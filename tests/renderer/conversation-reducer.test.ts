import { describe, expect, it } from "vitest";
import {
  acknowledgeQuestionAnswer,
  appendAssistantBlocksToLastTurn,
  applyConversationEvent,
  beginConversationTurn,
  emptyConversation,
} from "@/lib/chat/conversation-reducer";
import type { Conversation } from "../../src/shared/agent/conversation";
import type { AgentEvent } from "../../src/shared/agent/runtime";

const ids = {
  runtimeSessionId: "rt-1",
  tabId: "tab-1",
  turnId: "turn-1",
};

function ev<T extends AgentEvent>(event: T): T {
  return event;
}

function blocksOf(conv: Conversation) {
  const turn = conv.live
    ? { user: conv.live.user, assistant: conv.live.assistant, status: conv.live.status }
    : conv.turns.at(-1);
  return turn;
}

describe("applyConversationEvent", () => {
  it("keeps session_created.sessionId off the conversation primary key", () => {
    let conv = emptyConversation({ conversationId: "conv-1", title: "Paper" });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "session_created",
      eventId: "e-created",
      sessionId: "rt-should-not-become-conversation-id",
    }));

    expect(conv.conversationId).toBe("conv-1");
    expect(conv.turns).toEqual([]);
    expect(conv.live).toBeNull();
  });

  it("accumulates thinking and text as ordered assistant blocks", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "review this paper",
    });
    conv = applyConversationEvent(conv, ev({ ...ids, type: "thinking_delta", eventId: "e-th-1", text: "hmm" }));
    conv = applyConversationEvent(conv, ev({ ...ids, type: "thinking_delta", eventId: "e-th-2", text: "..." }));
    conv = applyConversationEvent(conv, ev({ ...ids, type: "text_delta", eventId: "e-tx-1", text: "Hello" }));
    conv = applyConversationEvent(conv, ev({ ...ids, type: "text_delta", eventId: "e-tx-2", text: " world" }));

    const live = blocksOf(conv);
    expect(live?.user.blocks).toEqual([{ type: "text", text: "review this paper" }]);
    expect(live?.assistant.blocks).toEqual([
      {
        type: "thinking",
        thinking: "hmm...",
        timeStart: expect.any(Number),
        timeEnd: expect.any(Number),
        duration: expect.any(Number),
      },
      { type: "text", text: "Hello world" },
    ]);
    expect(live?.status).toBe("streaming");
  });

  it("keeps post-tool text after the tool result instead of collapsing the turn", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "查阅文献",
    });
    conv = applyConversationEvent(conv, ev({ ...ids, type: "text_delta", eventId: "e-pre", text: "先检索。" }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-tool-start",
      toolCallId: "c1",
      toolName: "literature-search",
      args: { query: "transformers" },
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_progress",
      eventId: "e-tool-prog",
      toolCallId: "c1",
      toolName: "literature-search",
      text: "searching",
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_finished",
      eventId: "e-tool-end",
      toolCallId: "c1",
      toolName: "literature-search",
      ok: true,
      result: { hits: 3 },
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "text_delta",
      eventId: "e-final",
      text: "正式总结：三篇相关论文。",
    }));
    conv = applyConversationEvent(conv, ev({ ...ids, type: "turn_finished", eventId: "e-done" }));

    expect(conv.live).toBeNull();
    expect(conv.turns).toHaveLength(1);
    expect(conv.turns[0].status).toBe("completed");
    expect(conv.turns[0].assistant.blocks.map((block) => block.type)).toEqual([
      "text",
      "tool_use",
      "tool_result",
      "text",
    ]);
    expect(conv.turns[0].assistant.blocks.at(-1)).toEqual({
      type: "text",
      text: "正式总结：三篇相关论文。",
    });
    const tool = conv.turns[0].assistant.blocks.find((block) => block.type === "tool_use");
    expect(tool).toMatchObject({
      id: "c1",
      name: "literature-search",
      status: "completed",
    });
  });

  it("does not rewrite the turn document for permission_requested", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "edit file",
    });
    conv = applyConversationEvent(conv, ev({ ...ids, type: "text_delta", eventId: "e-tx", text: "准备改文件" }));
    const before = structuredClone(conv);
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "permission_requested",
      eventId: "e-perm",
      requestId: "req-1",
      toolCallId: "c1",
      toolName: "write",
      args: { path: "a.tex" },
    }));

    expect(conv.live?.assistant.blocks).toEqual(before.live?.assistant.blocks);
    expect(conv.turns).toEqual(before.turns);
  });

  it("keeps composer user blocks on the live turn instead of collapsing to a string", () => {
    const conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userBlocks: [
        { type: "text", text: "## Referenced files\n\nmanuscript/main.tex" },
      ],
    });
    expect(conv.live?.user.blocks[0]?.text).toContain("Referenced files");
    expect(conv.pendingPlanSuggest).toBeNull();
  });

  it("records plan_suggested on the conversation without inventing a tool card", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "write a plan",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "plan_suggested",
      eventId: "e-p",
      requestId: "p-1",
      reason: "This looks like a multi-step change.",
    }));

    expect(conv.pendingPlanSuggest).toEqual({
      requestId: "p-1",
      reason: "This looks like a multi-step change.",
    });
    expect(conv.live?.assistant.blocks).toEqual([]);
  });

  it("records question_requested without inventing a tool card", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "ask me",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "question_requested",
      eventId: "e-q",
      requestId: "q-1",
      prompt: "Which paper?",
      options: ["A", "B"],
    }));

    expect(conv.pendingQuestion).toEqual({
      requestId: "q-1",
      prompt: "Which paper?",
      options: ["A", "B"],
    });
    expect(conv.live?.assistant.blocks.some((block) => block.type === "tool_use")).toBe(false);
  });

  it("acknowledgeQuestionAnswer only attaches the answer to the matching tool id", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "ask me",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-qs",
      toolCallId: "call-q",
      toolName: "question",
      args: { question: "Which paper?", options: ["A", "B"] },
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "question_requested",
      eventId: "e-q",
      requestId: "call-q",
      prompt: "Which paper?",
      options: ["A", "B"],
    }));

    conv = acknowledgeQuestionAnswer(conv, "call-q", "A");

    expect(conv.pendingQuestion).toBeNull();
    const result = conv.live?.assistant.blocks.find(
      (block) => block.type === "tool_result" && block.tool_use_id === "call-q",
    );
    expect(result?.content).toBe("A");
  });

  it("acknowledgeQuestionAnswer does not stamp the answer onto a different question tool", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "ask me",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-qs",
      toolCallId: "call-q",
      toolName: "question",
      args: { question: "Which paper?", options: ["A", "B"] },
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "question_requested",
      eventId: "e-q",
      requestId: "q-mismatch",
      prompt: "A different question?",
      options: ["A", "B"],
    }));

    conv = acknowledgeQuestionAnswer(conv, "q-mismatch", "A");

    expect(conv.pendingQuestion).toBeNull();
    const result = conv.live?.assistant.blocks.find(
      (block) => block.type === "tool_result" && block.tool_use_id === "call-q",
    );
    expect(result).toBeUndefined();
  });

  it("question tool_finished clears a matching hang", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "ask me",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-qs",
      toolCallId: "call-q",
      toolName: "question",
      args: { question: "Which paper?" },
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "question_requested",
      eventId: "e-q",
      requestId: "call-q",
      prompt: "Which paper?",
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_finished",
      eventId: "e-qf",
      toolCallId: "call-q",
      toolName: "question",
      ok: true,
      result: "A",
    }));
    expect(conv.pendingQuestion).toBeNull();
  });

  it("subagent question_requested does not take over the parent hang", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "delegate",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "question_requested",
      eventId: "e-parent-q",
      requestId: "parent-q",
      prompt: "Parent question?",
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "question_requested",
      eventId: "e-child-q",
      requestId: "child-q",
      prompt: "Child question?",
      subagent: {
        parentToolCallId: "task-1",
        expertFqid: "expert.reviewer",
        expertName: "Reviewer",
      },
    }));
    expect(conv.pendingQuestion).toEqual({
      requestId: "parent-q",
      prompt: "Parent question?",
    });
  });

  it("acknowledgeQuestionAnswer with only a hang request just clears chrome", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "ask me",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "question_requested",
      eventId: "e-q",
      requestId: "q-hang",
      prompt: "Which paper?",
    }));

    conv = acknowledgeQuestionAnswer(conv, "q-hang", "A");

    expect(conv.pendingQuestion).toBeNull();
    expect(conv.live?.assistant.blocks).toEqual([]);
  });

  it("stores usage_updated on the conversation, not as a turn block", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "hi",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "usage_updated",
      eventId: "e-use",
      inputTokens: 12,
      outputTokens: 34,
    }));

    expect(conv.usage).toEqual({ inputTokens: 12, outputTokens: 34 });
    expect(conv.live?.assistant.blocks).toEqual([]);
  });

  it("keeps partial text on turn_cancelled and writes an error block on turn_failed", () => {
    let cancelled = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "stop me",
    });
    cancelled = applyConversationEvent(cancelled, ev({ ...ids, type: "text_delta", eventId: "e-c1", text: "半句" }));
    cancelled = applyConversationEvent(cancelled, ev({ ...ids, type: "turn_cancelled", eventId: "e-c2" }));
    expect(cancelled.live).toBeNull();
    expect(cancelled.turns[0].status).toBe("cancelled");
    expect(cancelled.turns[0].assistant.blocks).toEqual([{ type: "text", text: "半句" }]);

    let failed = beginConversationTurn(emptyConversation({ conversationId: "conv-2" }), {
      turnId: "turn-1",
      userText: "fail",
    });
    failed = applyConversationEvent(failed, ev({
      ...ids,
      type: "turn_failed",
      eventId: "e-f1",
      error: "provider_timeout",
    }));
    expect(failed.turns[0].status).toBe("failed");
    expect(failed.turns[0].assistant.blocks).toEqual([
      { type: "text", text: "provider_timeout", is_error: true },
    ]);
  });

  it("does not write subagent events into the parent conversation", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "delegate",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "text_delta",
      eventId: "e-sub",
      text: "child output",
      subagent: {
        parentToolCallId: "task-1",
        expertFqid: "expert.reviewer",
        expertName: "Reviewer",
      },
    }));

    expect(conv.live?.assistant.blocks).toEqual([]);
    expect(conv.turns).toEqual([]);
    expect(conv.subagentRuns["task-1"]).toMatchObject({
      expertName: "Reviewer",
      status: "running",
      blocks: [{ type: "text", text: "child output" }],
    });
  });

  it("seeds and completes a task run from the parent tool events", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "delegate",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-task-start",
      toolCallId: "task-1",
      toolName: "task",
      args: { expertId: "peer-reviewer", prompt: "review methods" },
    }));
    expect(conv.live?.assistant.blocks.some((block) => block.name === "task")).toBe(true);
    expect(conv.subagentRuns["task-1"]).toMatchObject({
      expertName: "peer-reviewer",
      prompt: "review methods",
      status: "running",
    });

    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_finished",
      eventId: "e-task-end",
      toolCallId: "task-1",
      toolName: "task",
      ok: true,
      result: "done",
    }));
    expect(conv.subagentRuns["task-1"]?.status).toBe("done");
  });

  it("marks a task run as error even if the child already reported turn_finished", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "delegate",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-task-start",
      toolCallId: "task-1",
      toolName: "task",
      args: { expertId: "literature-synthesizer", prompt: "synthesize" },
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "turn_finished",
      eventId: "e-child-end",
      subagent: {
        parentToolCallId: "task-1",
        expertFqid: "prismnext.core:literature-synthesizer",
        expertName: "Literature Synthesizer",
      },
    }));
    expect(conv.subagentRuns["task-1"]?.status).toBe("done");

    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_finished",
      eventId: "e-task-end",
      toolCallId: "task-1",
      toolName: "task",
      ok: false,
      error: "subagent_timeout:Literature Synthesizer after 600000ms",
    }));
    expect(conv.subagentRuns["task-1"]).toMatchObject({
      status: "error",
      error: "subagent_timeout:Literature Synthesizer after 600000ms",
    });
  });

  it("keeps attaching child activity after the parent turn has settled", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "delegate",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-task-start",
      toolCallId: "task-1",
      toolName: "task",
      args: { expertId: "literature-synthesizer", prompt: "synthesize" },
    }));
    conv = applyConversationEvent(conv, ev({ ...ids, type: "turn_finished", eventId: "e-parent-end" }));
    expect(conv.live).toBeNull();

    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "text_delta",
      eventId: "e-child-late",
      text: "方向仍开放",
      subagent: {
        parentToolCallId: "task-1",
        expertFqid: "prismnext.core:literature-synthesizer",
        expertName: "Literature Synthesizer",
      },
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "turn_finished",
      eventId: "e-child-end",
      subagent: {
        parentToolCallId: "task-1",
        expertFqid: "prismnext.core:literature-synthesizer",
        expertName: "Literature Synthesizer",
      },
    }));

    expect(conv.live).toBeNull();
    expect(conv.subagentRuns["task-1"]).toMatchObject({
      status: "done",
      expertName: "Literature Synthesizer",
      blocks: [{ type: "text", text: "方向仍开放" }],
    });
  });

  it("mounts Task result text when the child stream never arrived", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "delegate",
    });
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-task-start",
      toolCallId: "task-1",
      toolName: "task",
      args: { expertId: "literature-synthesizer", prompt: "synthesize" },
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_finished",
      eventId: "e-task-end",
      toolCallId: "task-1",
      toolName: "task",
      ok: true,
      result: { ok: true, result: "三个方向的判断如下…" },
    }));
    expect(conv.subagentRuns["task-1"]).toMatchObject({
      status: "done",
      blocks: [{ type: "text", text: "三个方向的判断如下…" }],
    });
  });

  it("replays the same eventId without duplicating tools or finishing the turn twice", () => {
    const start = ev({
      ...ids,
      type: "tool_started",
      eventId: "e-tool-start",
      toolCallId: "c1",
      toolName: "read",
      args: { path: "a.tex" },
    });
    const finish = ev({ ...ids, type: "turn_finished", eventId: "e-done" });

    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "read it",
    });
    conv = applyConversationEvent(conv, start);
    conv = applyConversationEvent(conv, start);
    expect(conv.live?.assistant.blocks.filter((block) => block.type === "tool_use")).toHaveLength(1);

    conv = applyConversationEvent(conv, finish);
    conv = applyConversationEvent(conv, finish);
    expect(conv.turns).toHaveLength(1);
    expect(conv.turns[0].status).toBe("completed");
    expect(conv.live).toBeNull();
  });

  it("ignores late incremental deltas after a turn settles instead of creating a ghost live turn", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "hi",
    });
    conv = applyConversationEvent(conv, ev({ ...ids, type: "text_delta", eventId: "e-1", text: "reply" }));
    conv = applyConversationEvent(conv, ev({ ...ids, type: "turn_finished", eventId: "e-done" }));
    expect(conv.live).toBeNull();
    expect(conv.turns).toHaveLength(1);

    // Late deltas for the settled turn must NOT rebuild a live turn.
    conv = applyConversationEvent(conv, ev({ ...ids, type: "text_delta", eventId: "e-late", text: "stale" }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-late-tool",
      toolCallId: "c-stale",
      toolName: "read",
      args: {},
    }));
    expect(conv.live).toBeNull();
    expect(conv.turns).toHaveLength(1);
    expect(conv.turns[0].assistant.blocks).toEqual([{ type: "text", text: "reply" }]);
  });

  it("ignores stale-turn events while a newer turn is streaming", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "first",
    });
    conv = applyConversationEvent(conv, ev({ ...ids, type: "turn_finished", eventId: "e-done-1" }));

    conv = beginConversationTurn(conv, { turnId: "turn-2", userText: "second" });
    // A late delta from turn-1 must not overwrite turn-2's live state.
    conv = applyConversationEvent(conv, ev({ ...ids, turnId: "turn-1", type: "text_delta", eventId: "e-stale", text: "stale" }));
    expect(conv.live?.turnId).toBe("turn-2");
    expect(conv.live?.assistant.blocks).toEqual([]);
  });

  it("ignores a stale turn_cancelled while a newer turn is streaming", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "first",
    });
    conv = applyConversationEvent(conv, ev({ ...ids, type: "text_delta", eventId: "e-1", text: "partial" }));
    conv = beginConversationTurn(conv, { turnId: "turn-2", userText: "queued" });

    conv = applyConversationEvent(conv, ev({
      ...ids,
      turnId: "turn-1",
      type: "turn_cancelled",
      eventId: "e-stale-cancel",
    }));

    expect(conv.live?.turnId).toBe("turn-2");
    expect(conv.live?.user.blocks).toEqual([{ type: "text", text: "queued" }]);
    expect(conv.turns).toHaveLength(0);
  });

  it("ignores stale turn_finished and turn_failed while a newer turn is streaming", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "first",
    });
    conv = beginConversationTurn(conv, { turnId: "turn-2", userText: "next" });

    conv = applyConversationEvent(conv, ev({
      ...ids,
      turnId: "turn-1",
      type: "turn_finished",
      eventId: "e-stale-done",
    }));
    expect(conv.live?.turnId).toBe("turn-2");

    conv = applyConversationEvent(conv, ev({
      ...ids,
      turnId: "turn-1",
      type: "turn_failed",
      eventId: "e-stale-fail",
      error: "turn_in_progress",
    }));
    expect(conv.live?.turnId).toBe("turn-2");
    expect(conv.live?.assistant.blocks).toEqual([]);
  });

  it("seals thinking/tool timings when the turn settles so folds show real durations", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "do it",
    });
    conv = applyConversationEvent(conv, ev({ ...ids, type: "thinking_delta", eventId: "e-th", text: "think" }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_started",
      eventId: "e-tool",
      toolCallId: "c1",
      toolName: "read",
      args: {},
    }));
    conv = applyConversationEvent(conv, ev({
      ...ids,
      type: "tool_finished",
      eventId: "e-tool-end",
      toolCallId: "c1",
      toolName: "read",
      ok: true,
      result: {},
    }));
    conv = applyConversationEvent(conv, ev({ ...ids, type: "turn_finished", eventId: "e-done" }));

    const turn = conv.turns[0];
    const thinking = turn.assistant.blocks.find((block) => block.type === "thinking");
    const tool = turn.assistant.blocks.find((block) => block.type === "tool_use");
    expect(typeof thinking?.timeStart).toBe("number");
    expect(typeof thinking?.timeEnd).toBe("number");
    expect(typeof thinking?.duration).toBe("number");
    expect(typeof tool?.timeStart).toBe("number");
    expect(typeof tool?.timeEnd).toBe("number");
    expect(typeof tool?.duration).toBe("number");
  });

  it("appends host chrome blocks to the last turn without inventing ChatStreamMessage rows", () => {
    let conv = beginConversationTurn(emptyConversation({ conversationId: "conv-1" }), {
      turnId: "turn-1",
      userText: "draft a plan",
    });
    conv = applyConversationEvent(conv, ev({ ...ids, type: "text_delta", eventId: "e-1", text: "done" }));
    conv = applyConversationEvent(conv, ev({ ...ids, type: "turn_finished", eventId: "e-done" }));

    conv = appendAssistantBlocksToLastTurn(conv, [{
      type: "tool_use",
      id: "todo-approve-1",
      name: "todowrite",
      input: { todos: [{ content: "Write intro", status: "pending" }] },
    }]);

    expect(conv.live).toBeNull();
    expect(conv.turns).toHaveLength(1);
    expect(conv.turns[0].assistant.blocks.map((block) => block.type)).toEqual(["text", "tool_use"]);
    expect(conv.turns[0].assistant.blocks.at(-1)).toMatchObject({
      id: "todo-approve-1",
      name: "todowrite",
    });
  });
});
