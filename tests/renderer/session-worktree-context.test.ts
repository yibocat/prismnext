import { describe, expect, it } from "vitest";
import { resolveSessionWorktreeContext } from "../../src/renderer/lib/git/session-worktree-context";
import type { WorktreeInfo } from "@/types/electron";

const PROJECT = "/Users/test/my-paper";
const WT_PATH = `${PROJECT}/.prismnext/worktrees/calm-owl`;

const activeWorktrees: WorktreeInfo[] = [
  {
    name: "calm-owl",
    path: WT_PATH,
    branch: "wt-calm-owl",
    baseBranch: "feature-auth",
    head: "abc123",
    aheadCount: 1,
    behindCount: 0,
  },
];

describe("resolveSessionWorktreeContext", () => {
  it("labels local sessions", () => {
    const ctx = resolveSessionWorktreeContext(PROJECT, PROJECT, activeWorktrees);
    expect(ctx.kind).toBe("local");
    expect(ctx.shortLabel).toBe("Local");
  });

  it("labels active worktree sessions with branch target", () => {
    const ctx = resolveSessionWorktreeContext(WT_PATH, PROJECT, activeWorktrees);
    expect(ctx.kind).toBe("worktree");
    expect(ctx.shortLabel).toBe("calm-owl · feature-auth");
    expect(ctx.label).toBe("calm-owl → feature-auth");
  });

  it("labels closed worktree sessions from stored directory", () => {
    const closedPath = `${PROJECT}/.prismnext/worktrees/old-owl`;
    const ctx = resolveSessionWorktreeContext(closedPath, PROJECT, activeWorktrees);
    expect(ctx.kind).toBe("closed-worktree");
    expect(ctx.shortLabel).toContain("old-owl");
    expect(ctx.shortLabel).toContain("closed");
  });

  it("still labels active worktree when session path has trailing slash", () => {
    const ctx = resolveSessionWorktreeContext(`${WT_PATH}/`, PROJECT, activeWorktrees);
    expect(ctx.kind).toBe("worktree");
    expect(ctx.shortLabel).toBe("calm-owl · feature-auth");
  });

  it("does not mark sibling worktree sessions as closed after one is removed", () => {
    const foxPath = `${PROJECT}/.prismnext/worktrees/quick-fox`;
    const remaining: WorktreeInfo[] = [
      {
        name: "quick-fox",
        path: foxPath,
        branch: "wt-quick-fox",
        baseBranch: "main",
        head: "def456",
        aheadCount: 0,
        behindCount: 0,
      },
    ];
    const ctx = resolveSessionWorktreeContext(foxPath, PROJECT, remaining);
    expect(ctx.kind).toBe("worktree");
    expect(ctx.shortLabel).toContain("quick-fox");
  });
});
