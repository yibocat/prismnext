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
