import { create } from "zustand";
import { toast } from "sonner";
import { AUTO_SAVE_DELAY } from "@/styles/constants";
import { useProjectStore } from "./project-store";
import { useRightPanelStore } from "./right-panel-store";
import { useLayoutStore } from "./layout-store";
import { useChatStore } from "./chat-store";
import { clearPdfCache } from "./compile-store";

export type ProjectFileType = "tex" | "image" | "pdf" | "bib" | "style" | "other";

/** Files larger than this (5 MB) are not auto-loaded into memory */
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

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
}

interface DocumentState {
  projectRoot: string | null;
  showWelcome: boolean;
  setShowWelcome: (show: boolean) => void;
  files: ProjectFile[];
  folders: string[];
  activeFileId: string | null;
  initialized: boolean;
  isSaving: boolean;
  fileContents: Map<string, FileContent>;
  jumpTarget: number | null;
  /** Jump to a specific line in a specific file (used by TOC/Labels/Citations) */
  jumpToLine: { fileId: string; line: number } | null;
  selectionRange: { start: number; end: number } | null;

  // Async actions
  openProject: (rootPath: string) => Promise<void>;
  closeProject: () => Promise<void>;
  saveFile: (id: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  refreshFileContent: (id: string) => Promise<void>;

  // Modified actions (now async)
  createNewFile: (name: string, type?: ProjectFileType, folder?: string) => Promise<void>;
  createFolder: (name: string, parent?: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  deleteFolder: (folderPath: string) => Promise<void>;
  renameFile: (id: string, newName: string) => Promise<void>;
  renameFolder: (folderPath: string, newName: string) => Promise<void>;

  // Sync actions
  setActiveFile: (id: string) => void;
  getContent: (id: string) => string;
  setContent: (id: string, content: string) => void;
  isFileDirty: (id: string) => boolean;
  requestJumpToPosition: (position: number) => void;
  requestJumpToLine: (fileId: string, line: number) => void;
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

export const useDocumentStore = create<DocumentState>((set, get) => ({
  projectRoot: null,
  showWelcome: true,
  setShowWelcome: (show) => set({ showWelcome: show }),
  files: [],
  folders: [],
  activeFileId: null,
  initialized: false,
  isSaving: false,
  fileContents: new Map(),
  jumpTarget: null,
  jumpToLine: null,
  selectionRange: null,

  // ─── Project Management ───

  openProject: async (rootPath: string) => {
    try {
      // Clean up previous project state — dispose agent FIRST to prevent
      // late-arriving events from writing back into the cleared store
      await window.electronAPI.cliDispose();
      useRightPanelStore.getState().closeAllTabs();
      useChatStore.getState().clearAllSessions();
      useLayoutStore.getState().setLeftSidebarView("sessions");
      useLayoutStore.getState().setLeftSidebarOverlay(false);
      useLayoutStore.getState().setRightSidebarOpen(false);
      useLayoutStore.setState({ showArchived: false });
      clearPdfCache();
      // Lazy import to avoid circular dependency
      (await import("./changes-store")).useChangesStore.getState().clearAll();

      const result = await window.electronAPI.fsScan(rootPath);
      const files: ProjectFile[] = result.files.map((f) => ({
        id: f.relativePath,
        name: f.relativePath.split("/").pop() || f.relativePath,
        relativePath: f.relativePath,
        absolutePath: f.absolutePath,
        type: f.type,
        fileSize: f.fileSize,
      }));

      const fileContents = new Map<string, FileContent>();

      // Load content for each file
      for (const file of files) {
        if (file.type === "tex" || file.type === "bib" || file.type === "style" || file.type === "other") {
          try {
            const { content } = await window.electronAPI.fsRead(file.absolutePath);
            fileContents.set(file.id, { content, isDirty: false });
          } catch {
            // Failed to read file, skip
          }
        } else if (file.type === "image" && (file.fileSize || 0) <= LARGE_FILE_THRESHOLD) {
          try {
            const { dataUrl } = await window.electronAPI.fsReadImage(file.absolutePath);
            fileContents.set(file.id, { dataUrl, isDirty: false });
          } catch {
            // Failed to read image, skip
          }
        }
      }

      set({
        projectRoot: rootPath,
        showWelcome: false,
        files,
        folders: result.folders,
        activeFileId: null,
        fileContents,
        initialized: true,
      });

      // Add to recent projects
      useProjectStore.getState().addRecentProject(rootPath);

      // Persist last project path so it auto-restores on next launch
      window.electronAPI.settingsSet({ lastProjectPath: rootPath } as any);
    } catch (error) {
      toast.error(`Failed to open project: ${error}`);
      throw error;
    }
  },

  closeProject: async () => {
    clearAutoSaveTimer();
    // Clear last project path so next launch shows welcome page
    window.electronAPI.settingsSet({ lastProjectPath: null } as any);
    // Clean up sub-stores to prevent session/tab pollution
    await window.electronAPI.cliDispose();
    useRightPanelStore.getState().closeAllTabs();
    useChatStore.getState().clearAllSessions();
    clearPdfCache();
    import("./changes-store").then((m) => m.useChangesStore.getState().clearAll());
    set({
      projectRoot: null,
      showWelcome: true,
      files: [],
      folders: [],
      activeFileId: null,
      fileContents: new Map(),
      initialized: false,
    });
  },

  // ─── File Operations ───

  saveFile: async (id: string) => {
    const state = get();
    const file = state.files.find((f) => f.id === id);
    const content = state.fileContents.get(id);

    if (!file || !content?.content || !content.isDirty) return;

    set({ isSaving: true });

    try {
      await window.electronAPI.fsWrite(file.absolutePath, content.content);
      const newMap = new Map(state.fileContents);
      newMap.set(id, { ...content, isDirty: false });
      set({ fileContents: newMap, isSaving: false });
    } catch (error) {
      toast.error(`Failed to save ${file.name}: ${error}`);
      set({ isSaving: false });
    }
  },

  saveAllFiles: async () => {
    const state = get();
    const dirtyEntries: [string, FileContent][] = [];
    state.fileContents.forEach((val, key) => {
      if (val.isDirty && val.content) {
        dirtyEntries.push([key, val]);
      }
    });

    if (dirtyEntries.length === 0) return;

    set({ isSaving: true });

    const results = await Promise.allSettled(
      dirtyEntries.map(([id, fc]) => {
        const file = state.files.find((f) => f.id === id);
        if (!file) return Promise.resolve();
        return window.electronAPI.fsWrite(file.absolutePath, fc.content!);
      }),
    );

    const savedIds = new Set<string>();
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        savedIds.add(dirtyEntries[i][0]);
      }
    });

    if (savedIds.size > 0) {
      const newMap = new Map(state.fileContents);
      savedIds.forEach((id) => {
        const existing = newMap.get(id);
        if (existing) {
          newMap.set(id, { ...existing, isDirty: false });
        }
      });
      set({ fileContents: newMap, isSaving: false });
    } else {
      set({ isSaving: false });
    }
  },

  refreshFiles: async () => {
    const { projectRoot } = get();
    if (!projectRoot) return;

    try {
      const result = await window.electronAPI.fsScan(projectRoot);
      const files: ProjectFile[] = result.files.map((f) => ({
        id: f.relativePath,
        name: f.relativePath.split("/").pop() || f.relativePath,
        relativePath: f.relativePath,
        absolutePath: f.absolutePath,
        type: f.type,
        fileSize: f.fileSize,
      }));

      // Preserve content for files that still exist
      const { fileContents } = get();
      const newFileContents = new Map<string, FileContent>();
      for (const file of files) {
        const existing = fileContents.get(file.id);
        if (existing) {
          newFileContents.set(file.id, existing);
        }
      }

      set({ files, folders: result.folders, fileContents: newFileContents });
    } catch (error) {
      toast.error(`Failed to refresh files: ${error}`);
    }
  },

  refreshFileContent: async (id: string) => {
    const file = get().files.find((f) => f.id === id);
    if (!file) return;
    try {
      const { content } = await window.electronAPI.fsRead(file.absolutePath);
      const newMap = new Map(get().fileContents);
      newMap.set(id, { content, isDirty: false });
      set({ fileContents: newMap });
    } catch {}
  },

  createNewFile: async (name: string, type?: ProjectFileType, folder?: string) => {
    const { projectRoot, files } = get();
    if (!projectRoot) return;

    const relativePath = folder ? `${folder}/${name}` : name;
    const inferred = type ? { type, content: type === "tex" ? defaultTexContent : "" } : inferFromExtension(name);

    try {
      const { absPath } = await window.electronAPI.fsCreate(
        projectRoot,
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

      const newFileContents = new Map(get().fileContents);
      newFileContents.set(relativePath, { content: inferred.content, isDirty: false });

      set({
        files: [...files, newFile],
        activeFileId: relativePath,
        fileContents: newFileContents,
      });
    } catch (error) {
      toast.error(`Failed to create file: ${error}`);
      throw error;
    }
  },

  createFolder: async (name: string, parent?: string) => {
    const { projectRoot } = get();
    if (!projectRoot) return;

    const folderPath = parent ? `${parent}/${name}` : name;
    const absolutePath = `${projectRoot}/${folderPath}`.replace(/\\/g, "/");

    try {
      await window.electronAPI.fsMkdir(absolutePath);
      set((s) => ({
        folders: [...s.folders, folderPath],
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
      await window.electronAPI.fsDelete(file.absolutePath);
      const newFiles = files.filter((f) => f.id !== id);
      const newFileContents = new Map(get().fileContents);
      newFileContents.delete(id);

      set({
        files: newFiles,
        activeFileId:
          activeFileId === id
            ? newFiles.length > 0
              ? newFiles[0].id
              : null
            : activeFileId,
        fileContents: newFileContents,
      });
    } catch (error) {
      toast.error(`Failed to delete file: ${error}`);
      throw error;
    }
  },

  deleteFolder: async (folderPath: string) => {
    const { projectRoot, files } = get();
    if (!projectRoot) return;

    // Check if this would delete all files
    const remainingFiles = files.filter(
      (f) => !f.relativePath.startsWith(`${folderPath}/`),
    );
    if (remainingFiles.length === 0) {
      toast.error("Cannot delete folder containing all files");
      return;
    }

    const absolutePath = `${projectRoot}/${folderPath}`.replace(/\\/g, "/");

    try {
      await window.electronAPI.fsDeleteFolder(absolutePath);

      const { activeFileId, fileContents } = get();
      const newFiles = files.filter((f) => !f.relativePath.startsWith(`${folderPath}/`));
      const newFolders = get().folders.filter(
        (f) => f !== folderPath && !f.startsWith(`${folderPath}/`),
      );
      const newFileContents = new Map(fileContents);
      files.forEach((f) => {
        if (f.relativePath.startsWith(`${folderPath}/`)) {
          newFileContents.delete(f.id);
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
        fileContents: newFileContents,
      });
    } catch (error) {
      toast.error(`Failed to delete folder: ${error}`);
      throw error;
    }
  },

  renameFile: async (id: string, newName: string) => {
    const { files, projectRoot } = get();
    const file = files.find((f) => f.id === id);
    if (!file || !projectRoot) return;

    const parentPath = file.relativePath.includes("/")
      ? file.relativePath.substring(0, file.relativePath.lastIndexOf("/"))
      : "";
    const newRelativePath = parentPath ? `${parentPath}/${newName}` : newName;
    const newAbsolutePath = `${projectRoot}/${newRelativePath}`.replace(/\\/g, "/");

    try {
      await window.electronAPI.fsRename(file.absolutePath, newAbsolutePath);

      const { activeFileId, fileContents } = get();
      const existingContent = fileContents.get(id);
      const newFileContents = new Map(fileContents);
      if (existingContent) {
        newFileContents.delete(id);
        newFileContents.set(newRelativePath, existingContent);
      }

      set({
        files: files.map((f) =>
          f.id === id
            ? {
                ...f,
                id: newRelativePath,
                name: newName,
                relativePath: newRelativePath,
                absolutePath: newAbsolutePath,
              }
            : f,
        ),
        activeFileId: activeFileId === id ? newRelativePath : activeFileId,
        fileContents: newFileContents,
      });
    } catch (error) {
      toast.error(`Failed to rename file: ${error}`);
      throw error;
    }
  },

  renameFolder: async (folderPath: string, newName: string) => {
    const { files, folders, projectRoot, fileContents } = get();
    if (!projectRoot) return;

    const parentPath = folderPath.includes("/")
      ? folderPath.substring(0, folderPath.lastIndexOf("/"))
      : "";
    const newFolderPath = parentPath ? `${parentPath}/${newName}` : newName;
    const oldPrefix = `${folderPath}/`;
    const newPrefix = `${newFolderPath}/`;

    const oldAbs = `${projectRoot}/${folderPath}`.replace(/\\/g, "/");
    const newAbs = `${projectRoot}/${newFolderPath}`.replace(/\\/g, "/");

    try {
      await window.electronAPI.fsRename(oldAbs, newAbs);

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
      const newFileContents = new Map(fileContents);
      fileContents.forEach((v, k) => {
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

      set({
        files: newFiles,
        folders: newFolders,
        fileContents: newFileContents,
      });
    } catch (error) {
      toast.error(`Failed to rename folder: ${error}`);
      throw error;
    }
  },

  // ─── Sync Actions ───

  setActiveFile: (id: string) => set({ activeFileId: id }),

  getContent: (id: string) => get().fileContents.get(id)?.content ?? "",

  setContent: (id: string, content: string) => {
    const { fileContents } = get();
    const existing = fileContents.get(id);
    // Only update if content actually changed
    if (existing?.content === content) return;

    const newMap = new Map(fileContents);
    newMap.set(id, { content, isDirty: true });
    set({ fileContents: newMap });

    scheduleAutoSave();
  },

  isFileDirty: (id: string) => get().fileContents.get(id)?.isDirty ?? false,

  requestJumpToPosition: (position: number) => set({ jumpTarget: position }),
  requestJumpToLine: (fileId: string, line: number) => set({ jumpToLine: { fileId, line } }),

  setSelectionRange: (range) => set({ selectionRange: range }),
}));

// Add bib to the ProjectFile type
declare module "./document-store" {
  interface ProjectFile {
    type: ProjectFileType;
  }
}
