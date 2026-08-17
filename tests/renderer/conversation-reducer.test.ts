import { describe, expect, it } from "vitest";
import {
  applyConversationEvent,
  beginConversationTurn,
  emptyConversation,
} from "@/lib/chat/conversation-reducer";
import type { Conversation } from "../../src/shared/agent-conversation";
import type { AgentEvent } from "../../src/shared/agent-runtime";

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
      { type: "thinking", thinking: "hmm..." },
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
});
