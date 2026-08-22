import { create } from "zustand";
import { toast } from "sonner";
import { AUTO_SAVE_DELAY } from "@/styles/constants";
import { createLogger } from "@/services/logger";
import { isBinaryProjectFile } from "../../shared/platform/project-file-openability";

const log = createLogger("document-store", "startup");

/** Monotonic id so stale async openProject work is discarded after a newer open. */
let openProjectGeneration = 0;
/** True when the latest generation bump came from close, not another open. */
let projectOpenSupersededByClose = false;
/** Monotonic id so a slower openFile cannot clobber a newer selection. */
let fileOpenGeneration = 0;
import { useRightPanelStore } from "./right-panel-store";
import { useWorktreeStore } from "./worktree-store";
import { externalFileId } from "@/lib/files/external-file";
import {
  isLazyProjectFilePath,
  resolveProjectRelativePath,
} from "@/lib/files/project-path";
import { trackRecentOpenedFile } from "@/lib/files/recent-files";
import { switchWorkbenchFocus } from "@/lib/workspace/project-lifecycle";
import { sameProjectPath, useWorkbenchStore } from "@/stores/workbench-store";
import {
  focusPathAfterOpenFolder,
  workbenchStateFromOpenResult,
} from "../../shared/workbench/api";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { projectDesktop } from "@/lib/desktop-api/project";
import { workbenchDesktop } from "@/lib/desktop-api/workbench";

export type ProjectFileType = "tex" | "image" | "pdf" | "bib" | "style" | "other";

export interface ProjectFile {
  id: string; // relativePath
  name: string;
  relativePath: string;
  absolutePath: string;
  type: ProjectFileType;
  fileSize?: number;
}

interface FileContent {
  content?: string; // for text files
  dataUrl?: string; // for images
  isDirty: boolean;
  /** Binary / DB — viewer shows shell-reveal placeholder instead of editor. */
  nonOpenable?: boolean;
}

interface FileMeta {
  relativePath: string;
  absolutePath: string;
  name: string;
  type: ProjectFileType;
  fileSize?: number;
  isExternal?: boolean;
}

interface DocumentState {
  projectRoot: string | null;
  /** Current working root — projectRoot on main, worktree path when active */
  checkoutRoot: string | null;
  files: ProjectFile[];
  folders: string[];
  activeFileId: string | null;
  initialized: boolean;
  isSaving: boolean;
  /** True while openProject is in progress — UI can show a skeleton */
  isOpeningProject: boolean;
  /** Per-file metadata for ALL project files (name, type, size).
   *  Built once on openProject / worktree switch. Updated incrementally by watcher. */
  fileMetadata: Map<string, FileMeta>;
  /** Content cache — ONLY files that have been opened by the user or are dirty.
   *  Replaces the old fileContents which held ALL file contents in memory. */
  openedContents: Map<string, FileContent>;
  jumpTarget: number | null;
  /** Jump to a specific line in a specific file (used by TOC/Labels/Citations) */
  jumpToLine: { fileId: string; line: number } | null;
  insertText: string | null;
  selectionRange: { start: number; end: number } | null;
  /** Bumped after reloadMetadataFromDisk updates metadata — editors watch this. */
  contentVersion: number;
  /** Bumped on every setContent/saveFile — lightweight subscription target
   *  for components that only need to know IF anything is dirty, not WHAT. */
  dirtyVersion: number;

  // Async actions
  openProject: (rootPath: string) => Promise<void>;
  /** Switch the focused workbench project without joining or tearing down agents. */
  focusProject: (rootPath: string) => Promise<void>;
  closeProject: () => Promise<void>;
  /** Open a file for editing — loads content from disk if not already cached */
  openFile: (id: string) => Promise<void>;
  /** Seed opened content without reading disk (after atomic create+write). */
  seedOpenedFile: (id: string, content: string) => void;
  /** Register metadata for a hidden project file (`.workbench/…`, `.brief.md`) not in the file tree scan */
  ensureLazyProjectFileMeta: (relativePath: string) => Promise<boolean>;
  /** Open a file outside the project root */
  openExternalFile: (absolutePath: string, opts?: { pin?: boolean }) => Promise<void>;
  /** Register external path for @mention / context without opening a tab */
  registerExternalFile: (absolutePath: string) => ProjectFile;
  saveFile: (id: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  /** Lightweight reload — rescans metadata only, does not re-read file contents.
   *  Pass force=true to bypass watcher suppression (used by git ops, manual refresh). */
  reloadMetadataFromDisk: (force?: boolean) => Promise<void>;
  /** Incremental update from file watcher — only reloads changed paths */
  incrementalFileChanged: (absolutePaths: string[]) => Promise<void>;
  refreshFileContent: (id: string) => Promise<void>;
  /** Re-read all open CLEAN files from disk — used after git branch switch.
   *  Skips dirty files to preserve unsaved edits. Bumps contentVersion once. */
  reloadOpenCleanFiles: () => Promise<void>;
  /** Combined metadata rescan + content reload for all open clean files.
   *  Single set() call — one render instead of two. Used by switchBranch. */
  reloadAllFromDisk: () => Promise<void>;
  /** Switch to a new checkout root (e.g. worktree), saving dirty files first */
  switchCheckoutRoot: (newRoot: string) => Promise<void>;

  // Modified actions (now async)
  createNewFile: (name: string, type?: ProjectFileType, folder?: string) => Promise<void>;
  createFolder: (name: string, parent?: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  deleteFolder: (folderPath: string) => Promise<void>;
  renameFile: (id: string, newName: string) => Promise<void>;
  renameFolder: (folderPath: string, newName: string) => Promise<void>;

  // Sync actions
  setActiveFile: (id: string) => void;
  getAsset: (id: string) => string;
  /** Project-relative paths of files with unsaved edits. */
  getDirtyRelativePaths: () => string[];
  /** Dirty + open tex-related files with in-memory content (for live compile flush). */
  getLiveCompilePayload: () => {
    dirtyRelPaths: string[];
    dirtyFiles: Array<{ relPath: string; content: string }>;
  };
  /**
   * Mark files clean only when in-memory content still matches what was compiled.
   * Edits that arrived during compile stay dirty so a follow-up compile can pick them up.
   */
  markCompiledClean: (compiled: Array<{ relPath: string; content: string }>) => void;
  setContent: (id: string, content: string) => void;
  isFileDirty: (id: string) => boolean;
  requestJumpToPosition: (position: number) => void;
  requestJumpToLine: (fileId: string, line: number) => void;
  requestInsertText: (text: string) => void;
  setSelectionRange: (range: { start: number; end: number } | null) => void;
}

// Auto-save implementation
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const state = useDocumentStore.getState();
    await state.saveAllFiles();
  }, AUTO_SAVE_DELAY);
}

function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

// Default content for new LaTeX files
const defaultTexContent = String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\begin{document}

\end{document}
`;

/** Infer file type and default content from extension */
function inferFromExtension(
  name: string,
): { type: ProjectFileType; content: string } {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();

  if (/\.(png|jpg|jpeg|gif|svg|bmp|webp)$/.test(name.toLowerCase())) {
    return { type: "image", content: "" };
  }

  if (/\.(sty|cls|bst|def|cfg|fd|dtx|ins|clo|ldf)$/i.test(ext)) {
    return { type: "style", content: "" };
  }

  if (ext === ".bib") return { type: "bib", content: "" };
  if (ext === ".pdf") return { type: "pdf", content: "" };
  if (ext === ".tex" || ext === ".ltx") {
    return { type: "tex", content: defaultTexContent };
  }
  if (ext === ".json") return { type: "other", content: "{\n  \n}\n" };

  return { type: "other", content: "" };
}

/** Determine ProjectFileType from a relative path string.
 *  Used by incrementalFileChanged for newly detected files. */
function inferTypeFromExtension(relativePath: string): ProjectFileType {
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
  if (["tex", "sty", "cls", "ltx"].includes(ext)) return "tex";
  if (["bib"].includes(ext)) return "bib";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (["pdf"].includes(ext)) return "pdf";
  if (["bst"].includes(ext)) return "style";
  return "other";
}

/** Derive folder list from file paths — single source of truth.
 *  "folders" is NEVER independently maintained; it's always computed from "files". */
function deriveFolders(files: { relativePath: string }[]): string[] {
  const set = new Set<string>();
  for (const f of files) {
    const parts = f.relativePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      set.add(parts.slice(0, i).join("/"));
    }
  }
  return Array.from(set).sort();
}

/** Guard against cascading: save → watcher event → re-read waste.
 *  When true, watcher-triggered reloadMetadataFromDisk / incrementalFileChanged
 *  are suppressed — the save itself didn't change meaningful content on disk.
 *  Reset after a short cooldown. Reduced from 3s to 1.5s since git operations
 *  no longer trigger full reloads. */
let _suppressWatcherReload = false;
let _suppressTimer: ReturnType<typeof setTimeout> | null = null;

function markSuppressWatcherReload() {
  _suppressWatcherReload = true;
  if (_suppressTimer) clearTimeout(_suppressTimer);
  _suppressTimer = setTimeout(() => {
    _suppressWatcherReload = false;
    _suppressTimer = null;
  }, 1500); // 1.5 s cooldown — covers watcher debounce cycle
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  projectRoot: null,
  checkoutRoot: null,
  files: [],
  folders: [],
  activeFileId: null,
  initialized: false,
  isSaving: false,
  isOpeningProject: false,
  fileMetadata: new Map(),
  openedContents: new Map(),
  jumpTarget: null,
  jumpToLine: null,
  insertText: null,
  selectionRange: null,
  contentVersion: 0,
  dirtyVersion: 0,

  // ─── Project Management ───

  openProject: async (rootPath: string) => {
    const opened = await workbenchDesktop.workbenchOpenFolder(rootPath);
    useWorkbenchStore.setState({
      ...workbenchStateFromOpenResult(opened),
      loaded: true,
    });
    await get().focusProject(focusPathAfterOpenFolder(opened.openedLastPath, rootPath));
  },

  focusProject: async (rootPath: string) => {
    const previousRoot = get().projectRoot;
    if (sameProjectPath(previousRoot, rootPath) && get().initialized) {
      const member = useWorkbenchStore.getState().members.find((item) =>
        sameProjectPath(item.lastPath, rootPath),
      );
      if (member) useWorkbenchStore.getState().setFocusProject(member.id);
      return;
    }

    const generation = ++openProjectGeneration;
    projectOpenSupersededByClose = false;
    const t0 = performance.now();
    let canonicalRoot = rootPath;
    const firstOpen = !previousRoot;
    if (firstOpen) set({ isOpeningProject: true });
    try {
      ({ rootPath: canonicalRoot } = await projectDesktop.projectOpen(rootPath));
      if (generation !== openProjectGeneration) return;

      await switchWorkbenchFocus({
        canonicalRoot,
        shouldAbort: () => generation !== openProjectGeneration,
        supersededByClose: () => projectOpenSupersededByClose,
        applyDocumentTree: (scan) => {
          const files: ProjectFile[] = scan.files.map((file) => ({
            id: file.relativePath,
            name: file.relativePath.split("/").pop() || file.relativePath,
            relativePath: file.relativePath,
            absolutePath: file.absolutePath,
            type: file.type as ProjectFile["type"],
            fileSize: file.fileSize,
          }));
          const fileMetadata = new Map<string, FileMeta>();
          for (const file of files) {
            fileMetadata.set(file.id, {
              relativePath: file.relativePath,
              absolutePath: file.absolutePath,
              name: file.name,
              type: file.type,
              fileSize: file.fileSize,
            });
          }
          set({
            projectRoot: canonicalRoot,
            checkoutRoot: canonicalRoot,
            files,
            folders: scan.folders,
            activeFileId: null,
            fileMetadata,
            openedContents: new Map(),
            initialized: true,
          });
        },
      });
    } catch (error) {
      if (generation === openProjectGeneration) {
        try {
          if (previousRoot) await projectDesktop.projectActivate(previousRoot);
          else await projectDesktop.projectClose();
        } catch (revertError) {
          log.warn("project.activate", { error: String(revertError), reason: "restore_previous" });
        }
      }
      toast.error(`Failed to open project: ${error}`);
      throw error;
    } finally {
      if (generation === openProjectGeneration) {
        const ms = Math.round(performance.now() - t0);
        const project = canonicalRoot.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? canonicalRoot;
        log.debug("focusProject complete", { durationMs: ms, project });
        if (firstOpen) set({ isOpeningProject: false });
      }
    }
  },

  closeProject: async () => {
    const previousRoot = get().projectRoot;
    let defaultLastPath = useWorkbenchStore.getState().defaultLastPath.trim();
    if (!defaultLastPath) {
      try {
        const wb = await workbenchDesktop.workbenchGetState();
        defaultLastPath = wb.defaultLastPath?.trim() ?? "";
      } catch {
        defaultLastPath = "";
      }
    }
    if (!defaultLastPath) return;
    if (sameProjectPath(previousRoot, defaultLastPath)) return;
    await get().focusProject(defaultLastPath);
  },

  openFile: async (id: string) => {
    const { openedContents, fileMetadata, activeFileId } = get();

    // Cache hit — only switch active; do not skip load when cache is missing
    // (id === activeFileId with no content was a common empty-editor stuck state).
    const cached = openedContents.get(id);
    const hasCachedPayload =
      !!cached &&
      (typeof cached.content === "string" || typeof cached.dataUrl === "string");
    if (hasCachedPayload) {
      if (activeFileId !== id) set({ activeFileId: id });
      return;
    }

    // Need to load from disk
    let meta = fileMetadata.get(id);
    if (!meta) {
      const registered = await get().ensureLazyProjectFileMeta(id);
      if (!registered) return;
      meta = get().fileMetadata.get(id);
      if (!meta) return;
    }

    const openSeq = ++fileOpenGeneration;
    // Switch active immediately so tabs/UI match the click while content loads.
    if (get().activeFileId !== id) set({ activeFileId: id });

    const relPath = meta.relativePath || id;
    if (isBinaryProjectFile(relPath)) {
      const newMap = new Map(get().openedContents);
      newMap.set(id, { nonOpenable: true, isDirty: false });
      if (openSeq === fileOpenGeneration) {
        set({
          openedContents: newMap,
          activeFileId: id,
          contentVersion: get().contentVersion + 1,
        });
      }
      return;
    }

    try {
      // Images: data URL for ImageViewer. PDFs: preview loads Uint8Array via
      // fsReadBytes (data:application/pdf hangs pdf.js/lector in Electron).
      if (meta.type === "pdf") {
        if (openSeq === fileOpenGeneration) {
          set({
            activeFileId: id,
            contentVersion: get().contentVersion + 1,
          });
        }
      } else if (meta.type === "image") {
        const { dataUrl } = await fsDesktop.fsReadImage(meta.absolutePath);
        if (!dataUrl) return;
        const newMap = new Map(get().openedContents);
        newMap.set(id, { dataUrl, isDirty: false });
        if (openSeq !== fileOpenGeneration) {
          set({ openedContents: newMap, contentVersion: get().contentVersion + 1 });
          return;
        }
        set({
          openedContents: newMap,
          activeFileId: id,
          contentVersion: get().contentVersion + 1,
        });
      } else {
        const { content } = await fsDesktop.fsRead(meta.absolutePath);
        const newMap = new Map(get().openedContents);
        newMap.set(id, { content, isDirty: false });
        if (openSeq !== fileOpenGeneration) {
          set({ openedContents: newMap, contentVersion: get().contentVersion + 1 });
          return;
        }
        set({
          openedContents: newMap,
          activeFileId: id,
          contentVersion: get().contentVersion + 1,
        });
      }
    } catch {
      if (openSeq === fileOpenGeneration) {
        set({ activeFileId: id });
      }
    }
  },

  seedOpenedFile: (id: string, content: string) => {
    const newMap = new Map(get().openedContents);
    newMap.set(id, { content, isDirty: false });
    set({ openedContents: newMap, activeFileId: id });
  },

  ensureLazyProjectFileMeta: async (relativePath: string): Promise<boolean> => {
    const { fileMetadata, projectRoot } = get();
    if (fileMetadata.has(relativePath)) return true;
    if (!projectRoot || !isLazyProjectFilePath(relativePath)) return false;

    const abs = resolveProjectRelativePath(projectRoot, relativePath);
    if (!abs) return false;

    try {
      const exists = await fsDesktop.fsExists(abs);
      if (!exists) return false;
      const isFile = await fsDesktop.fsIsFile(abs);
      if (!isFile) return false;

      const name = relativePath.split("/").pop() || relativePath;
      const { type } = inferFromExtension(name);
      const meta: FileMeta = {
        relativePath,
        absolutePath: abs,
        name,
        type,
      };

      const newMetadata = new Map(get().fileMetadata);
      newMetadata.set(relativePath, meta);
      set({ fileMetadata: newMetadata });
      void trackRecentOpenedFile(relativePath, name);
      return true;
    } catch {
      return false;
    }
  },

  registerExternalFile: (absolutePath: string) => {
    const id = externalFileId(absolutePath);
    const name = absolutePath.split(/[/\\]/).pop() || absolutePath;
    const { type } = inferFromExtension(name);

    const meta: FileMeta = {
      relativePath: absolutePath,
      absolutePath,
      name,
      type,
      isExternal: true,
    };

    const newMetadata = new Map(get().fileMetadata);
    newMetadata.set(id, meta);
    set({ fileMetadata: newMetadata });
    void trackRecentOpenedFile(id, name);

    return {
      id,
      name,
      relativePath: absolutePath,
      absolutePath,
      type,
    };
  },

  openExternalFile: async (absolutePath: string, opts?: { pin?: boolean }) => {
    const file = get().registerExternalFile(absolutePath);

    useRightPanelStore.getState().openFile(file.id, file.absolutePath, file.name, {
      pin: opts?.pin ?? false,
      isExternal: true,
    });
    await get().openFile(file.id);
  },

  // ─── File Operations ───

  saveFile: async (id: string) => {
    const state = get();
    const file = state.files.find((f) => f.id === id);
    const meta = state.fileMetadata.get(id);
    const absPath = file?.absolutePath ?? meta?.absolutePath;
    const displayName = file?.name ?? meta?.name ?? id;
    const content = state.openedContents.get(id);

    if (!absPath || !content?.content || !content.isDirty) return;

    set({ isSaving: true });

    try {
      await fsDesktop.fsWrite(absPath, content.content);
      const newMap = new Map(state.openedContents);
      newMap.set(id, { ...content, isDirty: false });
      set({ openedContents: newMap, isSaving: false, dirtyVersion: state.dirtyVersion + 1 });
    } catch (error) {
      toast.error(`Failed to save ${displayName}: ${error}`);
      set({ isSaving: false });
    }
  },

  saveAllFiles: async () => {
    const state = get();
    const dirtyEntries: [string, FileContent][] = [];
    state.openedContents.forEach((val, key) => {
      if (val.isDirty && val.content) {
        dirtyEntries.push([key, val]);
      }
    });

    if (dirtyEntries.length === 0) return;

    set({ isSaving: true });

    const results = await Promise.allSettled(
      dirtyEntries.map(([id, fc]) => {
        const file = state.files.find((f) => f.id === id);
        const meta = state.fileMetadata.get(id);
        const absPath = file?.absolutePath ?? meta?.absolutePath;
        if (!absPath) return Promise.resolve();
        return fsDesktop.fsWrite(absPath, fc.content!);
      }),
    );

    const savedIds = new Set<string>();
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        savedIds.add(dirtyEntries[i][0]);
      }
    });

    if (savedIds.size > 0) {
      const newMap = new Map(state.openedContents);
      savedIds.forEach((id) => {
        const existing = newMap.get(id);
        if (existing) {
          newMap.set(id, { ...existing, isDirty: false });
        }
      });
      set({ openedContents: newMap, isSaving: false, dirtyVersion: state.dirtyVersion + 1 });

      // Trigger git auto-refresh after editor save.
      // Suppress watcher reload during the refresh window to prevent
      // the save→git→watcher→reload cascade.
      markSuppressWatcherReload();
      import("@/lib/git/git-refresh-root").then(({ scheduleGitStatusRefresh }) => {
        scheduleGitStatusRefresh();
      });
    } else {
      set({ isSaving: false });
    }
  },

  switchCheckoutRoot: async (newRoot: string) => {
    const { checkoutRoot } = get();
    if (newRoot === checkoutRoot) return;

    // Save all dirty files in the current checkout before switching
    await get().saveAllFiles();

    // Switch to new root — clear old content cache
    set({ checkoutRoot: newRoot, openedContents: new Map() });

    // Try to use worktree pre-scanned cache first
    try {
      const wtState = useWorktreeStore.getState();
      if (wtState.activeWorktree && wtState.activeWorktree.path === newRoot) {
        const cached = wtState.getCachedTree(wtState.activeWorktree.path);
        if (cached) {
          // Use cached metadata — instant file tree
          const { files, folders } = cached;
          const newMetadata = new Map<string, FileMeta>();
          for (const f of files) {
            newMetadata.set(f.id, {
              relativePath: f.relativePath,
              absolutePath: f.absolutePath,
              name: f.name,
              type: f.type,
              fileSize: f.fileSize,
            });
          }
          set({
            files: files as ProjectFile[],
            folders,
            fileMetadata: newMetadata,
            contentVersion: get().contentVersion + 1,
          });
          return;
        }
      }
    } catch {
      // Cache lookup failed — fall through to live scan
    }

    // Fallback: live scan metadata from new root
    await get().reloadMetadataFromDisk(true); // force — worktree switch always works
  },

  refreshFiles: async () => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    await get().reloadMetadataFromDisk(true); // force — manual refresh always works
  },

  reloadMetadataFromDisk: async (force = false) => {
    const { checkoutRoot } = get();
    if (!checkoutRoot) return;

    // Skip watcher-triggered reload during save→git cascade,
    // but allow explicit calls (git ops, manual refresh) to bypass.
    if (!force && _suppressWatcherReload) return;

    try {
      const result = await fsDesktop.fsScanMetadata(checkoutRoot);
      const newFiles: ProjectFile[] = result.files.map((f) => ({
        id: f.relativePath,
        name: f.relativePath.split("/").pop() || f.relativePath,
        relativePath: f.relativePath,
        absolutePath: f.absolutePath,
        type: f.type,
        fileSize: f.fileSize,
      }));

      // Build new metadata map
      const newMetadata = new Map<string, FileMeta>();
      for (const file of newFiles) {
        newMetadata.set(file.id, {
          relativePath: file.relativePath,
          absolutePath: file.absolutePath,
          name: file.name,
          type: file.type,
          fileSize: file.fileSize,
        });
      }

      // Check which files were deleted
      const { openedContents, activeFileId: currentActiveId } = get();
      const newOpenedContents = new Map(openedContents);
      const deletedCleanIds: string[] = [];

      for (const [id, entry] of openedContents) {
        if (!newMetadata.has(id)) {
          if (entry.isDirty) {
            // Preserve unsaved work — keep in openedContents even though
            // the file no longer exists on disk (e.g. after branch switch).
            toast.warning(
              `"${id}" was deleted on disk — unsaved changes preserved`,
            );
          } else {
            newOpenedContents.delete(id);
            deletedCleanIds.push(id);
          }
        }
      }

      // Close tabs for clean-deleted files so the editor doesn't show stale content
      if (deletedCleanIds.length > 0) {
        const rps = useRightPanelStore.getState();
        for (const tab of rps.tabs) {
          if (tab.fileId && deletedCleanIds.includes(tab.fileId)) {
            rps.closeTab(tab.id);
          }
        }
      }

      const activeStillExists = currentActiveId
        ? newOpenedContents.has(currentActiveId) && newFiles.some((f) => f.id === currentActiveId)
        : false;

      // result.folders comes from the disk scan — it is the ground truth.
      // It includes empty folders (correct) and excludes non-existent ones.
      set({
        files: newFiles,
        folders: result.folders,
        fileMetadata: newMetadata,
        openedContents: newOpenedContents,
        activeFileId: activeStillExists ? currentActiveId : null,
        contentVersion: get().contentVersion + 1,
      });
    } catch (error) {
      toast.error(`Failed to reload files: ${error}`);
    }
  },

  /** Handle file watcher events. Strategy:
   *   - Any structural change (file added/deleted) → full metadata reload from disk
   *   - Content-only changes → only update openedContents for opened files
   *   - Large batches (>20 paths) → always reload from disk (single IPC)
   *   This method NEVER modifies files/folders/fileMetadata directly —
   *   those are always sourced from the disk scan. */
  incrementalFileChanged: async (absolutePaths: string[]) => {
    const { checkoutRoot, files, openedContents } = get();
    if (!checkoutRoot) return;

    // Skip watcher-triggered reload during save cascade
    if (_suppressWatcherReload) return;

    // Large batch or any structural change → full disk rescan (correct & fast)
    if (absolutePaths.length > 20) {
      await get().reloadMetadataFromDisk(true);
      return;
    }

    const checkoutRootNormalized = checkoutRoot.endsWith("/") ? checkoutRoot : checkoutRoot + "/";
    const relativePaths = absolutePaths
      .map((abs) => (abs.startsWith(checkoutRootNormalized) ? abs.slice(checkoutRootNormalized.length) : null))
      .filter((rel): rel is string => rel !== null);

    if (relativePaths.length === 0) return;

    const filesById = new Map(files.map((f) => [f.id, f]));
    let hasStructuralChange = false;

    // First pass: detect structural changes (additions or deletions)
    for (const relPath of relativePaths) {
      const existing = filesById.get(relPath);
      if (existing) continue; // known file, might just be content change

      // File is new (not in current file list) or deleted (need fs:exists check)
      const absPath = `${checkoutRootNormalized}${relPath}`;
      try {
        const exists = await fsDesktop.fsExists(absPath);
        if (exists && !existing) {
          // New file added externally → structural change
          hasStructuralChange = true;
          break;
        }
        if (!exists && existing) {
          // File deleted externally → structural change
          hasStructuralChange = true;
          break;
        }
      } catch {
        // fs:exists failed — fall back to disk rescan
        hasStructuralChange = true;
        break;
      }
    }

    // Structural changes: do a full disk rescan (single IPC, guaranteed correct)
    if (hasStructuralChange) {
      await get().reloadMetadataFromDisk(true);
      return;
    }

    // Content-only changes: just re-read opened files
    const readTasks: Promise<void>[] = [];
    for (const relPath of relativePaths) {
      const entry = openedContents.get(relPath);
      if (!entry || entry.isDirty) continue; // not opened, or has unsaved edits

      const absPath = `${checkoutRootNormalized}${relPath}`;
      const file = filesById.get(relPath);
      if (!file) continue;

      if (file.type === "image") {
        readTasks.push(
          fsDesktop.fsReadImage(absPath)
            .then(({ dataUrl }) => {
              const current = get().openedContents.get(relPath);
              if (current && !current.isDirty) {
                const newMap = new Map(get().openedContents);
                newMap.set(relPath, { dataUrl: dataUrl ?? undefined, isDirty: false });
                set({ openedContents: newMap, contentVersion: get().contentVersion + 1 });
              }
            })
            .catch(() => {}),
        );
      } else {
        readTasks.push(
          fsDesktop.fsRead(absPath)
            .then(({ content }) => {
              const current = get().openedContents.get(relPath);
              if (current && !current.isDirty) {
                const newMap = new Map(get().openedContents);
                newMap.set(relPath, { content, isDirty: false });
                set({ openedContents: newMap, contentVersion: get().contentVersion + 1 });
              }
            })
            .catch(() => {}),
        );
      }
    }

    await Promise.all(readTasks);
  },

  refreshFileContent: async (id: string) => {
    const file = get().files.find((f) => f.id === id);
    if (!file) return;
    try {
      if (file.type === "image") {
        const { dataUrl } = await fsDesktop.fsReadImage(file.absolutePath);
        if (!dataUrl) return;
        const newMap = new Map(get().openedContents);
        newMap.set(id, { dataUrl, isDirty: false });
        set({ openedContents: newMap });
      } else {
        const { content } = await fsDesktop.fsRead(file.absolutePath);
        const newMap = new Map(get().openedContents);
        newMap.set(id, { content, isDirty: false });
        set({ openedContents: newMap });
      }
    } catch {}
  },

  /** Re-read all open CLEAN files from disk.
   *  Used after git branch switch to immediately reflect new branch content,
   *  rather than waiting for the OS file watcher. Skips dirty files. */
  reloadOpenCleanFiles: async () => {
    const { openedContents, files } = get();
    const textTasks: { id: string; absPath: string }[] = [];
    const imageTasks: { id: string; absPath: string }[] = [];

    for (const [id, entry] of openedContents) {
      if (entry.isDirty) continue;
      const file = files.find((f) => f.id === id);
      if (!file) continue;
      if (file.type === "image") {
        imageTasks.push({ id, absPath: file.absolutePath });
      } else {
        textTasks.push({ id, absPath: file.absolutePath });
      }
    }

    if (textTasks.length === 0 && imageTasks.length === 0) return;

    // Read all files in parallel
    const [textResults, imageResults] = await Promise.all([
      textTasks.length > 0
        ? Promise.allSettled(textTasks.map((t) => fsDesktop.fsRead(t.absPath)))
        : Promise.resolve([] as PromiseSettledResult<{ content: string }>[]),
      imageTasks.length > 0
        ? Promise.allSettled(imageTasks.map((t) => fsDesktop.fsReadImage(t.absPath)))
        : Promise.resolve([] as PromiseSettledResult<{ dataUrl: string }>[]),
    ]);

    // Single set() to avoid racing concurrent updates
    const current = get().openedContents;
    const newMap = new Map(current);
    let changed = false;

    for (let i = 0; i < textResults.length; i++) {
      const r = textResults[i];
      if (r.status !== "fulfilled") continue;
      const { id } = textTasks[i];
      const existing = current.get(id);
      if (existing && !existing.isDirty) {
        newMap.set(id, { content: r.value.content, isDirty: false });
        changed = true;
      }
    }

    for (let i = 0; i < imageResults.length; i++) {
      const r = imageResults[i];
      if (r.status !== "fulfilled") continue;
      const { id } = imageTasks[i];
      const existing = current.get(id);
      if (existing && !existing.isDirty && r.value.dataUrl) {
        newMap.set(id, { dataUrl: r.value.dataUrl, isDirty: false });
        changed = true;
      }
    }

    if (changed) {
      set((s) => ({ openedContents: newMap, contentVersion: s.contentVersion + 1 }));
    }
  },

  /** Combined metadata rescan + content reload — single render cycle.
   *  Used by switchBranch to avoid two separate renders. */
  reloadAllFromDisk: async () => {
    const { checkoutRoot, openedContents } = get();
    if (!checkoutRoot) return;

    // Phase 1: scan metadata
    const result = await fsDesktop.fsScanMetadata(checkoutRoot);
    const newFiles: ProjectFile[] = result.files.map((f) => ({
      id: f.relativePath,
      name: f.relativePath.split("/").pop() || f.relativePath,
      relativePath: f.relativePath,
      absolutePath: f.absolutePath,
      type: f.type,
      fileSize: f.fileSize,
    }));

    const newMetadata = new Map<string, FileMeta>();
    for (const file of newFiles) {
      newMetadata.set(file.id, {
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        name: file.name,
        type: file.type,
        fileSize: file.fileSize,
      });
    }

    // Phase 2: collect clean open files to reload
    const textTasks: { id: string; absPath: string }[] = [];
    const imageTasks: { id: string; absPath: string }[] = [];
    const deletedCleanIds: string[] = [];

    const newOpenedContents = new Map(openedContents);
    for (const [id, entry] of openedContents) {
      const meta = newMetadata.get(id);
      if (!meta) {
        // File deleted from disk
        if (entry.isDirty) {
          toast.warning(`"${id}" was deleted on disk — unsaved changes preserved`);
        } else {
          newOpenedContents.delete(id);
          deletedCleanIds.push(id);
        }
        continue;
      }
      if (entry.isDirty) continue; // preserve dirty content
      // Queue for reload
      const file = newFiles.find((f) => f.id === id);
      if (!file) continue;
      if (file.type === "image") {
        imageTasks.push({ id, absPath: file.absolutePath });
      } else {
        textTasks.push({ id, absPath: file.absolutePath });
      }
    }

    // Phase 3: read all clean file contents in parallel
    const [textResults, imageResults] = await Promise.all([
      textTasks.length > 0
        ? Promise.allSettled(textTasks.map((t) => fsDesktop.fsRead(t.absPath)))
        : Promise.resolve([] as PromiseSettledResult<{ content: string }>[]),
      imageTasks.length > 0
        ? Promise.allSettled(imageTasks.map((t) => fsDesktop.fsReadImage(t.absPath)))
        : Promise.resolve([] as PromiseSettledResult<{ dataUrl: string }>[]),
    ]);

    for (let i = 0; i < textResults.length; i++) {
      const r = textResults[i];
      if (r.status !== "fulfilled") continue;
      const { id } = textTasks[i];
      const existing = newOpenedContents.get(id);
      if (existing && !existing.isDirty) {
        newOpenedContents.set(id, { content: r.value.content, isDirty: false });
      }
    }
    for (let i = 0; i < imageResults.length; i++) {
      const r = imageResults[i];
      if (r.status !== "fulfilled") continue;
      const { id } = imageTasks[i];
      const existing = newOpenedContents.get(id);
      if (existing && !existing.isDirty && r.value.dataUrl) {
        newOpenedContents.set(id, { dataUrl: r.value.dataUrl, isDirty: false });
      }
    }

    // Phase 4: close tabs for clean-deleted files
    if (deletedCleanIds.length > 0) {
      const rps = useRightPanelStore.getState();
      for (const tab of rps.tabs) {
        if (tab.fileId && deletedCleanIds.includes(tab.fileId)) {
          rps.closeTab(tab.id);
        }
      }
    }

    const { activeFileId: currentActiveId } = get();
    const activeStillExists = currentActiveId
      ? newOpenedContents.has(currentActiveId) && newFiles.some((f) => f.id === currentActiveId)
      : false;

    // Single set() — one React render instead of two
    set({
      files: newFiles,
      folders: result.folders,
      fileMetadata: newMetadata,
      openedContents: newOpenedContents,
      activeFileId: activeStillExists ? currentActiveId : null,
      contentVersion: get().contentVersion + 1,
    });
  },

  createNewFile: async (name: string, type?: ProjectFileType, folder?: string) => {
    const { checkoutRoot, files } = get();
    if (!checkoutRoot) return;

    const relativePath = folder ? `${folder}/${name}` : name;
    const inferred = type ? { type, content: type === "tex" ? defaultTexContent : "" } : inferFromExtension(name);

    try {
      const { absPath } = await fsDesktop.fsCreate(
        checkoutRoot,
        relativePath,
        inferred.content,
      );

      const newFile: ProjectFile = {
        id: relativePath,
        name,
        relativePath,
        absolutePath: absPath,
        type: inferred.type,
      };

      const newOpenedContents = new Map(get().openedContents);
      newOpenedContents.set(relativePath, { content: inferred.content, isDirty: false });

      // Update fileMetadata so openFile can find this new file
      const newMetadata = new Map(get().fileMetadata);
      newMetadata.set(relativePath, {
        relativePath: newFile.relativePath,
        absolutePath: newFile.absolutePath,
        name: newFile.name,
        type: newFile.type,
        fileSize: 0,
      });

      // Derive folders from the new file list (single source of truth)
      const newFilesList = [...files, newFile];

      set({
        files: newFilesList,
        folders: get().folders, // preserve empty folders — new file parent already scanned
        activeFileId: relativePath,
        fileMetadata: newMetadata,
        openedContents: newOpenedContents,
      });

      // Trigger git refresh — new file may show as untracked
      import("@/lib/git/git-refresh-root").then(({ refreshGitStatusNow }) => {
        markSuppressWatcherReload();
        refreshGitStatusNow();
      });
    } catch (error) {
      toast.error(`Failed to create file: ${error}`);
      throw error;
    }
  },

  createFolder: async (name: string, parent?: string) => {
    const { checkoutRoot } = get();
    if (!checkoutRoot) return;

    const folderPath = parent ? `${parent}/${name}` : name;
    const absolutePath = `${checkoutRoot}/${folderPath}`.replace(/\\/g, "/");

    try {
      await fsDesktop.fsMkdir(absolutePath);
      set((s) => ({
        folders: s.folders.includes(folderPath) ? s.folders : [...s.folders, folderPath],
      }));
    } catch (error) {
      toast.error(`Failed to create folder: ${error}`);
      throw error;
    }
  },

  deleteFile: async (id: string) => {
    const { files, activeFileId } = get();

    const file = files.find((f) => f.id === id);
    if (!file) return;

    try {
      await fsDesktop.fsDelete(file.absolutePath);
      const newFiles = files.filter((f) => f.id !== id);
      const newOpenedContents = new Map(get().openedContents);
      newOpenedContents.delete(id);

      // Clean up fileMetadata
      const newMetadata = new Map(get().fileMetadata);
      newMetadata.delete(id);

      set({
        files: newFiles,
        folders: get().folders, // preserve empty folders — deleting a file doesn't delete its parent dir
        activeFileId:
          activeFileId === id
            ? newFiles.length > 0
              ? newFiles[0].id
              : null
            : activeFileId,
        fileMetadata: newMetadata,
        openedContents: newOpenedContents,
      });

      // Trigger git refresh — deleted file changes git status
      import("@/lib/git/git-refresh-root").then(({ refreshGitStatusNow }) => {
        markSuppressWatcherReload();
        refreshGitStatusNow();
      });
    } catch (error) {
      toast.error(`Failed to delete file: ${error}`);
      throw error;
    }
  },

  deleteFolder: async (folderPath: string) => {
    const { checkoutRoot, files } = get();
    if (!checkoutRoot) return;

    // Check if this would delete all files
    const remainingFiles = files.filter(
      (f) => !f.relativePath.startsWith(`${folderPath}/`),
    );
    if (remainingFiles.length === 0) {
      toast.error("Cannot delete folder containing all files");
      return;
    }

    const absolutePath = `${checkoutRoot}/${folderPath}`.replace(/\\/g, "/");

    try {
      await fsDesktop.fsDeleteFolder(absolutePath);

      const { activeFileId, openedContents } = get();
      const newFiles = files.filter((f) => !f.relativePath.startsWith(`${folderPath}/`));
      const newFolders = get().folders.filter(
        (f) => f !== folderPath && !f.startsWith(`${folderPath}/`),
      );
      const newOpenedContents = new Map(openedContents);
      files.forEach((f) => {
        if (f.relativePath.startsWith(`${folderPath}/`)) {
          newOpenedContents.delete(f.id);
        }
      });

      // Clean up fileMetadata for all files in the deleted folder
      const newMetadata = new Map(get().fileMetadata);
      files.forEach((f) => {
        if (f.relativePath.startsWith(`${folderPath}/`)) {
          newMetadata.delete(f.id);
        }
      });

      set({
        files: newFiles,
        folders: newFolders,
        activeFileId:
          activeFileId && newFiles.find((f) => f.id === activeFileId)
            ? activeFileId
            : newFiles.length > 0
              ? newFiles[0].id
              : null,
        fileMetadata: newMetadata,
        openedContents: newOpenedContents,
      });

      // Trigger git refresh — deleted files change git status
      import("@/lib/git/git-refresh-root").then(({ refreshGitStatusNow }) => {
        markSuppressWatcherReload();
        refreshGitStatusNow();
      });

      // Workspace config sync is handled by files-sidebar.tsx before
      // calling deleteFolder — that component has the full workspace
      // context needed for the confirmation dialog and config cleanup.
    } catch (error) {
      toast.error(`Failed to delete folder: ${error}`);
      throw error;
    }
  },

  renameFile: async (id: string, newName: string) => {
    const { files, checkoutRoot } = get();
    const file = files.find((f) => f.id === id);
    if (!file || !checkoutRoot) return;

    const parentPath = file.relativePath.includes("/")
      ? file.relativePath.substring(0, file.relativePath.lastIndexOf("/"))
      : "";
    const newRelativePath = parentPath ? `${parentPath}/${newName}` : newName;
    const newAbsolutePath = `${checkoutRoot}/${newRelativePath}`.replace(/\\/g, "/");

    try {
      await fsDesktop.fsRename(file.absolutePath, newAbsolutePath);

      const { activeFileId, openedContents } = get();
      const existingContent = openedContents.get(id);
      const newOpenedContents = new Map(openedContents);
      if (existingContent) {
        newOpenedContents.delete(id);
        newOpenedContents.set(newRelativePath, existingContent);
      }

      // Update fileMetadata for the renamed file
      const newMetadata = new Map(get().fileMetadata);
      const oldMeta = newMetadata.get(id);
      if (oldMeta) {
        newMetadata.delete(id);
        newMetadata.set(newRelativePath, {
          ...oldMeta,
          relativePath: newRelativePath,
          absolutePath: newAbsolutePath,
          name: newName,
        });
      }

      const renamedFiles = files.map((f) =>
        f.id === id
          ? {
              ...f,
              id: newRelativePath,
              name: newName,
              relativePath: newRelativePath,
              absolutePath: newAbsolutePath,
            }
          : f,
      );

      set({
        files: renamedFiles,
        folders: get().folders, // preserve empty folders — rename doesn't delete dirs
        activeFileId: activeFileId === id ? newRelativePath : activeFileId,
        fileMetadata: newMetadata,
        openedContents: newOpenedContents,
      });

      // Trigger git refresh — renamed file may show as renamed/moved
      import("@/lib/git/git-refresh-root").then(({ refreshGitStatusNow }) => {
        markSuppressWatcherReload();
        refreshGitStatusNow();
      });
    } catch (error) {
      toast.error(`Failed to rename file: ${error}`);
      throw error;
    }
  },

  renameFolder: async (folderPath: string, newName: string) => {
    const { files, folders, checkoutRoot, openedContents } = get();
    if (!checkoutRoot) return;

    const parentPath = folderPath.includes("/")
      ? folderPath.substring(0, folderPath.lastIndexOf("/"))
      : "";
    const newFolderPath = parentPath ? `${parentPath}/${newName}` : newName;
    const oldPrefix = `${folderPath}/`;
    const newPrefix = `${newFolderPath}/`;

    const oldAbs = `${checkoutRoot}/${folderPath}`.replace(/\\/g, "/");
    const newAbs = `${checkoutRoot}/${newFolderPath}`.replace(/\\/g, "/");

    try {
      await fsDesktop.fsRename(oldAbs, newAbs);

      // Update affected file paths
      const affectedFiles = files
        .filter((f) => f.relativePath.startsWith(oldPrefix))
        .map((f) => ({
          ...f,
          id: newPrefix + f.relativePath.slice(oldPrefix.length),
          relativePath: newPrefix + f.relativePath.slice(oldPrefix.length),
          absolutePath: f.absolutePath
            .replace(/\\/g, "/")
            .replace(oldAbs, newAbs)
            .replace(oldPrefix, newPrefix),
        }));

      const newFiles = files
        .filter((f) => !f.relativePath.startsWith(oldPrefix))
        .concat(affectedFiles);

      // Update folder paths
      const newFolders = folders.map((f) =>
        f === folderPath
          ? newFolderPath
          : f.startsWith(oldPrefix)
            ? newPrefix + f.slice(oldPrefix.length)
            : f,
      );

      // Update content map keys
      const newFileContents = new Map(openedContents);
      openedContents.forEach((v, k) => {
        if (k.startsWith(oldPrefix)) {
          newFileContents.delete(k);
          newFileContents.set(newPrefix + k.slice(oldPrefix.length), v);
        }
      });

      // Update tab references
      const rps = useRightPanelStore.getState();
      for (const t of rps.tabs) {
        if (t.fileId?.startsWith(oldPrefix)) {
          const newId = newPrefix + t.fileId.slice(oldPrefix.length);
          const newPath = newPrefix + (t.filePath ?? "").slice(oldPrefix.length);
          rps.updateTab(t.id, { fileId: newId, filePath: newPath });
        }
      }

      // Update fileMetadata for all affected files
      const newMetadata = new Map(get().fileMetadata);
      files.filter((f) => f.relativePath.startsWith(oldPrefix)).forEach((f) => {
        const newId = newPrefix + f.relativePath.slice(oldPrefix.length);
        const newRelPath = newPrefix + f.relativePath.slice(oldPrefix.length);
        const meta = newMetadata.get(f.id);
        newMetadata.delete(f.id);
        if (meta) {
          newMetadata.set(newId, {
            ...meta,
            relativePath: newRelPath,
            absolutePath: meta.absolutePath.replace(oldAbs, newAbs),
          });
        }
      });

      set({
        files: newFiles,
        folders: newFolders,
        fileMetadata: newMetadata,
        openedContents: newFileContents,
      });

      // Trigger git refresh — renamed files change git status
      import("@/lib/git/git-refresh-root").then(({ refreshGitStatusNow }) => {
        markSuppressWatcherReload();
        refreshGitStatusNow();
      });
    } catch (error) {
      toast.error(`Failed to rename folder: ${error}`);
      throw error;
    }
  },

  // ─── Sync Actions ───

  setActiveFile: (id: string) => {
    if (!id) {
      // Clearing the selection — openFile can't handle empty id
      // (it early-returns on missing metadata), so set directly.
      set({ activeFileId: null });
      return;
    }
    // Always go through openFile — even when already active — so a failed /
    // incomplete prior load (tab open, empty cache) can recover.
    get().openFile(id);
  },

  getAsset: (id: string) => get().openedContents.get(id)?.content ?? "",

  getDirtyRelativePaths: () => {
    const state = get();
    const paths: string[] = [];
    state.openedContents.forEach((val, id) => {
      if (!val.isDirty) return;
      const file = state.files.find((f) => f.id === id);
      if (file?.relativePath) paths.push(file.relativePath);
    });
    return paths;
  },

  getLiveCompilePayload: () => {
    const state = get();
    const dirtyRelPaths: string[] = [];
    const dirtyFiles: Array<{ relPath: string; content: string }> = [];
    const seen = new Set<string>();
    state.openedContents.forEach((val, id) => {
      // Only flush buffers that actually changed — avoids rewriting every open
      // .tex/.bib on each live pass (IPC + disk + incremental sync).
      if (!val.isDirty || val.content == null) return;
      const file = state.files.find((f) => f.id === id);
      if (!file?.relativePath) return;
      if (!/\.(tex|bib|sty|cls|bst)$/i.test(file.relativePath)) return;
      if (seen.has(file.relativePath)) return;
      seen.add(file.relativePath);
      dirtyRelPaths.push(file.relativePath);
      dirtyFiles.push({ relPath: file.relativePath, content: val.content });
    });
    return { dirtyRelPaths, dirtyFiles };
  },

  markCompiledClean: (compiled) => {
    if (compiled.length === 0) return;
    const state = get();
    const byRel = new Map(compiled.map((f) => [f.relPath, f.content]));
    const newMap = new Map(state.openedContents);
    let changed = false;
    for (const file of state.files) {
      const compiledContent = byRel.get(file.relativePath);
      if (compiledContent === undefined) continue;
      const existing = newMap.get(file.id);
      if (!existing?.isDirty) continue;
      // Still editing — leave dirty for the next compile pass.
      if (existing.content !== compiledContent) continue;
      newMap.set(file.id, { ...existing, isDirty: false });
      changed = true;
    }
    if (changed) {
      set({ openedContents: newMap, dirtyVersion: state.dirtyVersion + 1 });
    }
  },

  setContent: (id: string, content: string) => {
    const state = get();
    const existing = state.openedContents.get(id);
    if (existing?.content === content) return;

    const newMap = new Map(state.openedContents);
    newMap.set(id, { content, isDirty: true });
    set({
      openedContents: newMap,
      dirtyVersion: state.dirtyVersion + 1,
      contentVersion: state.contentVersion + 1,
    });

    const rp = useRightPanelStore.getState();
    const previewTab = rp.tabs.find((t) => t.kind === "file" && t.fileId === id && t.isPreview);
    if (previewTab) rp.pinTab(previewTab.id);

    scheduleAutoSave();

    const file = state.files.find((f) => f.id === id);
    if (file && /\.(tex|bib|sty|cls|bst)$/i.test(file.relativePath)) {
      void import("./compile-store").then(({ useCompileStore }) => {
        useCompileStore.getState().scheduleAutoCompile();
      });
    }
  },

  isFileDirty: (id: string) => get().openedContents.get(id)?.isDirty ?? false,

  requestJumpToPosition: (position: number) => set({ jumpTarget: position }),
  requestJumpToLine: (fileId: string, line: number) => set({ jumpToLine: { fileId, line } }),
  requestInsertText: (text: string) => set({ insertText: text }),

  setSelectionRange: (range) => set({ selectionRange: range }),
}));

// Add bib to the ProjectFile type
declare module "./document-store" {
  interface ProjectFile {
    type: ProjectFileType;
  }
}
