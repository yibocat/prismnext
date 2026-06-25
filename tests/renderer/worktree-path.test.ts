import { describe, expect, it } from "vitest";
import {
  findWorktreeForDirectory,
  isWorktreeDirectoryActive,
  normalizeCheckoutPath,
  worktreePathsEqual,
} from "../../src/renderer/lib/git/worktree-path";
import type { WorktreeInfo } from "@/types/electron";

const PROJECT = "/Users/test/my-paper";
const WT_PATH = `${PROJECT}/.prismnext/worktrees/calm-owl`;

const worktrees: WorktreeInfo[] = [
  {
    name: "calm-owl",
    path: WT_PATH,
    branch: "wt-calm-owl",
    baseBranch: "feature-auth",
    head: "abc123",
    aheadCount: 1,
    behindCount: 0,
  },
  {
    name: "quick-fox",
    path: `${PROJECT}/.prismnext/worktrees/quick-fox`,
    branch: "wt-quick-fox",
    baseBranch: "main",
    head: "def456",
    aheadCount: 0,
    behindCount: 0,
  },
];

describe("worktree path helpers", () => {
  it("normalizes trailing slashes and backslashes", () => {
    expect(normalizeCheckoutPath(`${WT_PATH}/`)).toBe(WT_PATH);
    expect(worktreePathsEqual(`${WT_PATH}/`, WT_PATH)).toBe(true);
  });

  it("finds worktree by normalized path", () => {
    const found = findWorktreeForDirectory(`${WT_PATH}/`, worktrees, PROJECT);
    expect(found?.name).toBe("calm-owl");
  });

  it("finds worktree by name when path prefix differs", () => {
    const altPath = `${PROJECT}/.prismnext/worktrees/calm-owl`;
    const gitResolved = `${PROJECT}/.prismnext/worktrees/calm-owl`;
    const list: WorktreeInfo[] = [
      { ...worktrees[0], path: gitResolved },
    ];
    const sessionDir = `${altPath}/`;
    expect(findWorktreeForDirectory(sessionDir, list, PROJECT)?.name).toBe("calm-owl");
  });

  it("does not mark other worktrees as closed when one is removed from list", () => {
    const foxPath = `${PROJECT}/.prismnext/worktrees/quick-fox`;
    const remaining = worktrees.filter((w) => w.name === "quick-fox");
    expect(isWorktreeDirectoryActive(foxPath, remaining, PROJECT)).toBe(true);
    expect(isWorktreeDirectoryActive(WT_PATH, remaining, PROJECT)).toBe(false);
  });
});
