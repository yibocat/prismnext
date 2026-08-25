import { beforeEach, describe, expect, it, vi } from "vitest";

const agentSend = vi.fn().mockResolvedValue({ ok: false, error: "missing_project" });
const agentCancel = vi.fn().mockResolvedValue({ ok: true });
const agentDispose = vi.fn().mockResolvedValue({ ok: true });
const agentLoadSession = vi.fn().mockResolvedValue({ ok: false, error: "unknown_conversation" });

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: { getState: () => ({ projectRoot: "/tmp/project" }) },
}));

vi.mock("@/stores/settings-store", () => {
  let settings = {
    aiProvider: "anthropic",
    aiModel: "claude-sonnet-4-5",
    aiApiKeys: { anthropic: "sk-test" },
    sessionChromeByProject: {} as Record<string, Record<string, unknown>>,
  };
  return {
    useSettingsStore: {
      getState: () => ({ settings }),
      setState: (
        updater:
          | { settings?: typeof settings }
          | ((s: { settings: typeof settings }) => { settings?: typeof settings }),
      ) => {
        const patch = typeof updater === "function" ? updater({ settings }) : updater;
        if (patch.settings) settings = { ...settings, ...patch.settings };
      },
    },
  };
});

vi.mock("@/lib/desktop-api/settings", () => ({
  settingsDesktop: {
    settingsSet: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/git/checkout-context", () => ({
  applyCheckoutTransition: vi.fn().mockResolvedValue(undefined),
  attachWorktreeForSessionDirectory: vi.fn().mockResolvedValue(undefined),
  captureSessionCwd: vi.fn(),
  resolveWorktreeAtCheckout: vi.fn(),
  resolveWorktreePathForSend: vi.fn(),
  isWorktreeCheckoutPath: vi.fn().mockReturnValue(false),
  isPendingNewWorktree: vi.fn().mockReturnValue(false),
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
    agentSend,
    agentCancel,
    agentDispose,
    agentLoadSession,
  },
});

import { useChatStore } from "../../src/renderer/stores/chat-store";

describe("chat-store Agent routing", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
    agentSend.mockClear();
    agentCancel.mockClear();
    agentDispose.mockClear();
    agentLoadSession.mockClear();
  });

  it("makes New Agent a Pi conversation titled New Chat", () => {
    const initial = useChatStore.getState().tabs[0];
    expect(initial?.runtime).toBe("pi");
    expect(initial?.title).toBe("New Chat");

    useChatStore.getState().newSession();
    const active = useChatStore.getState().tabs.find(
      (tab) => tab.id === useChatStore.getState().activeTabId,
    );
    expect(active?.runtime).toBe("pi");
    expect(active?.title).toBe("New Chat");
    expect(useChatStore.getState().tabs.filter((tab) => tab.runtime === "pi").length).toBeGreaterThan(1);
  });

  it("sends New Agent prompts through the Agent API", async () => {
    const tabId = useChatStore.getState().activeTabId;
    await useChatStore.getState().sendPrompt("hello from pi");
    expect(agentSend).toHaveBeenCalledWith(expect.objectContaining({
      text: "hello from pi",
      tabId,
      projectRoot: "/tmp/project",
    }));
  });

  it("keeps imported OpenCode history read-only instead of using its backend", async () => {
    const tabId = useChatStore.getState().activeTabId;
    useChatStore.setState((state) => {
      const tabs = state.tabs.map((tab) => (
        tab.id === tabId
          ? { ...tab, runtime: "opencode" as const, legacyReadOnly: true }
          : tab
      ));
      return { tabs };
    });

    await useChatStore.getState().sendPrompt("do not continue in OpenCode");

    expect(agentSend).not.toHaveBeenCalled();
    const tab = useChatStore.getState().tabs.find((item) => item.id === tabId);
    expect(tab?.messages).toEqual([]);
    expect(tab?.error).toMatch(/read-only/i);
  });

  it("projects one Agent turn in event order without splitting tool results into messages", () => {
    const tabId = useChatStore.getState().activeTabId;
    const store = useChatStore.getState() as any;
    store._beginAgentTurn(tabId, "turn-1", "search then explain");
    const base = {
      runtimeSessionId: "runtime-1",
      tabId,
      turnId: "turn-1",
    };
    store._applyAgentEvent(tabId, { ...base, type: "text_delta", text: "Searching." });
    store._applyAgentEvent(tabId, {
      ...base,
      type: "tool_started",
      toolCallId: "tool-1",
      toolName: "literature-search",
      args: { query: "agent architecture" },
    });
    store._applyAgentEvent(tabId, {
      ...base,
      type: "tool_finished",
      toolCallId: "tool-1",
      toolName: "literature-search",
      ok: true,
      result: { count: 2 },
    });
    store._applyAgentEvent(tabId, { ...base, type: "text_delta", text: " Two papers found." });
    store._applyAgentEvent(tabId, { ...base, type: "turn_finished" });

    const tab = useChatStore.getState().tabs.find((item) => item.id === tabId) as any;
    expect(tab.conversation.turns[0].assistant.blocks.map((block: any) => block.type)).toEqual([
      "text",
      "tool_use",
      "tool_result",
      "text",
    ]);
    expect(tab.conversation.live).toBeNull();
  });

  it("loads history through the Agent API", async () => {
    const { emptyConversation } = await import("../../src/shared/agent/conversation");
    agentLoadSession.mockResolvedValue({
      ok: true,
      conversationId: "conv-hist",
      title: "History",
      conversation: emptyConversation({ conversationId: "conv-hist", title: "History" }),
    });

    await useChatStore.getState().loadSession("conv-hist");

    expect(agentLoadSession).toHaveBeenCalledWith({
      conversationId: "conv-hist",
      projectRoot: "/tmp/project",
    });
    const loaded = useChatStore.getState().tabs.find((tab) => tab.id === "conv-hist");
    expect(loaded?.runtime).toBe("pi");
    expect(loaded?.legacyReadOnly).toBe(false);
  });

  it("closes an Agent tab via Agent cancel/dispose for that tab only", () => {
    const firstId = useChatStore.getState().activeTabId;
    useChatStore.getState().newSession();
    useChatStore.getState().closeTab(firstId);
    expect(agentCancel).toHaveBeenCalledWith({ conversationId: firstId });
    expect(agentDispose).toHaveBeenCalledWith({ conversationId: firstId });
    expect(useChatStore.getState().tabs.some((tab) => tab.id === firstId)).toBe(false);
  });
});
