import type {
  RemoteBootstrapLogLine,
  RemoteConnectConstitution,
  RemoteConnectGate,
  RemoteConnectionState,
} from "@shared/remote";

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
