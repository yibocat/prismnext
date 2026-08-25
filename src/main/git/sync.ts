import { isFastForwardPullError, parseRemoteNames } from "../../shared/git";
import { execGit, execGitOrNull } from "./exec";
import type { GitSyncResult } from "./types";

export { isFastForwardPullError };

export interface FetchRemoteOptions {
  remote?: string;
  all?: boolean;
}

export type FetchTarget =
  | { kind: "all" }
  | { kind: "remote"; name: string }
  | { kind: "noop" };

/**
 * Decide what `git fetch` should talk to.
 * Preferred remote (usually tracking.remoteName) wins; else origin; else the only remote.
 */
export function resolveFetchTarget(
  remotes: string[],
  preferredRemote: string | null | undefined,
  opts: FetchRemoteOptions = {},
): FetchTarget {
  if (opts.all) return remotes.length > 0 ? { kind: "all" } : { kind: "noop" };

  const requested = opts.remote?.trim();
  if (requested) return { kind: "remote", name: requested };

  if (preferredRemote && remotes.includes(preferredRemote)) {
    return { kind: "remote", name: preferredRemote };
  }
  if (remotes.includes("origin")) return { kind: "remote", name: "origin" };
  if (remotes.length === 1) return { kind: "remote", name: remotes[0]! };
  if (remotes.length > 1) return { kind: "remote", name: remotes[0]! };
  return { kind: "noop" };
}

export function fetchGitArgs(target: FetchTarget): string[] | null {
  if (target.kind === "noop") return null;
  if (target.kind === "all") return ["fetch", "--all", "--prune"];
  return ["fetch", "--prune", target.name];
}

export async function fetchRemote(
  projectRoot: string,
  opts: FetchRemoteOptions = {},
): Promise<GitSyncResult> {
  const remotes = parseRemoteNames(await execGitOrNull(projectRoot, ["remote"]));
  const target = resolveFetchTarget(remotes, null, opts);
  const args = fetchGitArgs(target);
  if (!args) {
    return { success: true, noop: true, output: "No remote to fetch." };
  }
  try {
    const output = await execGit(projectRoot, args);
    return { success: true, output: output.trim() || "Fetched." };
  } catch (err: unknown) {
    const msg = (err as Error).message || "Fetch failed";
    return { success: false, error: msg, output: msg };
  }
}

export async function pullRemote(projectRoot: string): Promise<GitSyncResult> {
  const upstream = await execGitOrNull(projectRoot, ["rev-parse", "--abbrev-ref", "@{upstream}"]);
  if (!upstream?.trim()) {
    return { success: false, error: "No upstream branch — publish this branch first." };
  }
  try {
    const output = await execGit(projectRoot, ["pull", "--ff-only"]);
    return { success: true, output: output.trim() || "Already up to date." };
  } catch (err: unknown) {
    const msg = (err as Error).message || "Pull failed";
    return { success: false, error: msg, output: msg };
  }
}
