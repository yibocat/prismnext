import { describe, expect, it } from "vitest";
import type { AgentSessionRecord, AgentTurnRecord } from "../../src/main/agent/session-store";
import {
  hydrateSessionRecordToChatMessages,
  hydrateSessionRecordToConversation,
} from "../../src/main/agent/session-hydrator";

describe("hydrateSessionRecordToChatMessages", () => {
  it("converts user and assistant turns with thinking, tool calls and results to ChatStreamMessage array", () => {
    const turn1: AgentTurnRecord = {
      turnIndex: 0,
      turnId: "turn-0",
      createdAt: 1000,
      finishedAt: 2000,
      user: {
        text: "Analyze this paper",
        attachments: [{ name: "paper.pdf", kind: "file", path: "/docs/paper.pdf" }],
      },
      assistant: {
        thinking: "Let me check the metadata first.",
        text: "Here is the summary of the paper.",
        toolCalls: [
          {
            toolCallId: "call-lit-1",
            toolName: "literature-read",
            args: { bibkey: "Einstein1905" },
            result: { title: "On the Electrodynamics of Moving Bodies", year: 1905 },
            startedAt: 1100,
            finishedAt: 1400,
          },
          {
            toolCallId: "call-bash-1",
            toolName: "bash",
            args: { command: "python verify.py" },
            error: "Syntax error on line 4",
            denied: false,
            startedAt: 1500,
            finishedAt: 1800,
          },
        ],
      },
      usage: {
        inputTokens: 250,
        outputTokens: 80,
      },
      status: "completed",
    };

    const session: AgentSessionRecord = {
      version: 1,
      runtimeSessionId: "ses-test-1",
      tabId: "tab-1",
      title: "Physics Analysis",
      projectRoot: "/project",
      boundCheckoutPath: "/project",
      backend: "pi-sdk",
      permissionMode: "edit_auto",
      sessionAgent: "build",
      turns: [turn1],
      createdAt: "2026-08-17T00:00:00Z",
      updatedAt: "2026-08-17T00:01:00Z",
    };

    const messages = hydrateSessionRecordToChatMessages(session);
    expect(messages).toHaveLength(2);

    // 1. User Message
    const userMsg = messages[0];
    expect(userMsg?.type).toBe("user");
    expect(userMsg?.message?.content).toEqual([
      {
        type: "text",
        text: "Analyze this paper",
        attachments: [{ name: "paper.pdf", kind: "file", path: "/docs/paper.pdf" }],
      },
    ]);

    // 2. Assistant Message
    const assistantMsg = messages[1];
    expect(assistantMsg?.type).toBe("assistant");
    const blocks = assistantMsg?.message?.content || [];
    expect(blocks).toHaveLength(6); // thinking + tool_use_1 + tool_result_1 + tool_use_2 + tool_result_2 + text

    // Thinking
    expect(blocks[0]).toEqual({
      type: "thinking",
      thinking: "Let me check the metadata first.",
    });

    // Tool Call 1
    expect(blocks[1]).toEqual({
      type: "tool_use",
      id: "call-lit-1",
      name: "literature-read",
      input: { bibkey: "Einstein1905" },
      status: "completed",
    });

    // Tool Result 1
    expect(blocks[2]).toEqual({
      type: "tool_result",
      tool_use_id: "call-lit-1",
      name: "literature-read",
      content: { title: "On the Electrodynamics of Moving Bodies", year: 1905 },
      is_error: false,
      status: "completed",
    });

    // Tool Call 2 (Error)
    expect(blocks[3]).toEqual({
      type: "tool_use",
      id: "call-bash-1",
      name: "bash",
      input: { command: "python verify.py" },
      status: "failed",
    });

    // Tool Result 2 (Error)
    expect(blocks[4]).toEqual({
      type: "tool_result",
      tool_use_id: "call-bash-1",
      name: "bash",
      content: "Syntax error on line 4",
      is_error: true,
      status: "failed",
    });

    // Final text
    expect(blocks[5]).toEqual({
      type: "text",
      text: "Here is the summary of the paper.",
    });
  });

  it("handles empty turns or sessions cleanly", () => {
    const emptySession: AgentSessionRecord = {
      version: 1,
      runtimeSessionId: "ses-empty",
      tabId: "tab-empty",
      title: "Empty",
      projectRoot: "/project",
      boundCheckoutPath: "/project",
      backend: "pi-sdk",
      permissionMode: "auto",
      sessionAgent: "build",
      turns: [],
      createdAt: "2026-08-17T00:00:00Z",
      updatedAt: "2026-08-17T00:00:00Z",
    };

    expect(hydrateSessionRecordToChatMessages(emptySession)).toEqual([]);
  });

  it("hydrates a Conversation document instead of OpenCode message rows", () => {
    const turn: AgentTurnRecord = {
      turnIndex: 0,
      turnId: "turn-0",
      createdAt: 1000,
      user: { text: "查阅文献" },
      assistant: {
        thinking: "先检索",
        text: "正式总结",
        toolCalls: [{
          toolCallId: "c1",
          toolName: "literature-search",
          args: { query: "x" },
          result: { hits: 1 },
          startedAt: 1100,
          finishedAt: 1200,
        }],
      },
      status: "completed",
    };
    const session: AgentSessionRecord = {
      version: 2,
      conversationId: "conv-1",
      runtimeSessionId: "rt-1",
      tabId: "tab-1",
      title: "Literature",
      projectRoot: "/project",
      boundCheckoutPath: "/project",
      backend: "pi-sdk",
      permissionMode: "edit_auto",
      sessionAgent: "build",
      turns: [turn],
      createdAt: "2026-08-17T00:00:00Z",
      updatedAt: "2026-08-17T00:01:00Z",
    };

    const conv = hydrateSessionRecordToConversation(session);
    expect(conv.conversationId).toBe("conv-1");
    expect(conv.title).toBe("Literature");
    expect(conv.live).toBeNull();
    expect(conv.turns).toHaveLength(1);
    expect(conv.turns[0].assistant.blocks.map((block) => block.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_result",
      "text",
    ]);
    expect(conv.turns[0].assistant.blocks.at(-1)).toEqual({ type: "text", text: "正式总结" });
  });
});
