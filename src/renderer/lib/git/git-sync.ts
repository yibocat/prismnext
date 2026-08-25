import { toast } from "sonner";
import { pickDefaultBranch } from "@shared/git-hosting";
import { i18n } from "@/lib/i18n";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { applyCheckoutTransition, resolveWorktreeAtCheckout } from "./checkout-context";
import {
  deriveWorktreeMergeFollowUps,
  type WorktreeMergeFollowUp,
} from "./git-publish";

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

async function goToLocalAfterMerge(projectRoot: string): Promise<void> {
  await applyCheckoutTransition({ type: "local" });
  await refreshGitUnit(projectRoot);
}

async function pushAfterMerge(projectRoot: string): Promise<void> {
  await goToLocalAfterMerge(projectRoot);
  await useGitStore.getState().refreshGhAuth(projectRoot);
  await useGitStore.getState().pushRemote(projectRoot);
}

async function createPrAfterMerge(projectRoot: string): Promise<void> {
  await goToLocalAfterMerge(projectRoot);
  await useGitStore.getState().openCreatePr(projectRoot);
}

function followUpButton(kind: WorktreeMergeFollowUp, projectRoot: string, mergedBranch: string) {
  if (kind === "goToLocal") {
    return {
      label: i18n.t("git.toast.goToLocal"),
      onClick: () => {
        void goToLocalAfterMerge(projectRoot);
      },
    };
  }
  if (kind === "push") {
    return {
      label: i18n.t("git.toast.pushBranch", { branch: mergedBranch }),
      onClick: () => {
        void pushAfterMerge(projectRoot);
      },
    };
  }
  return {
    label: i18n.t("git.toast.createPr"),
    onClick: () => {
      void createPrAfterMerge(projectRoot);
    },
  };
}

/** Merge-to-branch succeeded — toast the next Local / Push / PR step. */
export function showWorktreeMergeFollowUpToast(input: {
  projectRoot: string;
  changeSummary?: string;
  mergedBranch: string;
  aheadAfterMerge: number;
  hasRemote: boolean;
}): void {
  const followUps = deriveWorktreeMergeFollowUps({
    isWorktreeView: resolveWorktreeAtCheckout() != null,
    mergedBranch: input.mergedBranch,
    aheadAfterMerge: input.aheadAfterMerge,
    hasRemote: input.hasRemote,
    defaultBranch: pickDefaultBranch(useGitStore.getState().branches),
    ghInstalled: useGitStore.getState().ghAuth.installed,
    ghAuthenticated: useGitStore.getState().ghAuth.authenticated,
  }).slice(0, 2);

  toast.success(
    i18n.t("git.toast.mergedWorktree", {
      summary: input.changeSummary ?? input.mergedBranch,
      branch: input.mergedBranch,
    }),
    {
      duration: 10_000,
      action: followUps[0]
        ? followUpButton(followUps[0], input.projectRoot, input.mergedBranch)
        : undefined,
      cancel: followUps[1]
        ? followUpButton(followUps[1], input.projectRoot, input.mergedBranch)
        : undefined,
    },
  );
}
