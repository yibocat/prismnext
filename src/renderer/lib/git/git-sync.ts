import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { applyCheckoutTransition } from "./checkout-context";

/** Refresh git status/branches for one checkout root (project or worktree). */
export async function refreshGitUnit(gitRoot: string): Promise<void> {
  const gs = useGitStore.getState();
  await gs.forceRefreshStatus(gitRoot);
  if (gitRoot === useDocumentStore.getState().projectRoot) {
    await gs.refreshBranches(gitRoot);
  }
}

/**
 * After merging worktree commits into the main repo (Merge to Branch), refresh both sides.
 * User may still be editing inside the worktree checkout.
 */
export async function syncAfterWorktreeMerge(
  projectRoot: string,
  worktreeRoot: string,
  _worktreeName: string,
): Promise<void> {
  useWorktreeStore.getState().invalidateCache(worktreeRoot);
  await useWorktreeStore.getState().refreshWorktrees(projectRoot);
  await useGitStore.getState().refreshAfterWorktreeMerge(projectRoot, worktreeRoot);
}

/**
 * Worktree merged and removed — return app to local/project checkout.
 */
export async function finalizeWorktreeMergeClose(
  projectRoot: string,
  worktreeName: string,
): Promise<void> {
  const wtStore = useWorktreeStore.getState();
  wtStore.invalidateCache(
    wtStore.worktrees.find((w) => w.name === worktreeName)?.path ?? "",
  );

  await applyCheckoutTransition({ type: "local" });
  await wtStore.refreshWorktrees(projectRoot);
  await refreshGitUnit(projectRoot);
  await useDocumentStore.getState().reloadAllFromDisk();
}

/** @deprecated Use syncAfterWorktreeMerge */
export const syncAfterWorktreePush = syncAfterWorktreeMerge;
