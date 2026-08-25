import { create } from "zustand";
import { toast } from "sonner";
import type { WorktreeInfo, BranchInfo } from "@/types/electron";
import { applyCheckoutTransition } from "@/lib/git/checkout-context";
import { rehomeWorktreeSessions } from "@/lib/git/worktree-sessions";
import { worktreePathsEqual } from "@/lib/git/worktree-path";
import { reconcileWorktreeList, isWorktreeCheckoutOnDisk } from "@/lib/git/worktree-present";
import { clearCheckpointsForWorktree } from "@/lib/chat/worktree-checkpoint-lifecycle";
import { useDocumentStore } from "@/stores/document-store";
import { gitDesktop } from "@/lib/desktop-api/git";
import { fsDesktop } from "@/lib/desktop-api/fs";

export type WorktreeMode = "local" | "worktree";

interface WorktreeState {
  worktrees: WorktreeInfo[];
  activeWorktree: WorktreeInfo | null;
  mode: WorktreeMode;
  pendingBranch: string | null;
  branches: BranchInfo[];
  loading: boolean;
  error: string | null;

  /** Cache of pre-scanned file trees — keyed by absolute worktree path. */
  fileTreeCache: Map<string, {
    files: Array<{
      id: string;
      name: string;
      relativePath: string;
      absolutePath: string;
      type: "tex" | "image" | "pdf" | "bib" | "style" | "other";
      fileSize?: number;
    }>;
    folders: string[];
    scannedAt: number;
  }>;
  preScanWorktree: (worktreePath: string) => Promise<void>;
  getCachedTree: (worktreePath: string) => { files: any[]; folders: string[] } | undefined;
  invalidateCache: (worktreePath: string) => void;

  refreshWorktrees: (projectRoot: string) => Promise<void>;
  setMode: (mode: WorktreeMode, branch?: string) => void;
  selectExistingWorktree: (worktree: WorktreeInfo) => void;
  initializeWorktree: (projectRoot: string) => Promise<WorktreeInfo>;
  moveToLocal: (projectRoot: string, target?: WorktreeInfo) => Promise<void>;
  removeWorktree: (projectRoot: string, name: string) => Promise<void>;
  refreshBranches: (projectRoot: string) => Promise<void>;
  clearActiveWorktree: () => void;
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
  fileTreeCache: new Map(),

  refreshWorktrees: async (projectRoot: string) => {
    set({ loading: true, error: null });
    try {
      let worktrees = await gitDesktop.worktreeList(projectRoot);
      if (useDocumentStore.getState().projectRoot !== projectRoot) return;

      worktrees = await reconcileWorktreeList(worktrees, get().worktrees);

      const { activeWorktree: active, mode: currentMode } = get();
      const hadActive = active !== null;
      let stillExists = hadActive
        ? worktrees.some((w) => worktreePathsEqual(w.path, active!.path))
        : false;
      if (hadActive && !stillExists && active) {
        if (await isWorktreeCheckoutOnDisk(active.path)) {
          worktrees = [...worktrees, active];
          stillExists = true;
        }
      }

      set({
        worktrees,
        loading: false,
        activeWorktree: stillExists ? active : (hadActive ? null : active),
        mode: hadActive && !stillExists ? "local" : currentMode,
        pendingBranch: hadActive && !stillExists ? null : get().pendingBranch,
      });
    } catch (err: unknown) {
      if (useDocumentStore.getState().projectRoot !== projectRoot) return;
      set({
        error: (err as Error).message || "Failed to list worktrees",
        loading: false,
      });
    }
  },

  preScanWorktree: async (worktreePath: string) => {
    try {
      const result = await fsDesktop.fsScanMetadata(worktreePath);
      const files = result.files.map((f) => ({
        id: f.relativePath,
        name: f.relativePath.split("/").pop() || f.relativePath,
        relativePath: f.relativePath,
        absolutePath: f.absolutePath,
        type: f.type,
        fileSize: f.fileSize,
      }));
      const newCache = new Map(get().fileTreeCache);
      newCache.set(worktreePath, { files, folders: result.folders, scannedAt: Date.now() });
      set({ fileTreeCache: newCache });
    } catch {
      // Best-effort
    }
  },

  getCachedTree: (worktreePath: string) => {
    const entry = get().fileTreeCache.get(worktreePath);
    if (!entry) return undefined;
    return { files: entry.files, folders: entry.folders };
  },

  invalidateCache: (worktreePath: string) => {
    const newCache = new Map(get().fileTreeCache);
    newCache.delete(worktreePath);
    set({ fileTreeCache: newCache });
  },

  setMode: (mode: WorktreeMode, branch?: string) => {
    if (mode === "local") {
      set({ mode: "local", pendingBranch: null, activeWorktree: null });
    } else {
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

    if (mode !== "worktree") throw new Error("Not in worktree mode");

    // Reuse an already-attached worktree only when user did not ask for a new one.
    if (!pendingBranch) {
      if (activeWorktree) return activeWorktree;
      throw new Error("No branch selected for worktree");
    }

    set({ loading: true, error: null, activeWorktree: null });
    try {
      const info = await gitDesktop.worktreeCreate(
        projectRoot,
        undefined,
        pendingBranch,
      );
      if (useDocumentStore.getState().projectRoot !== projectRoot) {
        throw new Error("Project changed during worktree creation");
      }

      set({ activeWorktree: info, pendingBranch: null, loading: false });
      get().preScanWorktree(info.path).catch(() => {});
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

  moveToLocal: async (projectRoot: string, target?: WorktreeInfo) => {
    const { activeWorktree } = get();
    const closing = target ?? activeWorktree;
    if (!closing) {
      set({ mode: "local", pendingBranch: null });
      return;
    }

    const closingActive =
      !!activeWorktree &&
      (worktreePathsEqual(activeWorktree.path, closing.path) ||
        activeWorktree.name === closing.name);

    set({ loading: true, error: null });
    let sessionCount = 0;
    const wtPath = closing.path;
    await clearCheckpointsForWorktree(closing, "closed");
    try {
      try {
        sessionCount = await gitDesktop.worktreeMoveSessions(projectRoot, closing.name);
      } catch {
        toast.warning("Conversation history could not be migrated", {
          description: "Sessions from this worktree may be lost.",
          duration: 6000,
        });
      }
      const reassigned = await rehomeWorktreeSessions(projectRoot, wtPath);
      if (reassigned > 0) sessionCount = Math.max(sessionCount, reassigned);
      await gitDesktop.worktreeRemove(projectRoot, closing.name);
    } catch {
      // Even if removal fails, reset local state when we closed the active checkout
    }
    get().invalidateCache(wtPath);
    set({
      activeWorktree: closingActive ? null : activeWorktree,
      mode: closingActive ? "local" : get().mode,
      pendingBranch: closingActive ? null : get().pendingBranch,
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
    const active = get().activeWorktree;
    const wasActive = active?.name === name;
    const wtPath = active?.name === name ? active.path : get().worktrees.find((w) => w.name === name)?.path;
    const wtInfo = active?.name === name
      ? active
      : get().worktrees.find((w) => w.name === name);
    if (wtInfo) {
      await clearCheckpointsForWorktree(wtInfo, "closed");
    }
    try {
      if (wtPath) {
        await rehomeWorktreeSessions(projectRoot, wtPath);
      }
      await gitDesktop.worktreeRemove(projectRoot, name);
      if (wtPath) {
        get().invalidateCache(wtPath);
      }
      if (wasActive) {
        await applyCheckoutTransition({ type: "local" });
      }
      await get().refreshWorktrees(projectRoot);
      set({ loading: false });
    } catch (err: unknown) {
      set({
        error: (err as Error).message || "Failed to remove worktree",
        loading: false,
      });
      throw err;
    }
  },

  clearActiveWorktree: () => {
    set({ activeWorktree: null, mode: "local", pendingBranch: null });
  },

  refreshBranches: async (projectRoot: string) => {
    try {
      const branches = await gitDesktop.worktreeBranches(projectRoot);
      if (useDocumentStore.getState().projectRoot !== projectRoot) return;
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
      fileTreeCache: new Map(),
    }),
}));
