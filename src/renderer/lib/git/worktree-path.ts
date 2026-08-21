import type { WorktreeInfo } from "@/types/electron";
import { isHomeWorktreeCheckoutPath, parseHomeWorktreeCheckoutPath } from "../../../shared/workbench-paths";

/** Normalize checkout paths for stable equality checks (slashes, trailing slash). */
export function normalizeCheckoutPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function parseWorktreeNameFromPath(
  directory: string,
  _projectRoot?: string | null,
): string | null {
  if (!isHomeWorktreeCheckoutPath(directory)) return null;
  return parseHomeWorktreeCheckoutPath(directory)?.worktreeId ?? null;
}

export function worktreePathsEqual(a: string, b: string): boolean {
  return normalizeCheckoutPath(a) === normalizeCheckoutPath(b);
}

/** User chose "New Worktree" — creation is deferred until the first chat message. */
export function isPendingNewWorktree(state: {
  mode: string;
  pendingBranch: string | null;
  activeWorktree: unknown;
}): boolean {
  return state.mode === "worktree" && state.pendingBranch !== null && state.activeWorktree === null;
}

/**
 * Match a session directory to a known worktree — by normalized path, then by worktree name.
 * Avoids false "closed" labels when git vs join() paths differ slightly.
 */
export function findWorktreeForDirectory(
  directory: string,
  worktrees: WorktreeInfo[],
  projectRoot?: string | null,
): WorktreeInfo | undefined {
  const norm = normalizeCheckoutPath(directory);
  const byPath = worktrees.find((w) => normalizeCheckoutPath(w.path) === norm);
  if (byPath) return byPath;

  if (!projectRoot) return undefined;
  const name = parseWorktreeNameFromPath(directory, projectRoot);
  if (!name) return undefined;
  return worktrees.find((w) => w.name === name);
}

export function isWorktreeDirectoryActive(
  directory: string,
  worktrees: WorktreeInfo[],
  projectRoot?: string | null,
): boolean {
  return findWorktreeForDirectory(directory, worktrees, projectRoot) !== undefined;
}
