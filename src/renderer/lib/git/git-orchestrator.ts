import type { GitFileStatusData } from "@shared/git/types";
import type { WorktreeInfo } from "@/types/electron";
import { gitDesktop } from "@/lib/desktop-api/git";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { applyCheckoutTransition } from "./checkout-context";
import { worktreePathsEqual } from "./worktree-path";
import { finalizeWorktreeMergeClose, syncAfterWorktreeMerge } from "./git-sync";
import { mergeFollowUpFromStatus } from "./git-publish";
import { rehomeWorktreeSessions } from "./worktree-sessions";
import { clearCheckpointsForWorktree } from "@/lib/chat/worktree-checkpoint-lifecycle";

export interface WorktreeChangedFile {
  path: string;
  status: string;
}

export type GitOrchestratorStepId =
  | "save-files"
  | "commit-worktree"
  | "stash-project"
  | "checkout-base"
  | "merge"
  | "commit-merge"
  | "stash-pop"
  | "delete-branch"
  | "remove-worktree"
  | "sync";

export interface OrchestratorProgress {
  id: GitOrchestratorStepId;
  label: string;
  index: number;
  total: number;
}

export interface WorktreeMergeInput {
  projectRoot: string;
  worktree: WorktreeInfo;
  changedFiles: string[];
  aheadCount: number;
}

export interface WorktreeMergeResult {
  success: boolean;
  error?: string;
  changeSummary?: string;
  rollbackWarnings?: string[];
  mergedBranch?: string;
  aheadAfterMerge?: number;
  hasRemote?: boolean;
}

/** @deprecated Use WorktreeMergeInput */
export type WorktreePushInput = WorktreeMergeInput;
/** @deprecated Use WorktreeMergeResult */
export type WorktreePushResult = WorktreeMergeResult;

export interface MergeCloseResult {
  success: boolean;
  error?: string;
  conflict?: boolean;
  stashedProjectChanges?: boolean;
}

interface PushRollbackState {
  originalBranch: string;
  didStash: boolean;
  didCheckoutBase: boolean;
  mergeStaged: boolean;
}

async function readProjectBranch(projectRoot: string): Promise<string> {
  try {
    const status = await gitDesktop.gitStatus(projectRoot);
    return status.branch || "";
  } catch {
    return "";
  }
}

async function readMergeFollowUp(projectRoot: string, mergedBranch: string) {
  try {
    const status = await gitDesktop.gitStatus(projectRoot);
    return mergeFollowUpFromStatus(mergedBranch, status.tracking);
  } catch {
    return mergeFollowUpFromStatus(mergedBranch, undefined);
  }
}

export function buildMergeToBranchStepLabels(baseBranch: string, alreadyOnBase: boolean): string[] {
  if (alreadyOnBase) {
    return [
      "Saving files…",
      "Committing in worktree…",
      "Stashing project changes…",
      `Merging into ${baseBranch}…`,
      "Committing merge…",
      "Restoring project changes…",
    ];
  }
  return [
    "Saving files…",
    "Committing in worktree…",
    "Stashing project changes…",
    `Switching to ${baseBranch}…`,
    "Merging…",
    "Committing merge…",
    "Restoring project changes…",
  ];
}

export function buildMergeCloseStepLabels(targetBranch: string, alreadyOnTarget: boolean): string[] {
  if (alreadyOnTarget) {
    return [
      "Saving files…",
      "Stashing project changes…",
      `Merging into ${targetBranch}…`,
      "Removing worktree…",
      "Restoring project changes…",
    ];
  }
  return [
    "Saving files…",
    "Stashing project changes…",
    `Switching to ${targetBranch}…`,
    "Merging…",
    "Removing worktree…",
    "Restoring project changes…",
  ];
}

export function formatWorktreeChangeSummary(
  worktreeName: string,
  changedFileCount: number,
  aheadCount: number,
): string {
  if (changedFileCount > 0) {
    return `${changedFileCount} file${changedFileCount !== 1 ? "s" : ""} from ${worktreeName}`;
  }
  return `${aheadCount} commit${aheadCount !== 1 ? "s" : ""} from ${worktreeName}`;
}

/** @deprecated Use buildMergeToBranchStepLabels */
export const buildPushStepLabels = buildMergeToBranchStepLabels;

export function canMergeWorktree(changedFileCount: number, aheadCount: number): boolean {
  return changedFileCount > 0 || aheadCount > 0;
}

/** @deprecated Use canMergeWorktree */
export const canPushWorktree = canMergeWorktree;

/** Load unstaged/staged/untracked paths in a worktree checkout. */
export async function loadWorktreeChangedFiles(worktreeRoot: string): Promise<WorktreeChangedFile[]> {
  try {
    await useDocumentStore.getState().saveAllFiles();
    const result = await gitDesktop.gitStatus(worktreeRoot);
    if (!result.files) return [];
    return result.files
      .filter((f: GitFileStatusData) => f.staged || f.unstaged || f.untracked)
      .map((f: GitFileStatusData) => ({
        path: f.path,
        status: f.untracked ? "?" : f.staged ? f.indexStatus : f.worktreeStatus,
      }));
  } catch {
    return [];
  }
}

async function tryStashProject(projectRoot: string, message: string): Promise<boolean> {
  try {
    const stashResult = await gitDesktop.gitStash(projectRoot, message);
    return stashResult.success;
  } catch {
    return false;
  }
}

async function rollbackMergeToBranch(
  projectRoot: string,
  state: PushRollbackState,
): Promise<string[]> {
  const warnings: string[] = [];

  if (state.mergeStaged) {
    try {
      const abort = await gitDesktop.gitAbortMerge(projectRoot);
      if (!abort.success) {
        warnings.push("Could not abort in-progress merge — resolve manually in the Git panel.");
      }
    } catch {
      warnings.push("Could not abort in-progress merge — resolve manually in the Git panel.");
    }
  }

  if (state.didCheckoutBase && state.originalBranch) {
    try {
      const current = await readProjectBranch(projectRoot);
      if (current !== state.originalBranch) {
        const checkout = await gitDesktop.gitCheckout(projectRoot, state.originalBranch);
        if (!checkout.success) {
          warnings.push(`Could not restore branch ${state.originalBranch}.`);
        }
      }
    } catch {
      warnings.push(`Could not restore branch ${state.originalBranch}.`);
    }
  }

  if (state.didStash) {
    try {
      const pop = await gitDesktop.gitStashPop(projectRoot);
      if (!pop.success) {
        warnings.push("Stashed project changes were not restored — use Stash Pop in the Git panel.");
      }
    } catch {
      warnings.push("Stashed project changes were not restored — use Stash Pop in the Git panel.");
    }
  }

  return warnings;
}

function emitProgress(
  onProgress: ((progress: OrchestratorProgress) => void) | undefined,
  labels: string[],
  index: number,
  id: GitOrchestratorStepId,
): void {
  onProgress?.({
    id,
    label: labels[index] ?? labels[labels.length - 1] ?? "",
    index,
    total: labels.length,
  });
}

/**
 * Merge worktree branch into baseBranch on the main repo (worktree stays open).
 * Rolls back stash / checkout / in-progress merge on failure.
 */
export async function mergeWorktreeToBase(
  input: WorktreeMergeInput,
  onProgress?: (progress: OrchestratorProgress) => void,
): Promise<WorktreeMergeResult> {
  const { projectRoot, worktree, changedFiles, aheadCount } = input;
  const worktreeRoot = worktree.path;
  const baseBranch = worktree.baseBranch || "main";

  if (!canMergeWorktree(changedFiles.length, aheadCount)) {
    return { success: false, error: "No changes to merge" };
  }

  const originalBranch = await readProjectBranch(projectRoot);
  const alreadyOnBase = originalBranch === baseBranch;
  const labels = buildMergeToBranchStepLabels(baseBranch, alreadyOnBase);
  const rollback: PushRollbackState = {
    originalBranch,
    didStash: false,
    didCheckoutBase: false,
    mergeStaged: false,
  };

  try {
    emitProgress(onProgress, labels, 0, "save-files");
    await useDocumentStore.getState().saveAllFiles();

    emitProgress(onProgress, labels, 1, "commit-worktree");
    if (changedFiles.length > 0) {
      const commitResult = await gitDesktop.gitCommitAll(
        worktreeRoot,
        changedFiles,
        `worktree(${worktree.name}): ${changedFiles.length} file${changedFiles.length !== 1 ? "s" : ""}`,
      );
      if (!commitResult.success && !commitResult.error?.includes("nothing to commit")) {
        throw new Error(`Failed to commit in worktree: ${commitResult.error}`);
      }
    }

    emitProgress(onProgress, labels, 2, "stash-project");
    rollback.didStash = await tryStashProject(
      projectRoot,
      `auto-save before merging worktree ${worktree.name}`,
    );

    if (!alreadyOnBase) {
      emitProgress(onProgress, labels, 3, "checkout-base");
      const checkoutResult = await gitDesktop.gitCheckout(projectRoot, baseBranch);
      if (!checkoutResult.success) {
        throw new Error(`Failed to checkout ${baseBranch}: ${checkoutResult.error}`);
      }
      rollback.didCheckoutBase = true;
    }

    const mergeIndex = alreadyOnBase ? 3 : 4;
    emitProgress(onProgress, labels, mergeIndex, "merge");
    const mergeResult = await gitDesktop.gitMergeNoCommit(projectRoot, worktree.branch);
    if (!mergeResult.success) {
      throw new Error(`Merge failed: ${mergeResult.error}`);
    }
    rollback.mergeStaged = true;

    const commitIndex = alreadyOnBase ? 4 : 5;
    emitProgress(onProgress, labels, commitIndex, "commit-merge");
    const changeSummary = formatWorktreeChangeSummary(worktree.name, changedFiles.length, aheadCount);
    const mergeCommitMsg = `Merge worktree ${worktree.name} into ${baseBranch}\n\n${changeSummary}`;
    const mergeCommitResult = await gitDesktop.gitCommit(projectRoot, mergeCommitMsg);
    if (!mergeCommitResult.success) {
      throw new Error(`Failed to commit merge: ${mergeCommitResult.error}`);
    }
    rollback.mergeStaged = false;

    if (rollback.didStash) {
      const popIndex = alreadyOnBase ? 5 : 6;
      emitProgress(onProgress, labels, popIndex, "stash-pop");
      const popResult = await gitDesktop.gitStashPop(projectRoot);
      rollback.didStash = false;
      if (!popResult.success) {
        await syncAfterWorktreeMerge(projectRoot, worktreeRoot, worktree.name);
        await clearCheckpointsForWorktree(worktree, "merged");
        const followUp = await readMergeFollowUp(projectRoot, baseBranch);
        return {
          success: true,
          changeSummary,
          ...followUp,
          rollbackWarnings: [
            "Merge succeeded but stashed project changes could not be auto-restored — use Stash Pop in the Git panel.",
          ],
        };
      }
    }

    emitProgress(onProgress, labels, labels.length - 1, "sync");
    await syncAfterWorktreeMerge(projectRoot, worktreeRoot, worktree.name);
    await clearCheckpointsForWorktree(worktree, "merged");
    const followUp = await readMergeFollowUp(projectRoot, baseBranch);

    return { success: true, changeSummary, ...followUp };
  } catch (err: unknown) {
    const rollbackWarnings = await rollbackMergeToBranch(projectRoot, rollback);
    return {
      success: false,
      error: (err as Error).message || "Merge failed",
      rollbackWarnings: rollbackWarnings.length > 0 ? rollbackWarnings : undefined,
    };
  }
}

/** @deprecated Use mergeWorktreeToBase */
export const pushWorktreeToBase = mergeWorktreeToBase;

/**
 * Merge worktree into base branch, delete worktree branch, remove worktree directory.
 * On conflict: leaves merge state for manual resolution and opens Git panel.
 */
export async function mergeAndCloseWorktree(
  projectRoot: string,
  worktree: WorktreeInfo,
  onProgress?: (progress: OrchestratorProgress) => void,
): Promise<MergeCloseResult> {
  const targetBranch = worktree.baseBranch || "main";
  const originalBranch = await readProjectBranch(projectRoot);
  const alreadyOnTarget = originalBranch === targetBranch;
  const labels = buildMergeCloseStepLabels(targetBranch, alreadyOnTarget);
  let didStash = false;
  let didCheckout = false;

  try {
    emitProgress(onProgress, labels, 0, "save-files");
    await useDocumentStore.getState().saveAllFiles();

    emitProgress(onProgress, labels, 1, "stash-project");
    didStash = await tryStashProject(
      projectRoot,
      `auto-save before merge close of ${worktree.name}`,
    );

    if (!alreadyOnTarget) {
      emitProgress(onProgress, labels, 2, "checkout-base");
      const checkout = await gitDesktop.gitCheckout(projectRoot, targetBranch);
      if (!checkout.success) {
        throw new Error(`Failed to checkout ${targetBranch}: ${checkout.error}`);
      }
      didCheckout = true;
    }

    const mergeIndex = alreadyOnTarget ? 2 : 3;
    emitProgress(onProgress, labels, mergeIndex, "merge");
    const mergeResult = await gitDesktop.gitMerge(projectRoot, worktree.branch);
    if (!mergeResult.success) {
      useRightPanelStore.getState().ensureTab("git-overview");
      const detail = mergeResult.error || mergeResult.output || "Merge failed";
      return {
        success: false,
        conflict: true,
        stashedProjectChanges: didStash,
        error:
          `Merge conflict detected. Open the Git panel to resolve conflicts, then commit the result. ` +
          `Or use 'Abort merge' in the branch menu to cancel.\n\n${detail}`,
      };
    }

    const removeIndex = alreadyOnTarget ? 3 : 4;
    emitProgress(onProgress, labels, removeIndex, "remove-worktree");
    await clearCheckpointsForWorktree(worktree, "closed");
    await rehomeWorktreeSessions(projectRoot, worktree.path);
    try {
      await gitDesktop.gitDeleteBranch(projectRoot, worktree.branch);
    } catch {
      // Branch may already be gone after fast-forward merge
    }
    try {
      await gitDesktop.worktreeRemove(projectRoot, worktree.name);
    } catch {
      // Best-effort — finalize still resets app state
    }
    await finalizeWorktreeMergeClose(projectRoot, worktree.name);

    if (didStash) {
      emitProgress(onProgress, labels, labels.length - 1, "stash-pop");
      const pop = await gitDesktop.gitStashPop(projectRoot);
      didStash = !pop.success;
    }

    return {
      success: true,
      stashedProjectChanges: didStash || undefined,
    };
  } catch (err: unknown) {
    if (didCheckout && originalBranch && originalBranch !== targetBranch) {
      try {
        await gitDesktop.gitCheckout(projectRoot, originalBranch);
      } catch {
        // Non-fatal
      }
    }
    if (didStash) {
      try {
        await gitDesktop.gitStashPop(projectRoot);
      } catch {
        // Non-fatal
      }
    }
    await useWorktreeStore.getState().refreshWorktrees(projectRoot);
    return { success: false, error: (err as Error).message || "Merge failed" };
  }
}

/** Discard worktree (move sessions, remove worktree). Only returns to local if that checkout was active. */
export async function discardAndCloseWorktree(
  projectRoot: string,
  worktree: WorktreeInfo,
): Promise<void> {
  const wtStore = useWorktreeStore.getState();
  const wasActive =
    !!wtStore.activeWorktree &&
    (worktreePathsEqual(wtStore.activeWorktree.path, worktree.path) ||
      wtStore.activeWorktree.name === worktree.name);
  await wtStore.moveToLocal(projectRoot, worktree);
  if (wasActive) {
    await applyCheckoutTransition({ type: "local" });
  }
}
