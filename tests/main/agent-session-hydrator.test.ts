import { describe, expect, it } from "vitest";
import type { AgentSessionRecord, AgentTurnRecord } from "../../src/main/agent/session-store";
import { hydrateSessionRecordToConversation } from "../../src/main/agent/session-hydrator";

describe("hydrateSessionRecordToConversation", () => {
  it("hydrates a Conversation document from stored turns", () => {
    const turn: AgentTurnRecord = {
      turnIndex: 0,
      turnId: "turn-0",
      createdAt: 1000,
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
      status: "completed",
      meta: { modelLabel: "Sonnet", completedAt: 2000 },
    };
    const session: AgentSessionRecord = {
      version: 2,
      conversationId: "conv-1",
      runtimeSessionId: "rt-1",
      tabId: "tab-1",
      title: "Physics Analysis",
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
    expect(conv.title).toBe("Physics Analysis");
    expect(conv.live).toBeNull();
    expect(conv.turns).toHaveLength(1);
    expect(conv.turns[0]?.user.blocks[0]).toMatchObject({
      type: "text",
      text: "Analyze this paper",
    });
    expect(conv.turns[0]?.assistant.blocks.map((block) => block.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_result",
      "tool_use",
      "tool_result",
      "text",
    ]);
    expect(conv.turns[0]?.assistant.blocks.at(-1)).toEqual({
      type: "text",
      text: "Here is the summary of the paper.",
    });
    expect(conv.turns[0]?.meta).toEqual({ modelLabel: "Sonnet", completedAt: 2000 });
  });

  it("handles empty sessions cleanly", () => {
    const emptySession: AgentSessionRecord = {
      version: 2,
      conversationId: "conv-empty",
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

    const conv = hydrateSessionRecordToConversation(emptySession);
    expect(conv.conversationId).toBe("conv-empty");
    expect(conv.turns).toEqual([]);
  });
});
