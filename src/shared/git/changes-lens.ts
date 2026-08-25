export type GitWorkingFilter = "all" | "staged" | "unstaged";

export type GitChangesLens =
  | { kind: "working"; mode: GitWorkingFilter }
  | { kind: "last-agent-turn" }
  | { kind: "branch-changes" }
  | { kind: "commit"; hash: string };

export function branchRangeRev(baseBranch: string): string {
  return `${baseBranch}...HEAD`;
}

export function isGitRangeRev(rev: string): boolean {
  return rev.includes("...");
}

export type GitLogRange = "head" | "branch";

export interface GitLogOptions {
  maxCount?: number;
  range?: GitLogRange;
  baseBranch?: string;
}

export const BRANCH_COMMITS_MAX = 20;

export function workingLens(mode: GitWorkingFilter): GitChangesLens {
  return { kind: "working", mode };
}

export function normalizeGitRelPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

export function normalizeCheckoutPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function sameCheckoutPath(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return normalizeCheckoutPath(a) === normalizeCheckoutPath(b);
}

export function intersectTouchedWorkingPaths(
  touched: Iterable<string>,
  workingPaths: Iterable<string>,
): Set<string> {
  const work = new Set([...workingPaths].map(normalizeGitRelPath));
  const out = new Set<string>();
  for (const path of touched) {
    const normalized = normalizeGitRelPath(path);
    if (work.has(normalized)) out.add(normalized);
  }
  return out;
}

/** Commits submenu: feature branch only, and only when default..HEAD is non-empty. */
export function shouldOfferBranchCommitsMenu(
  branch: string,
  defaultBranch: string,
  branchOnlyCount: number,
): boolean {
  if (!branch || branch === "HEAD" || !defaultBranch) return false;
  if (branch === defaultBranch) return false;
  return branchOnlyCount > 0;
}

export function normalizeGitLogOptions(
  maxCountOrOpts?: number | GitLogOptions,
): GitLogOptions {
  if (typeof maxCountOrOpts === "number") return { maxCount: maxCountOrOpts };
  return maxCountOrOpts ?? {};
}
