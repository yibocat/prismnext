export type SshHostMatch =
  | { alias: string }
  | { unmatched: string };

export const SSH_CONFIG_REVEAL_PATH = "~/.ssh/config";

export function matchSshHostInput(
  input: string,
  hosts: ReadonlyArray<{ alias: string; hostname: string }>,
): SshHostMatch {
  const query = input.trim();
  if (!query) return { unmatched: "" };
  const exact = hosts.find((host) => host.alias === query || host.hostname === query);
  if (exact) return { alias: exact.alias };
  const hostPart = query.includes("@") ? query.slice(query.lastIndexOf("@") + 1) : query;
  const byHost = hosts.find((host) => host.alias === hostPart || host.hostname === hostPart);
  if (byHost) return { alias: byHost.alias };
  return { unmatched: query };
}

export function listSshPickerHosts<T extends { alias: string; hostname: string }>(
  hosts: ReadonlyArray<T>,
  recentProfileIds: ReadonlyArray<string>,
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  const recent = new Map(recentProfileIds.map((id, index) => [id, index]));
  return [...hosts]
    .filter((host) => {
      if (!q) return true;
      return host.alias.toLowerCase().includes(q) || host.hostname.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const ai = recent.get(a.alias);
      const bi = recent.get(b.alias);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a.alias.localeCompare(b.alias);
    });
}
