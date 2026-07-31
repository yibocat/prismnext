import { describe, expect, it } from "vitest";
import { mapOpenCodePartToBlocks } from "../../src/renderer/lib/chat/message-parts";

describe("mapOpenCodePartToBlocks timing", () => {
  it("maps tool state.time to duration / timeStart / timeEnd", () => {
    const blocks = mapOpenCodePartToBlocks({
      type: "tool",
      callID: "c1",
      tool: "read",
      state: {
        status: "completed",
        input: { path: "a.tex" },
        output: "ok",
        time: { start: 1_000, end: 3_500 },
      },
    });
    const tool = blocks.find((b) => b.type === "tool_use");
    expect(tool?.duration).toBe(2.5);
    expect(tool?.timeStart).toBe(1_000);
    expect(tool?.timeEnd).toBe(3_500);
  });

  it("maps reasoning time to thinking duration", () => {
    const blocks = mapOpenCodePartToBlocks({
      type: "reasoning",
      text: "plan",
      time: { start: 0, end: 4200 },
    });
    expect(blocks[0]).toMatchObject({
      type: "thinking",
      thinking: "plan",
      duration: 4.2,
    });
  });
});
