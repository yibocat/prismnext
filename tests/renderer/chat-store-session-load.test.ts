import { describe, it, expect, beforeEach, vi } from "vitest";

const sessionLoad = vi.fn();

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
    sessionLoad,
    sessionGetDirectory: vi.fn().mockResolvedValue(null),
    sessionGetContext: vi.fn().mockResolvedValue(null),
    sessionGetUserDisplays: vi.fn().mockResolvedValue([]),
  },
});

import { useChatStore } from "../../src/renderer/stores/chat-store";

describe("chat-store session loading", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
    (useChatStore as any)._msgCache.clear();
    sessionLoad.mockReset();
  });

  it("creates a tool_result for completed tools with empty output", async () => {
    sessionLoad.mockResolvedValue([
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            tool: "read",
            callID: "call-1",
            state: {
              status: "completed",
              input: { file_path: "paper/main.tex" },
            },
          },
        ],
      },
    ]);

    await useChatStore.getState().loadSession("session-1");

    const content = useChatStore.getState().messages[0].message?.content || [];
    expect(content).toEqual([
      { type: "tool_use", id: "call-1", name: "read", input: { file_path: "paper/main.tex" } },
      { type: "tool_result", tool_use_id: "call-1", content: "", is_error: false },
    ]);
  });

  it("creates an error tool_result for cancelled tools on session load", async () => {
    sessionLoad.mockResolvedValue([
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            tool: "bash",
            callID: "call-denied",
            state: {
              status: "cancelled",
              input: { command: "rm -rf /" },
            },
          },
        ],
      },
    ]);

    await useChatStore.getState().loadSession("session-2");

    const content = useChatStore.getState().messages[0].message?.content || [];
    expect(content).toEqual([
      { type: "tool_use", id: "call-denied", name: "bash", input: { command: "rm -rf /" } },
      {
        type: "tool_result",
        tool_use_id: "call-denied",
        content: "Permission denied",
        is_error: true,
      },
    ]);
  });

  it("sets isLoadingSession while session history loads from disk", async () => {
    let resolveLoad!: (value: unknown[]) => void;
    sessionLoad.mockImplementation(
      () => new Promise((resolve) => { resolveLoad = resolve; }),
    );

    const loadPromise = useChatStore.getState().loadSession("session-loading");
    await Promise.resolve();
    expect(useChatStore.getState().isLoadingSession).toBe(true);
    expect(useChatStore.getState().messages).toEqual([]);

    resolveLoad([
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "Hello" }],
      },
    ]);
    await loadPromise;

    expect(useChatStore.getState().isLoadingSession).toBe(false);
    expect(useChatStore.getState().messages.length).toBeGreaterThan(0);
  });

  it("hydrates cached sessions without entering loading state", async () => {
    const cached = [
      {
        type: "user" as const,
        message: { content: [{ type: "text" as const, text: "Cached hello" }] },
      },
    ];
    (useChatStore as any)._msgCache.set("session-cached", cached);

    await useChatStore.getState().loadSession("session-cached");

    expect(useChatStore.getState().isLoadingSession).toBe(false);
    expect(useChatStore.getState().messages).toEqual(cached);
  });

  it("drops internal patch metadata parts on session load", async () => {
    sessionLoad.mockResolvedValue([
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            tool: "apply_patch",
            callID: "call-patch",
            state: {
              status: "completed",
              input: { patch: "diff" },
              output: "ok",
            },
          },
          {
            type: "patch",
            hash: "df7612e3",
            files: ["/proj/.prismnext/worktrees/wt/main.tex"],
          },
        ],
      },
    ]);

    await useChatStore.getState().loadSession("session-patch");

    const content = useChatStore.getState().messages[0].message?.content || [];
    expect(content.some((b) => b.type === "text" && String(b.text).includes('"type":"patch"'))).toBe(false);
    expect(content).toEqual([
      { type: "tool_use", id: "call-patch", name: "apply_patch", input: { patch: "diff" } },
      { type: "tool_result", tool_use_id: "call-patch", content: "ok", is_error: false },
    ]);
  });
});
