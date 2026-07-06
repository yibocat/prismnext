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

const chatCancel = vi.fn().mockResolvedValue(undefined);

vi.stubGlobal("window", {
  electronAPI: {
    chatCancel,
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
    chatCancel.mockClear();
  });

  it("commits the in-progress streamingMessage to messages with stopped=true instead of discarding it", async () => {
    const tabId = useChatStore.getState().createTab();
    useChatStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
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
    expect(chatCancel).toHaveBeenCalledWith("sess-1");
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
    expect(tab.loadedMessageCount).toBe(1);
    expect(tab.totalMessageCount).toBeGreaterThanOrEqual(1);
    expect(tab.loadedSqlRowCount).toBeGreaterThanOrEqual(1);
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
