import { create } from "zustand";
import { toast } from "sonner";
import { createLogger } from "@/services/logger";
import type {
  GitFileStatusData,
  GitStatusData,
  GitBranchesData,
  GitFileDiffData,
} from "@/types/electron";
import { useDocumentStore } from "./document-store";
import { useWorktreeStore } from "./worktree-store";

const log = createLogger("git-store", "git");

// ─── Types ───

export type GitFilterMode = "unstaged" | "staged" | "all";
export type GitViewMode = "changes" | "history";

export interface GitCommitData {
  hash: string;
  message: string;
  author: string;
  date: string;
  graph: string;
  refs: string;
  insertions: number;
  deletions: number;
}

export interface GitFileItem extends GitFileStatusData {
  /** Unique id for this item (path + splitView for MM files) */
  id: string;
  /** Diff content, loaded on demand when accordion expands */
  diff: { oldContent: string; newContent: string } | null;
  /** Whether diff is currently loading */
  diffLoading: boolean;
  /** Whether the accordion item is expanded */
  expanded: boolean;
  /** Line change counts */
  added: number;
  deleted: number;
  /**
   * For files that have both staged and unstaged changes (MM in git status),
   * the file is split into two entries. This field indicates which portion
   * this entry represents. When set, diff is always computed from this view.
   */
  splitView?: "staged" | "unstaged";
}

interface GitState {
  // ── Core data ──
  branch: string;
  branches: string[];
  files: GitFileItem[];
  filterMode: GitFilterMode;

  // ── Status ──
  loading: boolean;
  error: string | null;
  isGitRepo: boolean;
  checkingRepo: boolean;

  // ── View mode ──
  viewMode: GitViewMode;
  listMode: "list" | "tree";
  commits: GitCommitData[];
  commitsLoading: boolean;

  // ── Current unit (sub-folder working directory) ──
  unitRoot: string | null;
  /** Bumped after init / checkout — sidebar watches this to re-scan .git folders */
  gitFolderVersion: number;
  /** Schedule a debounced refreshStatus after editor auto-save */
  scheduleAutoRefresh: (projectRoot: string) => void;
  _autoRefreshTimer: ReturnType<typeof setTimeout> | null;

  // ── Actions ──
  selectUnit: (path: string) => Promise<void>;
  checkRepo: (projectRoot: string) => Promise<void>;
  setViewMode: (mode: GitViewMode) => void;
  setListMode: (mode: "list" | "tree") => void;
  loadHistory: (projectRoot: string) => Promise<void>;
  refreshStatus: (projectRoot: string) => Promise<void>;
  refreshBranches: (projectRoot: string) => Promise<void>;
  loadDiff: (projectRoot: string, fileId: string, filePath: string) => Promise<void>;
  setFilterMode: (mode: GitFilterMode) => void;
  setFileExpanded: (id: string, expanded: boolean) => void;
  stageFile: (projectRoot: string, filePath: string) => Promise<void>;
  unstageFile: (projectRoot: string, filePath: string) => Promise<void>;
  stageAll: (projectRoot: string, filePaths: string[]) => Promise<void>;
  unstageAll: (projectRoot: string, filePaths: string[]) => Promise<void>;
  discardFile: (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) => Promise<void>;
  commitChanges: (projectRoot: string, message: string) => Promise<void>;
  switchBranch: (projectRoot: string, branch: string) => Promise<void>;
  createBranch: (projectRoot: string, branchName: string) => Promise<void>;
  mergeBranch: (projectRoot: string, sourceBranch: string) => Promise<void>;
  abortMerge: (projectRoot: string) => Promise<void>;
  revertCommit: (projectRoot: string, hash: string) => Promise<void>;
  resetToCommit: (projectRoot: string, hash: string, mode: "soft" | "mixed" | "hard") => Promise<void>;
  initRepo: (projectRoot: string) => Promise<void>;
  /** True while switchBranch is in progress — UI shows a spinner. */
  switching: boolean;
  /** Branch selected in chat toolbar — not yet switched. Applied lazily on send. */
  pendingBranch: string | null;
  setPendingBranch: (branch: string | null) => void;
  clearAll: () => void;
}

// ─── Helpers ───

/** Stable ID based on path + splitView — avoids React unmount/remount on every refreshStatus. */
function stableId(path: string, splitView?: "staged" | "unstaged"): string {
  return splitView ? `${path}#${splitView}` : path;
}

/** Timestamp of the last refreshStatus call. Used by scheduleAutoRefresh
 *  to avoid a redundant refresh right after a direct call (e.g. from a
 *  git action like switchBranch / mergeBranch). */
let lastRefreshTimestamp = 0;

/** Short-lived cache for git status + diff stats to avoid redundant
 *  git subprocess spawns within the same event cascade.
 *  TTL is intentionally short (1 s) — only catches back-to-back calls.
 *  Keyed by projectRoot so switching projects doesn't return stale data. */
interface CachedStatus {
  projectRoot: string;
  data: GitStatusData;
  stats: { unstaged: Record<string, { added: number; deleted: number }>; staged: Record<string, { added: number; deleted: number }> };
  timestamp: number;
}
let _statusCache: CachedStatus | null = null;
const STATUS_CACHE_TTL_MS = 1000;

function invalidateStatusCache() {
  _statusCache = null;
}

function makeItem(
  f: GitFileStatusData,
  overrides?: Partial<GitFileItem>,
): GitFileItem {
  return {
    ...f,
    id: stableId(f.path, overrides?.splitView),
    diff: null,
    diffLoading: false,
    expanded: false,
    added: 0,
    deleted: 0,
    ...overrides,
  };
}

// ─── Store ───

export const useGitStore = create<GitState>()((set, get) => ({
  branch: "",
  branches: [],
  files: [],
  filterMode: "all",
  loading: false,
  error: null,
  pendingBranch: null,
  switching: false,
  isGitRepo: false,
  checkingRepo: true,
  unitRoot: null,
  gitFolderVersion: 0,
  _autoRefreshTimer: null,
  viewMode: "changes",
  listMode: "list",
  commits: [],
  commitsLoading: false,

  // ── setViewMode ──
  setViewMode: (mode: GitViewMode) => set({ viewMode: mode }),

  // ── setListMode ──
  setListMode: (mode: "list" | "tree") => set({ listMode: mode }),

  // ── loadHistory ──
  loadHistory: async (projectRoot: string) => {
    if (get().commitsLoading) return;
    set({ commitsLoading: true });
    try {
      const commits = await window.electronAPI.gitLog(projectRoot);
      set({ commits, commitsLoading: false });
    } catch {
      set({ commits: [], commitsLoading: false });
    }
  },

  // ── selectUnit ──
  selectUnit: async (path: string) => {
    set({ unitRoot: path });
    await get().checkRepo(path);
  },

  // ── checkRepo ──
  checkRepo: async (projectRoot: string) => {
    try {
      const isRepo = await window.electronAPI.gitIsRepo(projectRoot);
      set({ isGitRepo: isRepo, checkingRepo: false });
      if (isRepo) {
        // Must be sequential: refreshStatus sets branch, refreshBranches refines it.
        // Parallel would cause a race condition on the `branch` field.
        await get().refreshStatus(projectRoot);
        await get().refreshBranches(projectRoot);
      }
    } catch {
      set({ isGitRepo: false, checkingRepo: false });
    }
  },

  // ── refreshStatus ──
  refreshStatus: async (projectRoot: string) => {
    lastRefreshTimestamp = Date.now();

    // Short-lived cache: if status was fetched within the last second
    // and hasn't been invalidated by a mutation, reuse the raw data.
    let data: GitStatusData;
    let stats: { unstaged: Record<string, { added: number; deleted: number }>; staged: Record<string, { added: number; deleted: number }> };

    if (_statusCache && _statusCache.projectRoot === projectRoot && Date.now() - _statusCache.timestamp < STATUS_CACHE_TTL_MS) {
      data = _statusCache.data;
      stats = _statusCache.stats;
    } else {
      set({ loading: true, error: null });
      try {
        [data, stats] = await Promise.all([
          window.electronAPI.gitStatus(projectRoot),
          window.electronAPI.gitDiffStats(projectRoot).catch(() => ({ unstaged: {}, staged: {} })),
        ]);
        _statusCache = { projectRoot, data, stats, timestamp: Date.now() };
      } catch (err: unknown) {
        toast.error((err as Error).message || "Failed to get git status");
        set({
          error: (err as Error).message || "Failed to get git status",
          loading: false,
        });
        return;
      }
    }
      // Index previous file state by stable id → O(1) lookup instead of O(n²) Array.find
      const prevById = new Map<string, GitFileItem>();
      for (const p of get().files) prevById.set(p.id, p);
      const files: GitFileItem[] = [];

      for (const f of data.files) {
        const unstagedStat = stats.unstaged[f.path] ?? { added: 0, deleted: 0 };
        const stagedStat = stats.staged[f.path] ?? { added: 0, deleted: 0 };

        if (f.staged && f.unstaged) {
          // MM file: split into two entries — one staged, one unstaged
          const prevStaged = prevById.get(stableId(f.path, "staged"));
          const prevUnstaged = prevById.get(stableId(f.path, "unstaged"));

          files.push(
            makeItem(f, {
              staged: true,
              unstaged: false,
              splitView: "staged",
              diff: prevStaged?.diff ?? null,
              expanded: prevStaged?.expanded ?? false,
              added: stagedStat.added,
              deleted: stagedStat.deleted,
            }),
            makeItem(f, {
              staged: false,
              unstaged: true,
              splitView: "unstaged",
              diff: prevUnstaged?.diff ?? null,
              expanded: prevUnstaged?.expanded ?? false,
              added: unstagedStat.added,
              deleted: unstagedStat.deleted,
            }),
          );
        } else {
          // Normal file (single state)
          const prev = prevById.get(stableId(f.path));
          const stat = f.staged ? stagedStat : unstagedStat;
          // Fallback: compute counts from cached diff content if stat is 0
          let added = stat.added;
          let deleted = stat.deleted;
          if (added === 0 && deleted === 0 && prev?.diff) {
            const a = prev.diff.oldContent.split("\n").length;
            const b = prev.diff.newContent.split("\n").length;
            added = Math.max(0, b - a);
            deleted = Math.max(0, a - b);
          }
          files.push(
            makeItem(f, {
              diff: prev?.diff ?? null,
              expanded: prev?.expanded ?? false,
              added,
              deleted,
            }),
          );
        }
      }

      set({
        branch: data.branch,
        files,
        loading: false,
      });

      // Pre-fetch git history in the background so the history tab is instant
      if (get().commits.length === 0) {
        get().loadHistory(projectRoot);
      }
  },

  // ── scheduleAutoRefresh ──
  scheduleAutoRefresh: (projectRoot: string) => {
    const state = get();
    if (state._autoRefreshTimer) clearTimeout(state._autoRefreshTimer);
    const timer = setTimeout(() => {
      // If refreshStatus was already called directly within the last 3 s
      // (e.g. by a git action like switch/merge/commit), skip this
      // auto-refresh to avoid a redundant round-trip.
      if (Date.now() - lastRefreshTimestamp < 3000) return;
      get().refreshStatus(projectRoot);
    }, 2000);
    set({ _autoRefreshTimer: timer });
  },

  // ── refreshBranches ──
  refreshBranches: async (projectRoot: string) => {
    try {
      const data: GitBranchesData = await window.electronAPI.gitBranches(projectRoot);
      // Only overwrite branch if we got a meaningful value
      if (data.current && data.current !== "(no branch)") {
        set({ branches: data.branches, branch: data.current });
      } else {
        set({ branches: data.branches });
      }
    } catch {
      // Non-critical; branch info may already be set from status
    }
  },

  // ── loadDiff (lazy, on accordion expand) ──
  loadDiff: async (projectRoot: string, fileId: string, filePath: string) => {
    const file = get().files.find((f) => f.id === fileId);
    if (!file || file.diff !== null) return;

    // Mark loading on the specific file item
    set((s) => ({
      files: s.files.map((f) =>
        f.id === fileId ? { ...f, diffLoading: true } : f,
      ),
    }));

    try {
      // Use splitView as the primary view; fall back to filterMode
      const view = file.splitView ?? get().filterMode;
      const diff: GitFileDiffData = await window.electronAPI.gitDiff(
        projectRoot,
        filePath,
        file.indexStatus,
        file.worktreeStatus,
        file.staged,
        file.unstaged,
        file.untracked,
        view,
      );
      set((s) => ({
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                diff: { oldContent: diff.oldContent, newContent: diff.newContent },
                diffLoading: false,
              }
            : f,
        ),
      }));
    } catch (err: unknown) {
      toast.error((err as Error).message || `Failed to load diff for ${filePath}`);
      set((s) => ({
        files: s.files.map((f) =>
          f.id === fileId ? { ...f, diffLoading: false } : f,
        ),
        error: (err as Error).message || `Failed to load diff for ${filePath}`,
      }));
    }
  },

  // ── setFilterMode ──
  setFilterMode: (mode: GitFilterMode) => set({ filterMode: mode }),

  // ── setFileExpanded ──
  setFileExpanded: (id: string, expanded: boolean) =>
    set((s) => ({
      files: s.files.map((f) =>
        f.id === id ? { ...f, expanded } : f,
      ),
    })),

  // ── stageFile ──
  stageFile: async (projectRoot: string, filePath: string) => {
    invalidateStatusCache();
    const result = await window.electronAPI.gitStage(projectRoot, filePath);
    if (!result.success) {
      console.error(`[git] stage failed: ${filePath}`, result.error);
      toast.error(result.error || "Stage failed");
      set({ error: result.error || "Stage failed" });
      return;
    }
    await get().refreshStatus(projectRoot);
  },

  // ── unstageFile ──
  unstageFile: async (projectRoot: string, filePath: string) => {
    invalidateStatusCache();
    const result = await window.electronAPI.gitUnstage(projectRoot, filePath);
    if (!result.success) {
      console.error(`[git] unstage failed: ${filePath}`, result.error);
      toast.error(result.error || "Unstage failed");
      set({ error: result.error || "Unstage failed" });
      return;
    }
    await get().refreshStatus(projectRoot);
  },

  // ── stageAll ──
  stageAll: async (projectRoot: string, filePaths: string[]) => {
    invalidateStatusCache();
    const paths = filePaths.filter(Boolean);
    if (paths.length === 0) return;
    let failed = false;
    for (const fp of paths) {
      const result = await window.electronAPI.gitStage(projectRoot, fp);
      if (!result.success) {
        console.error(`[git] stageAll failed: ${fp}`, result.error);
        failed = true;
      }
    }
    if (failed) {
      toast.error("Some files failed to stage");
      set({ error: "Some files failed to stage" });
    }
    await get().refreshStatus(projectRoot);
  },

  // ── unstageAll ──
  unstageAll: async (projectRoot: string, filePaths: string[]) => {
    invalidateStatusCache();
    const paths = filePaths.filter(Boolean);
    if (paths.length === 0) return;
    let failed = false;
    for (const fp of paths) {
      const result = await window.electronAPI.gitUnstage(projectRoot, fp);
      if (!result.success) {
        console.error(`[git] unstageAll failed: ${fp}`, result.error);
        failed = true;
      }
    }
    if (failed) {
      toast.error("Some files failed to unstage");
      set({ error: "Some files failed to unstage" });
    }
    await get().refreshStatus(projectRoot);
  },

  // ── discardFile ──
  discardFile: async (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) => {
    invalidateStatusCache();
    const result = await window.electronAPI.gitDiscard(projectRoot, filePath, staged, untracked, worktreeStatus);
    if (!result.success) {
      console.error(`[git] discard failed: ${filePath}`, result.error);
      toast.error(result.error || "Failed to discard changes");
      set({ error: result.error || "Failed to discard changes" });
      return;
    }
    // Refresh git panel
    await get().refreshStatus(projectRoot);
    // Immediately refresh this one file in the editor (don't wait for watcher)
    const docState = useDocumentStore.getState();
    if (docState.openedContents.has(filePath) || docState.activeFileId === filePath) {
      await docState.refreshFileContent(filePath);
    }
  },

  // ── commitChanges ──
  commitChanges: async (projectRoot: string, message: string) => {
    invalidateStatusCache();
    const result = await window.electronAPI.gitCommit(projectRoot, message);
    if (!result.success) {
      console.error("[git] commit failed:", result.error);
      toast.error(result.error || "Commit failed");
      set({ error: result.error || "Commit failed" });
      return;
    }
    await get().refreshStatus(projectRoot);
    // Commit does not modify files on disk — no reload needed
    set({ error: null });
  },

  // ── switchBranch ──
  switchBranch: async (projectRoot: string, branch: string) => {
    const t0 = performance.now();
    const prevBranch = get().branch;
    set({ switching: true, branch, pendingBranch: null });
    invalidateStatusCache();

    const tWarmup = performance.now();
    await window.electronAPI.gitWarmup?.(projectRoot).catch(() => {});
    const wMs = Math.round(performance.now() - tWarmup);
    console.log(`[switchBranch] warmup: ${wMs}ms  (${branch})`);
    log.info("switchBranch warmup", { durationMs: wMs, branch });

    const tCheckout = performance.now();
    const result = await window.electronAPI.gitCheckout(projectRoot, branch);
    const cMs = Math.round(performance.now() - tCheckout);
    console.log(`[switchBranch] gitCheckout: ${cMs}ms  (${branch})`);
    log.info("gitCheckout", { durationMs: cMs, branch });
    if (!result.success) {
      set({
        branch: prevBranch,
        error: result.error || "Failed to switch branch",
        switching: false,
      });
      toast.error(result.error || "Failed to switch branch");
      return;
    }

    Promise.all([
      get().refreshStatus(projectRoot),
      get().refreshBranches(projectRoot),
    ]);

    await useDocumentStore.getState().reloadAllFromDisk();
    set({ switching: false });
    console.log(`[switchBranch] total: ${Math.round(performance.now() - t0)}ms  (-> ${branch})`);
  },

  // ── createBranch ──
  createBranch: async (projectRoot: string, branchName: string) => {
    invalidateStatusCache();
    const result = await window.electronAPI.gitCreateBranch(projectRoot, branchName);
    if (!result.success) {
      toast.error(result.error || "Failed to create branch");
      set({ error: result.error || "Failed to create branch" });
      return;
    }
    await Promise.all([
      get().refreshStatus(projectRoot),
      get().refreshBranches(projectRoot),
    ]);
  },

  // ── mergeBranch ──
  mergeBranch: async (projectRoot: string, sourceBranch: string) => {
    invalidateStatusCache();
    const branch = get().branch;
    const result = await window.electronAPI.gitMerge(projectRoot, sourceBranch);
    if (!result.success) {
      // Merge conflicts or other failure
      const detail = result.output || result.error || "Merge failed";
      toast.error("Merge conflict", {
        description: detail.length > 300 ? detail.slice(0, 300) + "..." : detail,
        duration: 8000,
      });
      set({ error: detail });
      return;
    }
    const summary = result.output || "";
    const isUpToDate = summary.includes("Already up to date");
    toast.success(
      isUpToDate
        ? `Already up to date with '${sourceBranch}'`
        : `Merged '${sourceBranch}' into '${branch}'`,
      {
        description: isUpToDate ? undefined : summary.split("\n").slice(0, 3).join("\n"),
        duration: 5000,
      },
    );
    await Promise.all([
      get().refreshStatus(projectRoot),
      get().refreshBranches(projectRoot),
    ]);
    // Files changed — force metadata reload
    await useDocumentStore.getState().reloadMetadataFromDisk(true);
  },

  // ── abortMerge ──
  abortMerge: async (projectRoot: string) => {
    invalidateStatusCache();
    const result = await window.electronAPI.gitAbortMerge(projectRoot);
    if (!result.success) {
      toast.error(result.error || "Failed to abort merge");
      set({ error: result.error || "Failed to abort merge" });
      return;
    }
    toast.success("Merge aborted");
    await get().refreshStatus(projectRoot);
    await get().refreshBranches(projectRoot);
    // Files restored — force metadata reload
    await useDocumentStore.getState().reloadMetadataFromDisk(true);
  },

  // ── revertCommit ──
  revertCommit: async (projectRoot: string, hash: string) => {
    invalidateStatusCache();
    const result = await window.electronAPI.gitRevert(projectRoot, hash);
    if (!result.success) {
      toast.error(result.error || "Failed to revert commit");
      set({ error: result.error || "Failed to revert commit" });
      return;
    }
    await Promise.all([
      get().refreshStatus(projectRoot),
      get().refreshBranches(projectRoot),
      get().loadHistory(projectRoot),
    ]);
    // Files changed — force metadata reload
    await useDocumentStore.getState().reloadMetadataFromDisk(true);
  },

  // ── resetToCommit ──
  resetToCommit: async (projectRoot: string, hash: string, mode: "soft" | "mixed" | "hard") => {
    invalidateStatusCache();
    const result = await window.electronAPI.gitReset(projectRoot, hash, mode);
    if (!result.success) {
      toast.error(result.error || "Failed to reset");
      set({ error: result.error || "Failed to reset" });
      return;
    }
    await Promise.all([
      get().refreshStatus(projectRoot),
      get().refreshBranches(projectRoot),
      get().loadHistory(projectRoot),
    ]);
    // Mixed/hard reset changes working tree files — force metadata reload.
    // Soft reset only moves HEAD, but a reload is cheap enough to always do.
    await useDocumentStore.getState().reloadMetadataFromDisk(true);
  },

  // ── initRepo ──
  initRepo: async (projectRoot: string) => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI.gitInit(projectRoot);
      if (!result.success) {
        toast.error(result.error || "Failed to initialize git repository");
        set({ error: result.error || "Failed to initialize git repository", loading: false });
        return;
      }
      await get().checkRepo(projectRoot);
      set((s) => ({ gitFolderVersion: s.gitFolderVersion + 1 }));
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to initialize git repository");
      set({
        error: (err as Error).message || "Failed to initialize git repository",
        loading: false,
      });
    }
  },

  // ── setPendingBranch ──
  setPendingBranch: (branch: string | null) => {
    set({ pendingBranch: branch });
  },

  // ── clearAll ──
  clearAll: () => {
    const timer = get()._autoRefreshTimer;
    if (timer) clearTimeout(timer);
    set({
      branch: "",
      branches: [],
      files: [],
      filterMode: "all",
      loading: false,
      error: null,
      isGitRepo: false,
      checkingRepo: true,
      unitRoot: null,
      gitFolderVersion: 0,
      _autoRefreshTimer: null,
      viewMode: "changes",
      listMode: "list",
      commits: [],
      commitsLoading: false,
      pendingBranch: null,
    });
  },
}));
