import { useEffect, useMemo } from "react";
import type { WorktreeInfo } from "@/types/electron";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { isWorktreeCheckoutPath } from "./checkout-context";
import { findWorktreeForDirectory, isPendingNewWorktree } from "./worktree-path";

/**
 * Resolve the worktree for Push/Close UI — prefers store activeWorktree,
 * falls back to checkoutRoot match. Optionally syncs store when found via checkout.
 */
export function useResolvedWorktree(options?: { refreshOnMount?: boolean }): WorktreeInfo | null {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const checkoutRoot = useDocumentStore((s) => s.checkoutRoot);
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const refreshWorktrees = useWorktreeStore((s) => s.refreshWorktrees);
  const selectExistingWorktree = useWorktreeStore((s) => s.selectExistingWorktree);

  const pendingBranch = useWorktreeStore((s) => s.pendingBranch);
  const mode = useWorktreeStore((s) => s.mode);

  const resolved = useMemo(() => {
    if (activeWorktree) return activeWorktree;
    if (isPendingNewWorktree({ mode, pendingBranch, activeWorktree })) return null;
    if (!checkoutRoot || !projectRoot || !isWorktreeCheckoutPath(checkoutRoot, projectRoot)) {
      return null;
    }
    return findWorktreeForDirectory(checkoutRoot, worktrees, projectRoot) ?? null;
  }, [activeWorktree, worktrees, checkoutRoot, projectRoot, mode, pendingBranch]);

  useEffect(() => {
    if (isPendingNewWorktree({ mode, pendingBranch, activeWorktree })) return;
    if (!activeWorktree && resolved) {
      selectExistingWorktree(resolved);
    }
  }, [activeWorktree, resolved, selectExistingWorktree, mode, pendingBranch]);

  useEffect(() => {
    if (options?.refreshOnMount && projectRoot && resolved?.path) {
      void refreshWorktrees(projectRoot);
    }
  }, [options?.refreshOnMount, projectRoot, resolved?.path, refreshWorktrees]);

  return resolved;
}
