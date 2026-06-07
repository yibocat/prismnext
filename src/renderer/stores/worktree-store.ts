import { create } from "zustand";
import { toast } from "sonner";
import type { WorktreeInfo, BranchInfo } from "@/types/electron";

export type WorktreeMode = "local" | "worktree";

interface WorktreeState {
  worktrees: WorktreeInfo[];
  activeWorktree: WorktreeInfo | null;
  mode: WorktreeMode;
  pendingBranch: string | null;
  branches: BranchInfo[];
  loading: boolean;
  error: string | null;

  refreshWorktrees: (projectRoot: string) => Promise<void>;
  setMode: (mode: WorktreeMode, branch?: string) => void;
  selectExistingWorktree: (worktree: WorktreeInfo) => void;
  initializeWorktree: (projectRoot: string) => Promise<WorktreeInfo>;
  moveToLocal: (projectRoot: string) => Promise<void>;
  removeWorktree: (projectRoot: string, name: string) => Promise<void>;
  refreshBranches: (projectRoot: string) => Promise<void>;
  clearAll: () => void;
}

export const useWorktreeStore = create<WorktreeState>()((set, get) => ({
  worktrees: [],
  activeWorktree: null,
  mode: "local",
  pendingBranch: null,
  branches: [],
  loading: false,
  error: null,

  refreshWorktrees: async (projectRoot: string) => {
    set({ loading: true, error: null });
    try {
      const worktrees = await window.electronAPI.worktreeList(projectRoot);
      const { activeWorktree: active, mode: currentMode } = get();
      // Only reset mode if the previously-active worktree was deleted externally.
      // If there was no active worktree (pending "New Worktree" state), preserve the mode.
      const hadActive = active !== null;
      const stillExists = hadActive
        ? worktrees.some((w) => w.name === active!.name)
        : false;
      set({
        worktrees,
        loading: false,
        activeWorktree: stillExists ? active : (hadActive ? null : active),
        // Only downgrade to "local" if we LOST an active worktree — not when pending
        mode: hadActive && !stillExists ? "local" : currentMode,
        pendingBranch: hadActive && !stillExists ? null : get().pendingBranch,
      });
    } catch (err: unknown) {
      set({
        error: (err as Error).message || "Failed to list worktrees",
        loading: false,
      });
    }
  },

  setMode: (mode: WorktreeMode, branch?: string) => {
    if (mode === "local") {
      set({ mode: "local", pendingBranch: null, activeWorktree: null });
    } else {
      // "New Worktree" is a fresh intent — clear any existing worktree
      set({ mode: "worktree", pendingBranch: branch ?? null, activeWorktree: null });
    }
  },

  selectExistingWorktree: (worktree: WorktreeInfo) => {
    set({
      mode: "worktree",
      activeWorktree: worktree,
      pendingBranch: null,
    });
  },

  initializeWorktree: async (projectRoot: string) => {
    const { pendingBranch, mode, activeWorktree } = get();

    // If already initialized (selectExistingWorktree was used), just return it
    if (activeWorktree) return activeWorktree;

    // If in local mode, nothing to do
    if (mode !== "worktree") throw new Error("Not in worktree mode");

    if (!pendingBranch) throw new Error("No branch selected for worktree");

    set({ loading: true, error: null });
    try {
      const info = await window.electronAPI.worktreeCreate(
        projectRoot,
        undefined, // auto-generate name
        pendingBranch,
      );
      // Set activeWorktree BEFORE refreshWorktrees so it won't reset mode to "local"
      set({ activeWorktree: info, pendingBranch: null });
      await get().refreshWorktrees(projectRoot);
      return info;
    } catch (err: unknown) {
      set({
        error: (err as Error).message || "Failed to create worktree",
        loading: false,
      });
      throw err;
    }
  },

  moveToLocal: async (projectRoot: string) => {
    const { activeWorktree } = get();
    if (!activeWorktree) {
      set({ mode: "local", pendingBranch: null });
      return;
    }

    set({ loading: true, error: null });
    let sessionCount = 0;
    try {
      // Move session files from worktree to project so the conversation
      // becomes a normal project-level session instead of being deleted.
      try {
        sessionCount = await window.electronAPI.worktreeMoveSessions(projectRoot, activeWorktree.name);
      } catch {
        // Session migration is best-effort — warn but proceed with removal
        toast.warning("Conversation history could not be migrated", {
          description: "Sessions from this worktree may be lost.",
          duration: 6000,
        });
      }
      await window.electronAPI.worktreeRemove(projectRoot, activeWorktree.name);
    } catch {
      // Even if removal fails, reset local state
    }
    set({
      activeWorktree: null,
      mode: "local",
      pendingBranch: null,
      loading: false,
    });
    await get().refreshWorktrees(projectRoot);

    if (sessionCount > 0) {
      toast.success("Worktree closed", {
        description: `Moved ${sessionCount} session(s) back to project.`,
        duration: 4000,
      });
    }
  },

  removeWorktree: async (projectRoot: string, name: string) => {
    set({ loading: true, error: null });
    try {
      await window.electronAPI.worktreeRemove(projectRoot, name);
      const { activeWorktree, mode } = get();
      if (activeWorktree?.name === name) {
        set({ activeWorktree: null, mode: "local", pendingBranch: null });
      }
      await get().refreshWorktrees(projectRoot);
    } catch (err: unknown) {
      set({
        error: (err as Error).message || "Failed to remove worktree",
        loading: false,
      });
      throw err;
    }
  },

  refreshBranches: async (projectRoot: string) => {
    try {
      const branches = await window.electronAPI.worktreeBranches(projectRoot);
      set({ branches });
    } catch {}
  },

  clearAll: () =>
    set({
      worktrees: [],
      activeWorktree: null,
      mode: "local",
      pendingBranch: null,
      branches: [],
      loading: false,
      error: null,
    }),
}));
