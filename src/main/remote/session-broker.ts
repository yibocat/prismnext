import { randomUUID } from "node:crypto";
import {
  RemoteOperationError,
  describeModelSeedGate,
  encodeRemoteAbs,
  emptyConnectConstitution,
  emptyDesktopModelSeed,
  isHostDoctorReport,
  isHostHandshake,
  isHostModelConfigureResult,
  isRemoteErrorCode,
  normalizePosixAbs,
  PAYLOAD_MISSING_LOCAL_MESSAGE,
  recordConnectGate,
  type DesktopModelSeed,
  type HostHandshake,
  type RemoteBootstrapLogLine,
  type RemoteConnectConstitution,
  type RemoteConnectGate,
  type RemoteConnectResult,
  type RemoteConnectionSnapshot,
  type RemoteConnectionState,
  type RemoteErrorCode,
  type RemoteLogLevel,
  type SshProfile,
} from "../../shared/remote";
import { createLogger } from "../app/logger";
import { ensureHostPayload } from "./bootstrap";
import { NdjsonFrameCodec } from "./frame-codec";
import { checkStoredHostKey, trustHostKey } from "./known-hosts";
import {
  hasBundledLinuxHostPayload,
  parseRemoteUnameMachine,
  resolveBundledHostPayload,
  type HostLinuxArch,
  type HostPayloadRef,
} from "./payload-path";
import { ensureRemoteListenPort } from "./host-listen";
import { profileModelKeys } from "./profile-overrides";
import type { SshClient, SshSession, SshStdioPipe } from "./ssh-client";
import { appendOpenSshKnownHost } from "./system-ssh-client";
import { licenseToHostProGrant, type HostProGrant } from "../../shared/pro";
import { readProLicense } from "../teams/pro-license";
import { pushLaptopProPackageToHost } from "./pro-push";

const log = createLogger("remote");

const LOG_CAP = 400;

/** Start Host with first-party teams/commands from the payload, not the SSH cwd. */
export function buildHostServeStdioCommand(boot: {
  nodeBin: string;
  hostBin: string;
  currentDir?: string;
}): string {
  const hostBin = boot.hostBin.replace(/\\/g, "/");
  const nodeBin = boot.nodeBin.replace(/\\/g, "/");
  const currentDir = (boot.currentDir ?? hostBin.replace(/\/bin\/prismnext-host$/, "")).replace(
    /\\/g,
    "/",
  );
  const teamsDir = `${currentDir}/resources/teams`;
  const commandsDir = `${currentDir}/resources/commands`;
  const hostRoot = currentDir.replace(/\/current\/?$/, "") || currentDir;
  const proDir = `${hostRoot}/pro-package`;
  const binDir = `${currentDir}/bin`;
  return [
    "env",
    `PRISM_FIRST_PARTY_TEAMS_DIR="${teamsDir}"`,
    `PRISM_APP_COMMANDS_DIR="${commandsDir}"`,
    `PRISM_HOST_PRO_PACKAGE_DIR="${proDir}"`,
    `PRISM_HOST_BIN_DIR="${binDir}"`,
    `"${nodeBin}"`,
    `"${hostBin}"`,
    "serve --stdio",
  ].join(" ");
}

export interface RemoteSessionBrokerDeps {
  desktopVersion: string;
  getProfile?: (id: string) => SshProfile | null;
  ssh?: SshClient;
  resolvePayload?: (arch?: HostLinuxArch) => HostPayloadRef | { error: "payload_missing_local" };
  knownHostsPath?: string;
  now?: () => number;
  onLog?: (line: RemoteBootstrapLogLine) => void;
  onConnection?: (profileId: string, state: RemoteConnectionState) => void;
  onEvent?: (channel: string, payload: unknown, profileId: string) => void;
  readModelSeed?: () => DesktopModelSeed;
  readProGrant?: () => HostProGrant | null;
}

interface LiveConnection {
  profileId: string;
  connectionId: string;
  session: SshSession;
  pipe: SshStdioPipe | null;
  codec: NdjsonFrameCodec;
  pending: Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>;
  handshake: HostHandshake | null;
  remoteRoot: string | null;
  projectId: string | null;
  listenPort: number | null;
  transport: "listen" | "stdio";
  ready: boolean;
  closing: boolean;
  reconnecting: boolean;
}

export class RemoteSessionBroker {
  private readonly byProfile = new Map<string, RemoteConnectionState>();
  private readonly live = new Map<string, LiveConnection>();
  private logs: RemoteBootstrapLogLine[] = [];
  private sshPromise: Promise<SshClient> | null = null;

  constructor(private readonly deps: RemoteSessionBrokerDeps) {}

  snapshot(): RemoteConnectionSnapshot {
    const byProfileId: Record<string, RemoteConnectionState> = {};
    for (const [id, state] of this.byProfile) byProfileId[id] = state;
    return { byProfileId, logs: [...this.logs] };
  }

  connectionStatus(profileId?: string): RemoteConnectionState {
    if (!profileId) return { phase: "idle" };
    return this.byProfile.get(profileId) ?? { phase: "idle" };
  }

  trustHost(input: { host: string; port: number; fingerprint: string }): void {
    if (this.deps.knownHostsPath) {
      trustHostKey(input.host, input.port, input.fingerprint, this.deps.knownHostsPath);
      return;
    }
    appendOpenSshKnownHost(input.host, input.port);
  }

  async connect(profileId: string): Promise<RemoteConnectResult> {
    let constitution = emptyConnectConstitution();
    const mark = (gate: RemoteConnectGate, ok: boolean, detail: string, level?: RemoteLogLevel) => {
      constitution = recordConnectGate(constitution, { gate, ok, detail });
      this.log(profileId, detail, { level: level ?? (ok ? "ok" : "error"), gate });
    };

    const profile = this.deps.getProfile
      ? this.deps.getProfile(profileId)
      : (await import("./profiles")).getSshProfile(profileId);
    if (!profile) {
      return this.failConnect(profileId, "not_connected", "SSH profile not found.", constitution);
    }

    const payloadReady = this.deps.resolvePayload
      ? !("error" in this.deps.resolvePayload())
      : hasBundledLinuxHostPayload();
    if (!payloadReady) {
      mark(
        "payload",
        false,
        PAYLOAD_MISSING_LOCAL_MESSAGE,
      );
      return this.failConnect(
        profileId,
        "payload_missing_local",
        PAYLOAD_MISSING_LOCAL_MESSAGE,
        constitution,
      );
    }
    mark("payload", true, "Local Linux Host payload is present.");

    await this.disconnect(profileId, { silent: true });
    this.setState(profileId, { phase: "connecting", profileId });
    this.log(profileId, `Connecting with system ssh ${profile.id}…`);

    let session: SshSession | null = null;
    try {
      const ssh = await this.resolveSsh();
      session = await ssh.connect({
        alias: profile.id,
        host: profile.host,
        port: profile.port,
        user: profile.user || undefined,
        identityFile: profile.identityFile,
        onHostKey: (fingerprint) => {
          const decision = checkStoredHostKey(
            profile.host,
            profile.port,
            fingerprint,
            profile.strictHostKey,
            this.deps.knownHostsPath,
          );
          if (decision === "accept" && !profile.strictHostKey) {
            try {
              trustHostKey(profile.host, profile.port, fingerprint, this.deps.knownHostsPath);
            } catch {
              // TOFU write is best-effort.
            }
          }
          if (decision !== "accept") {
            mark(
              "host_key",
              false,
              decision === "mismatch"
                ? "SSH host key does not match ~/.ssh/known_hosts."
                : "Unknown SSH host key — confirm it in the menu.",
            );
            this.setState(profileId, {
              phase: "awaiting_host_key",
              profileId,
              hostKey: { host: profile.host, port: profile.port, fingerprint },
            });
          }
          return decision;
        },
      });
      mark("ssh", true, `System ssh reached ${profile.id}.`);
      mark("host_key", true, "SSH host key accepted.");

      const uname = await session.exec("uname -m");
      const linuxArch = parseRemoteUnameMachine(uname.stdout);
      if (!linuxArch) {
        mark(
          "runtime",
          false,
          `Remote machine is ${uname.stdout.trim() || "unknown"}. Host runtime downloads Linux x64/arm64 Node only.`,
        );
        throw new RemoteOperationError(
          "host_runtime",
          `Remote machine is ${uname.stdout.trim() || "unknown"}. Host runtime downloads Linux x64/arm64 Node only.`,
        );
      }

      const payload = this.deps.resolvePayload
        ? this.deps.resolvePayload(linuxArch)
        : resolveBundledHostPayload({ arch: linuxArch });
      if ("error" in payload) {
        mark(
          "payload",
          false,
          PAYLOAD_MISSING_LOCAL_MESSAGE,
        );
        throw new RemoteOperationError(
          "payload_missing_local",
          PAYLOAD_MISSING_LOCAL_MESSAGE,
        );
      }

      const connectionId = `conn_${randomUUID()}`;
      this.setState(profileId, { phase: "bootstrapping", profileId, connectionId });
      const boot = await ensureHostPayload({
        session,
        local: {
          tarballPath: payload.path,
          sha256: payload.sha256,
          desktopVersion: this.deps.desktopVersion,
        },
        linuxArch,
        log: (message) => this.log(profileId, message),
      });
      mark("home", true, `Remote home resolved (${boot.appHome}).`);
      mark(
        "bootstrap",
        true,
        boot.action === "skipped"
          ? "Host program and Node / Git / Tectonic already match this app — skipping install."
          : boot.action === "provisioned"
            ? "Server installed the missing Host runtime."
            : "Host program pushed; server downloaded any missing Node / Git / Tectonic.",
      );

      const node = await session.exec(`"${boot.nodeBin}" --version`);
      if (node.code !== 0 || !node.stdout.trim().startsWith("v")) {
        mark(
          "runtime",
          false,
          node.stderr.trim()
          || "Host Node could not start. The server should have downloaded it during connect.",
        );
        throw new RemoteOperationError(
          "host_runtime",
          node.stderr.trim()
          || "Host Node could not start. The server should have downloaded it during connect.",
        );
      }
      mark("runtime", true, `Host Node is ${node.stdout.trim()} (${linuxArch}, dedicated).`);

      const live: LiveConnection = {
        profileId,
        connectionId,
        session,
        pipe: null,
        codec: new NdjsonFrameCodec(),
        pending: new Map(),
        handshake: null,
        remoteRoot: null,
        projectId: null,
        listenPort: null,
        transport: "stdio",
        ready: false,
        closing: false,
        reconnecting: false,
      };
      this.live.set(profileId, live);
      await this.openHostTransport(live, boot, mark);
      this.attachPipe(live);

      const handshakeRaw = await this.invokeOn(live, "host.handshake", { connectionId });
      if (!isHostHandshake(handshakeRaw)) {
        mark("handshake", false, "Host handshake was not a HostHandshake.");
        throw new RemoteOperationError("protocol", "Host handshake was not a HostHandshake.");
      }
      live.handshake = handshakeRaw;
      const missing = (["literature", "experiment"] as const).filter(
        (feature) => !handshakeRaw.features.includes(feature),
      );
      if (missing.length > 0) {
        mark(
          "handshake",
          false,
          `Remote Host is missing ${missing.join(", ")}. Disconnect and reconnect so this app can push the current Host.`,
        );
        throw new RemoteOperationError(
          "payload_stale",
          `Remote Host is missing ${missing.join(", ")}. Disconnect and reconnect so this app can push the current Host.`,
        );
      }
      mark(
        "handshake",
        true,
        `Handshake ok — ${handshakeRaw.desktopVersion} ${handshakeRaw.payloadSha256.slice(0, 8)}`,
      );
      if (handshakeRaw.features.includes("agent")) {
        await this.syncHostPro(live, mark);
      }

      constitution = await this.attachHostDoctor(live, constitution);

      live.ready = true;
      this.setState(profileId, {
        phase: "ready",
        profileId,
        connectionId,
        handshake: handshakeRaw,
        constitution,
      });
      return { ok: true, profileId, connectionId, handshake: handshakeRaw, constitution };
    } catch (err) {
      if (session) await session.dispose().catch(() => undefined);
      this.live.delete(profileId);
      if (err instanceof RemoteOperationError && err.code === "host_key_unknown" && err.fingerprint) {
        return {
          ok: false,
          profileId,
          code: "host_key_unknown",
          message: err.message,
          hostKey: { host: err.host ?? profile.host, port: err.port ?? profile.port, fingerprint: err.fingerprint },
          constitution,
        };
      }
      const mapped = mapError(err);
      return this.failConnect(profileId, mapped.code, mapped.message, constitution, mapped.hostKey);
    }
  }

  async disconnect(profileId: string, opts?: { silent?: boolean }): Promise<void> {
    const live = this.live.get(profileId);
    if (live?.pipe && !live.closing) {
      await this.invokeOn(live, "host.configure", {
        modelKeys: profileModelKeys(this.deps.getProfile?.(profileId) ?? null),
        proGrant: null,
      }).catch(() => undefined);
    }
    if (live) live.closing = true;
    this.live.delete(profileId);
    if (live) {
      for (const pending of live.pending.values()) {
        pending.reject(new RemoteOperationError("not_connected", "Disconnected."));
      }
      live.pending.clear();
      await live.pipe?.close().catch(() => undefined);
      await live.session.dispose().catch(() => undefined);
    }
    if (!opts?.silent) {
      this.setState(profileId, { phase: "disconnected", profileId });
      this.log(profileId, "Disconnected.");
    }
  }

  async openProject(
    profileId: string,
    remoteRoot: string,
  ): Promise<{
    projectId: string;
    remoteRoot: string;
    connectionId: string;
    lastPath: string;
    handle: import("../../shared/remote").RemoteProjectHandle;
  }> {
    const live = this.live.get(profileId);
    if (!live) throw new RemoteOperationError("not_connected", "Not connected.");
    const raw = await this.invokeOn(live, "project.open", { remoteRoot }) as {
      projectId?: string;
      remoteRoot?: string;
    };
    if (!raw.projectId || !raw.remoteRoot) {
      throw new RemoteOperationError("protocol", "project.open did not return a project id.");
    }
    live.remoteRoot = raw.remoteRoot;
    live.projectId = raw.projectId;
    const lastPath = encodeRemoteAbs(profileId, raw.remoteRoot);
    if (!lastPath) throw new RemoteOperationError("protocol", "Could not encode remote project root.");
    this.log(profileId, `Opened remote project ${raw.projectId} at ${raw.remoteRoot}`, {
      level: "ok",
      gate: "handshake",
    });
    return {
      projectId: raw.projectId,
      remoteRoot: raw.remoteRoot,
      connectionId: live.connectionId,
      lastPath,
      handle: {
        kind: "remote",
        projectId: raw.projectId,
        profileId,
        remoteRoot: raw.remoteRoot,
        connectionId: live.connectionId,
      },
    };
  }

  boundRemoteRoot(profileId: string): string | null {
    return this.live.get(profileId.trim())?.remoteRoot ?? null;
  }

  /**
   * SSH stdio up is not a project bind. Host fs/agent need `project.open` first.
   * No-op when this folder is already the live remoteRoot.
   */
  async ensureProjectOpen(
    profileId: string,
    remoteRoot: string,
  ): Promise<{
    projectId: string;
    remoteRoot: string;
    connectionId: string;
    lastPath: string;
    handle: import("../../shared/remote").RemoteProjectHandle;
  } | null> {
    const live = this.live.get(profileId);
    if (!live) return null;
    if (!live.pipe || live.reconnecting || !live.ready) {
      await this.waitForPipe(live);
    }
    const abs = normalizePosixAbs(remoteRoot);
    if (!abs) {
      throw new RemoteOperationError("protocol", "Choose a remote folder.");
    }
    if (live.remoteRoot === abs && live.projectId) {
      const lastPath = encodeRemoteAbs(profileId, abs);
      if (!lastPath) throw new RemoteOperationError("protocol", "Could not encode remote project root.");
      return {
        projectId: live.projectId,
        remoteRoot: abs,
        connectionId: live.connectionId,
        lastPath,
        handle: {
          kind: "remote",
          projectId: live.projectId,
          profileId,
          remoteRoot: abs,
          connectionId: live.connectionId,
        },
      };
    }
    return this.openProject(profileId, abs);
  }

  profileIdForProjectId(projectId: string): string | null {
    const id = projectId.trim();
    if (!id) return null;
    for (const [profileId, live] of this.live) {
      if (live.projectId === id) return profileId;
    }
    return null;
  }

  isBound(profileId: string): boolean {
    const live = this.live.get(profileId.trim());
    return Boolean(live?.pipe || live?.reconnecting);
  }

  /** Push the current laptop Pro grant (and packs, if licensed) to every live Host. */
  async syncProOnLiveHosts(): Promise<void> {
    for (const live of this.live.values()) {
      if (!live.pipe) continue;
      try {
        await this.syncHostPro(live);
      } catch (err) {
        this.log(live.profileId, err instanceof Error ? err.message : String(err), {
          level: "warn",
        });
      }
    }
  }

  /** Push the current Settings keys to every live Host (Settings save, or reconnect). */
  async reconfigureModelKeys(): Promise<void> {
    for (const live of this.live.values()) {
      if (!live.handshake?.features.includes("agent") || !live.pipe) continue;
      try {
        const { seed, mode } = await this.pushHostModelSeed(live);
        this.log(
          live.profileId,
          `Updated Host model keys (${seed.providerIds.join(", ") || "none"}).`,
          {
            level: mode === "gateway" || seed.providerIds.length > 0 ? "ok" : "warn",
            gate: "model",
          },
        );
      } catch (err) {
        this.log(live.profileId, err instanceof Error ? err.message : String(err), {
          level: "error",
          gate: "model",
        });
      }
    }
  }

  async invoke(profileId: string, method: string, params: unknown): Promise<unknown> {
    const live = this.live.get(profileId);
    if (!live) throw new RemoteOperationError("not_connected", "Not connected.");
    if (!live.pipe || live.reconnecting || !live.ready) {
      await this.waitForPipe(live);
    }
    return this.invokeOn(live, method, params);
  }

  /** Close the NDJSON pipe only. A listen Host stays up so the broker can reattach. */
  async dropControlPlane(profileId: string): Promise<void> {
    const live = this.live.get(profileId.trim());
    if (!live?.pipe) return;
    await live.pipe.close().catch(() => undefined);
  }

  private async waitForPipe(live: LiveConnection, timeoutMs = 20_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (live.closing || this.live.get(live.profileId) !== live) {
        throw new RemoteOperationError("not_connected", "Not connected.");
      }
      if (live.pipe && live.ready && !live.reconnecting) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new RemoteOperationError("not_connected", "Host stdio is not open.");
  }

  private invokeOn(live: LiveConnection, method: string, params: unknown): Promise<unknown> {
    if (!live.pipe) throw new RemoteOperationError("not_connected", "Host stdio is not open.");
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      live.pending.set(id, { resolve, reject });
      live.pipe!.stdin.write(live.codec.encode({ kind: "req", id, method, params }), (err) => {
        if (err) {
          live.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  private async openHostTransport(
    live: LiveConnection,
    boot: { nodeBin: string; hostBin: string; currentDir?: string },
    mark?: (gate: RemoteConnectGate, ok: boolean, detail: string, level?: RemoteLogLevel) => void,
  ): Promise<void> {
    const listenPort = live.session.openForwardedTcp
      ? await ensureRemoteListenPort(live.session, boot)
      : null;
    if (listenPort && live.session.openForwardedTcp) {
      try {
        live.pipe = await live.session.openForwardedTcp(listenPort);
        live.listenPort = listenPort;
        live.transport = "listen";
        mark?.(
          "host_serve",
          true,
          `prismnext-host listen 127.0.0.1:${listenPort} (SSH local forward).`,
        );
        return;
      } catch {
        live.listenPort = null;
        live.transport = "stdio";
      }
    }
    this.log(live.profileId, "Starting prismnext-host serve --stdio…");
    live.pipe = await live.session.openStdio(buildHostServeStdioCommand(boot));
    live.transport = "stdio";
    mark?.("host_serve", true, "prismnext-host serve --stdio is running.");
  }

  private attachPipe(live: LiveConnection): void {
    const onDead = () => {
      void this.onTransportDead(live);
    };
    live.pipe?.stdout?.once("close", onDead);
    live.pipe?.stdout?.once("end", onDead);
    live.pipe?.stdin?.once("error", onDead);
    const onData = (chunk: Buffer | string) => {
      try {
        const frames = live.codec.push(chunk);
        for (const frame of frames) {
          if (frame.kind === "res") {
            const pending = live.pending.get(frame.id);
            if (!pending) continue;
            live.pending.delete(frame.id);
            if (frame.ok) pending.resolve(frame.result);
            else pending.reject(mapHostFrameError(frame.error.code, frame.error.message));
          }
          if (frame.kind === "event") {
            if (frame.channel === "remote:displaced") {
              live.closing = true;
              this.live.delete(live.profileId);
              this.setState(live.profileId, {
                phase: "error",
                profileId: live.profileId,
                code: "displaced",
                message: "Another computer took over this Host.",
              });
              this.log(live.profileId, "Another computer took over this Host.", { level: "error" });
            }
            this.deps.onEvent?.(frame.channel, frame.payload, live.profileId);
          }
        }
      } catch (err) {
        this.log(live.profileId, err instanceof Error ? err.message : String(err));
      }
    };
    live.pipe?.stdout?.on("data", onData);
    live.pipe?.stderr?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk).trim();
      if (text) this.log(live.profileId, text);
    });
  }

  private async onTransportDead(live: LiveConnection): Promise<void> {
    if (
      live.closing
      || live.reconnecting
      || this.live.get(live.profileId) !== live
      || !live.ready
    ) {
      return;
    }
    live.reconnecting = true;
    live.ready = false;
    const stalePipe = live.pipe;
    live.pipe = null;
    for (const pending of live.pending.values()) {
      pending.reject(new RemoteOperationError("not_connected", "Host control plane dropped. Reconnecting…"));
    }
    live.pending.clear();
    const prev = this.byProfile.get(live.profileId);
    const constitution = prev && "constitution" in prev ? prev.constitution : undefined;
    this.setState(live.profileId, {
      phase: "reconnecting",
      profileId: live.profileId,
      connectionId: live.connectionId,
      handshake: live.handshake ?? undefined,
      constitution,
    });
    this.log(live.profileId, "Control plane dropped — reconnecting…", { level: "warn" });
    if (live.transport !== "listen" || !live.listenPort || !live.session.openForwardedTcp) {
      this.live.delete(live.profileId);
      this.setState(live.profileId, { phase: "disconnected", profileId: live.profileId });
      this.log(live.profileId, "stdio Host died with the SSH pipe. Connect again.", { level: "error" });
      return;
    }
    try {
      await stalePipe?.close().catch(() => undefined);
      live.pipe = await live.session.openForwardedTcp(live.listenPort);
      live.codec = new NdjsonFrameCodec();
      this.attachPipe(live);
      const reattached = await this.invokeOn(live, "host.reattach", {
        connectionId: live.connectionId,
      }) as { remoteRoot?: string | null; projectId?: string | null };
      if (typeof reattached.remoteRoot === "string") live.remoteRoot = reattached.remoteRoot;
      if (typeof reattached.projectId === "string") live.projectId = reattached.projectId;
      if (!live.handshake) throw new RemoteOperationError("protocol", "Reconnect lost the Host handshake.");
      if (live.handshake.features.includes("agent")) {
        await this.syncHostPro(live);
      }
      live.ready = true;
      live.reconnecting = false;
      this.setState(live.profileId, {
        phase: "ready",
        profileId: live.profileId,
        connectionId: live.connectionId,
        handshake: live.handshake,
        constitution,
      });
      this.log(live.profileId, "Reattached to the Host listen process.", { level: "ok" });
    } catch (err) {
      if (err instanceof RemoteOperationError && err.code === "displaced") {
        live.closing = true;
        this.live.delete(live.profileId);
        this.setState(live.profileId, {
          phase: "error",
          profileId: live.profileId,
          code: "displaced",
          message: err.message,
        });
        this.log(live.profileId, err.message, { level: "error" });
        return;
      }
      this.live.delete(live.profileId);
      this.setState(live.profileId, { phase: "disconnected", profileId: live.profileId });
      this.log(live.profileId, err instanceof Error ? err.message : String(err), { level: "error" });
    }
  }

  private failConnect(
    profileId: string,
    code: RemoteErrorCode,
    message: string,
    constitution: RemoteConnectConstitution,
    hostKey?: { host: string; port: number; fingerprint: string },
  ): RemoteConnectResult {
    this.setState(profileId, { phase: "error", profileId, code, message, constitution });
    this.log(profileId, message, { level: "error" });
    return { ok: false, profileId, code, message, hostKey, constitution };
  }

  private readSeed(): DesktopModelSeed {
    if (this.deps.readModelSeed) return this.deps.readModelSeed();
    return emptyDesktopModelSeed("Desktop model seed reader is not installed.");
  }

  private async pushHostModelSeed(live: LiveConnection): Promise<{
    seed: DesktopModelSeed;
    mode: "remote" | "gateway";
    hostProviderIds: string[];
  }> {
    const mode = profileModelKeys(this.deps.getProfile?.(live.profileId) ?? null);
    const seed = this.readSeed();
    const configured = await this.invokeOn(live, "host.configure", {
      modelKeys: mode,
      extraBaseUrls: seed.extraBaseUrls,
      proGrant: this.currentProGrant(),
      ...(mode === "remote"
        ? { aiApiKeys: seed.aiApiKeys, aiBaseUrls: seed.aiBaseUrls, wrapKey: seed.wrapKey }
        : {}),
    });
    return {
      seed,
      mode,
      hostProviderIds: isHostModelConfigureResult(configured) ? configured.providerIds : [],
    };
  }

  private currentProGrant(): HostProGrant | null {
    if (this.deps.readProGrant) return this.deps.readProGrant();
    try {
      return licenseToHostProGrant(readProLicense());
    } catch {
      return null;
    }
  }

  private async syncHostPro(
    live: LiveConnection,
    mark?: (gate: RemoteConnectGate, ok: boolean, detail: string, level?: RemoteLogLevel) => void,
  ): Promise<void> {
    const grant = this.currentProGrant();
    if (grant) {
      try {
        const pushed = await pushLaptopProPackageToHost({
          invoke: (profileId, method, params) => {
            void profileId;
            return this.invokeOn(live, method, params);
          },
        }, live.profileId);
        if (pushed.ok && pushed.action === "pushed") {
          this.log(live.profileId, `Pushed Pro packs (${pushed.files} files).`);
        } else if (pushed.ok && pushed.action === "skipped") {
          this.log(live.profileId, "Pro packs already match this computer.");
        }
      } catch (err) {
        this.log(
          live.profileId,
          `Pro packs were not pushed: ${err instanceof Error ? err.message : String(err)}`,
          { level: "warn" },
        );
      }
    }
    await this.configureHostModels(live, mark);
  }

  private async configureHostModels(
    live: LiveConnection,
    mark?: (gate: RemoteConnectGate, ok: boolean, detail: string, level?: RemoteLogLevel) => void,
  ): Promise<void> {
    const { seed, mode, hostProviderIds } = await this.pushHostModelSeed(live);
    const gate = describeModelSeedGate({ mode, seed, hostProviderIds });
    mark?.("model", gate.ok, gate.detail, gate.ok ? "ok" : "error");
  }

  private async attachHostDoctor(
    live: LiveConnection,
    constitution: RemoteConnectConstitution,
  ): Promise<RemoteConnectConstitution> {
    try {
      const raw = await this.invokeOn(live, "host.doctor", {});
      if (!isHostDoctorReport(raw)) {
        this.log(live.profileId, "Host doctor returned an unexpected payload.", {
          level: "warn",
          gate: "doctor",
        });
        return recordConnectGate(constitution, {
          gate: "doctor",
          ok: false,
          detail: "Host doctor returned an unexpected payload.",
        });
      }
      const tectonic = raw.runtime?.tectonic.available
        ? (raw.runtime.tectonic.version || "yes")
        : "missing";
      const detail = `Doctor: node ${raw.node || "missing"}, home ${raw.homeWritable ? "writable" : "not writable"}, git ${raw.git ? "yes" : "no"}, tectonic ${tectonic}.`;
      this.log(live.profileId, detail, { level: raw.ok ? "ok" : "warn", gate: "doctor" });
      return {
        ...recordConnectGate(constitution, { gate: "doctor", ok: raw.ok, detail }),
        doctor: raw,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.log(live.profileId, `Host doctor failed: ${detail}`, { level: "warn", gate: "doctor" });
      return recordConnectGate(constitution, {
        gate: "doctor",
        ok: false,
        detail: `Host doctor failed: ${detail}`,
      });
    }
  }

  private async resolveSsh(): Promise<SshClient> {
    if (this.deps.ssh) return this.deps.ssh;
    if (!this.sshPromise) {
      this.sshPromise = import("./system-ssh-client").then((mod) => mod.createSystemSshClient());
    }
    return this.sshPromise;
  }

  private setState(profileId: string, state: RemoteConnectionState): void {
    this.byProfile.set(profileId, state);
    this.deps.onConnection?.(profileId, state);
  }

  private log(
    profileId: string,
    message: string,
    extra?: { level?: RemoteLogLevel; gate?: RemoteConnectGate },
  ): void {
    const level = extra?.level ?? "info";
    const line: RemoteBootstrapLogLine = {
      ts: (this.deps.now ?? Date.now)(),
      profileId,
      message,
      level,
      gate: extra?.gate,
    };
    this.logs.push(line);
    if (this.logs.length > LOG_CAP) this.logs = this.logs.slice(-LOG_CAP);
    this.deps.onLog?.(line);
    const appLevel = level === "ok" ? "info" : level;
    log[appLevel](`[${profileId}${extra?.gate ? `:${extra.gate}` : ""}] ${message}`);
  }
}

function toCode(code: string): RemoteErrorCode {
  return isRemoteErrorCode(code) ? code : "protocol";
}

function mapHostFrameError(code: string, message: string): RemoteOperationError {
  if (message.startsWith("unknown method:")) {
    return new RemoteOperationError(
      "payload_stale",
      `${message}. The Host on this server is older than this app — disconnect and reconnect so PrismNext can push the current Host.`,
    );
  }
  return new RemoteOperationError(toCode(code), message);
}

function mapError(err: unknown): {
  code: RemoteErrorCode;
  message: string;
  hostKey?: { host: string; port: number; fingerprint: string };
} {
  if (err instanceof RemoteOperationError) {
    return {
      code: err.code,
      message: err.message,
      hostKey:
        err.fingerprint && err.host && err.port
          ? { host: err.host, port: err.port, fingerprint: err.fingerprint }
          : undefined,
    };
  }
  return { code: "host_runtime", message: err instanceof Error ? err.message : String(err) };
}
