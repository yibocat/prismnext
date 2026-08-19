import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/stores/chat-store";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useDocumentStore } from "@/stores/document-store";
import { clearCheckpointsForWorktree } from "@/lib/chat/worktree-checkpoint-lifecycle";
import { emptyConversation } from "../../src/shared/agent-conversation";

const PROJECT = "/proj";
const WT = `${PROJECT}/.prismnext/worktrees/owl`;

describe("clearCheckpointsForWorktree", () => {
  beforeEach(() => {
    useDocumentStore.setState({ projectRoot: PROJECT });
    useCheckpointStore.setState({ byTab: {} });
    useChatStore.setState({
      tabs: [
        {
          id: "tab-1",
          sessionId: "sess-1",
          sessionCwd: WT,
          title: "Test",
          messages: [],
          conversation: {
            ...emptyConversation({ conversationId: "tab-1" }),
            turns: [{
              turnId: "t0",
              turnIndex: 0,
              user: { blocks: [{ type: "text", text: "hi" }] },
              assistant: { blocks: [{ type: "text", text: "ok" }] },
              status: "completed",
            }],
          },
          streamingMessage: null,
          error: null,
          isStreaming: false,
          promptStale: false,
          isLoadingSession: false,
        } as any,
      ],
      activeTabId: "tab-1",
    });
    vi.stubGlobal("electronAPI", {
      fsExists: vi.fn().mockResolvedValue(true),
      fsDelete: vi.fn().mockResolvedValue(undefined),
      fsScan: vi.fn().mockResolvedValue({ files: [] }),
    });
  });

  it("clears checkpoints for tabs bound to the worktree path", async () => {
    useCheckpointStore.setState({
      byTab: {
        "tab-1": {
          sessionId: "sess-1",
          checkpoints: [
            {
              turnIndex: 0,
              createdAt: 1,
              files: [],
              touchedThisTurn: ["main.tex"],
            },
          ],
          pendingTurn: null,
          regret: null,
          boundCheckoutPath: WT,
        },
      },
    });

    await clearCheckpointsForWorktree(
      { path: WT, name: "owl", baseBranch: "main" },
      "merged",
    );

    expect(useCheckpointStore.getState().byTab["tab-1"].checkpoints).toEqual([]);
    expect(window.electronAPI.fsDelete).toHaveBeenCalled();
  });

  it("clears checkpoints when only checkpoint store references the worktree", async () => {
    useChatStore.setState({
      tabs: [
        {
          ...(useChatStore.getState().tabs[0] as any),
          sessionCwd: PROJECT,
        },
      ],
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
                  absolutePath: `${WT}/main.tex`,
                  content: "x",
                },
              ],
              touchedThisTurn: ["main.tex"],
            },
          ],
          pendingTurn: null,
          regret: null,
          boundCheckoutPath: WT,
        },
      },
    });

    await clearCheckpointsForWorktree(
      { path: WT, name: "owl", baseBranch: "main" },
      "merged",
    );

    expect(useCheckpointStore.getState().byTab["tab-1"].checkpoints).toEqual([]);
    expect(window.electronAPI.fsDelete).toHaveBeenCalled();
  });

  it("canRollback is false when session cwd no longer matches bound checkout", () => {
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
                  absolutePath: `${WT}/main.tex`,
                  content: "x",
                },
              ],
              touchedThisTurn: ["main.tex"],
            },
          ],
          pendingTurn: null,
          regret: null,
          boundCheckoutPath: WT,
        },
      },
    });
    useChatStore.setState({
      tabs: [
        {
          ...(useChatStore.getState().tabs[0] as any),
          sessionCwd: PROJECT,
        },
      ],
    } as any);

    expect(useCheckpointStore.getState().canRollbackToTurn("tab-1", 0)).toBe(false);
  });
});
