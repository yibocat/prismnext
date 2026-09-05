import { describe, expect, it } from "vitest";
import { useBlockSplitter } from "../../src/renderer/components/modules/chat/use-block-splitter";
import { renderHook } from "@testing-library/react";

/** Simulate streaming by growing content and collecting committed snapshots. */
function simulateStreaming(chunks: string[]) {
  let full = "";
  const committedSnapshots: string[] = [];
  for (const chunk of chunks) {
    full += chunk;
    const { result } = renderHook(() => useBlockSplitter(full));
    committedSnapshots.push(result.current.committed);
  }
  return { full, committedSnapshots };
}

describe("useBlockSplitter committedBlocks", () => {
  const DOC = [
    "## Heading intro",
    "",
    "First paragraph with $x=1$ math.",
    "",
    "$$ a^2 + b^2 = c^2 $$",
    "",
    "```ts",
    "const a = 1;",
    "```",
    "",
    "- item one",
    "- item two",
    "",
    "Final paragraph.",
  ].join("\n");

  it("blocks appear in order within committed (whitespace slivers dropped)", () => {
    const { result } = renderHook(() => useBlockSplitter(DOC));
    const { committedBlocks, committed, pending } = result.current;
    // No stray whitespace-only blocks; every block is real content.
    for (const block of committedBlocks) {
      expect(block.trim()).not.toBe("");
    }
    // Blocks must appear in order inside committed (blank slivers between
    // fence close and the next \n\n are filtered out, so join !== committed).
    let pos = 0;
    for (const block of committedBlocks) {
      const at = committed.indexOf(block, pos);
      expect(at).toBeGreaterThanOrEqual(pos);
      pos = at + block.length;
    }
    // Full document is still recoverable from committed + pending.
    expect((committed + pending).replace(/\n+$/, "")).toBe(DOC);
  });

  it("keeps earlier blocks byte-identical while streaming appends", () => {
    const chunks = DOC.split(/(?<=\n)/);
    let full = "";
    let prevBlocks: string[] = [];
    for (const chunk of chunks) {
      full += chunk;
      const { result } = renderHook(() => useBlockSplitter(full));
      const blocks = result.current.committedBlocks;
      // Append-only: every previously seen block keeps its exact content.
      for (let i = 0; i < prevBlocks.length; i++) {
        expect(blocks[i]).toBe(prevBlocks[i]);
      }
      prevBlocks = blocks;
    }
    expect(prevBlocks.length).toBeGreaterThan(2);
  });

  it("never splits inside a fenced code block", () => {
    const doc = "Intro.\n\n```py\nprint('a')\n\nprint('b')\n```\n\nTail.";
    const { result } = renderHook(() => useBlockSplitter(doc));
    const codeBlock = result.current.committedBlocks.find((b) => b.includes("print"));
    expect(codeBlock).toContain("print('a')");
    expect(codeBlock).toContain("print('b')");
  });
});

const LABEL_SMOOTHING = `## Label Smoothing（简单提一下）

训练时不是用 one-hot 标签（$y_t$ 位置为 1，其余为 0），而是做平滑：

$$ y_{\\text{smooth}} = \\begin{cases}
1 - \\alpha, & \\text{对正确 token} \\\\
\\alpha / (V - 1), & \\text{对其他 token}
\\end{cases} $$

其中 $\\alpha = 0.1$（Transformer 论文做的）。

**效果**：强迫模型不要对任何一个预测过于自信。`;

describe("useBlockSplitter streaming math", () => {
  it("never commits an unclosed $$ display-math fence", () => {
    // Grow character-by-character (worst case for fence detection)
    const chars = LABEL_SMOOTHING.split("");
    let full = "";
    for (let i = 0; i < chars.length; i++) {
      full += chars[i];
      const { result } = renderHook(() => useBlockSplitter(full));
      const committed = result.current.committed;
      const opens = (committed.match(/\$\$/g) || []).length;
      if (opens > 0) {
        // Every $$ in committed must be paired
        expect(opens % 2).toBe(0);
      }
    }
  });

  it("commits full document only after closing $$", () => {
    const closeIdx = LABEL_SMOOTHING.indexOf("\\end{cases} $$") + "\\end{cases} $$".length;
    const beforeClose = LABEL_SMOOTHING.slice(0, closeIdx - 2);
    const { result: r1 } = renderHook(() => useBlockSplitter(beforeClose));
    expect(r1.current.committed).not.toContain("\\begin{cases}");

    const { result: r2 } = renderHook(() => useBlockSplitter(LABEL_SMOOTHING));
    expect(r2.current.committed).toContain("\\begin{cases}");
    expect(r2.current.committed + r2.current.pending).toBe(LABEL_SMOOTHING);
  });
});
