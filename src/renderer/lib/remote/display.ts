import type {
  RemoteBootstrapLogLine,
  RemoteConnectConstitution,
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
