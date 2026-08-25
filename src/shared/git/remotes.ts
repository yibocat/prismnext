import type { GitRemoteInfo } from "./types";

export type PushRemoteDecision =
  | { kind: "detached" }
  | { kind: "no-remote" }
  | { kind: "push-upstream" }
  | { kind: "publish"; remote: string }
  | { kind: "choose"; remotes: GitRemoteInfo[] };

export function parseRemoteVerbose(output: string | null | undefined): GitRemoteInfo[] {
  if (!output) return [];
  const byName = new Map<string, { fetch?: string; push?: string }>();
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const name = match[1]!;
    const url = match[2]!;
    const side = match[3] as "fetch" | "push";
    const rec = byName.get(name) ?? {};
    rec[side] = url;
    byName.set(name, rec);
  }
  return [...byName.entries()].map(([name, urls]) => ({
    name,
    url: urls.push || urls.fetch || "",
  }));
}

const REMOTE_NAME_RE = /^[A-Za-z][A-Za-z0-9._-]*$/;

export function isValidRemoteName(name: string): boolean {
  return REMOTE_NAME_RE.test(name.trim());
}

/** Light check — git still validates the URL when adding. */
export function isPlausibleRemoteUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^ssh:\/\//i.test(trimmed)) return true;
  if (/^git:\/\//i.test(trimmed)) return true;
  if (/^git@[\w.-]+:\S+$/.test(trimmed)) return true;
  if (trimmed.startsWith("/") || trimmed.startsWith(".")) return true;
  return false;
}

export function suggestRemoteName(existingNames: string[]): string {
  return existingNames.includes("origin") ? "" : "origin";
}

/** Short host/path for menus — not a full URL editor. */
export function formatRemoteUrlSummary(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  let text = trimmed.replace(/\.git$/, "");
  text = text.replace(/^https?:\/\//, "").replace(/^ssh:\/\//, "");
  text = text.replace(/^git@/, "");
  if (text.length > 42) return `${text.slice(0, 41)}…`;
  return text;
}

export function resolvePushRemote(input: {
  remotes: GitRemoteInfo[];
  hasUpstream: boolean;
  isDetached?: boolean;
  branchPushRemote?: string | null;
  explicitRemote?: string | null;
}): PushRemoteDecision {
  if (input.isDetached) return { kind: "detached" };

  const remotes = input.remotes;
  const names = remotes.map((r) => r.name);
  const explicit = input.explicitRemote?.trim();
  if (explicit) return { kind: "publish", remote: explicit };

  if (remotes.length === 0) return { kind: "no-remote" };
  if (input.hasUpstream) return { kind: "push-upstream" };

  const configured = input.branchPushRemote?.trim();
  if (configured && names.includes(configured)) {
    return { kind: "publish", remote: configured };
  }
  if (remotes.length === 1) return { kind: "publish", remote: remotes[0]!.name };
  if (names.includes("origin")) return { kind: "publish", remote: "origin" };
  return { kind: "choose", remotes };
}
