/** Git + worktree IPC DTOs — isomorphic (main + renderer). */

export interface GitFileStatusData {
  path: string;
  oldPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

/** Current branch vs its remote-tracking ref (any git remote, not GitHub-only). */
export interface GitTrackingData {
  /** e.g. "origin/master"; null when no @{upstream} */
  upstreamRef: string | null;
  /** Remote name parsed from upstream / remotes list; null if none */
  remoteName: string | null;
  /** Commits ahead of upstream; 0 when no upstream */
  aheadCount: number;
  /** Commits behind upstream; 0 when no upstream */
  behindCount: number;
  /** At least one `git remote` exists, or porcelain listed an upstream */
  hasRemote: boolean;
  /** Detached HEAD */
  isDetached: boolean;
}

export interface GitStatusData {
  branch: string;
  files: GitFileStatusData[];
  tracking: GitTrackingData;
}

export interface GitBranchesData {
  current: string;
  branches: string[];
}

export interface GitFileDiffData {
  path: string;
  oldContent: string;
  newContent: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitResultData {
  success: boolean;
  error?: string;
}

export interface GitMergeResultData {
  success: boolean;
  error?: string;
  output?: string;
}

/** Fetch / pull / push result (IPC). */
export interface GitSyncResultData {
  success: boolean;
  error?: string;
  output?: string;
  /** No remote to talk to — not a failure. */
  noop?: boolean;
}

export interface GitRemoteInfo {
  name: string;
  /** Push URL if present, otherwise fetch URL. */
  url: string;
}

export interface GitAddRemoteResultData extends GitResultData {
  remotes: GitRemoteInfo[];
}

export interface GitPushResultData extends GitSyncResultData {
  /** First push needs the user to pick among multiple remotes. */
  needsRemoteChoice?: boolean;
  remotes?: GitRemoteInfo[];
  /** Remote used with `git push -u` (first publish). */
  publishedRemote?: string;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  baseBranch: string;
  head: string;
  aheadCount: number;
  behindCount: number;
}

export interface MergeStatus {
  branch: string;
  mainBranch: string;
  aheadCount: number;
  behindCount: number;
  commits: { hash: string; message: string }[];
}

export interface BranchInfo {
  name: string;
  isLocked: boolean;
  lockedBy: string | null;
}

/** Main-process aliases (historical names on git.ts). */
export type GitFileEntry = GitFileStatusData;
export type GitStatusResult = GitStatusData;
export type GitBranchesResult = GitBranchesData;
export type GitFileDiff = GitFileDiffData;
export type GitResult = GitResultData;
