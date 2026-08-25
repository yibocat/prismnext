import { describe, expect, it } from "vitest";
import {
  intersectTouchedWorkingPaths,
  shouldOfferBranchCommitsMenu,
} from "../../src/shared/git/changes-lens";
import { resolveLastAgentTurnFromSnapshot } from "../../src/renderer/lib/git/agent-turn-lens";
import {
  filterGitFilesByLens,
  sumGitLineCounts,
} from "../../src/renderer/modes/git-mode/git-changes-tree";
import type { GitFileItem } from "../../src/renderer/stores/git-store";

function file(overrides: Partial<GitFileItem> & Pick<GitFileItem, "id" | "path">): GitFileItem {
  return {
    indexStatus: "M",
    worktreeStatus: "M",
    staged: false,
    unstaged: true,
    untracked: false,
    diff: null,
    diffLoading: false,
    added: 1,
    deleted: 0,
    ...overrides,
  };
}

describe("intersectTouchedWorkingPaths", () => {
  it("keeps only paths still in the working tree, ignoring ./ prefixes", () => {
    expect(
      [...intersectTouchedWorkingPaths(["./src/a.ts", "gone.ts"], ["src/a.ts", "other.ts"])],
    ).toEqual(["src/a.ts"]);
  });
});

describe("shouldOfferBranchCommitsMenu", () => {
  it("hides Commits on the default branch and detached HEAD", () => {
    expect(shouldOfferBranchCommitsMenu("master", "master", 3)).toBe(false);
    expect(shouldOfferBranchCommitsMenu("main", "main", 2)).toBe(false);
    expect(shouldOfferBranchCommitsMenu("HEAD", "master", 4)).toBe(false);
    expect(shouldOfferBranchCommitsMenu("feat/foo", "master", 0)).toBe(false);
  });

  it("shows Commits on a feature branch that is ahead of default", () => {
    expect(shouldOfferBranchCommitsMenu("feat/foo", "master", 2)).toBe(true);
  });
});

describe("resolveLastAgentTurnFromSnapshot", () => {
  it("requires an active tab that belongs to the project", () => {
    expect(
      resolveLastAgentTurnFromSnapshot({
        gitRoot: "/paper",
        activeTabId: null,
        tabBelongsToProject: true,
        boundCheckoutPath: "/paper",
        pendingTouched: ["a.ts"],
        latestTouched: null,
        workingPaths: ["a.ts"],
      }).status,
    ).toBe("no-tab");
    expect(
      resolveLastAgentTurnFromSnapshot({
        gitRoot: "/paper",
        activeTabId: "t1",
        tabBelongsToProject: false,
        boundCheckoutPath: "/paper",
        pendingTouched: ["a.ts"],
        latestTouched: null,
        workingPaths: ["a.ts"],
      }).status,
    ).toBe("no-tab");
  });

  it("rejects a checkpoint bound to another checkout", () => {
    expect(
      resolveLastAgentTurnFromSnapshot({
        gitRoot: "/paper",
        activeTabId: "t1",
        tabBelongsToProject: true,
        boundCheckoutPath: "/paper/.worktrees/agent",
        pendingTouched: ["a.ts"],
        latestTouched: null,
        workingPaths: ["a.ts"],
      }).status,
    ).toBe("wrong-checkout");
  });

  it("prefers the in-flight turn and intersects with git status", () => {
    const result = resolveLastAgentTurnFromSnapshot({
      gitRoot: "/paper",
      activeTabId: "t1",
      tabBelongsToProject: true,
      boundCheckoutPath: "/paper",
      pendingTouched: ["a.ts", "committed.ts"],
      latestTouched: ["old.ts"],
      latestTurnIndex: 3,
      workingPaths: ["a.ts", "other.ts"],
    });
    expect(result.status).toBe("ready");
    expect([...result.paths]).toEqual(["a.ts"]);
    expect(result.turnIndex).toBe(3);
  });

  it("falls back to the latest checkpoint when no turn is pending", () => {
    const result = resolveLastAgentTurnFromSnapshot({
      gitRoot: "/paper/",
      activeTabId: "t1",
      tabBelongsToProject: true,
      boundCheckoutPath: "/paper",
      pendingTouched: null,
      latestTouched: ["b.ts"],
      latestTurnIndex: 1,
      workingPaths: ["b.ts"],
    });
    expect(result.status).toBe("ready");
    expect([...result.paths]).toEqual(["b.ts"]);
  });

  it("is empty when the turn files are already committed", () => {
    expect(
      resolveLastAgentTurnFromSnapshot({
        gitRoot: "/paper",
        activeTabId: "t1",
        tabBelongsToProject: true,
        boundCheckoutPath: "/paper",
        pendingTouched: null,
        latestTouched: ["done.ts"],
        workingPaths: ["other.ts"],
      }).status,
    ).toBe("empty");
  });
});

describe("filterGitFilesByLens", () => {
  const files = [
    file({ id: "s", path: "a.ts", staged: true, unstaged: false, added: 10, deleted: 2 }),
    file({ id: "u", path: "b.ts", staged: false, unstaged: true, added: 4, deleted: 1 }),
  ];

  it("keeps working-mode filters and last-turn path intersection", () => {
    expect(filterGitFilesByLens(files, { kind: "working", mode: "staged" }).map((f) => f.id)).toEqual(
      ["s"],
    );
    expect(
      filterGitFilesByLens(files, { kind: "last-agent-turn" }, new Set(["b.ts"])).map((f) => f.id),
    ).toEqual(["u"]);
    expect(filterGitFilesByLens(files, { kind: "commit", hash: "abc1234" })).toEqual([]);
    expect(filterGitFilesByLens(files, { kind: "branch-changes" })).toEqual([]);
  });

  it("sums last-turn line counts from the filtered rows", () => {
    const last = filterGitFilesByLens(files, { kind: "last-agent-turn" }, new Set(["a.ts"]));
    expect(sumGitLineCounts(last)).toEqual({ added: 10, deleted: 2 });
  });
});
