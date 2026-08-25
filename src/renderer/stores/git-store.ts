import { create } from "zustand";
import { toast } from "sonner";
import { createLogger } from "@/services/logger";
import { i18n } from "@/lib/i18n";
import type {
  GitFileStatusData,
  GitStatusData,
  GitBranchesData,
  GitFileDiffData,
  GitRemoteInfo,
  GitTrackingData,
  GhAuthStatus,
} from "@/types/electron";
import { EMPTY_TRACKING, isFastForwardPullError, isNonFastForwardPushError } from "@shared/git";
import {
  EMPTY_GH_AUTH,
  firstCommitSubject,
  pickDefaultBranch,
} from "@shared/git-hosting";
import { derivePushLabel, shouldOfferCreatePr, shouldOfferPushAfterCommit } from "@/lib/git/git-publish";
import { gitDesktop } from "@/lib/desktop-api/git";
import { gitHostingDesktop } from "@/lib/desktop-api/git-hosting";
import { openExternalUrl } from "@/lib/desktop-api/shell";
import { useDocumentStore } from "./document-store";
import { useWorktreeStore } from "./worktree-store";
import { useGitDiffPrefsStore } from "./git-diff-prefs-store";

const log = createLogger("git-store", "git");

// ─── Types ───

export type GitFilterMode = "unstaged" | "staged" | "all";
export type GitSyncing = false | "fetch" | "pull" | "push";

function toastGitDetail(text: string | undefined): string | undefined {
  const detail = text?.trim();
  if (!detail) return undefined;
  return detail.length > 300 ? `${detail.slice(0, 300)}...` : detail;
}

export interface GitCreatePrDefaults {
  title: string;
  base: string;
  head: string;
}

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
  /** Diff content, loaded on demand when row expands */
  diff: { oldContent: string; newContent: string } | null;
  /** Whether diff is currently loading */
  diffLoading: boolean;
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
  tracking: GitTrackingData;
  remotes: GitRemoteInfo[];
  pendingRemotePick: boolean;
  pendingAddRemote: boolean;
  addingRemote: boolean;
  ghAuth: GhAuthStatus;
  pendingCreatePr: boolean;
  createPrDefaults: GitCreatePrDefaults | null;
  creatingPr: boolean;
  syncing: GitSyncing;
  filterMode: GitFilterMode;

  // ── Status ──
  loading: boolean;
  error: string | null;
  isGitRepo: boolean;
  checkingRepo: boolean;

  // ── Selection ──
  selectedCommitHash: string | null;
  /** Main diff list — multiple rows may be expanded at once */
  expandedChangeIds: string[];
  /** History commit detail — expanded file diff rows */
  expandedCommitFilePaths: string[];
  gitExpandedFolders: string[];
  sidebarView: "changes" | "history";
  commits: GitCommitData[];
  commitsLoading: boolean;
  _historyRequestId: number;

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
  selectCommit: (hash: string) => void;
  clearSelectedCommit: () => void;
  toggleChangeExpanded: (fileId: string) => void;
  expandChange: (fileId: string) => void;
  selectChangeFromSidebar: (fileId: string) => void;
  toggleCommitFileExpanded: (filePath: string) => void;
  collapseAllCommitFiles: () => void;
  collapseAllChanges: () => void;
  /** Clear cached per-file diff content (e.g. after ignore-whitespace toggle). */
  clearAllDiffs: () => void;
  /** Re-load diffs for currently expanded change rows. */
  reloadExpandedDiffs: (projectRoot: string) => Promise<void>;
  toggleGitFolder: (folderPath: string) => void;
  setSidebarView: (view: "changes" | "history") => void;
  loadHistory: (projectRoot: string) => Promise<void>;
  refreshStatus: (projectRoot: string) => Promise<void>;
  /** Bypass status cache — use after external git mutations (push/merge on disk). */
  forceRefreshStatus: (projectRoot: string) => Promise<void>;
  /** Refresh sidebar after worktree Merge to Branch (clears stale debounced refresh). */
  refreshAfterWorktreeMerge: (projectRoot: string, worktreeRoot: string) => Promise<void>;
  refreshBranches: (projectRoot: string) => Promise<void>;
  loadDiff: (projectRoot: string, fileId: string, filePath: string) => Promise<void>;
  setFilterMode: (mode: GitFilterMode) => void;
  stageFile: (projectRoot: string, filePath: string) => Promise<void>;
  unstageFile: (projectRoot: string, filePath: string) => Promise<void>;
  stageAll: (projectRoot: string, filePaths: string[]) => Promise<void>;
  unstageAll: (projectRoot: string, filePaths: string[]) => Promise<void>;
  discardFile: (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) => Promise<void>;
  commitChanges: (projectRoot: string, message: string) => Promise<void>;
  switchBranch: (projectRoot: string, branch: string) => Promise<void>;
  createBranch: (projectRoot: string, branchName: string) => Promise<void>;
  mergeBranch: (projectRoot: string, sourceBranch: string) => Promise<void>;
  pushRemote: (projectRoot: string, opts?: { remote?: string }) => Promise<void>;
  cancelRemotePick: () => void;
  openAddRemote: () => void;
  cancelAddRemote: () => void;
  addRemote: (projectRoot: string, input: { name: string; url: string }) => Promise<boolean>;
  refreshGhAuth: (projectRoot: string) => Promise<void>;
  openCreatePr: (projectRoot: string) => Promise<void>;
  cancelCreatePr: () => void;
  createPullRequest: (
    projectRoot: string,
    input: { title: string; base: string; head: string; body?: string; draft?: boolean },
  ) => Promise<void>;
  openPrInBrowser: (projectRoot: string, url?: string) => Promise<void>;
  fetchRemote: (projectRoot: string, opts?: { remote?: string; all?: boolean }) => Promise<void>;
  pullRemote: (projectRoot: string) => Promise<void>;
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
    added: 0,
    deleted: 0,
    ...overrides,
  };
}

function idsForFilterMode(files: GitFileItem[], mode: GitFilterMode): Set<string> {
  const filtered =
    mode === "staged"
      ? files.filter((f) => f.staged)
      : mode === "unstaged"
        ? files.filter((f) => f.unstaged || f.untracked)
        : files;
  return new Set(filtered.map((f) => f.id));
}

// ─── Store ───

export const useGitStore = create<GitState>()((set, get) => ({
  branch: "",
  branches: [],
  files: [],
  tracking: EMPTY_TRACKING,
  remotes: [],
  pendingRemotePick: false,
  pendingAddRemote: false,
  addingRemote: false,
  ghAuth: EMPTY_GH_AUTH,
  pendingCreatePr: false,
  createPrDefaults: null,
  creatingPr: false,
  syncing: false,
  filterMode: useGitDiffPrefsStore.getState().filterMode,
  loading: false,
  error: null,
  pendingBranch: null,
  switching: false,
  isGitRepo: false,
  checkingRepo: true,
  unitRoot: null,
  gitFolderVersion: 0,
  _autoRefreshTimer: null,
  selectedCommitHash: null,
  expandedChangeIds: [],
  expandedCommitFilePaths: [],
  gitExpandedFolders: [],
  sidebarView: "changes",
  commits: [],
  commitsLoading: false,
  _historyRequestId: 0,

  // ── selectCommit ──
  selectCommit: (hash: string) =>
    set({ selectedCommitHash: hash, expandedCommitFilePaths: [] }),

  // ── clearSelectedCommit ──
  clearSelectedCommit: () =>
    set({ selectedCommitHash: null, expandedCommitFilePaths: [] }),

  toggleChangeExpanded: (fileId: string) =>
    set((s) => {
      const expanded = new Set(s.expandedChangeIds);
      if (expanded.has(fileId)) expanded.delete(fileId);
      else expanded.add(fileId);
      return { expandedChangeIds: [...expanded] };
    }),

  expandChange: (fileId: string) =>
    set((s) => {
      if (s.expandedChangeIds.includes(fileId)) return s;
      return { expandedChangeIds: [...s.expandedChangeIds, fileId] };
    }),

  selectChangeFromSidebar: (fileId: string) => {
    get().expandChange(fileId);
    set({ selectedCommitHash: null, expandedCommitFilePaths: [] });
  },

  toggleCommitFileExpanded: (filePath: string) =>
    set((s) => {
      const expanded = new Set(s.expandedCommitFilePaths);
      if (expanded.has(filePath)) expanded.delete(filePath);
      else expanded.add(filePath);
      return { expandedCommitFilePaths: [...expanded] };
    }),

  collapseAllCommitFiles: () => set({ expandedCommitFilePaths: [] }),

  collapseAllChanges: () => set({ expandedChangeIds: [] }),

  clearAllDiffs: () =>
    set((s) => ({
      files: s.files.map((f) => ({ ...f, diff: null, diffLoading: false })),
    })),

  reloadExpandedDiffs: async (projectRoot: string) => {
    const { expandedChangeIds, files } = get();
    await Promise.all(
      expandedChangeIds.map(async (id) => {
        const file = files.find((f) => f.id === id);
        if (file) await get().loadDiff(projectRoot, id, file.path);
      }),
    );
  },

  toggleGitFolder: (folderPath: string) =>
    set((s) => {
      const expanded = new Set(s.gitExpandedFolders);
      if (expanded.has(folderPath)) expanded.delete(folderPath);
      else expanded.add(folderPath);
      return { gitExpandedFolders: [...expanded] };
    }),

  setSidebarView: (view) => {
    set({
      sidebarView: view,
      selectedCommitHash: view === "changes" ? null : get().selectedCommitHash,
    });
    if (view === "history") {
      const root = get().unitRoot;
      if (root) get().loadHistory(root);
    }
  },

  // ── loadHistory ──
  // Uses _historyRequestId to discard stale responses (e.g. rapid branch switches)
  loadHistory: async (projectRoot: string) => {
    const id = ++get()._historyRequestId;
    set({ commitsLoading: true });
    try {
      const commits = await gitDesktop.gitLog(projectRoot);
      // Discard if a newer request was made while this one was in-flight
      if (get()._historyRequestId !== id) return;
      set({ commits, commitsLoading: false });
    } catch {
      if (get()._historyRequestId !== id) return;
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
      const isRepo = await gitDesktop.gitIsRepo(projectRoot);
      if (isRepo) {
        set({ isGitRepo: true, checkingRepo: false });
        // Must be sequential: refreshStatus sets branch, refreshBranches refines it.
        // Parallel would cause a race condition on the `branch` field.
        await get().refreshStatus(projectRoot);
        await get().refreshBranches(projectRoot);
        void get().refreshGhAuth(projectRoot);
      } else {
        // Clear stale git data from previous project to prevent cross-project pollution
        set({
          isGitRepo: false,
          checkingRepo: false,
          files: [],
          branch: "",
          branches: [],
          tracking: EMPTY_TRACKING,
          remotes: [],
          ghAuth: EMPTY_GH_AUTH,
          pendingCreatePr: false,
          createPrDefaults: null,
          commits: [],
          selectedCommitHash: null,
          error: null,
        });
      }
    } catch {
      set({
        isGitRepo: false,
        checkingRepo: false,
        files: [],
        branch: "",
        branches: [],
        tracking: EMPTY_TRACKING,
        remotes: [],
        ghAuth: EMPTY_GH_AUTH,
        pendingCreatePr: false,
        createPrDefaults: null,
        commits: [],
        selectedCommitHash: null,
        error: null,
      });
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
        const remotesPromise = gitDesktop.gitRemotes(projectRoot).catch(() => get().remotes);
        [data, stats] = await Promise.all([
          gitDesktop.gitStatus(projectRoot),
          gitDesktop.gitDiffStats(projectRoot).catch(() => ({ unstaged: {}, staged: {} })),
        ]);
        const remotes = await remotesPromise;
        _statusCache = { projectRoot, data, stats, timestamp: Date.now() };
        set({ remotes });
      } catch (err: unknown) {
        const msg = (err as Error).message || "Failed to get git status";
        // Non-repo roots should not surface a fatal toast (Git mode empty state handles CTA).
        if (/not a git repository/i.test(msg)) {
          set({
            isGitRepo: false,
            loading: false,
            error: null,
            files: [],
            branch: "",
            branches: [],
            tracking: EMPTY_TRACKING,
            remotes: [],
          });
          return;
        }
        toast.error(msg);
        set({
          error: msg,
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
              added: stagedStat.added,
              deleted: stagedStat.deleted,
            }),
            makeItem(f, {
              staged: false,
              unstaged: true,
              splitView: "unstaged",
              diff: prevUnstaged?.diff ?? null,
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
              added,
              deleted,
            }),
          );
        }
      }

      set({
        branch: data.branch,
        files,
        tracking: data.tracking ?? EMPTY_TRACKING,
        loading: false,
      });

      // Pre-fetch git history in the background so the history tab is instant
      if (get().commits.length === 0) {
        get().loadHistory(projectRoot);
      }
  },

  forceRefreshStatus: async (projectRoot: string) => {
    invalidateStatusCache();
    await get().refreshStatus(projectRoot);
  },

  refreshAfterWorktreeMerge: async (projectRoot: string, worktreeRoot: string) => {
    invalidateStatusCache();

    const state = get();
    if (state._autoRefreshTimer) {
      clearTimeout(state._autoRefreshTimer);
      set({ _autoRefreshTimer: null });
    }

    const activeRoot = useDocumentStore.getState().checkoutRoot || projectRoot;

    set({
      selectedCommitHash: null,
      expandedChangeIds: [],
      loading: true,
      commits: [],
    });

    await get().refreshBranches(projectRoot);

    // When viewing project files, also refresh worktree so counts stay accurate.
    if (worktreeRoot !== projectRoot && activeRoot === projectRoot) {
      invalidateStatusCache();
      await get().refreshStatus(worktreeRoot);
    }

    invalidateStatusCache();
    await get().refreshStatus(activeRoot);

    set((s) => ({
      unitRoot: activeRoot,
      gitFolderVersion: s.gitFolderVersion + 1,
    }));

    await get().loadHistory(projectRoot);
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
      const data: GitBranchesData = await gitDesktop.gitBranches(projectRoot);
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
      const diff: GitFileDiffData = await gitDesktop.gitDiff(
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
  setFilterMode: (mode: GitFilterMode) =>
    set((s) => {
      useGitDiffPrefsStore.getState().setFilterMode(mode);
      const visible = idsForFilterMode(s.files, mode);
      return {
        filterMode: mode,
        expandedChangeIds: s.expandedChangeIds.filter((id) => visible.has(id)),
      };
    }),

  // ── stageFile ──
  stageFile: async (projectRoot: string, filePath: string) => {
    invalidateStatusCache();
    const result = await gitDesktop.gitStage(projectRoot, filePath);
    if (!result.success) {
      log.warn("git.fail", { op: "stage", path: filePath, error: result.error });
      toast.error(result.error || "Stage failed");
      set({ error: result.error || "Stage failed" });
      return;
    }
    await get().refreshStatus(projectRoot);
  },

  // ── unstageFile ──
  unstageFile: async (projectRoot: string, filePath: string) => {
    invalidateStatusCache();
    const result = await gitDesktop.gitUnstage(projectRoot, filePath);
    if (!result.success) {
      log.warn("git.fail", { op: "unstage", path: filePath, error: result.error });
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
    const result = await gitDesktop.gitStageAll(projectRoot, paths);
    if (!result.success) {
      log.warn("git.fail", { op: "stageAll", error: result.error });
      // Don't toast — git may refuse to stage gitignored files, that's fine
    }
    await get().refreshStatus(projectRoot);
  },

  // ── unstageAll ──
  unstageAll: async (projectRoot: string, filePaths: string[]) => {
    invalidateStatusCache();
    const paths = filePaths.filter(Boolean);
    if (paths.length === 0) return;
    const result = await gitDesktop.gitUnstageAll(projectRoot, paths);
    if (!result.success) {
      log.warn("git.fail", { op: "unstageAll", error: result.error });
    }
    await get().refreshStatus(projectRoot);
  },

  // ── discardFile ──
  discardFile: async (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) => {
    invalidateStatusCache();
    const result = await gitDesktop.gitDiscard(projectRoot, filePath, staged, untracked, worktreeStatus);
    if (!result.success) {
      log.warn("git.fail", { op: "discard", path: filePath, error: result.error });
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
    const result = await gitDesktop.gitCommit(projectRoot, message);
    if (!result.success) {
      log.warn("git.fail", { op: "commit", error: result.error });
      toast.error(result.error || "Commit failed");
      set({ error: result.error || "Commit failed" });
      return;
    }
    await get().refreshStatus(projectRoot);
    // Commit does not modify files on disk — no reload needed
    set({ error: null });
    const tracking = get().tracking;
    const pushLabel = shouldOfferPushAfterCommit(tracking)
      ? derivePushLabel(tracking, {
          push: i18n.t("git.toolbar.push"),
          publish: i18n.t("git.toolbar.publish"),
        })
      : null;
    toast.success(i18n.t("git.toast.committed"), {
      action: pushLabel
        ? {
            label: pushLabel,
            onClick: () => {
              void get().pushRemote(projectRoot);
            },
          }
        : undefined,
    });
  },

  // ── switchBranch ──
  switchBranch: async (projectRoot: string, branch: string) => {
    const t0 = performance.now();
    const prevBranch = get().branch;
    set({ switching: true, branch, pendingBranch: null });
    invalidateStatusCache();

    const tWarmup = performance.now();
    await gitDesktop.gitWarmup(projectRoot)?.catch(() => {});
    const wMs = Math.round(performance.now() - tWarmup);
    log.debug("switchBranch warmup", { durationMs: wMs, branch });

    const tCheckout = performance.now();
    const result = await gitDesktop.gitCheckout(projectRoot, branch);
    const cMs = Math.round(performance.now() - tCheckout);
    log.debug("gitCheckout", { durationMs: cMs, branch });
    if (!result.success) {
      set({
        branch: prevBranch,
        error: result.error || "Failed to switch branch",
        switching: false,
      });
      toast.error(result.error || "Failed to switch branch");
      return;
    }

    await Promise.all([
      get().refreshStatus(projectRoot),
      get().refreshBranches(projectRoot),
    ]);

    // Clear commit selection when switching branches — old hash won't exist on new branch
    set({ switching: false, selectedCommitHash: null });
    await useDocumentStore.getState().reloadAllFromDisk();
    log.debug("switchBranch total", { durationMs: Math.round(performance.now() - t0), branch });
  },

  // ── createBranch ──
  createBranch: async (projectRoot: string, branchName: string) => {
    invalidateStatusCache();
    const result = await gitDesktop.gitCreateBranch(projectRoot, branchName);
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

  cancelRemotePick: () => set({ pendingRemotePick: false }),

  openAddRemote: () => set({ pendingAddRemote: true }),

  cancelAddRemote: () => set({ pendingAddRemote: false, addingRemote: false }),

  addRemote: async (projectRoot, input) => {
    if (get().addingRemote) return false;
    set({ addingRemote: true });
    try {
      const result = await gitDesktop.gitAddRemote(projectRoot, input.name, input.url);
      if (!result?.success) {
        const code = result?.error ?? "";
        const message =
          code === "invalid_remote_name"
            ? i18n.t("git.remoteAdd.invalidName")
            : code === "invalid_remote_url"
              ? i18n.t("git.remoteAdd.invalidUrl")
              : code === "remote_exists"
                ? i18n.t("git.remoteAdd.exists")
                : toastGitDetail(code) || i18n.t("git.remoteAdd.failed");
        toast.error(i18n.t("git.remoteAdd.failed"), { description: message });
        return false;
      }
      set({
        remotes: result.remotes ?? [],
        pendingAddRemote: false,
      });
      invalidateStatusCache();
      await get().forceRefreshStatus(projectRoot);
      toast.success(i18n.t("git.remoteAdd.added", { name: input.name.trim() }));
      return true;
    } finally {
      set({ addingRemote: false });
    }
  },

  refreshGhAuth: async (projectRoot: string) => {
    try {
      const ghAuth = await gitHostingDesktop.gitHostingAuthStatus(projectRoot);
      set({ ghAuth: ghAuth ?? EMPTY_GH_AUTH });
    } catch {
      set({ ghAuth: EMPTY_GH_AUTH });
    }
  },

  openCreatePr: async (projectRoot: string) => {
    await get().refreshGhAuth(projectRoot);
    const commits = await gitDesktop.gitLog(projectRoot, 1).catch(() => []);
    const head = get().branch;
    const title = firstCommitSubject(commits[0]?.message ?? "") || head;
    set({
      createPrDefaults: {
        title,
        base: pickDefaultBranch(get().branches),
        head,
      },
      pendingCreatePr: true,
    });
  },

  cancelCreatePr: () => set({ pendingCreatePr: false, creatingPr: false }),

  createPullRequest: async (projectRoot, input) => {
    if (get().creatingPr) return;
    const title = input.title.trim();
    const base = input.base.trim();
    const head = input.head.trim();
    if (!title || !base || !head) {
      toast.error(i18n.t("git.prCreate.missingFields"));
      return;
    }
    set({ creatingPr: true });
    try {
      const result = await gitHostingDesktop.gitHostingPrCreate({
        projectRoot,
        title,
        base,
        head,
        body: input.body,
        draft: input.draft,
      });
      if (!result?.success) {
        toast.error(i18n.t("git.toast.createPrFailed"), {
          description: toastGitDetail(result?.output || result?.error),
        });
        return;
      }
      set({ pendingCreatePr: false });
      toast.success(i18n.t("git.toast.prCreated"), {
        action: {
          label: i18n.t("git.toast.openPr"),
          onClick: () => {
            void get().openPrInBrowser(projectRoot, result.url);
          },
        },
      });
    } finally {
      set({ creatingPr: false });
    }
  },

  openPrInBrowser: async (projectRoot, url) => {
    if (url) {
      await openExternalUrl(url).catch(() => {});
      return;
    }
    const result = await gitHostingDesktop.gitHostingPrViewWeb(projectRoot);
    if (!result?.success) {
      toast.error(i18n.t("git.toast.openPrFailed"), {
        description: toastGitDetail(result?.error),
      });
    }
  },

  // ── pushRemote ──
  pushRemote: async (projectRoot: string, opts) => {
    if (get().syncing) return;
    const tracking = get().tracking;
    if (tracking.isDetached) {
      toast.error(i18n.t("git.toast.detachedHead"));
      return;
    }
    if (!tracking.hasRemote && !opts?.remote) {
      get().openAddRemote();
      return;
    }

    set({ syncing: "push", pendingRemotePick: false });
    invalidateStatusCache();
    try {
      const result = await gitDesktop.gitPush(projectRoot, opts?.remote);
      if (result.needsRemoteChoice) {
        set({
          remotes: result.remotes ?? [],
          pendingRemotePick: true,
          syncing: false,
        });
        return;
      }
      if (!result.success) {
        const raw = result.output || result.error || "";
        toast.error(i18n.t("git.toast.pushFailed"), {
          description: isNonFastForwardPushError(raw)
            ? i18n.t("git.toast.pushNeedPull")
            : toastGitDetail(raw),
        });
        set({ error: result.error || raw || "Push failed" });
        return;
      }
      const branch = get().branch;
      const afterTracking = {
        ...get().tracking,
        aheadCount: 0,
        hasRemote: true,
        upstreamRef:
          get().tracking.upstreamRef
          ?? (result.publishedRemote && branch
            ? `${result.publishedRemote}/${branch}`
            : get().tracking.upstreamRef),
        remoteName: get().tracking.remoteName ?? result.publishedRemote ?? null,
      };
      const offerPr = shouldOfferCreatePr(afterTracking, {
        currentBranch: branch,
        defaultBranch: pickDefaultBranch(get().branches),
        ghInstalled: get().ghAuth.installed,
        ghAuthenticated: get().ghAuth.authenticated,
      });
      const prAction = offerPr
        ? {
            label: i18n.t("git.toast.createPr"),
            onClick: () => {
              void get().openCreatePr(projectRoot);
            },
          }
        : undefined;
      if (result.publishedRemote) {
        toast.success(
          i18n.t("git.toast.published", { remote: result.publishedRemote }),
          {
            action: prAction ?? (branch
              ? {
                  label: i18n.t("git.toast.copyBranch"),
                  onClick: () => {
                    void navigator.clipboard.writeText(branch).catch(() => {});
                  },
                }
              : undefined),
          },
        );
      } else {
        const summary = result.output?.trim();
        toast.success(summary || i18n.t("git.toast.pushed"), {
          action: prAction,
        });
      }
      await Promise.all([
        get().forceRefreshStatus(projectRoot),
        get().refreshBranches(projectRoot),
      ]);
    } finally {
      if (get().syncing === "push") set({ syncing: false });
    }
  },

  // ── fetchRemote ──
  fetchRemote: async (projectRoot: string, opts) => {
    if (get().syncing) return;
    set({ syncing: "fetch" });
    try {
      const result = await gitDesktop.gitFetch(projectRoot, {
        remote: opts?.all ? undefined : (opts?.remote ?? get().tracking.remoteName ?? undefined),
        all: opts?.all,
      });
      if (!result.success) {
        toast.error(i18n.t("git.toast.fetchFailed"), {
          description: toastGitDetail(result.output || result.error),
        });
        set({ error: result.error || "Fetch failed" });
        return;
      }
      if (result.noop) {
        toast.message(i18n.t("git.sync.noRemote"));
      } else {
        const summary = result.output?.trim();
        toast.success(
          summary && summary !== "Fetched."
            ? summary
            : i18n.t("git.toast.fetched"),
        );
      }
      await get().forceRefreshStatus(projectRoot);
    } finally {
      set({ syncing: false });
    }
  },

  // ── pullRemote ──
  pullRemote: async (projectRoot: string) => {
    if (get().syncing) return;
    set({ syncing: "pull" });
    invalidateStatusCache();
    try {
      const result = await gitDesktop.gitPull(projectRoot);
      if (!result.success) {
        const raw = result.output || result.error || "";
        const needRebase = isFastForwardPullError(raw);
        toast.error(i18n.t("git.toast.pullFailed"), {
          description: needRebase
            ? i18n.t("git.toast.pullNeedRebase")
            : toastGitDetail(raw),
        });
        set({ error: result.error || "Pull failed" });
        await get().forceRefreshStatus(projectRoot);
        return;
      }
      const summary = result.output?.trim();
      toast.success(summary || i18n.t("git.toast.pulled"));
      await Promise.all([
        get().forceRefreshStatus(projectRoot),
        get().refreshBranches(projectRoot),
      ]);
    } finally {
      set({ syncing: false });
    }
  },

  // ── mergeBranch ──
  mergeBranch: async (projectRoot: string, sourceBranch: string) => {
    invalidateStatusCache();
    const branch = get().branch;
    const result = await gitDesktop.gitMerge(projectRoot, sourceBranch);
    if (!result.success) {
      // Merge conflicts or other failure
      const detail = result.output || result.error || i18n.t("git.toast.mergeFailed");
      toast.error(i18n.t("git.toast.mergeConflict"), {
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
        ? i18n.t("git.toast.alreadyUpToDate", { branch: sourceBranch })
        : i18n.t("git.toast.merged", { source: sourceBranch, target: branch }),
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
    const result = await gitDesktop.gitAbortMerge(projectRoot);
    if (!result.success) {
      toast.error(result.error || i18n.t("git.toast.abortFailed"));
      set({ error: result.error || i18n.t("git.toast.abortFailed") });
      return;
    }
    toast.success(i18n.t("git.toast.mergeAborted"));
    await get().refreshStatus(projectRoot);
    await get().refreshBranches(projectRoot);
    // Files restored — force metadata reload
    await useDocumentStore.getState().reloadMetadataFromDisk(true);
  },

  // ── revertCommit ──
  revertCommit: async (projectRoot: string, hash: string) => {
    invalidateStatusCache();
    const result = await gitDesktop.gitRevert(projectRoot, hash);
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
    const result = await gitDesktop.gitReset(projectRoot, hash, mode);
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
      const result = await gitDesktop.gitInit(projectRoot);
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
    // Preserve filterMode — it is a UI preference (also mirrored in git-diff-prefs).
    const filterMode = get().filterMode;
    set({
      branch: "",
      branches: [],
      files: [],
      tracking: EMPTY_TRACKING,
      remotes: [],
      pendingRemotePick: false,
      pendingAddRemote: false,
      addingRemote: false,
      ghAuth: EMPTY_GH_AUTH,
      pendingCreatePr: false,
      createPrDefaults: null,
      creatingPr: false,
      syncing: false,
      filterMode,
      loading: false,
      error: null,
      isGitRepo: false,
      checkingRepo: true,
      unitRoot: null,
      gitFolderVersion: 0,
      _autoRefreshTimer: null,
      selectedCommitHash: null,
      expandedChangeIds: [],
      expandedCommitFilePaths: [],
      gitExpandedFolders: [],
      sidebarView: "changes",
      commits: [],
      commitsLoading: false,
      _historyRequestId: 0,
      pendingBranch: null,
    });
  },
}));

/** Persist hydrates async — sync filterMode once localStorage is ready. */
function syncFilterModeFromPrefs() {
  useGitStore.setState({ filterMode: useGitDiffPrefsStore.getState().filterMode });
}
if (useGitDiffPrefsStore.persist.hasHydrated()) {
  syncFilterModeFromPrefs();
} else {
  useGitDiffPrefsStore.persist.onFinishHydration(syncFilterModeFromPrefs);
}
