import type { WorktreeInfo } from "@/types/electron";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { useWorktreeStore, type WorktreeMode } from "@/stores/worktree-store";
import { rehomeWorktreeSessions } from "./worktree-sessions";
import { findWorktreeForDirectory, worktreePathsEqual, isPendingNewWorktree } from "./worktree-path";
import { isWorktreeCheckoutOnDisk } from "./worktree-present";
import {
  resolveGitRefreshRoot,
  scheduleGitStatusRefresh,
  refreshGitStatusNow,
} from "./git-refresh-root";
import { isHomeWorktreeCheckoutPath } from "../../../shared/workbench-paths";

export { resolveGitRefreshRoot, scheduleGitStatusRefresh, refreshGitStatusNow };
export { isPendingNewWorktree };

export function isWorktreeCheckoutPath(
  checkoutRoot: string | null | undefined,
  _projectRoot?: string | null,
): boolean {
  if (!checkoutRoot) return false;
  return isHomeWorktreeCheckoutPath(checkoutRoot);
}

/** Active worktree, or match the current checkout root against known worktrees. */
export function resolveWorktreeAtCheckout(): WorktreeInfo | null {
  const wtStore = useWorktreeStore.getState();
  if (isPendingNewWorktree(wtStore)) return null;
  if (wtStore.activeWorktree) return wtStore.activeWorktree;
  const checkoutRoot = useDocumentStore.getState().checkoutRoot;
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!checkoutRoot || !projectRoot || !isWorktreeCheckoutPath(checkoutRoot, projectRoot)) {
    return null;
  }
  return findWorktreeForDirectory(checkoutRoot, wtStore.worktrees, projectRoot) ?? null;
}

/** OpenCode/agent cwd for a tab — worktree path when applicable. */
export function resolveWorktreePathForSend(
  tab: { sessionCwd?: string | null } | null | undefined,
  projectRoot: string | null,
): string | undefined {
  if (tab?.sessionCwd && projectRoot && isWorktreeCheckoutPath(tab.sessionCwd, projectRoot)) {
    return tab.sessionCwd;
  }
  return resolveWorktreeAtCheckout()?.path ?? undefined;
}

/** Snapshot cwd at session creation / load time (worktree path or project root). */
export function captureSessionCwd(): string | null {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return null;
  return resolveWorktreeAtCheckout()?.path ?? projectRoot;
}

/** When opening a session that was created in a worktree checkout, re-attach it. */
export async function attachWorktreeForSessionDirectory(directory: string): Promise<void> {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot || !isWorktreeCheckoutPath(directory, projectRoot)) return;

  const wtStore = useWorktreeStore.getState();
  let worktree = findWorktreeForDirectory(directory, wtStore.worktrees, projectRoot);
  if (!worktree) {
    await wtStore.refreshWorktrees(projectRoot);
    worktree = findWorktreeForDirectory(
      directory,
      useWorktreeStore.getState().worktrees,
      projectRoot,
    );
  }
  if (worktree) {
    await applyCheckoutTransition({ type: "worktree-existing", worktree });
    return;
  }

  // Directory may still exist while the worktree list is stale (sibling close / git refresh).
  if (await isWorktreeCheckoutOnDisk(directory)) {
    await wtStore.refreshWorktrees(projectRoot);
    const refreshed = findWorktreeForDirectory(
      directory,
      useWorktreeStore.getState().worktrees,
      projectRoot,
    );
    if (refreshed) {
      await applyCheckoutTransition({ type: "worktree-existing", worktree: refreshed });
      return;
    }
  }

  // Worktree directory no longer exists — session survived a merge/close.
  if (projectRoot) {
    await rehomeWorktreeSessions(projectRoot, directory);
    const active = useWorktreeStore.getState().activeWorktree;
    if (active && worktreePathsEqual(active.path, directory)) {
      await applyCheckoutTransition({ type: "local" });
    }
  }
}

/** Snapshot of where the app reads/writes files and queries git. */
export interface CheckoutContextSnapshot {
  projectRoot: string | null;
  checkoutRoot: string | null;
  gitUnitRoot: string | null;
  mode: WorktreeMode;
  activeWorktree: WorktreeInfo | null;
}

export type CheckoutTransition =
  /** Edit on main project; keep worktrees on disk but detach active worktree. */
  | { type: "local" }
  /** Attach to an existing worktree checkout. */
  | { type: "worktree-existing"; worktree: WorktreeInfo }
  /** Plan a new worktree (created lazily on first chat message). */
  | { type: "worktree-intent"; baseBranch: string }
  /** Switch file/git root — e.g. after worktree:create returns a path. */
  | { type: "checkout-at"; root: string; worktree?: WorktreeInfo }
  /**
   * Peek at project files while a worktree session is active.
   * Does not clear activeWorktree; checks out base branch on project root.
   */
  | { type: "project-view-while-worktree" };

export function getCheckoutContext(): CheckoutContextSnapshot {
  const doc = useDocumentStore.getState();
  const wt = useWorktreeStore.getState();
  const git = useGitStore.getState();
  return {
    projectRoot: doc.projectRoot,
    checkoutRoot: doc.checkoutRoot,
    gitUnitRoot: git.unitRoot,
    mode: wt.mode,
    activeWorktree: wt.activeWorktree,
  };
}

async function ensureCheckoutRoot(root: string): Promise<void> {
  const doc = useDocumentStore.getState();
  if (doc.checkoutRoot === root) {
    await useGitStore.getState().selectUnit(root);
    return;
  }
  await doc.switchCheckoutRoot(root);
  // right-area also calls selectUnit when checkoutRoot changes — explicit call
  // keeps git panel in sync if effects batch oddly.
  await useGitStore.getState().selectUnit(root);
}

/**
 * Single write path for worktree mode + checkout root changes.
 * Call from UI instead of chaining setMode / switchCheckoutRoot / selectUnit.
 */
export async function applyCheckoutTransition(
  transition: CheckoutTransition,
): Promise<void> {
  const projectRoot = useDocumentStore.getState().projectRoot;

  switch (transition.type) {
    case "worktree-intent": {
      useWorktreeStore.getState().setMode("worktree", transition.baseBranch);
      if (projectRoot) {
        await ensureCheckoutRoot(projectRoot);
      }
      return;
    }

    case "local": {
      if (!projectRoot) return;
      useWorktreeStore.getState().clearActiveWorktree();
      await ensureCheckoutRoot(projectRoot);
      return;
    }

    case "worktree-existing": {
      useWorktreeStore.getState().selectExistingWorktree(transition.worktree);
      await ensureCheckoutRoot(transition.worktree.path);
      return;
    }

    case "checkout-at": {
      if (transition.worktree) {
        useWorktreeStore.getState().selectExistingWorktree(transition.worktree);
      }
      await ensureCheckoutRoot(transition.root);
      return;
    }

    case "project-view-while-worktree": {
      if (!projectRoot) return;
      const wt = useWorktreeStore.getState().activeWorktree;
      await ensureCheckoutRoot(projectRoot);
      if (wt?.baseBranch && wt.baseBranch !== useGitStore.getState().branch) {
        await useGitStore.getState().switchBranch(projectRoot, wt.baseBranch).catch(() => {});
      }
      return;
    }
  }
}
