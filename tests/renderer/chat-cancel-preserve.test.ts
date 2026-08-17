import { describe, it, expect, beforeEach, vi } from "vitest";
import { beginConversationTurn, applyConversationEvent } from "@/lib/chat/conversation-reducer";

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

function livePartial(tabConversation: ReturnType<typeof useChatStore.getState>["tabs"][number]["conversation"]) {
  let conv = beginConversationTurn(tabConversation, { turnId: "turn-1", userText: "go" });
  conv = applyConversationEvent(conv, {
    type: "text_delta",
    runtimeSessionId: "rt",
    tabId: "tab",
    turnId: "turn-1",
    text: "Partial reply that streamed so far",
  });
  return conv;
}

describe("cancelExecution preserves partial reply", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
    agentCancel.mockClear();
  });

  it("commits the live turn as cancelled instead of discarding streamed text", async () => {
    const tabId = useChatStore.getState().createTab();
    useChatStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              runtime: "pi" as const,
              sessionId: tabId,
              conversation: livePartial(t.conversation),
              isStreaming: true,
            }
          : t,
      ),
    }));

    await useChatStore.getState().cancelExecution();

    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(agentCancel).toHaveBeenCalledWith({ conversationId: tabId });
    expect(tab.isStreaming).toBe(false);
    expect(tab.conversation.live).toBeNull();
    expect(tab.conversation.turns[0]?.status).toBe("cancelled");
    expect(tab.conversation.turns[0]?.assistant.blocks).toEqual([
      { type: "text", text: "Partial reply that streamed so far" },
    ]);
  });

  it("bumps streamGeneration on cancel so a later send is a new generation", async () => {
    const tabId = useChatStore.getState().createTab();
    useChatStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              runtime: "pi" as const,
              sessionId: tabId,
              conversation: livePartial(t.conversation),
              isStreaming: true,
              streamGeneration: 2,
            }
          : t,
      ),
    }));

    await useChatStore.getState().cancelExecution();
    const afterCancel = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(afterCancel.isStreaming).toBe(false);
    expect(afterCancel.streamGeneration).toBe(3);

    useChatStore.getState()._setStreaming(tabId, true);
    const afterResend = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(afterResend.isStreaming).toBe(true);
    expect(afterResend.streamGeneration).toBe(4);

    const { canClearStreamingForGeneration } = await import(
      "../../src/renderer/lib/chat/stream-generation"
    );
    expect(canClearStreamingForGeneration(2, afterResend.streamGeneration)).toBe(false);
    expect(canClearStreamingForGeneration(3, afterResend.streamGeneration)).toBe(false);
    expect(canClearStreamingForGeneration(4, afterResend.streamGeneration)).toBe(true);
  });

  it("does not throw when there is no live turn to commit", async () => {
    const tabId = useChatStore.getState().createTab();
    useChatStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, sessionId: tabId, isStreaming: true }
          : t,
      ),
    }));

    await useChatStore.getState().cancelExecution();

    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(tab.isStreaming).toBe(false);
    expect(tab.conversation.live).toBeNull();
    expect(tab.conversation.turns).toEqual([]);
  });
});
