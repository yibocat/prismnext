import { describe, expect, it } from "vitest";
import {
  isGitChangeNewFile,
  resolveGitChangeStatusBadge,
  resolveGitChangeBadgeForPath,
} from "../../src/renderer/modes/git-mode/git-change-status";
import type { GitFileItem } from "../../src/renderer/stores/git-store";

function file(overrides: Partial<GitFileItem>): GitFileItem {
  return {
    id: "x",
    path: "x.ts",
    oldPath: null,
    indexStatus: " ",
    worktreeStatus: " ",
    staged: false,
    unstaged: false,
    untracked: false,
    added: 0,
    deleted: 0,
    diff: null,
    diffLoading: false,
    ...overrides,
  };
}

describe("isGitChangeNewFile", () => {
  it("is true for untracked files", () => {
    expect(isGitChangeNewFile(file({ untracked: true }))).toBe(true);
  });

  it("is true for staged additions with no deletions", () => {
    expect(
      isGitChangeNewFile(
        file({ indexStatus: "A", worktreeStatus: " ", staged: true, added: 12 }),
      ),
    ).toBe(true);
  });

  it("is false for modifications even with only additions in diff stat", () => {
    expect(
      isGitChangeNewFile(
        file({ worktreeStatus: "M", unstaged: true, added: 50, deleted: 0 }),
      ),
    ).toBe(false);
  });

  it("is false when diff stat includes deletions", () => {
    expect(
      isGitChangeNewFile(
        file({ indexStatus: "A", staged: true, added: 5, deleted: 2 }),
      ),
    ).toBe(false);
  });
});

describe("resolveGitChangeStatusBadge", () => {
  it("marks untracked files as U", () => {
    expect(resolveGitChangeStatusBadge(file({ untracked: true }))).toEqual({
      letter: "U",
      tone: "untracked",
    });
  });

  it("marks staged additions as A", () => {
    expect(
      resolveGitChangeStatusBadge(
        file({ indexStatus: "A", worktreeStatus: " ", staged: true }),
      ),
    ).toEqual({ letter: "A", tone: "added" });
  });

  it("marks unstaged modifications as M", () => {
    expect(
      resolveGitChangeStatusBadge(
        file({ indexStatus: " ", worktreeStatus: "M", unstaged: true }),
      ),
    ).toEqual({ letter: "M", tone: "modified" });
  });

  it("respects MM split view", () => {
    expect(
      resolveGitChangeStatusBadge(
        file({
          splitView: "staged",
          indexStatus: "M",
          worktreeStatus: "M",
          staged: true,
          unstaged: true,
        }),
      ),
    ).toEqual({ letter: "M", tone: "modified" });

    expect(
      resolveGitChangeStatusBadge(
        file({
          splitView: "unstaged",
          indexStatus: "M",
          worktreeStatus: "M",
          staged: true,
          unstaged: true,
        }),
      ),
    ).toEqual({ letter: "M", tone: "modified" });
  });

  it("prefers unstaged over staged for the same path", () => {
    const gitFiles = [
      file({
        path: "a.ts",
        splitView: "staged",
        indexStatus: "A",
        worktreeStatus: " ",
        staged: true,
        unstaged: false,
      }),
      file({
        path: "a.ts",
        splitView: "unstaged",
        indexStatus: "A",
        worktreeStatus: "M",
        staged: true,
        unstaged: true,
      }),
    ];
    expect(resolveGitChangeBadgeForPath(gitFiles, "a.ts")).toEqual({
      letter: "M",
      tone: "modified",
    });
  });
});
