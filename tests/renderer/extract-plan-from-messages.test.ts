import { describe, expect, it } from "vitest";
import {
  extractPlanDraftFromMessages,
  extractStepsFromPlanMarkdown,
} from "../../src/renderer/lib/chat/extract-plan-from-messages";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

describe("extractStepsFromPlanMarkdown", () => {
  it("extracts numbered落地 steps only under an explicit heading", () => {
    const md = `
## 建议落地步骤（增量）
1. 重写 brief
2. 新建 experiment 岛
3. 跑 smoke
`;
    const steps = extractStepsFromPlanMarkdown(md);
    expect(steps).toHaveLength(3);
    expect(steps[0]?.text).toContain("brief");
  });

  it("does not scrape every numbered list in a diagnosis essay", () => {
    const md = `
# 现状诊断（按严重性排序）

1. **SMOKE 数据** — 正文对不上
2. **Wilcoxon 不可信**

## 改进版规划

### Stage 1
1. 改 gen_data
2. 跑全量
`;
    expect(extractStepsFromPlanMarkdown(md)).toEqual([]);
  });
});

describe("extractPlanDraftFromMessages", () => {
  it("returns the full assistant markdown as body", () => {
    const planText = `# 改进版方案

## 现状

论文数字和 SMOKE 对不上。

## 建议落地步骤
1. 更新 brief
2. 实现 V4 benchmark
`;
    const messages: ChatStreamMessage[] = [
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: planText }],
        },
      },
    ];
    const draft = extractPlanDraftFromMessages(messages);
    expect(draft?.body).toBe(planText.trim());
    expect(draft?.title).toContain("改进版");
    expect(draft?.steps.length).toBe(2);
  });
});
