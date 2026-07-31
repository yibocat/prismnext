import { describe, expect, it } from "vitest";
import {
  buildSubAgentActivityBlocks,
  mapOpenCodePartToActivityBlocks,
} from "../../src/shared/opencode-session-activity";

describe("opencode-session-activity", () => {
  it("maps reasoning and tools; skips step markers", () => {
    expect(mapOpenCodePartToActivityBlocks({ type: "step-start" })).toEqual([]);
    expect(
      mapOpenCodePartToActivityBlocks({ type: "reasoning", text: "plan" }),
    ).toEqual([{ type: "thinking", thinking: "plan", text: "plan" }]);
    const toolBlocks = mapOpenCodePartToActivityBlocks({
      type: "tool",
      tool: "paper-search-mcp_search_arxiv",
      callID: "call-1",
      state: { status: "completed", input: { query: "x" }, output: "ok" },
    });
    expect(toolBlocks).toHaveLength(2);
    expect(toolBlocks[0]).toMatchObject({
      type: "tool_use",
      id: "call-1",
      name: "paper-search-mcp_search_arxiv",
    });
    expect(toolBlocks[1]).toMatchObject({
      type: "tool_result",
      tool_use_id: "call-1",
      is_error: false,
    });
  });

  it("skips user-role parts when building the activity stream", () => {
    const blocks = buildSubAgentActivityBlocks([
      { role: "user", data: { type: "text", text: "delegation prompt" } },
      { role: "assistant", data: { type: "text", text: "Searching…" } },
      {
        role: "assistant",
        data: {
          type: "tool",
          tool: "bash",
          callID: "c1",
          state: { status: "pending", input: { command: "ls" } },
        },
      },
    ]);
    expect(blocks).toEqual([
      { type: "text", text: "Searching…" },
      {
        type: "tool_use",
        id: "c1",
        name: "bash",
        input: { command: "ls" },
        status: "pending",
      },
    ]);
  });
});
