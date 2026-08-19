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
      attachments: [{ name: "paper.pdf", kind: "file", path: "/docs/paper.pdf" }],
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
    expect(conv.usage).toBeNull();
  });

  it("restores Pi occupancy and cumulative spend from usageTotals", () => {
    const session: AgentSessionRecord = {
      version: 2,
      conversationId: "conv-use",
      runtimeSessionId: "rt-use",
      tabId: "tab-use",
      title: "Usage",
      projectRoot: "/project",
      boundCheckoutPath: "/project",
      backend: "pi-sdk",
      permissionMode: "edit_auto",
      sessionAgent: "build",
      turns: [{
        turnIndex: 0,
        turnId: "t0",
        createdAt: 1,
        user: { text: "hi" },
        assistant: { text: "hello", toolCalls: [] },
        status: "completed",
        usage: { inputTokens: 400, outputTokens: 20, costUsd: 0.01 },
      }],
      usageTotals: {
        occupancyTokens: 1200,
        windowSize: 200000,
        costUsd: 0.08,
        input: 800,
        output: 90,
        cacheRead: 10,
        cacheWrite: 5,
        breakdown: { systemPrompt: 200, conversation: 1000 },
        updatedAt: 2,
      },
      createdAt: "2026-08-19T00:00:00Z",
      updatedAt: "2026-08-19T00:01:00Z",
    };
    const conv = hydrateSessionRecordToConversation(session);
    expect(conv.usage).toMatchObject({
      inputTokens: 1200,
      windowSize: 200000,
      costUsd: 0.08,
      breakdown: { systemPrompt: 200, conversation: 1000 },
    });
  });

  it("keeps persisted assistant.blocks in event order instead of flattening", () => {
    const turn: AgentTurnRecord = {
      turnIndex: 0,
      turnId: "turn-blocks",
      createdAt: 1000,
      user: { text: "列出项目再找 tex" },
      assistant: {
        thinking: "先看目录再找 tex",
        text: "找到 main.tex",
        toolCalls: [{
          toolCallId: "c-ls",
          toolName: "ls",
          args: { path: "." },
          result: "main.tex\n",
          startedAt: 1100,
          finishedAt: 1200,
        }],
        blocks: [
          { type: "thinking", thinking: "先看目录" },
          { type: "tool_use", id: "c-ls", name: "ls", input: { path: "." }, status: "completed" },
          { type: "tool_result", tool_use_id: "c-ls", name: "ls", content: "main.tex\n", status: "completed" },
          { type: "thinking", thinking: "再找 tex" },
          { type: "text", text: "找到 main.tex" },
        ],
      },
      status: "completed",
    };
    const session: AgentSessionRecord = {
      version: 2,
      conversationId: "conv-blocks",
      runtimeSessionId: "rt-blocks",
      tabId: "tab-blocks",
      title: "Blocks",
      projectRoot: "/project",
      boundCheckoutPath: "/project",
      backend: "pi-sdk",
      permissionMode: "edit_auto",
      sessionAgent: "build",
      turns: [turn],
      createdAt: "2026-08-19T00:00:00Z",
      updatedAt: "2026-08-19T00:01:00Z",
    };

    const conv = hydrateSessionRecordToConversation(session);
    expect(conv.turns[0]?.assistant.blocks.map((block) => block.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_result",
      "thinking",
      "text",
    ]);
    expect(conv.turns[0]?.assistant.blocks[0]).toEqual({ type: "thinking", thinking: "先看目录" });
    expect(conv.turns[0]?.assistant.blocks[3]).toEqual({ type: "thinking", thinking: "再找 tex" });
  });

  it("rebuilds Task runs from persisted tool_use / tool_result pairs", () => {
    const turn: AgentTurnRecord = {
      turnIndex: 0,
      turnId: "turn-task",
      createdAt: 1000,
      user: { text: "用 subagent 核查" },
      assistant: {
        text: "",
        toolCalls: [],
        blocks: [
          {
            type: "tool_use",
            id: "task-1",
            name: "task",
            input: { expertId: "literature-synthesizer", prompt: "核查方向" },
            status: "completed",
          },
          {
            type: "tool_result",
            tool_use_id: "task-1",
            name: "task",
            content: { ok: true, result: "三个方向仍开放" },
            status: "completed",
          },
        ],
      },
      status: "completed",
    };
    const session: AgentSessionRecord = {
      version: 2,
      conversationId: "conv-task",
      runtimeSessionId: "rt-task",
      tabId: "tab-task",
      title: "Task",
      projectRoot: "/project",
      boundCheckoutPath: "/project",
      backend: "pi-sdk",
      permissionMode: "edit_auto",
      sessionAgent: "build",
      turns: [turn],
      createdAt: "2026-08-19T00:00:00Z",
      updatedAt: "2026-08-19T00:01:00Z",
    };

    const conv = hydrateSessionRecordToConversation(session);
    expect(conv.subagentRuns["task-1"]).toMatchObject({
      expertName: "literature-synthesizer",
      status: "done",
      prompt: "核查方向",
      blocks: [{ type: "text", text: "三个方向仍开放" }],
    });
  });

  it("keeps persisted subagent process blocks instead of collapsing to the Task summary", () => {
    const turn: AgentTurnRecord = {
      turnIndex: 0,
      turnId: "turn-task",
      createdAt: 1000,
      user: { text: "用 subagent 核查" },
      assistant: {
        text: "",
        toolCalls: [],
        blocks: [
          {
            type: "tool_use",
            id: "task-1",
            name: "task",
            input: { expertId: "literature-synthesizer", prompt: "核查方向" },
            status: "completed",
          },
          {
            type: "tool_result",
            tool_use_id: "task-1",
            name: "task",
            content: { ok: true, result: "摘要而已" },
            status: "completed",
          },
        ],
      },
      status: "completed",
    };
    const session: AgentSessionRecord = {
      version: 2,
      conversationId: "conv-task-rich",
      runtimeSessionId: "rt-task-rich",
      tabId: "tab-task-rich",
      title: "Task",
      projectRoot: "/project",
      boundCheckoutPath: "/project",
      backend: "pi-sdk",
      permissionMode: "edit_auto",
      sessionAgent: "build",
      turns: [turn],
      subagentRuns: {
        "task-1": {
          parentToolCallId: "task-1",
          expertFqid: "literature-synthesizer",
          expertName: "literature-synthesizer",
          status: "done",
          prompt: "核查方向",
          blocks: [
            { type: "thinking", thinking: "先看三篇" },
            { type: "text", text: "三个方向仍开放" },
          ],
        },
      },
      compacted: { throughTurnIndex: 1, summary: "earlier turns folded", at: 1_700_000_000_000 },
      createdAt: "2026-08-19T00:00:00Z",
      updatedAt: "2026-08-19T00:01:00Z",
    };

    const conv = hydrateSessionRecordToConversation(session);
    expect(conv.subagentRuns["task-1"]?.blocks).toEqual([
      { type: "thinking", thinking: "先看三篇" },
      { type: "text", text: "三个方向仍开放" },
    ]);
    expect(conv.compacted).toEqual({
      throughTurnIndex: 1,
      summary: "earlier turns folded",
      at: 1_700_000_000_000,
    });
  });
});
