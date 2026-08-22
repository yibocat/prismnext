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

export interface GitStatusData {
  branch: string;
  files: GitFileStatusData[];
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
