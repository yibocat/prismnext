import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWorktreeAtCheckout } from "@/lib/git/checkout-context";
import { isPendingNewWorktree } from "@/lib/git/worktree-path";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";

const PROJECT = "/proj";
const WT_A = `${PROJECT}/.prismnext/worktrees/calm-owl`;

describe("new worktree intent", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      projectRoot: PROJECT,
      checkoutRoot: WT_A,
    } as any);
    useWorktreeStore.setState({
      mode: "worktree",
      pendingBranch: "main",
      activeWorktree: null,
      worktrees: [
        {
          name: "calm-owl",
          path: WT_A,
          branch: "wt-calm-owl",
          baseBranch: "main",
          head: "abc",
          aheadCount: 0,
          behindCount: 0,
        },
      ],
    } as any);
  });

  it("detects pending new worktree state", () => {
    const state = useWorktreeStore.getState();
    expect(isPendingNewWorktree(state)).toBe(true);
  });

  it("does not resolve checkout to an existing worktree while new intent is pending", () => {
    expect(resolveWorktreeAtCheckout()).toBeNull();
  });

  it("initializeWorktree creates a new worktree when pendingBranch is set", async () => {
    useDocumentStore.setState({ projectRoot: PROJECT } as any);

    const created = {
      name: "quick-fox",
      path: `${PROJECT}/.prismnext/worktrees/quick-fox`,
      branch: "wt-quick-fox",
      baseBranch: "main",
      head: "def",
      aheadCount: 0,
      behindCount: 0,
    };
    const create = vi.fn().mockResolvedValue(created);
    vi.stubGlobal("electronAPI", {
      worktreeCreate: create,
      worktreeList: vi.fn().mockResolvedValue([created]),
      fsScanMetadata: vi.fn().mockResolvedValue({ files: [], folders: [] }),
      fsExists: vi.fn(async (path: string) => path.endsWith("/.git")),
    });

    const wt = await useWorktreeStore.getState().initializeWorktree(PROJECT);
    expect(create).toHaveBeenCalledWith(PROJECT, undefined, "main");
    expect(wt.name).toBe("quick-fox");
    expect(useWorktreeStore.getState().activeWorktree?.name).toBe("quick-fox");
    expect(useWorktreeStore.getState().pendingBranch).toBeNull();
  });
});
