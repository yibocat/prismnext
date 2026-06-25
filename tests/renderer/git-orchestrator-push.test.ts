import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorktreeInfo } from "@/types/electron";
import { mergeWorktreeToBase } from "@/lib/git/git-orchestrator";

const worktree: WorktreeInfo = {
  name: "calm-owl",
  path: "/proj/.prismnext/worktrees/calm-owl",
  branch: "wt-calm-owl",
  baseBranch: "main",
  head: "abc1234",
  aheadCount: 1,
  behindCount: 0,
};

describe("mergeWorktreeToBase rollback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).electronAPI = {
      gitStatus: vi.fn().mockResolvedValue({ branch: "feature" }),
      gitCommitAll: vi.fn().mockResolvedValue({ success: true }),
      gitStash: vi.fn().mockResolvedValue({ success: true }),
      gitCheckout: vi.fn().mockResolvedValue({ success: true }),
      gitMergeNoCommit: vi.fn().mockResolvedValue({ success: false, error: "conflict" }),
      gitAbortMerge: vi.fn().mockResolvedValue({ success: true }),
      gitStashPop: vi.fn().mockResolvedValue({ success: true }),
      gitCommit: vi.fn(),
    };
  });

  it("rolls back stash and branch when merge fails", async () => {
    const result = await mergeWorktreeToBase({
      projectRoot: "/proj",
      worktree,
      changedFiles: ["a.tex"],
      aheadCount: 0,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Merge failed");
    expect(window.electronAPI.gitCheckout).toHaveBeenCalledWith("/proj", "main");
    expect(window.electronAPI.gitStashPop).toHaveBeenCalledWith("/proj");
    expect(window.electronAPI.gitAbortMerge).not.toHaveBeenCalled();
  });

  it("aborts merge when merge staged but commit fails", async () => {
    let statusCalls = 0;
    (window as any).electronAPI.gitStatus = vi.fn().mockImplementation(() => {
      statusCalls += 1;
      return Promise.resolve({ branch: statusCalls === 1 ? "feature" : "main" });
    });
    (window as any).electronAPI.gitMergeNoCommit = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI.gitCommit = vi.fn().mockResolvedValue({ success: false, error: "commit failed" });

    const result = await mergeWorktreeToBase({
      projectRoot: "/proj",
      worktree,
      changedFiles: [],
      aheadCount: 1,
    });

    expect(result.success).toBe(false);
    expect(window.electronAPI.gitAbortMerge).toHaveBeenCalledWith("/proj");
    expect(window.electronAPI.gitCheckout).toHaveBeenCalledWith("/proj", "main");
    expect(window.electronAPI.gitCheckout).toHaveBeenCalledWith("/proj", "feature");
    expect(window.electronAPI.gitStashPop).toHaveBeenCalledWith("/proj");
  });
});
