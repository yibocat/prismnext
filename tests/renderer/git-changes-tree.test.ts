import { describe, it, expect } from "vitest";
import type { GitFileItem } from "@/stores/git-store";
import {
  buildGitChangesTree,
  filterGitFilesByMode,
  flattenGitChangesTree,
  gitFileTreeKey,
  gitFilesToTreeInputs,
  gitFilterModeLineCounts,
} from "@/modes/git-mode/git-changes-tree";

function makeFile(overrides: Partial<GitFileItem> & Pick<GitFileItem, "id" | "path">): GitFileItem {
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

describe("git-changes-tree", () => {
  it("builds nested folder tree from paths", () => {
    const files = [
      makeFile({ id: "a", path: "src/main/foo.ts" }),
      makeFile({ id: "b", path: "src/renderer/bar.tsx" }),
    ];
    const tree = buildGitChangesTree(files);
    expect(tree.some((n) => n.name === "src" && n.type === "folder")).toBe(true);
    const expanded = new Set(["src", "src/main", "src/renderer"]);
    const flat = flattenGitChangesTree(files, expanded);
    const leaves = flat.filter((n) => n.type === "file");
    expect(leaves).toHaveLength(2);
    expect(leaves.map((n) => n.gitFileId).sort()).toEqual(["a", "b"]);
  });

  it("splits MM entries into separate tree keys", () => {
    const staged = makeFile({
      id: "mm-staged",
      path: "readme.md",
      staged: true,
      unstaged: false,
      splitView: "staged",
    });
    const unstaged = makeFile({
      id: "mm-unstaged",
      path: "readme.md",
      staged: false,
      unstaged: true,
      splitView: "unstaged",
    });
    expect(gitFileTreeKey(staged)).toBe("readme.md#staged");
    expect(gitFileTreeKey(unstaged)).toBe("readme.md#unstaged");

    const { pseudoFiles } = gitFilesToTreeInputs([staged, unstaged]);
    expect(pseudoFiles).toHaveLength(2);

    const flat = flattenGitChangesTree([staged, unstaged], new Set());
    expect(flat.filter((n) => n.type === "file")).toHaveLength(2);
  });

  it("filterGitFilesByMode respects staged/unstaged/all", () => {
    const files = [
      makeFile({ id: "s", path: "a.ts", staged: true, unstaged: false }),
      makeFile({ id: "u", path: "b.ts", staged: false, unstaged: true }),
      makeFile({ id: "t", path: "c.ts", staged: false, unstaged: false, untracked: true }),
    ];
    expect(filterGitFilesByMode(files, "staged").map((f) => f.id)).toEqual(["s"]);
    expect(filterGitFilesByMode(files, "unstaged").map((f) => f.id).sort()).toEqual(["t", "u"]);
    expect(filterGitFilesByMode(files, "all")).toHaveLength(3);
  });

  it("sums +/− line counts per filter mode", () => {
    const files = [
      makeFile({ id: "s", path: "a.ts", staged: true, unstaged: false, added: 10, deleted: 2 }),
      makeFile({ id: "u", path: "b.ts", staged: false, unstaged: true, added: 4, deleted: 1 }),
      makeFile({
        id: "t",
        path: "c.ts",
        staged: false,
        unstaged: false,
        untracked: true,
        added: 7,
        deleted: 0,
      }),
    ];
    expect(gitFilterModeLineCounts(files)).toEqual({
      all: { added: 21, deleted: 3 },
      staged: { added: 10, deleted: 2 },
      unstaged: { added: 11, deleted: 1 },
    });
  });
});
