import { parseRemoteAbs, recoverRemoteAbs, type RemoteConnectionState } from "@shared/remote";
import { i18n } from "@/lib/i18n";
import { useRemoteStore } from "@/stores/remote-store";

const SETTLE_MS = 120_000;

export class RemoteConnectError extends Error {
  readonly alias: string;
  constructor(alias: string, message: string) {
    super(message);
    this.name = "RemoteConnectError";
    this.alias = alias;
  }
}

export function isRemoteConnectError(error: unknown): error is RemoteConnectError {
  return error instanceof RemoteConnectError
    || (error instanceof Error && error.name === "RemoteConnectError" && "alias" in error);
}

/** Remote focus is lazy unless the caller asks to connect. */
export function resolveFocusConnectRemote(
  rootPath: string,
  opts?: { connectRemote?: boolean },
): boolean {
  if (opts?.connectRemote !== undefined) return opts.connectRemote;
  return !Boolean(recoverRemoteAbs(rootPath) || parseRemoteAbs(rootPath));
}

export function remotePhaseIsReady(phase: RemoteConnectionState["phase"] | undefined): boolean {
  return phase === "ready";
}

/** True when this folder is remote:// and the Host is not ready yet. */
export function isRemoteProjectOffline(
  projectRoot: string | null | undefined,
  byProfileId: Record<string, Pick<RemoteConnectionState, "phase">>,
): boolean {
  const parsed = parseRemoteAbs(projectRoot ?? "");
  if (!parsed) return false;
  return !remotePhaseIsReady(byProfileId[parsed.profileId]?.phase);
}

export function remotePhaseIsBusy(phase: RemoteConnectionState["phase"] | undefined): boolean {
  return phase === "connecting" || phase === "bootstrapping" || phase === "reconnecting";
}

export function remotePhaseNeedsConnect(phase: RemoteConnectionState["phase"] | undefined): boolean {
  return !phase || phase === "idle" || phase === "disconnected" || phase === "error";
}

export function remoteFocusNeedsBind(lastPath: string): boolean {
  const parsed = parseRemoteAbs(lastPath);
  if (!parsed) return false;
  return !remotePhaseIsReady(useRemoteStore.getState().byProfileId[parsed.profileId]?.phase);
}

function currentPhase(alias: string): RemoteConnectionState["phase"] | undefined {
  return useRemoteStore.getState().byProfileId[alias]?.phase;
}

function waitUntilSettled(alias: string): Promise<boolean> {
  if (remotePhaseIsReady(currentPhase(alias))) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(ok);
    };
    const unsub = useRemoteStore.subscribe((state) => {
      const phase = state.byProfileId[alias]?.phase;
      if (remotePhaseIsReady(phase)) finish(true);
      if (phase === "error" || phase === "disconnected") finish(false);
    });
    const timer = setTimeout(() => {
      if (currentPhase(alias) === "awaiting_host_key") return;
      finish(false);
    }, SETTLE_MS);
    const phase = currentPhase(alias);
    if (remotePhaseIsReady(phase)) finish(true);
    else if (phase === "error") finish(false);
  });
}

/**
 * A remembered `remote://` project is only a path. SSH dies when the app quits.
 * Call this from a user action (open a remote chat, pick a host). Launch restore
 * must not — connecting on startup stalls the app.
 */
export async function ensureRemoteProjectReady(lastPath: string): Promise<void> {
  const parsed = parseRemoteAbs(lastPath);
  if (!parsed) return;
  const store = useRemoteStore.getState();
  if (!store.hydrated) await store.hydrate();
  const alias = parsed.profileId;
  const phase = currentPhase(alias);
  if (remotePhaseIsReady(phase)) return;
  if (remotePhaseIsBusy(phase) || currentPhase(alias) === "awaiting_host_key") {
    if (currentPhase(alias) === "awaiting_host_key") {
      useRemoteStore.getState().openConnectDialog(alias, { blocking: true });
    }
    const ok = await waitUntilSettled(alias);
    if (!ok) {
      throw new RemoteConnectError(alias, i18n.t("remote.connectFailed", { host: alias }));
    }
    return;
  }
  const result = await useRemoteStore.getState().connect(alias);
  if (result.hostKey) {
    useRemoteStore.getState().openConnectDialog(alias, { blocking: true });
    const ok = await waitUntilSettled(alias);
    if (!ok) throw new RemoteConnectError(alias, i18n.t("remote.connectFailed", { host: alias }));
    return;
  }
  if (!result.ok) {
    throw new RemoteConnectError(
      alias,
      result.message || i18n.t("remote.connectFailed", { host: alias }),
    );
  }
}

/** SSH ready + Host `project.open` — send / compile / live file ops. */
export async function ensureRemoteLiveForWork(lastPath: string): Promise<void> {
  const parsed = parseRemoteAbs(lastPath);
  if (!parsed) return;
  await ensureRemoteProjectReady(lastPath);
  const { projectDesktop } = await import("@/lib/desktop-api/project");
  await projectDesktop.projectOpen(lastPath);
}
