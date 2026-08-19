import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: { getState: () => ({ projectRoot: "" }) },
}));

vi.mock("@/lib/git/checkout-context", () => ({
  applyCheckoutTransition: vi.fn().mockResolvedValue(undefined),
  attachWorktreeForSessionDirectory: vi.fn().mockResolvedValue(undefined),
  captureSessionCwd: vi.fn(),
  resolveWorktreeAtCheckout: vi.fn(),
  resolveWorktreePathForSend: vi.fn(),
  isWorktreeCheckoutPath: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/git/worktree-path", () => ({
  isWorktreeDirectoryActive: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/git/worktree-present", () => ({
  isWorktreeCheckoutOnDisk: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/git/worktree-sessions", () => ({
  rehomeWorktreeSessions: vi.fn().mockResolvedValue(undefined),
}));

vi.stubGlobal("window", {
  electronAPI: {},
});

import { useChatStore } from "../../src/renderer/stores/chat-store";

describe("chat-store late stream replay", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
    (useChatStore as any)._msgCache.clear();
  });

  it("ignores tool_use parts that were already committed in a prior turn", () => {
    const tabId = useChatStore.getState().activeTabId;
    const store = useChatStore.getState();

    // Prior turn already committed this tool.
    store._appendMessage(tabId, {
      type: "user",
      message: { content: [{ type: "text", text: "find papers" }] },
    });
    store._appendMessage(tabId, {
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "call_old_search",
            name: "paper-search-mcp_search_crossref",
            input: { query: "rl" },
          },
        ],
      },
    });

    store._setStreaming(tabId, true);
    // Current turn streams a real reply…
    store._upsertLastMessage(tabId, {
      type: "assistant",
      message: { content: [{ type: "text", text: "Here are the papers." }] },
    }, "msg_new");

    // …then a late/replayed tool_call from the prior turn arrives.
    store._upsertLastMessage(tabId, {
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "call_old_search",
            name: "paper-search-mcp_search_crossref",
            input: { query: "rl" },
          },
        ],
      },
    }, "msg_new");

    const streaming = useChatStore.getState().streamingMessage;
    const tools = (streaming?.message?.content || []).filter((b) => b.type === "tool_use");
    expect(tools).toEqual([]);
    expect(streaming?.message?.content).toEqual([
      { type: "text", text: "Here are the papers." },
    ]);
  });

  it("ignores parts for an OpenCode messageId that already settled", () => {
    const tabId = useChatStore.getState().activeTabId;
    const store = useChatStore.getState();

    store._setStreaming(tabId, true);
    store._upsertLastMessage(tabId, {
      type: "assistant",
      message: { content: [{ type: "text", text: "turn 1" }] },
    }, "msg_turn1");
    store._setStreaming(tabId, false); // settles msg_turn1

    store._setStreaming(tabId, true);
    store._upsertLastMessage(tabId, {
      type: "assistant",
      message: { content: [{ type: "text", text: "turn 2 reply" }] },
    }, "msg_turn2");

    // Late thought/tool chunk still tagged with the settled turn-1 messageId.
    store._upsertLastMessage(tabId, {
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "old thought from turn 1" },
          {
            type: "tool_use",
            id: "call_late",
            name: "bash",
            input: { command: "echo old" },
          },
        ],
      },
    }, "msg_turn1");

    const streaming = useChatStore.getState().streamingMessage;
    expect(streaming?.message?.content).toEqual([
      { type: "text", text: "turn 2 reply" },
    ]);
    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(tab.settledStreamMessageIds).toContain("msg_turn1");
  });

  it("keeps thinking deltas after tool→think split on the same messageId", () => {
    // GLM-style streams often emit tool_use before/during thought chunks under
    // one OpenCode messageId. Splitting must not settle that id mid-turn.
    const tabId = useChatStore.getState().activeTabId;
    const store = useChatStore.getState();

    store._setStreaming(tabId, true);
    store._upsertLastMessage(tabId, {
      type: "assistant",
      message: {
        content: [{
          type: "tool_use",
          id: "call_1",
          name: "bash",
          input: { command: "ls" },
        }],
      },
    }, "msg_same");

    store._upsertLastMessage(tabId, {
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "step 1" }] },
    }, "msg_same");

    store._upsertLastMessage(tabId, {
      type: "assistant",
      message: {
        content: [{ type: "thinking", thinking: "step 1 — then more reasoning" }],
      },
    }, "msg_same");

    const streaming = useChatStore.getState().streamingMessage;
    const think = streaming?.message?.content?.find((b) => b.type === "thinking");
    expect(think?.thinking).toBe("step 1 — then more reasoning");
    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(tab.settledStreamMessageIds).not.toContain("msg_same");
  });
});
