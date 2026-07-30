import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionRenameMock = vi.fn(async () => undefined);

// Mock stores and helpers that chat-store pulls in at module load.
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
  electronAPI: {
    sessionRename: sessionRenameMock,
    chatCancel: vi.fn().mockResolvedValue(undefined),
  },
});

import { useChatStore } from "../../src/renderer/stores/chat-store";

const stubTab = (id: string, sessionId: string | null, title: string) => ({
  id,
  title,
  userTitleSet: false,
  sessionId,
  sessionCwd: null,
  isStreaming: false,
  isLoadingSession: false,
  messages: [],
  streamingMessage: null,
  streamingPartMessageId: null,
  settledStreamMessageIds: [],
  error: null,
  promptStale: false,
  orchestratorId: null,
  sessionAgent: "build" as const,
  intensivePaperIds: [],
  subAgentRuns: {},
  preparePhase: null,
  planSuggestVisible: false,
  planSuggestDismissed: false,
  planSuggestReason: null,
  planSuggestDeadlineAt: null,
  planSuggestConsentSessionId: null,
  planDraftSteps: [],
  planDraftTitle: null,
  planDraftSummary: null,
  planArtifactCard: null,
  planDraftDirty: false,
  planDraftFileReady: false,
  planConfirmSuppressed: false,
  composerToolsSuppressed: false,
  planExitDialogOpen: false,
  draft: { input: "" },
  turnMeta: {},
  pendingTurnMeta: null,
  contextTokens: null,
  contextBreakdown: null,
  categorySchema: null,
  restoredFromCheckpointAt: null,
  lastCheckpointAt: null,
  lastCheckpointName: null,
  lastCheckpointKind: null,
  showCheckpointRestore: false,
});

beforeEach(() => {
  useChatStore.setState({
    tabs: [stubTab("tab-a", "sess-1", "New Chat"), stubTab("tab-b", null, "Another chat")],
    activeTabId: "tab-a",
    lastTitleByTab: {},
  } as any);
  sessionRenameMock.mockClear();
  sessionRenameMock.mockResolvedValue(undefined);
});

describe("renameSession", () => {
  it("calls IPC and updates title when tab has a sessionId", async () => {
    await useChatStore.getState().renameSession("tab-a", "My plan");
    expect(sessionRenameMock).toHaveBeenCalledWith({
      tabId: "tab-a",
      title: "My plan",
      sessionId: "sess-1",
    });
    expect(useChatStore.getState().tabs.find((t) => t.id === "tab-a")?.title).toBe("My plan");
    expect(useChatStore.getState().tabs.find((t) => t.id === "tab-a")?.userTitleSet).toBe(true);
    expect(useChatStore.getState().lastTitleByTab["tab-a"]).toBe("New Chat");
  });

  it("trims surrounding whitespace before saving", async () => {
    await useChatStore.getState().renameSession("tab-a", "  My plan  ");
    expect(sessionRenameMock).toHaveBeenCalledWith({
      tabId: "tab-a",
      title: "My plan",
      sessionId: "sess-1",
    });
    expect(useChatStore.getState().tabs.find((t) => t.id === "tab-a")?.title).toBe("My plan");
  });

  it("skips IPC and just updates local title when sessionId is null", async () => {
    await useChatStore.getState().renameSession("tab-b", "Local rename");
    expect(sessionRenameMock).not.toHaveBeenCalled();
    expect(useChatStore.getState().tabs.find((t) => t.id === "tab-b")?.title).toBe("Local rename");
    expect(useChatStore.getState().tabs.find((t) => t.id === "tab-b")?.userTitleSet).toBe(true);
    expect(useChatStore.getState().lastTitleByTab["tab-b"]).toBe("Another chat");
  });

  it("propagates IPC errors without writing the new title", async () => {
    sessionRenameMock.mockRejectedValueOnce(new Error("boom"));
    await expect(
      useChatStore.getState().renameSession("tab-a", "Won't stick"),
    ).rejects.toThrow("boom");
    expect(useChatStore.getState().tabs.find((t) => t.id === "tab-a")?.title).toBe("New Chat");
    expect(useChatStore.getState().lastTitleByTab["tab-a"]).toBeUndefined();
  });
});

describe("undoRenameSession", () => {
  it("restores the previous title and clears the buffer on success", async () => {
    await useChatStore.getState().renameSession("tab-a", "First");
    expect(useChatStore.getState().lastTitleByTab["tab-a"]).toBe("New Chat");
    sessionRenameMock.mockClear();

    await useChatStore.getState().undoRenameSession("tab-a");
    expect(sessionRenameMock).toHaveBeenCalledWith({
      tabId: "tab-a",
      title: "New Chat",
      sessionId: "sess-1",
    });
    expect(useChatStore.getState().tabs.find((t) => t.id === "tab-a")?.title).toBe("New Chat");
    expect(useChatStore.getState().lastTitleByTab["tab-a"]).toBeUndefined();
  });

  it("is a no-op when there is no buffered title", async () => {
    await useChatStore.getState().undoRenameSession("tab-a");
    expect(sessionRenameMock).not.toHaveBeenCalled();
  });

  it("preserves the buffer when IPC fails", async () => {
    await useChatStore.getState().renameSession("tab-a", "Second");
    sessionRenameMock.mockClear();
    sessionRenameMock.mockRejectedValueOnce(new Error("boom"));
    await expect(useChatStore.getState().undoRenameSession("tab-a")).rejects.toThrow("boom");
    expect(useChatStore.getState().lastTitleByTab["tab-a"]).toBe("New Chat");
  });
});

describe("renameSession and undoRenameSession interaction", () => {
  it("single-step undo buffer is overwritten by the next rename", async () => {
    await useChatStore.getState().renameSession("tab-a", "A");
    expect(useChatStore.getState().lastTitleByTab["tab-a"]).toBe("New Chat");
    await useChatStore.getState().renameSession("tab-a", "B");
    // After a second rename, the buffer holds the title that existed before *that* rename.
    expect(useChatStore.getState().lastTitleByTab["tab-a"]).toBe("A");
    // Tab title reflects the latest rename.
    expect(useChatStore.getState().tabs.find((t) => t.id === "tab-a")?.title).toBe("B");
  });
});
