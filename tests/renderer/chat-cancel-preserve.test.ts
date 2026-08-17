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

const agentCancel = vi.fn().mockResolvedValue({ ok: true });

vi.stubGlobal("window", {
  electronAPI: {
    agentCancel,
    agentDispose: vi.fn().mockResolvedValue({ ok: true }),
    sessionGetDirectory: vi.fn().mockResolvedValue(null),
    sessionGetContext: vi.fn().mockResolvedValue(null),
    sessionGetUserDisplays: vi.fn().mockResolvedValue([]),
    chatRegisterTab: vi.fn().mockResolvedValue({ success: true }),
  },
});

import { useChatStore } from "../../src/renderer/stores/chat-store";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

describe("cancelExecution preserves partial reply", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
    (useChatStore as any)._msgCache?.clear();
    agentCancel.mockClear();
  });

  it("commits the in-progress streamingMessage to messages with stopped=true instead of discarding it", async () => {
    const tabId = useChatStore.getState().createTab();
    useChatStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              runtime: "pi" as const,
              sessionId: "sess-1",
              isStreaming: true,
              streamingMessage: {
                type: "assistant" as const,
                message: { content: [{ type: "text" as const, text: "Partial reply that streamed so far" }] },
              },
            }
          : t,
      ),
    }));

    await useChatStore.getState().cancelExecution();

    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(agentCancel).toHaveBeenCalledWith({ conversationId: tabId });
    expect(tab.isStreaming).toBe(false);
    expect(tab.streamingMessage).toBeNull();
    // The partial reply is committed, not discarded.
    expect(tab.messages).toHaveLength(1);
    const committed = tab.messages[0] as ChatStreamMessage;
    expect(committed.type).toBe("assistant");
    expect(committed.stopped).toBe(true);
    expect(committed.message?.content).toEqual([
      { type: "text", text: "Partial reply that streamed so far" },
    ]);
  });

  it("marks message counts so load-earlier offset math stays correct", async () => {
    const tabId = useChatStore.getState().createTab();
    useChatStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              runtime: "pi" as const,
              sessionId: "sess-2",
              isStreaming: true,
              streamingMessage: {
                type: "assistant" as const,
                message: { content: [{ type: "text" as const, text: "hi" }] },
              },
            }
          : t,
      ),
    }));

    await useChatStore.getState().cancelExecution();

    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    // Committed interrupted reply must stay in the in-memory transcript.
    expect(tab.messages).toHaveLength(1);
    expect(tab.messages[0]).toMatchObject({ type: "assistant", stopped: true });
    expect(tab.streamingMessage).toBeNull();
  });

  it("bumps streamGeneration on cancel so stale chat:complete cannot clear the next turn", async () => {
    const tabId = useChatStore.getState().createTab();
    useChatStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              runtime: "pi" as const,
              sessionId: "sess-gen",
              isStreaming: true,
              streamGeneration: 2,
              streamingMessage: {
                type: "assistant" as const,
                message: { content: [{ type: "text" as const, text: "partial" }] },
              },
            }
          : t,
      ),
    }));

    await useChatStore.getState().cancelExecution();
    const afterCancel = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(afterCancel.isStreaming).toBe(false);
    expect(afterCancel.streamGeneration).toBe(3);

    // Queue drain / re-send starts a new turn
    useChatStore.getState()._setStreaming(tabId, true);
    const afterResend = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(afterResend.isStreaming).toBe(true);
    expect(afterResend.streamGeneration).toBe(4);

    // Stale complete captured generation 2 or 3 must not clear generation 4
    const { canClearStreamingForGeneration } = await import(
      "../../src/renderer/lib/chat/stream-generation"
    );
    expect(canClearStreamingForGeneration(2, afterResend.streamGeneration)).toBe(false);
    expect(canClearStreamingForGeneration(3, afterResend.streamGeneration)).toBe(false);
    expect(canClearStreamingForGeneration(4, afterResend.streamGeneration)).toBe(true);
  });

  it("does not throw when there is no streaming message to commit", async () => {
    const tabId = useChatStore.getState().createTab();
    useChatStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, sessionId: "sess-3", isStreaming: true, streamingMessage: null }
          : t,
      ),
    }));

    await useChatStore.getState().cancelExecution();

    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(tab.isStreaming).toBe(false);
    expect(tab.messages).toEqual([]);
    expect(tab.streamingMessage).toBeNull();
  });
});
