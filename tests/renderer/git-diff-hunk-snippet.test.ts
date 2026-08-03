import { describe, expect, it } from "vitest";
import {
  buildFullFileGitDiffSnippet,
  chunksIntersectingSelection,
  expandChunksToHunks,
  formatUnifiedPatch,
  gitDiffSnippetLabel,
  gitDiffSnippetTooltip,
  type GitDiffHunk,
} from "../../src/renderer/lib/git/diff-hunk-snippet";
import type { ChunkLike } from "../../src/renderer/lib/git/diff-chunk-lines";

describe("diff-hunk-snippet", () => {
  const oldText = ["alpha", "beta", "gamma", "delta", "epsilon"].join("\n");
  const newText = ["alpha", "BETA", "gamma", "delta", "zeta", "eta"].join("\n");

  it("chunksIntersectingSelection matches modification on side b", () => {
    const chunks: ChunkLike[] = [{ fromA: 6, toA: 10, fromB: 6, toB: 10 }];
    expect(chunksIntersectingSelection(chunks, "b", 6, 9)).toHaveLength(1);
    expect(chunksIntersectingSelection(chunks, "b", 0, 5)).toHaveLength(0);
  });

  it("chunksIntersectingSelection matches pure deletion widget anchor", () => {
    const chunks: ChunkLike[] = [{ fromA: 0, toA: 5, fromB: 20, toB: 20 }];
    expect(chunksIntersectingSelection(chunks, "b", 20, 20)).toHaveLength(1);
  });

  it("expandChunksToHunks includes context and +/- lines", () => {
    const chunks: ChunkLike[] = [{ fromA: 6, toA: 10, fromB: 6, toB: 10 }];
    const hunks = expandChunksToHunks(oldText, newText, chunks, 1);
    expect(hunks).toHaveLength(1);
    const hunk = hunks[0];
    expect(hunk.lines.some((l) => l.startsWith("-"))).toBe(true);
    expect(hunk.lines.some((l) => l.startsWith("+"))).toBe(true);
    expect(hunk.lines.some((l) => l.startsWith(" "))).toBe(true);
    expect(hunk.oldStartLine).toBeGreaterThanOrEqual(1);
    expect(hunk.newStartLine).toBeGreaterThanOrEqual(1);
  });

  it("expandChunksToHunks handles pure insertion", () => {
    const oldOnly = "line1\nline2";
    const newOnly = "line1\nline2\nline3";
    const chunks: ChunkLike[] = [{ fromA: 11, toA: 11, fromB: 12, toB: 17 }];
    const hunks = expandChunksToHunks(oldOnly, newOnly, chunks, 0);
    expect(hunks[0].lines.some((l) => l.startsWith("+"))).toBe(true);
    expect(hunks[0].lines.some((l) => l.startsWith("-"))).toBe(false);
  });

  it("expandChunksToHunks handles pure deletion", () => {
    const chunks: ChunkLike[] = [{ fromA: 6, toA: 10, fromB: 6, toB: 6 }];
    const hunks = expandChunksToHunks(oldText, newText, chunks, 0);
    expect(hunks[0].lines.some((l) => l.startsWith("-"))).toBe(true);
  });

  it("expandChunksToHunks produces multiple hunks for multiple chunks", () => {
    const chunks: ChunkLike[] = [
      { fromA: 6, toA: 10, fromB: 6, toB: 10 },
      { fromA: oldText.length, toA: oldText.length, fromB: 21, toB: newText.length },
    ];
    const hunks = expandChunksToHunks(oldText, newText, chunks, 0);
    expect(hunks).toHaveLength(2);
  });

  it("formatUnifiedPatch emits standard headers", () => {
    const hunks: GitDiffHunk[] = [
      {
        oldStartLine: 2,
        oldLineCount: 3,
        newStartLine: 2,
        newLineCount: 3,
        lines: [" alpha", "-beta", "+BETA", " gamma"],
      },
    ];
    const patch = formatUnifiedPatch("src/foo.ts", hunks);
    expect(patch).toContain("--- a/src/foo.ts");
    expect(patch).toContain("+++ b/src/foo.ts");
    expect(patch).toContain("@@ -2,3 +2,3 @@");
    expect(patch).toContain("-beta");
    expect(patch).toContain("+BETA");
  });

  it("gitDiffSnippetLabel prefers new-side line range", () => {
    const hunks: GitDiffHunk[] = [
      {
        oldStartLine: 2,
        oldLineCount: 2,
        newStartLine: 12,
        newLineCount: 3,
        lines: ["-a", "+b"],
      },
    ];
    expect(gitDiffSnippetLabel("src/main.ts", hunks)).toBe("main.ts:12-14");
  });

  it("gitDiffSnippetLabel falls back to old-side for deletions only", () => {
    const hunks: GitDiffHunk[] = [
      {
        oldStartLine: 4,
        oldLineCount: 2,
        newStartLine: 4,
        newLineCount: 1,
        lines: [" context", "-gone"],
      },
    ];
    expect(gitDiffSnippetLabel("a/b.ts", hunks)).toBe("b.ts:4-5");
  });

  it("gitDiffSnippetTooltip summarizes line counts", () => {
    expect(gitDiffSnippetTooltip(3, 2)).toBe("含 3 行删除 + 2 行新增");
    expect(gitDiffSnippetTooltip(0, 4)).toBe("含 4 行新增");
    expect(gitDiffSnippetTooltip(0, 0)).toBe("无改动行");
  });

  it("buildFullFileGitDiffSnippet covers entire file change", () => {
    const snippet = buildFullFileGitDiffSnippet("src/a.ts", oldText, newText);
    expect(snippet).not.toBeNull();
    expect(snippet!.hunks).toHaveLength(1);
    expect(snippet!.addedLineCount).toBeGreaterThan(0);
    expect(snippet!.removedLineCount).toBeGreaterThan(0);
    expect(snippet!.hunks[0]!.lines.some((l) => l.startsWith("+"))).toBe(true);
    expect(snippet!.hunks[0]!.lines.some((l) => l.startsWith("-"))).toBe(true);
  });
});
