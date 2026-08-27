import type {
  RemoteBootstrapLogLine,
  RemoteConnectConstitution,
  RemoteConnectGate,
  RemoteConnectionState,
} from "@shared/remote";
import { encodeRemoteAbs, parseRemoteAbs, recoverRemoteAbs } from "@shared/remote";
import type { AgentLifecyclePhase } from "../../../shared/agent/status";

export function shortPayloadSha(sha: string, length = 8): string {
  return sha.slice(0, length);
}

export function clipBootstrapLogs(
  lines: RemoteBootstrapLogLine[],
  max = 200,
): RemoteBootstrapLogLine[] {
  if (lines.length <= max) return lines;
  return lines.slice(-max);
}

export function connectionPhaseLabelKey(state: RemoteConnectionState): string {
  return `remote.phase.${state.phase}`;
}

export function logsForProfile(
  lines: RemoteBootstrapLogLine[],
  profileId: string,
  max = 6,
): RemoteBootstrapLogLine[] {
  return clipBootstrapLogs(lines.filter((line) => line.profileId === profileId), max);
}

export function constitutionLines(constitution: RemoteConnectConstitution | undefined): string[] {
  if (!constitution) return [];
  return constitution.gates.map((item) => `${item.ok ? "ok" : "fail"} ${item.gate} — ${item.detail}`);
}

export function latestGateDetail(
  gate: RemoteConnectGate,
  constitution: RemoteConnectConstitution | undefined,
  logs: ReadonlyArray<RemoteBootstrapLogLine>,
): string | undefined {
  const recorded = constitution?.gates.find((item) => item.gate === gate)?.detail?.trim();
  if (recorded) return recorded;
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const line = logs[i];
    if (line?.gate !== gate) continue;
    const message = line.message.trim();
    if (message) return message;
  }
  return undefined;
}

export function resolveConnectGateStatus(
  gate: RemoteConnectGate,
  constitution: RemoteConnectConstitution | undefined,
  logs: ReadonlyArray<RemoteBootstrapLogLine>,
): "ok" | "fail" | "pending" {
  const recorded = constitution?.gates.find((item) => item.gate === gate);
  if (recorded) return recorded.ok ? "ok" : "fail";
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const line = logs[i];
    if (line?.gate !== gate) continue;
    if (line.level === "error") return "fail";
    if (line.level === "ok") return "ok";
    return "pending";
  }
  return "pending";
}

export function remoteHostDisplayName(
  projectRoot: string | null | undefined,
  hosts: ReadonlyArray<{ alias: string; hostname: string }>,
): string | null {
  const parsed = parseRemoteAbs(projectRoot ?? "");
  if (!parsed) return null;
  const host = hosts.find((item) => item.alias === parsed.profileId);
  return host?.hostname?.trim() || parsed.profileId;
}

export function remoteConnectionPhaseForRoot(
  projectRoot: string | null | undefined,
  byProfileId: Record<string, RemoteConnectionState>,
): RemoteConnectionState["phase"] | null {
  const parsed = parseRemoteAbs(projectRoot ?? "");
  if (!parsed) return null;
  return byProfileId[parsed.profileId]?.phase ?? "disconnected";
}

export function remoteStatusDotPhase(input: {
  remotePhase: RemoteConnectionState["phase"] | null;
  agentReady: boolean;
  canEmbed: boolean;
  reason?: string | null;
}): AgentLifecyclePhase {
  if (
    input.remotePhase === "connecting"
    || input.remotePhase === "bootstrapping"
    || input.remotePhase === "reconnecting"
    || input.remotePhase === "awaiting_host_key"
  ) {
    return "starting";
  }
  if (input.remotePhase === "error") return "error";
  if (input.remotePhase === "ready") {
    if (input.agentReady && input.canEmbed) return "ready";
    if (!input.canEmbed) return "error";
    return "starting";
  }
  return "stopped";
}

export function remoteConnectionDetailKey(
  phase: RemoteConnectionState["phase"] | null,
): string {
  if (phase === "ready") return "shell.status.remoteConnected";
  if (
    phase === "connecting"
    || phase === "bootstrapping"
    || phase === "reconnecting"
    || phase === "awaiting_host_key"
  ) {
    return "shell.status.remoteConnecting";
  }
  if (phase === "error") return "shell.status.remoteError";
  return "shell.status.remoteDisconnected";
}

export type RemoteStatusRow = {
  profileId: string;
  hostname: string;
  phase: RemoteConnectionState["phase"];
};

function isLiveRemotePhase(phase: RemoteConnectionState["phase"] | undefined): boolean {
  return (
    phase === "ready"
    || phase === "connecting"
    || phase === "bootstrapping"
    || phase === "reconnecting"
    || phase === "awaiting_host_key"
    || phase === "error"
  );
}

/** Live SSH sessions — one row per connected Host, not per project. */
export function listRemoteStatusRows(
  roots: ReadonlyArray<string | null | undefined>,
  hosts: ReadonlyArray<{ alias: string; hostname: string }>,
  byProfileId: Record<string, RemoteConnectionState>,
  preferProfileId?: string | null,
): RemoteStatusRow[] {
  const seen = new Set<string>();
  const rows: RemoteStatusRow[] = [];
  const add = (profileId: string) => {
    if (!profileId || seen.has(profileId)) return;
    const phase = byProfileId[profileId]?.phase;
    if (!isLiveRemotePhase(phase)) return;
    seen.add(profileId);
    const host = hosts.find((item) => item.alias === profileId);
    rows.push({
      profileId,
      hostname: host?.hostname?.trim() || profileId,
      phase,
    });
  };
  if (preferProfileId) add(preferProfileId);
  for (const root of roots) {
    const parsed = parseRemoteAbs(root ?? "");
    if (parsed) add(parsed.profileId);
  }
  for (const profileId of Object.keys(byProfileId)) {
    add(profileId);
  }
  return rows;
}

export function remotePhaseToDot(phase: RemoteConnectionState["phase"]): AgentLifecyclePhase {
  if (
    phase === "connecting"
    || phase === "bootstrapping"
    || phase === "reconnecting"
    || phase === "awaiting_host_key"
  ) {
    return "starting";
  }
  if (phase === "ready") return "ready";
  if (phase === "error") return "error";
  return "stopped";
}

export function appStatusDotPhase(
  remotes: ReadonlyArray<{ phase: RemoteConnectionState["phase"] }>,
  localAgent: AgentLifecyclePhase | null,
): AgentLifecyclePhase {
  const phases: AgentLifecyclePhase[] = remotes.map((row) => remotePhaseToDot(row.phase));
  if (localAgent) phases.push(localAgent);
  if (phases.includes("error")) return "error";
  if (phases.includes("starting")) return "starting";
  if (phases.includes("stopped") && !phases.includes("ready")) return "stopped";
  if (phases.includes("ready")) return "ready";
  return localAgent ?? "stopped";
}

/** Session cwd may be a Host POSIX path; recover `remote://` from the project root. */
export function resolveSessionRemoteRoot(
  sessionDirectory: string | null | undefined,
  fallbacks: ReadonlyArray<string | null | undefined>,
): string | null {
  const fromDir = recoverRemoteAbs(sessionDirectory ?? "");
  if (fromDir) return fromDir;
  const posix = sessionDirectory?.replace(/\\/g, "/").trim() ?? "";
  for (const fallback of fallbacks) {
    const parsed = parseRemoteAbs(fallback ?? "");
    if (!parsed) continue;
    if (!posix || posix === parsed.abs || posix.startsWith(`${parsed.abs}/`)) {
      return encodeRemoteAbs(parsed.profileId, posix.startsWith("/") ? posix : parsed.abs);
    }
    if (posix.startsWith("/")) {
      return encodeRemoteAbs(parsed.profileId, posix);
    }
    return recoverRemoteAbs(fallback ?? "");
  }
  return null;
}
