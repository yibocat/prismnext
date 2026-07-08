import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { StaticMarkdown } from "../../src/renderer/components/modules/chat/static-markdown";

const LABEL_SMOOTHING = `## Label Smoothing（简单提一下）

训练时不是用 one-hot 标签（$y_t$ 位置为 1，其余为 0），而是做平滑：

$$ y_{\\text{smooth}} = \\begin{cases}
1 - \\alpha, & \\text{对正确 token} \\\\
\\alpha / (V - 1), & \\text{对其他 token}
\\end{cases} $$

其中 $\\alpha = 0.1$（Transformer 论文做的）。

**效果**：强迫模型不要对任何一个预测过于自信。`;

describe("StaticMarkdown render", () => {
  it("renders heading, bold, and katex without inline-code swallowing", () => {
    const { container } = render(<StaticMarkdown content={LABEL_SMOOTHING} />);
    const html = container.innerHTML;
    expect(html).toContain("Label Smoothing");
    expect(html).toMatch(/<h2[^>]*>/);
    expect(html).toContain("katex");
    expect(html).toContain("效果");
    expect(html).not.toContain("**效果**");
    // Should not treat the math tail as one giant inline code span
    const inlineCodes = container.querySelectorAll("code:not(pre code)");
    for (const el of inlineCodes) {
      expect(el.textContent?.length ?? 0).toBeLessThan(80);
    }
  });
});
