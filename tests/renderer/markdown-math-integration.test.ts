import { describe, expect, it } from "vitest";
import { prepareMarkdownMath, normalizeMathDelimiters } from "../../src/renderer/lib/markdown/markdown-config";

const LABEL_SMOOTHING = `## Label Smoothing（简单提一下）

训练时不是用 one-hot 标签（$y_t$ 位置为 1，其余为 0），而是做平滑：

$$ y_{\\text{smooth}} = \\begin{cases}
1 - \\alpha, & \\text{对正确 token} \\\\
\\alpha / (V - 1), & \\text{对其他 token}
\\end{cases} $$

其中 $\\alpha = 0.1$（Transformer 论文做的）。

**效果**：强迫模型不要对任何一个预测过于自信（真实标签概率不会到 1），对翻译的 BLEU 有微弱提升但减轻过拟合。`;

describe("markdown math integration", () => {
  it("preserves $$ display math with cases environment", () => {
    const out = prepareMarkdownMath(LABEL_SMOOTHING);
    expect(out).toContain("$$");
    expect(out).toContain("\\begin{cases}");
    expect(out).toContain("\\end{cases}");
    expect(out).toContain("**效果**");
    expect(out).not.toMatch(/\$\$[\s\S]*\$\$[\s\S]*\$\$/); // no accidental double-wrap
  });

  it("normalizeMathDelimiters puts $$ delimiters on their own lines", () => {
    const out = normalizeMathDelimiters(LABEL_SMOOTHING);
    expect(out).toMatch(/\n\$\$\ny_\{\\text\{smooth\}\}/);
    expect(out).toMatch(/\\end\{cases\}\n\$\$\n/);
    expect(out).toContain("\\begin{cases}");
  });
});
