import { describe, expect, it, vi } from "vitest";
import { reconcileWorktreeList } from "../../src/renderer/lib/git/worktree-present";
import type { WorktreeInfo } from "@/types/electron";

const PROJECT = "/proj";
const WT_A: WorktreeInfo = {
  name: "calm-owl",
  path: `${PROJECT}/.prismnext/worktrees/calm-owl`,
  branch: "wt-calm-owl",
  baseBranch: "main",
  head: "abc",
  aheadCount: 0,
  behindCount: 0,
};
const WT_B: WorktreeInfo = {
  name: "quick-fox",
  path: `${PROJECT}/.prismnext/worktrees/quick-fox`,
  branch: "wt-quick-fox",
  baseBranch: "main",
  head: "def",
  aheadCount: 0,
  behindCount: 0,
};

describe("reconcileWorktreeList", () => {
  it("keeps sibling worktrees when git list is empty but directory still exists", async () => {
    vi.stubGlobal("electronAPI", {
      fsExists: vi.fn(async (path: string) =>
        path === `${WT_B.path}/.git`),
    });

    const result = await reconcileWorktreeList([], [WT_A, WT_B]);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("quick-fox");
  });

  it("does not restore a worktree that was actually removed from disk", async () => {
    vi.stubGlobal("electronAPI", {
      fsExists: vi.fn(async () => false),
    });

    const result = await reconcileWorktreeList([WT_B], [WT_A, WT_B]);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("quick-fox");
  });
});
