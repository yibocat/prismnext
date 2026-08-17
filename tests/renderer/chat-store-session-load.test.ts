import { describe, it, expect, beforeEach, vi } from "vitest";
import { emptyConversation, type Conversation } from "../../src/shared/agent-conversation";

const agentLoadSession = vi.fn();

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: { getState: () => ({ projectRoot: "/tmp/project" }) },
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
  electronAPI: {
    agentLoadSession,
    agentRenameSession: vi.fn().mockResolvedValue({ ok: true }),
    agentDispose: vi.fn().mockResolvedValue({ ok: true }),
    agentCancel: vi.fn().mockResolvedValue({ ok: true }),
  },
});

import { useChatStore } from "../../src/renderer/stores/chat-store";

function sampleConversation(conversationId: string): Conversation {
  return {
    ...emptyConversation({ conversationId, title: "Hello" }),
    turns: [
      {
        turnId: "t1",
        turnIndex: 0,
        user: { blocks: [{ type: "text", text: "Hello" }] },
        assistant: {
          blocks: [
            {
              type: "tool_use",
              id: "call-1",
              name: "read",
              input: { file_path: "paper/main.tex" },
              status: "completed",
            },
            {
              type: "tool_result",
              tool_use_id: "call-1",
              name: "read",
              content: "",
              is_error: false,
              status: "completed",
            },
          ],
        },
        status: "completed",
      },
    ],
  };
}

describe("chat-store session loading", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
    agentLoadSession.mockReset();
  });

  it("loads a Pi conversation as a writable Agent tab", async () => {
    agentLoadSession.mockResolvedValue({
      ok: true,
      conversationId: "conv-1",
      title: "Hello",
      conversation: sampleConversation("conv-1"),
    });

    await useChatStore.getState().loadSession("conv-1");

    expect(agentLoadSession).toHaveBeenCalledWith({
      conversationId: "conv-1",
      projectRoot: "/tmp/project",
    });
    const loaded = useChatStore.getState().tabs.find((tab) => tab.id === "conv-1");
    expect(loaded?.runtime).toBe("pi");
    expect(loaded?.legacyReadOnly).toBe(false);
    expect(loaded?.conversation.conversationId).toBe("conv-1");
    expect(loaded?.title).toBe("Hello");
    expect(useChatStore.getState().messages).toEqual([
      { type: "user", message: { content: [{ type: "text", text: "Hello" }] } },
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "call-1",
              name: "read",
              input: { file_path: "paper/main.tex" },
              status: "completed",
            },
            {
              type: "tool_result",
              tool_use_id: "call-1",
              name: "read",
              content: "",
              is_error: false,
              status: "completed",
            },
          ],
        },
      },
    ]);
  });

  it("sets isLoadingSession while Agent history loads", async () => {
    let resolveLoad!: (value: unknown) => void;
    agentLoadSession.mockImplementation(
      () => new Promise((resolve) => { resolveLoad = resolve; }),
    );

    const loadPromise = useChatStore.getState().loadSession("conv-loading");
    await Promise.resolve();
    expect(useChatStore.getState().isLoadingSession).toBe(true);
    expect(useChatStore.getState().messages).toEqual([]);

    resolveLoad({
      ok: true,
      conversationId: "conv-loading",
      title: "Hello",
      conversation: {
        ...emptyConversation({ conversationId: "conv-loading", title: "Hello" }),
        turns: [{
          turnId: "t1",
          turnIndex: 0,
          user: { blocks: [{ type: "text", text: "Hello" }] },
          assistant: { blocks: [] },
          status: "completed",
        }],
      },
    });
    await loadPromise;

    expect(useChatStore.getState().isLoadingSession).toBe(false);
    expect(useChatStore.getState().messages.length).toBeGreaterThan(0);
  });

  it("activates an already-open conversation without reloading it", async () => {
    agentLoadSession.mockResolvedValue({
      ok: true,
      conversationId: "conv-open",
      title: "Open",
      conversation: sampleConversation("conv-open"),
    });
    await useChatStore.getState().loadSession("conv-open");
    agentLoadSession.mockClear();

    await useChatStore.getState().loadSession("conv-open");

    expect(agentLoadSession).not.toHaveBeenCalled();
    expect(useChatStore.getState().activeTabId).toBe("conv-open");
  });
});
