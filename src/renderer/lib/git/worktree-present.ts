import { normalizeCheckoutPath } from "./worktree-path";
import type { WorktreeInfo } from "@/types/electron";

/** True when the worktree checkout directory still exists on disk (has a .git marker). */
export async function isWorktreeCheckoutOnDisk(directory: string): Promise<boolean> {
  const root = normalizeCheckoutPath(directory);
  if (!root) return false;
  try {
    return await window.electronAPI.fsExists(`${root}/.git`);
  } catch {
    return false;
  }
}

/**
 * When git list is stale after closing a sibling worktree, keep entries that still
 * exist on disk instead of dropping them from the store.
 */
export async function reconcileWorktreeList(
  fetched: WorktreeInfo[],
  previous: WorktreeInfo[],
): Promise<WorktreeInfo[]> {
  const byName = new Map<string, WorktreeInfo>();
  for (const wt of fetched) {
    byName.set(wt.name, wt);
  }

  for (const old of previous) {
    if (byName.has(old.name)) continue;
    if (await isWorktreeCheckoutOnDisk(old.path)) {
      byName.set(old.name, old);
    }
  }

  return [...byName.values()];
}
