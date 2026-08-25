import { describe, expect, it } from "vitest";
import type { GitTrackingData } from "@shared/git";
import { EMPTY_TRACKING } from "@shared/git";
import {
  derivePushAction,
  derivePushLabel,
  deriveWorktreeMergeFollowUps,
  formatSyncBadgeLabel,
  mergeFollowUpFromStatus,
  shouldOfferCreatePr,
  shouldOfferPushAfterCommit,
  shouldShowCreatePrEntry,
} from "@/lib/git/git-publish";
import { buildAskAgentPrPrompt } from "@/lib/git/agent-pr-prompt";

function tracking(partial: Partial<GitTrackingData>): GitTrackingData {
  return { ...EMPTY_TRACKING, ...partial };
}

const labels = { push: "Push", publish: "Publish" };

describe("derivePushAction", () => {
  it("hides push on detached HEAD", () => {
    expect(derivePushAction(tracking({ isDetached: true, hasRemote: true }))).toBeNull();
  });

  it("hides push when there is no remote", () => {
    expect(derivePushAction(tracking({ hasRemote: false }))).toBeNull();
  });

  it("offers Publish when a remote exists but there is no upstream", () => {
    expect(derivePushAction(tracking({ hasRemote: true, remoteName: "gitea" }))).toEqual({
      kind: "publish",
      aheadCount: 0,
    });
  });

  it("offers Push when ahead of upstream", () => {
    expect(
      derivePushAction(
        tracking({
          hasRemote: true,
          upstreamRef: "origin/master",
          remoteName: "origin",
          aheadCount: 2,
        }),
      ),
    ).toEqual({ kind: "push", aheadCount: 2 });
  });

  it("hides Push when already in sync", () => {
    expect(
      derivePushAction(
        tracking({
          hasRemote: true,
          upstreamRef: "origin/master",
          remoteName: "origin",
        }),
      ),
    ).toBeNull();
  });

  it("still offers Push when diverged (ahead and behind)", () => {
    expect(
      derivePushAction(
        tracking({
          hasRemote: true,
          upstreamRef: "origin/master",
          aheadCount: 1,
          behindCount: 2,
        }),
      ),
    ).toEqual({ kind: "push", aheadCount: 1 });
  });
});

describe("derivePushLabel / shouldOfferPushAfterCommit", () => {
  it("formats Push ↑N and Publish", () => {
    expect(
      derivePushLabel(
        tracking({
          hasRemote: true,
          upstreamRef: "origin/master",
          aheadCount: 2,
        }),
        labels,
      ),
    ).toBe("Push ↑2");
    expect(derivePushLabel(tracking({ hasRemote: true }), labels)).toBe("Publish");
    expect(derivePushLabel(EMPTY_TRACKING, labels)).toBeNull();
  });

  it("offers a post-commit Push when there is something to publish", () => {
    expect(shouldOfferPushAfterCommit(tracking({ hasRemote: true }))).toBe(true);
    expect(
      shouldOfferPushAfterCommit(
        tracking({ hasRemote: true, upstreamRef: "origin/master", aheadCount: 1 }),
      ),
    ).toBe(true);
    expect(
      shouldOfferPushAfterCommit(
        tracking({ hasRemote: true, upstreamRef: "origin/master" }),
      ),
    ).toBe(false);
  });
});

describe("formatSyncBadgeLabel", () => {
  const catalog: Record<string, string> = {
    "git.sync.aheadBehind": "{{ahead}} ahead · {{behind}} behind",
    "git.sync.noUpstream": "No upstream",
    "git.sync.noRemote": "No remote",
  };

  function t(key: string, options?: Record<string, string | number>): string {
    let text = catalog[key] ?? key;
    if (options) {
      for (const [k, v] of Object.entries(options)) {
        text = text.replaceAll(`{{${k}}}`, String(v));
      }
    }
    return text;
  }

  it("hides the badge on detached HEAD", () => {
    expect(formatSyncBadgeLabel(tracking({ isDetached: true, hasRemote: true }), false, t)).toBeNull();
  });

  it("shows no-remote and no-upstream copy", () => {
    expect(formatSyncBadgeLabel(EMPTY_TRACKING, false, t)).toEqual({
      text: "No remote",
      hint: "No remote",
    });
    expect(formatSyncBadgeLabel(tracking({ hasRemote: true, remoteName: "gitea" }), false, t)).toEqual({
      text: "No upstream",
      hint: "No upstream",
    });
  });

  it("shows arrows and the real remote name", () => {
    expect(
      formatSyncBadgeLabel(
        tracking({
          hasRemote: true,
          upstreamRef: "gitea/paper",
          remoteName: "gitea",
          aheadCount: 2,
          behindCount: 1,
        }),
        false,
        t,
      ),
    ).toEqual({
      text: "↑2 ↓1 · gitea",
      hint: "2 ahead · 1 behind",
    });
  });

  it("omits zero arrows when in sync", () => {
    expect(
      formatSyncBadgeLabel(
        tracking({
          hasRemote: true,
          upstreamRef: "origin/master",
          remoteName: "origin",
        }),
        false,
        t,
      )?.text,
    ).toBe("origin");
  });

  it("compacts to arrows only", () => {
    expect(
      formatSyncBadgeLabel(
        tracking({
          hasRemote: true,
          upstreamRef: "origin/master",
          remoteName: "origin",
          aheadCount: 2,
        }),
        true,
        t,
      )?.text,
    ).toBe("↑2");
  });
});

describe("shouldShowCreatePrEntry / shouldOfferCreatePr", () => {
  const ready = tracking({
    hasRemote: true,
    upstreamRef: "origin/feat",
    remoteName: "origin",
    aheadCount: 0,
  });
  const branch = { currentBranch: "feat", defaultBranch: "master" };
  const gh = {
    ...branch,
    ghInstalled: true,
    ghAuthenticated: true,
  };

  it("shows the menu entry after a feature branch is pushed, even without gh", () => {
    expect(shouldShowCreatePrEntry(ready, branch)).toBe(true);
    expect(shouldOfferCreatePr(ready, { ...gh, ghInstalled: false })).toBe(false);
  });

  it("offers Create PR after a feature branch is pushed with gh", () => {
    expect(shouldOfferCreatePr(ready, gh)).toBe(true);
  });

  it("hides PR on the default branch, when still ahead, or without upstream", () => {
    expect(shouldShowCreatePrEntry(ready, { ...branch, currentBranch: "master" })).toBe(false);
    expect(shouldOfferCreatePr(ready, { ...gh, currentBranch: "master" })).toBe(false);
    expect(shouldShowCreatePrEntry({ ...ready, aheadCount: 1 }, branch)).toBe(false);
    expect(shouldOfferCreatePr({ ...ready, aheadCount: 1 }, gh)).toBe(false);
    expect(shouldOfferCreatePr(ready, { ...gh, ghInstalled: false })).toBe(false);
    expect(shouldOfferCreatePr(ready, { ...gh, ghAuthenticated: false })).toBe(false);
    expect(shouldShowCreatePrEntry({ ...ready, upstreamRef: null }, branch)).toBe(false);
    expect(shouldOfferCreatePr({ ...ready, upstreamRef: null }, gh)).toBe(false);
  });
});

describe("worktree merge follow-up", () => {
  it("reads ahead/remote from status after merge", () => {
    expect(
      mergeFollowUpFromStatus("master", tracking({ aheadCount: 2, hasRemote: true })),
    ).toEqual({
      mergedBranch: "master",
      aheadAfterMerge: 2,
      hasRemote: true,
    });
    expect(mergeFollowUpFromStatus("main", undefined)).toEqual({
      mergedBranch: "main",
      aheadAfterMerge: 0,
      hasRemote: false,
    });
  });

  it("offers Go to Local and Push when still in a worktree and the base is ahead", () => {
    expect(
      deriveWorktreeMergeFollowUps({
        isWorktreeView: true,
        mergedBranch: "master",
        aheadAfterMerge: 2,
        hasRemote: true,
        defaultBranch: "master",
        ghInstalled: true,
        ghAuthenticated: true,
      }),
    ).toEqual(["goToLocal", "push"]);
  });

  it("offers Create PR when the merged branch is already pushed and is not the default", () => {
    expect(
      deriveWorktreeMergeFollowUps({
        isWorktreeView: false,
        mergedBranch: "feat",
        aheadAfterMerge: 0,
        hasRemote: true,
        defaultBranch: "master",
        ghInstalled: true,
        ghAuthenticated: true,
      }),
    ).toEqual(["createPr"]);
  });

  it("does not offer Create PR on the default branch, and still offers Push without a remote", () => {
    expect(
      deriveWorktreeMergeFollowUps({
        isWorktreeView: false,
        mergedBranch: "master",
        aheadAfterMerge: 1,
        hasRemote: false,
        defaultBranch: "master",
        ghInstalled: true,
        ghAuthenticated: true,
      }),
    ).toEqual(["push"]);
  });
});

describe("buildAskAgentPrPrompt", () => {
  it("adds recent commits and a session id to the composer template", () => {
    const prompt = buildAskAgentPrPrompt({
      head: "feat/fig",
      base: "master",
      title: "Add figure",
      commitSubjects: ["Add figure", "Tidy caption"],
      sessionId: "sess-1",
    });
    expect(prompt).toMatch(/gh pr create/);
    expect(prompt).toMatch(/Add figure/);
    expect(prompt).toMatch(/Tidy caption/);
    expect(prompt).toMatch(/sess-1/);
  });
});
