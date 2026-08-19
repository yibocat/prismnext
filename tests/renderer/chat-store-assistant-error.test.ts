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

describe("chat-store _appendAssistantError", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
    (useChatStore as any)._msgCache.clear();
  });

  it("commits streaming then appends a turnError assistant bubble", () => {
    const tabId = useChatStore.getState().activeTabId;
    const store = useChatStore.getState();

    store._setStreaming(tabId, true);
    store._upsertLastMessage(tabId, {
      type: "assistant",
      message: { content: [{ type: "text", text: "partial…" }] },
    }, "msg-partial");

    store._appendAssistantError(tabId, "Insufficient quota (429).");

    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(tab.isStreaming).toBe(false);
    expect(tab.error).toBeNull();
    expect(tab.streamingMessage).toBeNull();
    expect(tab.messages.length).toBeGreaterThanOrEqual(2);
    const last = tab.messages[tab.messages.length - 1]!;
    expect(last.turnError).toBe(true);
    expect(last.type).toBe("assistant");
    expect(last.message?.content?.[0]).toMatchObject({
      type: "text",
      text: "Insufficient quota (429).",
    });
    const prior = tab.messages[tab.messages.length - 2]!;
    expect(prior.stopped).toBe(true);
    expect(prior.message?.content?.[0]).toMatchObject({ text: "partial…" });
  });

  it("dedupes identical session.error + chat:complete bodies", () => {
    const tabId = useChatStore.getState().activeTabId;
    const store = useChatStore.getState();
    store._appendAssistantError(tabId, "rate limited");
    store._appendAssistantError(tabId, "rate limited");
    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId)!;
    const errs = tab.messages.filter((m) => m.turnError);
    expect(errs).toHaveLength(1);
  });
});
