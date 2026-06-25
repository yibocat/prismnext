import type { WorktreeInfo } from "@/types/electron";
import { useChatStore } from "@/stores/chat-store";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { toast } from "sonner";

export type WorktreeCheckpointClearReason = "merged" | "closed";

function normalizeCheckoutPath(path: string): string {
  return path.replace(/\/+$/, "");
}

function worktreePathPrefix(worktreePath: string): string {
  return `${normalizeCheckoutPath(worktreePath)}/`;
}

function isUnderWorktree(absPath: string, worktreePath: string): boolean {
  const normalized = normalizeCheckoutPath(absPath);
  const wt = normalizeCheckoutPath(worktreePath);
  return normalized === wt || normalized.startsWith(worktreePathPrefix(wt));
}

function tabHasWorktreeBinding(
  tabId: string,
  worktreePath: string,
): boolean {
  const wt = normalizeCheckoutPath(worktreePath);
  const chatTab = useChatStore.getState().tabs.find((t) => t.id === tabId);
  if (chatTab?.sessionCwd && normalizeCheckoutPath(chatTab.sessionCwd) === wt) {
    return true;
  }

  const cpTab = useCheckpointStore.getState().byTab[tabId];
  if (!cpTab) return false;
  if (cpTab.boundCheckoutPath && normalizeCheckoutPath(cpTab.boundCheckoutPath) === wt) {
    return true;
  }
  for (const cp of cpTab.checkpoints) {
    for (const f of cp.files) {
      if (isUnderWorktree(f.absolutePath, wt)) return true;
    }
  }
  return false;
}

function tabIdsForWorktree(worktreePath: string): string[] {
  const ids = new Set<string>();

  for (const tab of useChatStore.getState().tabs) {
    if (tab.sessionCwd && normalizeCheckoutPath(tab.sessionCwd) === normalizeCheckoutPath(worktreePath)) {
      ids.add(tab.id);
    }
  }

  for (const tabId of Object.keys(useCheckpointStore.getState().byTab)) {
    if (tabHasWorktreeBinding(tabId, worktreePath)) {
      ids.add(tabId);
    }
  }

  return [...ids];
}

/**
 * Mainstream invalidation: drop per-turn restore snapshots when worktree context ends
 * (merge into base branch, or worktree closed). Does not revert Git history.
 */
export async function clearCheckpointsForWorktree(
  worktree: Pick<WorktreeInfo, "path" | "baseBranch" | "name">,
  reason: WorktreeCheckpointClearReason,
): Promise<void> {
  const tabIds = tabIdsForWorktree(worktree.path);
  const store = useCheckpointStore.getState();

  for (const tabId of tabIds) {
    await store.clearTabCheckpoints(tabId);
  }

  await store.clearOrphanCheckpointsOnDiskForWorktree(worktree.path);

  if (tabIds.length === 0) return;

  if (reason === "merged") {
    toast.info("Restore points cleared", {
      description: `Changes were merged into ${worktree.baseBranch}. Use Git history to revert commits.`,
      duration: 6000,
    });
  } else {
    toast.info("Restore points cleared", {
      description: `Worktree ${worktree.name} was closed.`,
      duration: 5000,
    });
  }
}
