import { describe, expect, it } from "vitest";
import {
  applyAssistantEventToBlocks,
  applySubagentEventToRuns,
  collectTaskRunsFromBlocks,
  deriveFlattenedAssistant,
  sealTurnBlockTimings,
} from "../../src/shared/conversation-blocks";
import type { AgentEvent } from "../../src/shared/agent-runtime";
import type { ContentBlock } from "../../src/shared/agent-conversation";

const ids = {
  runtimeSessionId: "rt-1",
  tabId: "tab-1",
  turnId: "turn-1",
};

function ev<T extends AgentEvent>(event: T): T {
  return event;
}

describe("applyAssistantEventToBlocks", () => {
  it("keeps thinking → tool → thinking → text in arrival order", () => {
    let blocks: ContentBlock[] = [];
    blocks = applyAssistantEventToBlocks(blocks, ev({
      ...ids,
      type: "thinking_delta",
      text: "先看目录",
    }));
    blocks = applyAssistantEventToBlocks(blocks, ev({
      ...ids,
      type: "tool_started",
      toolCallId: "c-ls",
      toolName: "ls",
      args: { path: "." },
    }));
    blocks = applyAssistantEventToBlocks(blocks, ev({
      ...ids,
      type: "tool_finished",
      toolCallId: "c-ls",
      toolName: "ls",
      ok: true,
      result: "main.tex\n",
    }));
    blocks = applyAssistantEventToBlocks(blocks, ev({
      ...ids,
      type: "thinking_delta",
      text: "再找 tex",
    }));
    blocks = applyAssistantEventToBlocks(blocks, ev({
      ...ids,
      type: "text_delta",
      text: "找到 main.tex",
    }));

    expect(blocks.map((block) => block.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_result",
      "thinking",
      "text",
    ]);
    expect(blocks[0]).toMatchObject({ type: "thinking", thinking: "先看目录" });
    expect(blocks[3]).toMatchObject({ type: "thinking", thinking: "再找 tex" });
    expect(blocks[4]).toMatchObject({ type: "text", text: "找到 main.tex" });

    const flatten = deriveFlattenedAssistant(sealTurnBlockTimings(blocks));
    expect(flatten.text).toBe("找到 main.tex");
    expect(flatten.thinking).toBe("先看目录再找 tex");
    expect(flatten.toolCalls).toHaveLength(1);
    expect(flatten.toolCalls[0]).toMatchObject({
      toolCallId: "c-ls",
      toolName: "ls",
      args: { path: "." },
      result: "main.tex\n",
    });
  });

  it("shows a preparing tool card, then keeps args and timeStart when execution starts", () => {
    let blocks: ContentBlock[] = [];
    blocks = applyAssistantEventToBlocks(blocks, ev({
      ...ids,
      type: "tool_started",
      toolCallId: "c-write",
      toolName: "write",
      args: {},
      preparing: true,
    }));
    expect(blocks[0]).toMatchObject({
      type: "tool_use",
      id: "c-write",
      name: "write",
      status: "preparing",
    });
    const startedAt = blocks[0].timeStart;

    blocks = applyAssistantEventToBlocks(blocks, ev({
      ...ids,
      type: "tool_started",
      toolCallId: "c-write",
      toolName: "write",
      args: { path: "notes/world-models.md" },
      preparing: true,
    }));
    expect(blocks[0]).toMatchObject({
      status: "running",
      input: { path: "notes/world-models.md" },
      timeStart: startedAt,
    });

    blocks = applyAssistantEventToBlocks(blocks, ev({
      ...ids,
      type: "tool_started",
      toolCallId: "c-write",
      toolName: "write",
      args: { path: "notes/world-models.md", content: "# notes" },
    }));
    expect(blocks[0]).toMatchObject({
      status: "running",
      input: { path: "notes/world-models.md", content: "# notes" },
      timeStart: startedAt,
    });
  });
});

describe("collectTaskRunsFromBlocks", () => {
  it("rebuilds a finished Task run from tool_use plus result text", () => {
    const runs = collectTaskRunsFromBlocks([
      {
        type: "tool_use",
        id: "task-1",
        name: "task",
        input: { expertId: "literature-synthesizer", prompt: "核查" },
      },
      {
        type: "tool_result",
        tool_use_id: "task-1",
        name: "task",
        content: { ok: true, result: "方向仍开放" },
      },
    ]);
    expect(runs).toEqual([{
      parentToolCallId: "task-1",
      expertFqid: "literature-synthesizer",
      expertName: "literature-synthesizer",
      status: "done",
      prompt: "核查",
      blocks: [{ type: "text", text: "方向仍开放" }],
    }]);
  });
});

describe("applySubagentEventToRuns", () => {
  it("accumulates child thinking/text and seals the run on turn_finished", () => {
    const subagent = {
      parentToolCallId: "task-1",
      expertFqid: "literature-synthesizer",
      expertName: "literature-synthesizer",
    };
    let runs = applySubagentEventToRuns({}, ev({
      ...ids,
      type: "thinking_delta",
      text: "先看三篇",
      subagent,
    }));
    runs = applySubagentEventToRuns(runs, ev({
      ...ids,
      type: "text_delta",
      text: "三个方向仍开放",
      subagent,
    }));
    runs = applySubagentEventToRuns(runs, ev({
      ...ids,
      type: "turn_finished",
      subagent,
    }));
    expect(runs["task-1"]).toMatchObject({
      expertName: "literature-synthesizer",
      status: "done",
      blocks: [
        { type: "thinking", thinking: "先看三篇" },
        { type: "text", text: "三个方向仍开放" },
      ],
    });
  });
});
