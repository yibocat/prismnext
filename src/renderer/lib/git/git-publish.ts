import type { GitTrackingData } from "@shared/git";

export type PushActionKind = "push" | "publish";

export interface PushAction {
  kind: PushActionKind;
  aheadCount: number;
}

export function derivePushAction(tracking: GitTrackingData): PushAction | null {
  if (tracking.isDetached) return null;
  if (!tracking.hasRemote) return null;
  if (tracking.upstreamRef) {
    if (tracking.aheadCount > 0) {
      return { kind: "push", aheadCount: tracking.aheadCount };
    }
    return null;
  }
  return { kind: "publish", aheadCount: 0 };
}

export function derivePushLabel(
  tracking: GitTrackingData,
  labels: { push: string; publish: string },
): string | null {
  const action = derivePushAction(tracking);
  if (!action) return null;
  if (action.kind === "publish") return labels.publish;
  return action.aheadCount > 0 ? `${labels.push} ↑${action.aheadCount}` : labels.push;
}

export function shouldOfferPushAfterCommit(tracking: GitTrackingData): boolean {
  return derivePushAction(tracking) != null;
}

export interface CreatePrContext {
  currentBranch: string;
  defaultBranch: string;
  ghInstalled: boolean;
  ghAuthenticated: boolean;
}

export function formatSyncBadgeLabel(
  tracking: GitTrackingData,
  compact: boolean,
  t: (key: string, options?: Record<string, string | number>) => string,
): { text: string; hint: string } | null {
  if (tracking.isDetached) return null;

  if (!tracking.hasRemote) {
    const text = t("git.sync.noRemote");
    return { text: compact ? "—" : text, hint: text };
  }

  if (!tracking.upstreamRef) {
    const text = t("git.sync.noUpstream");
    return { text: compact ? "—" : text, hint: text };
  }

  const remote = tracking.remoteName || tracking.upstreamRef;
  const arrows: string[] = [];
  if (tracking.aheadCount > 0) arrows.push(`↑${tracking.aheadCount}`);
  if (tracking.behindCount > 0) arrows.push(`↓${tracking.behindCount}`);
  const counts = arrows.join(" ");
  const hint = t("git.sync.aheadBehind", {
    ahead: tracking.aheadCount,
    behind: tracking.behindCount,
  });

  if (compact) {
    return { text: counts || remote, hint };
  }
  return { text: counts ? `${counts} · ${remote}` : remote, hint };
}

/** Menu can show Create PR / Copy command / Ask Agent. Dialog stays gated by gh. */
export function shouldShowCreatePrEntry(
  tracking: GitTrackingData,
  ctx: Pick<CreatePrContext, "currentBranch" | "defaultBranch">,
): boolean {
  if (tracking.isDetached || !tracking.upstreamRef) return false;
  if (tracking.aheadCount !== 0) return false;
  if (!ctx.currentBranch || ctx.currentBranch === ctx.defaultBranch) return false;
  return true;
}

/** Enable the Create PR dialog (D7): pushed feature branch + gh ready. */
export function shouldOfferCreatePr(
  tracking: GitTrackingData,
  ctx: CreatePrContext,
): boolean {
  if (!ctx.ghInstalled || !ctx.ghAuthenticated) return false;
  return shouldShowCreatePrEntry(tracking, ctx);
}

export interface WorktreeMergeFollowUpStatus {
  mergedBranch: string;
  aheadAfterMerge: number;
  hasRemote: boolean;
}

export function mergeFollowUpFromStatus(
  mergedBranch: string,
  tracking: GitTrackingData | undefined,
): WorktreeMergeFollowUpStatus {
  return {
    mergedBranch,
    aheadAfterMerge: tracking?.aheadCount ?? 0,
    hasRemote: tracking?.hasRemote ?? false,
  };
}

export type WorktreeMergeFollowUp = "goToLocal" | "push" | "createPr";

export function deriveWorktreeMergeFollowUps(input: {
  isWorktreeView: boolean;
  mergedBranch: string;
  aheadAfterMerge: number;
  hasRemote: boolean;
  defaultBranch: string;
  ghInstalled: boolean;
  ghAuthenticated: boolean;
}): WorktreeMergeFollowUp[] {
  const actions: WorktreeMergeFollowUp[] = [];
  if (input.isWorktreeView) actions.push("goToLocal");
  if (input.aheadAfterMerge > 0) actions.push("push");
  else if (
    input.hasRemote
    && input.mergedBranch
    && input.mergedBranch !== input.defaultBranch
    && input.ghInstalled
    && input.ghAuthenticated
  ) {
    actions.push("createPr");
  }
  return actions;
}
