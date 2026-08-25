import type { GitTrackingData } from "./types";

export const EMPTY_TRACKING: GitTrackingData = {
  upstreamRef: null,
  remoteName: null,
  aheadCount: 0,
  behindCount: 0,
  hasRemote: false,
  isDetached: false,
};

export interface PorcelainHeader {
  branch: string;
  isDetached: boolean;
  upstreamRef: string | null;
  aheadCount: number;
  behindCount: number;
}

/**
 * Parse line 1 of `git status --porcelain -b`.
 *
 * Examples:
 *   ## master
 *   ## master...origin/master
 *   ## feat/foo...origin/feat/foo [ahead 2, behind 1]
 *   ## HEAD (no branch)
 *   ## No commits yet on main
 */
export function parsePorcelainHeader(headerLine: string): PorcelainHeader {
  const raw = headerLine.startsWith("## ") ? headerLine.slice(3) : headerLine.trim();
  if (!raw) {
    return {
      branch: "unknown",
      isDetached: false,
      upstreamRef: null,
      aheadCount: 0,
      behindCount: 0,
    };
  }

  if (raw === "HEAD" || raw.startsWith("HEAD (no branch)")) {
    return {
      branch: "HEAD",
      isDetached: true,
      upstreamRef: null,
      aheadCount: 0,
      behindCount: 0,
    };
  }

  const noCommitsPrefix = "No commits yet on ";
  const body = raw.startsWith(noCommitsPrefix) ? raw.slice(noCommitsPrefix.length) : raw;

  const dots = body.indexOf("...");
  const left = (dots === -1 ? body : body.slice(0, dots)).trim();
  const branch = (left.split(/\s+/)[0] || "(no branch)").trim();

  if (dots === -1) {
    return {
      branch,
      isDetached: false,
      upstreamRef: null,
      aheadCount: 0,
      behindCount: 0,
    };
  }

  const right = body.slice(dots + 3);
  const bracket = right.indexOf(" [");
  const upstreamRef = (bracket === -1 ? right : right.slice(0, bracket)).trim() || null;
  const rest = bracket === -1 ? "" : right.slice(bracket);
  const ahead = rest.match(/ahead (\d+)/);
  const behind = rest.match(/behind (\d+)/);

  return {
    branch,
    isDetached: false,
    upstreamRef,
    aheadCount: ahead ? Number.parseInt(ahead[1]!, 10) || 0 : 0,
    behindCount: behind ? Number.parseInt(behind[1]!, 10) || 0 : 0,
  };
}

/** Longest remote name that prefixes `upstreamRef` (`gitea/feat/x` → `gitea`). */
export function resolveRemoteName(
  upstreamRef: string | null,
  remotes: string[],
): string | null {
  if (upstreamRef) {
    const matches = remotes.filter(
      (name) => upstreamRef === name || upstreamRef.startsWith(`${name}/`),
    );
    if (matches.length > 0) {
      return matches.reduce((a, b) => (a.length >= b.length ? a : b));
    }
    const slash = upstreamRef.indexOf("/");
    return slash === -1 ? upstreamRef : upstreamRef.slice(0, slash);
  }
  if (remotes.includes("origin")) return "origin";
  return remotes.length === 1 ? remotes[0]! : remotes[0] ?? null;
}

export function parseRemoteNames(output: string | null | undefined): string[] {
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isFastForwardPullError(message: string): boolean {
  return /fast-forward|diverging branches|not possible to fast-forward/i.test(message);
}

export function isNonFastForwardPushError(message: string): boolean {
  return /non-fast-forward|\[rejected\]|failed to push some refs/i.test(message);
}

export function buildTracking(
  header: PorcelainHeader,
  remotes: string[],
): GitTrackingData {
  return {
    upstreamRef: header.upstreamRef,
    remoteName: resolveRemoteName(header.upstreamRef, remotes),
    aheadCount: header.aheadCount,
    behindCount: header.behindCount,
    hasRemote: remotes.length > 0 || header.upstreamRef != null,
    isDetached: header.isDetached,
  };
}
