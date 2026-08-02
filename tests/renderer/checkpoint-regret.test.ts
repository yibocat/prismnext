import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/stores/chat-store";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useDocumentStore } from "@/stores/document-store";
import { truncateChatMessagesToTurn } from "@/components/modules/chat/chat-turns";

const PROJECT = "/proj";

function user(text: string) {
  return { type: "user" as const, message: { content: [{ type: "text" as const, text }] } };
}

function assistant(text: string) {
  return { type: "assistant" as const, message: { content: [{ type: "text" as const, text }] } };
}

describe("checkpoint regret / surviveNextFinalize", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      projectRoot: PROJECT,
      files: [],
      getContent: () => null,
      refreshFileContent: async () => {},
      refreshFiles: async () => {},
    } as any);
    useCheckpointStore.setState({ byTab: {} });
    useChatStore.setState({
      tabs: [
        {
          id: "tab-1",
          sessionId: null,
          sessionCwd: PROJECT,
          title: "Test",
          messages: [user("a"), assistant("A"), user("b"), assistant("B")],
          streamingMessage: null,
          error: null,
          isStreaming: false,
          promptStale: false,
          isLoadingSession: false,
        } as any,
      ],
      activeTabId: "tab-1",
      truncateToTurn: (tabId: string, turnIndex: number) => {
        useChatStore.setState((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId
              ? { ...t, messages: truncateChatMessagesToTurn(t.messages, turnIndex) }
              : t,
          ),
        }));
      },
      restoreMessages: (tabId: string, messages: unknown[]) => {
        useChatStore.setState((s) => ({
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, messages } : t)),
        }));
      },
      resyncTabMessagesFromDisk: async () => {},
    } as any);

    vi.stubGlobal("electronAPI", {
      fsExists: vi.fn().mockResolvedValue(false),
      fsRead: vi.fn(),
      fsWrite: vi.fn(),
      fsMkdir: vi.fn(),
      fsDelete: vi.fn(),
      sessionTruncateToTurn: vi.fn(),
      sessionUndoTruncate: vi.fn(),
    });
  });

  it("allows chat-only rollback when later turns exist", () => {
    useCheckpointStore.setState({
      byTab: {
        "tab-1": {
          sessionId: null,
          checkpoints: [],
          pendingTurn: null,
          regret: null,
          boundCheckoutPath: PROJECT,
        },
      },
    });

    expect(useCheckpointStore.getState().canRollbackToTurn("tab-1", 0)).toBe(true);
    expect(useCheckpointStore.getState().canRollbackToTurn("tab-1", 1)).toBe(true);
  });

  it("shows rollback for tip turn even without file checkpoints", () => {
    useCheckpointStore.setState({
      byTab: {
        "tab-1": {
          sessionId: null,
          checkpoints: [],
          pendingTurn: null,
          regret: null,
          boundCheckoutPath: PROJECT,
        },
      },
    });
    useChatStore.setState({
      tabs: [
        {
          ...(useChatStore.getState().tabs[0] as any),
          messages: [user("only"), assistant("one")],
        },
      ],
    } as any);

    expect(useCheckpointStore.getState().canRollbackToTurn("tab-1", 0)).toBe(true);
  });

  it("keeps regret across one finalize when surviveNextFinalize is set", async () => {
    useCheckpointStore.setState({
      byTab: {
        "tab-1": {
          sessionId: null,
          checkpoints: [
            {
              turnIndex: 0,
              createdAt: 1,
              files: [
                {
                  relativePath: "main.tex",
                  absolutePath: `${PROJECT}/main.tex`,
                  content: "v0",
                },
              ],
              touchedThisTurn: ["main.tex"],
            },
            {
              turnIndex: 1,
              createdAt: 2,
              files: [
                {
                  relativePath: "main.tex",
                  absolutePath: `${PROJECT}/main.tex`,
                  content: "v1",
                },
              ],
              touchedThisTurn: ["main.tex"],
            },
          ],
          pendingTurn: null,
          regret: null,
          boundCheckoutPath: PROJECT,
        },
      },
    });

    await useCheckpointStore.getState().rollbackToTurn("tab-1", 0, {
      preserveRegretAcrossNextFinalize: true,
    });

    const afterRollback = useCheckpointStore.getState().byTab["tab-1"]!;
    expect(afterRollback.regret?.surviveNextFinalize).toBe(true);
    expect(useCheckpointStore.getState().canUndoRollback("tab-1")).toBe(true);

    useCheckpointStore.getState().beginTurn("tab-1", 1);
    await useCheckpointStore.getState().finalizeTurn("tab-1", true);

    const afterFirstFinalize = useCheckpointStore.getState().byTab["tab-1"]!;
    expect(afterFirstFinalize.regret).not.toBeNull();
    expect(afterFirstFinalize.regret?.surviveNextFinalize).toBe(false);
    expect(useCheckpointStore.getState().canUndoRollback("tab-1")).toBe(true);

    useCheckpointStore.getState().beginTurn("tab-1", 2);
    await useCheckpointStore.getState().finalizeTurn("tab-1", true);

    expect(useCheckpointStore.getState().byTab["tab-1"]!.regret).toBeNull();
    expect(useCheckpointStore.getState().canUndoRollback("tab-1")).toBe(false);
  });

  it("clears regret on finalize when surviveNextFinalize is not set", async () => {
    useCheckpointStore.setState({
      byTab: {
        "tab-1": {
          sessionId: null,
          checkpoints: [
            {
              turnIndex: 0,
              createdAt: 1,
              files: [],
              touchedThisTurn: [],
            },
          ],
          pendingTurn: null,
          regret: {
            files: [],
            checkpoints: [],
            messages: [user("old")],
            surviveNextFinalize: false,
          },
          boundCheckoutPath: PROJECT,
        },
      },
    });

    useCheckpointStore.getState().beginTurn("tab-1", 1);
    await useCheckpointStore.getState().finalizeTurn("tab-1", true);

    expect(useCheckpointStore.getState().byTab["tab-1"]!.regret).toBeNull();
  });

  it("restores UI/files when sessionUndoTruncate fails", async () => {
    (window.electronAPI as any).sessionUndoTruncate = vi.fn().mockRejectedValue(
      new Error("No session backup available for undo"),
    );
    (window.electronAPI as any).fsWrite = vi.fn().mockResolvedValue(undefined);
    (window.electronAPI as any).fsExists = vi.fn().mockResolvedValue(true);

    useDocumentStore.setState({
      projectRoot: PROJECT,
      files: [
        {
          id: "f1",
          relativePath: "main.tex",
          absolutePath: `${PROJECT}/main.tex`,
        },
      ],
      getContent: () => "tip",
      refreshFileContent: async () => {},
      refreshFiles: async () => {},
    } as any);

    useCheckpointStore.setState({
      byTab: {
        "tab-1": {
          sessionId: "sess-1",
          checkpoints: [
            {
              turnIndex: 0,
              createdAt: 1,
              files: [
                {
                  relativePath: "main.tex",
                  absolutePath: `${PROJECT}/main.tex`,
                  content: "v0",
                },
              ],
              touchedThisTurn: ["main.tex"],
            },
          ],
          pendingTurn: null,
          regret: {
            files: [
              {
                relativePath: "main.tex",
                absolutePath: `${PROJECT}/main.tex`,
                content: "tip",
              },
            ],
            checkpoints: [
              {
                turnIndex: 0,
                createdAt: 1,
                files: [
                  {
                    relativePath: "main.tex",
                    absolutePath: `${PROJECT}/main.tex`,
                    content: "v0",
                  },
                ],
                touchedThisTurn: ["main.tex"],
              },
              {
                turnIndex: 1,
                createdAt: 2,
                files: [
                  {
                    relativePath: "main.tex",
                    absolutePath: `${PROJECT}/main.tex`,
                    content: "tip",
                  },
                ],
                touchedThisTurn: ["main.tex"],
              },
            ],
            messages: [user("a"), assistant("A"), user("b"), assistant("B")],
          },
          boundCheckoutPath: PROJECT,
        },
      },
    });

    const result = await useCheckpointStore.getState().undoLastRollback("tab-1");
    expect(result.ok).toBe(true);
    expect(result.sessionRestored).toBe(false);
    expect(useChatStore.getState().tabs[0]!.messages).toHaveLength(4);
    expect(window.electronAPI.fsWrite).toHaveBeenCalledWith(
      `${PROJECT}/main.tex`,
      "tip",
    );
    expect(useCheckpointStore.getState().byTab["tab-1"]!.regret).toBeNull();
  });

  it("deletes files created after the rollback target", async () => {
    const deleted: string[] = [];
    (window.electronAPI as any).fsExists = vi.fn().mockResolvedValue(true);
    (window.electronAPI as any).fsDelete = vi.fn(async (p: string) => {
      deleted.push(p);
    });
    (window.electronAPI as any).fsWrite = vi.fn().mockResolvedValue(undefined);

    useDocumentStore.setState({
      projectRoot: PROJECT,
      files: [],
      getContent: () => null,
      refreshFileContent: async () => {},
      refreshFiles: async () => {},
    } as any);

    useCheckpointStore.setState({
      byTab: {
        "tab-1": {
          sessionId: null,
          checkpoints: [
            {
              turnIndex: 0,
              createdAt: 1,
              files: [
                {
                  relativePath: "main.tex",
                  absolutePath: `${PROJECT}/main.tex`,
                  content: "v0",
                },
              ],
              touchedThisTurn: ["main.tex"],
              createdThisTurn: [],
            },
            {
              turnIndex: 1,
              createdAt: 2,
              files: [
                {
                  relativePath: "main.tex",
                  absolutePath: `${PROJECT}/main.tex`,
                  content: "v0",
                },
                {
                  relativePath: "extra.tex",
                  absolutePath: `${PROJECT}/extra.tex`,
                  content: "new",
                },
              ],
              touchedThisTurn: ["extra.tex"],
              createdThisTurn: ["extra.tex"],
            },
          ],
          pendingTurn: null,
          regret: null,
          boundCheckoutPath: PROJECT,
        },
      },
    });

    await useCheckpointStore.getState().rollbackToTurn("tab-1", 0);

    expect(deleted).toContain(`${PROJECT}/extra.tex`);
    expect(window.electronAPI.fsWrite).toHaveBeenCalledWith(
      `${PROJECT}/main.tex`,
      "v0",
    );
  });
});
