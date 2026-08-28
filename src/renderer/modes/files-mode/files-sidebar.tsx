import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { shellDesktop } from "@/lib/desktop-api/shell";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { DEFAULT_MANUSCRIPT_DIR, FOLDER_FUNCTION_LABELS, folderWorkspaceFunction, findWorkspaceFolder, type FolderFunction } from "@/types/workspace";
import { resolveFolderIconName } from "@/lib/workspace/folder-icons";
import { WorkspaceFolderIcon } from "@/lib/workspace/workspace-folder-icon";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { tabFileId, tabFilePath } from "@/lib/workspace/mode-registry";
import { useGitStore } from "@/stores/git-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { applyCheckoutTransition } from "@/lib/git/checkout-context";
import {
  FilePlusCorner,
  FolderPlusIcon,
  FoldVerticalIcon,
  UnfoldVerticalIcon,
  RefreshCwIcon,
  GitBranchIcon,
  SplitIcon,
} from "lucide-react";

import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from "@/components/ui/app-context-menu";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
  appMenuFontClass,
} from "@/components/ui/app-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SETTINGS_FORM_INPUT } from "@/components/modules/settings/settings-tokens";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { buildFileTree, flattenVisibleTree, type TreeNode, type FlatVisibleNode } from "@/lib/files/file-tree";

import {
  SidebarHeader,
} from "@/components/ui/sidebar";
import { getModeDir, type SidebarMode, filterFilesByMode, filterFoldersByMode } from "./file-filter";
import { trackRecentOpenedFile, setProjectLastActiveFileId } from "@/lib/files/recent-files";
import { FolderVirtRow, FileVirtRow, InlineEditRow, FILE_TREE_ROW_ATTR, type VirtTreeCallbacks } from "@/components/layout/right-sidebar/virtual-tree-rows";
import {
  pickGitFileItemForPath,
  resolveGitChangeBadgeForPath,
} from "@/modes/git-mode/git-change-status";



// ─── Files Header ───

interface FilesHeaderCallbacks {
  onNewFile: (folder?: string) => void;
  onNewFolder: (parent?: string) => void;
}

function FilesHeader({ callbacks, projectName, anyExpanded, onToggleAll }: {
  callbacks: FilesHeaderCallbacks;
  projectName?: string;
  anyExpanded: boolean;
  onToggleAll: () => void;
}) {
  const { t } = useTranslation();
  const refreshFiles = useDocumentStore((s) => s.refreshFiles);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    refreshFiles();
    setTimeout(() => setSpinning(false), 400);
  };

  return (
    <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between px-3">
      <span className="truncate text-[length:var(--font-size-12)] font-medium text-muted-foreground">
        {projectName || "Project"}
      </span>
      <div className="flex items-center gap-0.5 shrink-0">
        <Hint label={t("modes.files.newFile")}>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => callbacks.onNewFile()}
          >
            <FilePlusCorner className="size-3.5" />
          </button>
        </Hint>
        <Hint label={t("modes.files.newFolder")}>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => callbacks.onNewFolder()}
          >
            <FolderPlusIcon className="size-3.5" />
          </button>
        </Hint>
        <Hint label={anyExpanded ? t("modes.files.collapseAll") : t("modes.files.expandAll")}>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={onToggleAll}
          >
            {anyExpanded ? (
              <FoldVerticalIcon className="size-3.5" />
            ) : (
              <UnfoldVerticalIcon className="size-3.5" />
            )}
          </button>
        </Hint>
        <Hint label={t("modes.files.refresh")}>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={handleRefresh}
          >
            <RefreshCwIcon className={cn("size-3.5", spinning && "animate-spin")} />
          </button>
        </Hint>
      </div>
    </SidebarHeader>
  );
}

// ─── Files Sidebar ───

export function FilesSidebar() {
  const { t } = useTranslation();
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const allFiles = useDocumentStore((s) => s.files);
  const allFolders = useDocumentStore((s) => s.folders);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const dirtyVersion = useDocumentStore((s) => s.dirtyVersion);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);
  const workspaceDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const manuscriptDir = manuscriptConfig?.dir ?? DEFAULT_MANUSCRIPT_DIR;
  const openFile = useRightPanelStore((s) => s.openFile);
  const deleteFile = useDocumentStore((s) => s.deleteFile);
  const deleteFolder = useDocumentStore((s) => s.deleteFolder);
  const renameFile = useDocumentStore((s) => s.renameFile);
  const renameFolder = useDocumentStore((s) => s.renameFolder);
  const createNewFile = useDocumentStore((s) => s.createNewFile);
  const createFolder = useDocumentStore((s) => s.createFolder);

  // Delete file AND close any tabs that were viewing it
  const handleDeleteFile = useCallback(
    (fileId: string) => {
      if (!window.confirm(t("dialogs.files.deleteBody", { name: fileId }))) return;
      const rps = useRightPanelStore.getState();
      for (const tab of rps.tabs) {
        if (tabFileId(tab) === fileId || tabFilePath(tab) === fileId) {
          rps.requestCloseTab(tab.id);
        }
      }
      deleteFile(fileId);
    },
    [deleteFile, t],
  );

  // Delete folder AND close any tabs viewing files inside it
  const handleDeleteFolder = useCallback(
    (folderPath: string) => {
      // Check if this folder is configured in workspace settings
      const workspaceDirs = useWorkspaceConfigStore.getState().workspaceDirs;
      const wsEntry = workspaceDirs.find((d) => d.name === folderPath);

      setDeleteDialog({
        folderPath,
        folderName: folderPath.split("/").pop() || folderPath,
        workspaceFunc: wsEntry?.function,
      });
    },
    [],
  );

  const currentMode: SidebarMode = "all";

  // ─── Context bar: branch + worktree ───
  const gitBranch = useGitStore((s) => s.branch);
  const gitSwitching = useGitStore((s) => s.switching);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const allBranches = useGitStore((s) => s.branches);
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const allWorktrees = useWorktreeStore((s) => s.worktrees);

  // ─── Files view target: which root is the file tree showing?
  //      "worktree" = worktree files, "project" = original project files.
  //      Purely a view toggle — never touches worktree lifecycle. ───
  const [filesView, setFilesView] = useState<"worktree" | "project">("worktree");

  // Reset view to worktree when the active worktree changes
  useEffect(() => {
    if (activeWorktree) {
      setFilesView("worktree");
    }
  }, [activeWorktree?.name]);

  const handleViewProject = useCallback(async () => {
    if (!projectRoot) return;
    await applyCheckoutTransition({ type: "project-view-while-worktree" });
    setFilesView("project");
  }, [projectRoot]);

  const handleViewWorktree = useCallback(() => {
    if (!activeWorktree) return;
    void applyCheckoutTransition({ type: "worktree-existing", worktree: activeWorktree });
    setFilesView("worktree");
  }, [activeWorktree]);

  // Filter out internal wt-* worktree branches
  const branches = useMemo(
    () => allBranches.filter((b) => !b.startsWith("wt-")),
    [allBranches],
  );

  // Branch switch handler
  const handleSwitchBranch = useCallback(
    async (branchName: string) => {
      if (!projectRoot || branchName === gitBranch) return;
      await useGitStore.getState().switchBranch(projectRoot, branchName);
    },
    [projectRoot, gitBranch],
  );

  // Worktree: switch to another existing worktree (real switch, not just view)
  const handleSwitchWorktree = useCallback(
    (wt: NonNullable<typeof activeWorktree>) => {
      void applyCheckoutTransition({ type: "worktree-existing", worktree: wt });
    },
    [],
  );
  const files = useMemo(() => filterFilesByMode(allFiles, currentMode, manuscriptDir), [allFiles, currentMode, manuscriptDir]);
  const folders = useMemo(() => filterFoldersByMode(allFolders, currentMode, manuscriptDir), [allFolders, currentMode, manuscriptDir]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const tree = useMemo(() => buildFileTree(files, folders), [files, folders]);
  const dirtyFiles = useMemo(() => {
    const dirty = new Set<string>();
    useDocumentStore.getState().openedContents.forEach((v, k) => { if (v.isDirty) dirty.add(k); });
    return dirty;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyVersion]);

  // ─── Git status — query project-level or worktree git repo ───

  // Derive file git status from the git store (already fetched by refreshStatus).
  // Avoids a duplicate `git status` IPC call — cuts status fetches in half.
  const gitFiles = useGitStore((s) => s.files);

  const gitSummary = useMemo(() => {
    if (!isGitRepo) return null;
    let staged = 0;
    let changed = 0;
    const seen = new Set<string>();
    for (const f of gitFiles) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      const pick = pickGitFileItemForPath(gitFiles, f.path);
      if (!pick) continue;
      if (pick.staged && !pick.unstaged) staged++;
      if (pick.unstaged || pick.untracked) changed++;
    }
    return { staged, changed };
  }, [isGitRepo, gitFiles]);

  // ─── Expand / collapse (persisted to layout-store) ───
  const persistedExpanded = useLayoutStore((s) => s.expandedFileTreeFolders);
  const setPersistedExpanded = useLayoutStore((s) => s.setExpandedFileTreeFolders);
  const expandedFolders = useMemo(() => new Set(persistedExpanded), [persistedExpanded]);

  const anyExpanded = expandedFolders.size > 0;

  const handleToggleAll = useCallback(() => {
    if (anyExpanded) {
      setPersistedExpanded([]);
    } else {
      setPersistedExpanded([...folders]);
    }
  }, [anyExpanded, folders, setPersistedExpanded]);

  const handleToggleFolder = useCallback(
    (path: string) => {
      const next = new Set(persistedExpanded);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      setPersistedExpanded([...next]);
    },
    [persistedExpanded, setPersistedExpanded],
  );


  // ─── Name validation ───

  const isCaseInsensitiveFs =
    typeof navigator !== "undefined" &&
    (navigator.platform.startsWith("Mac") || navigator.platform.startsWith("Win"));

  const nameExistsIn = useCallback(
    (name: string, folder?: string) => {
      const targetPath = folder ? `${folder}/${name}` : name;
      const cmp = (a: string, b: string) =>
        isCaseInsensitiveFs ? a.toLowerCase() === b.toLowerCase() : a === b;
      const existsAsFile = allFiles.some((f) => cmp(f.relativePath, targetPath));
      const existsAsFolder = allFolders.some((f) => cmp(f, targetPath));
      return existsAsFile || existsAsFolder;
    },
    [allFiles, allFolders, isCaseInsensitiveFs],
  );

  /** Convert a mode-relative folder path to a full project-relative path */
  const resolveCreateFolder = useCallback(
    (modeFolderPath?: string): string | undefined => {
      if (!modeFolderPath && currentMode === "all") return undefined;
      if (!modeFolderPath) return getModeDir(currentMode, manuscriptDir);
      if (currentMode === "all") return modeFolderPath;
      return `${getModeDir(currentMode, manuscriptDir)}/${modeFolderPath}`;
    },
    [currentMode, manuscriptDir],
  );

  // ─── Inline editing ───
  const [editing, setEditing] = useState<{ type: "file" | "folder"; parentPath?: string } | null>(null);

  // ─── Rename dialog ───
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [isFolderRename, setIsFolderRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [nameError, setNameError] = useState("");

  // ─── Delete folder confirmation dialog ───
  const [deleteDialog, setDeleteDialog] = useState<{
    folderPath: string;
    folderName: string;
    workspaceFunc?: FolderFunction;
  } | null>(null);

  const confirmDeleteFolder = useCallback(() => {
    if (!deleteDialog) return;
    const { folderPath, workspaceFunc } = deleteDialog;

    // Close any tabs viewing files inside this folder
    const rps = useRightPanelStore.getState();
    const prefix = `${folderPath}/`;
    for (const tab of rps.tabs) {
      if (tabFileId(tab)?.startsWith(prefix) || tabFilePath(tab)?.startsWith(prefix)) {
        rps.requestCloseTab(tab.id);
      }
    }

    // If this folder was configured in workspace settings, remove the config entry.
    // This keeps the workspace config in sync with the actual filesystem.
    if (workspaceFunc) {
      const wsStore = useWorkspaceConfigStore.getState();
      const idx = wsStore.workspaceDirs.findIndex((d) => d.name === folderPath);
      if (idx >= 0) {
        wsStore.removeFolder(idx);
        // Persist immediately — the settings component may not be mounted
        // when the user is in files mode, so the auto-save useEffect won't fire.
        const root = useDocumentStore.getState().projectRoot;
        if (root) wsStore.saveConfig(root).catch(() => {});
      }
    }

    deleteFolder(folderPath);
    setDeleteDialog(null);
  }, [deleteDialog, deleteFolder]);

  const openRenameDialog = useCallback((fileId: string, name: string) => {
    setRenameFileId(fileId);
    setIsFolderRename(false);
    setRenameValue(name);
    setNameError("");
    setRenameDialogOpen(true);
  }, []);

  const openFolderRenameDialog = useCallback((folderPath: string, name: string) => {
    setRenameFileId(folderPath);
    setIsFolderRename(true);
    setRenameValue(name);
    setNameError("");
    setRenameDialogOpen(true);
  }, []);

  const handleRename = useCallback(async () => {
    const name = renameValue.trim();
    if (!renameFileId || !name) return;
    if (name.includes("/") || name.includes("\\") || name === ".." || name === ".") {
      setNameError("Invalid file name");
      return;
    }
    if (isFolderRename) {
      try {
        await renameFolder(renameFileId, name);
      } catch { /* error handled in store */ }
      setRenameDialogOpen(false);
      setRenameFileId(null);
      setRenameValue("");
      setNameError("");
      return;
    }
    const file = allFiles.find((f) => f.id === renameFileId);
    const parentFolder = file?.relativePath.includes("/")
      ? file.relativePath.substring(0, file.relativePath.lastIndexOf("/"))
      : undefined;
    const isSameName = isCaseInsensitiveFs
      ? name.toLowerCase() === file?.name.toLowerCase()
      : name === file?.name;
    if (nameExistsIn(name, parentFolder) && !isSameName) {
      setNameError("A file or folder with this name already exists");
      return;
    }
    try {
      // Compute new path for tab sync
      const oldPath = renameFileId;
      const parent = oldPath.includes("/")
        ? oldPath.substring(0, oldPath.lastIndexOf("/"))
        : "";
      const newPath = parent ? `${parent}/${name}` : name;
      await renameFile(renameFileId, name);
      // Sync any tabs that were viewing this file
      const rps = useRightPanelStore.getState();
      for (const tab of rps.tabs) {
        if (tabFileId(tab) === oldPath || tabFilePath(tab) === oldPath) {
          rps.updateTab(tab.id, { fileId: newPath, filePath: newPath, title: name });
        }
      }
      setRenameDialogOpen(false);
      setRenameFileId(null);
      setRenameValue("");
      setNameError("");
    } catch { /* error handled in store */ }
  }, [renameValue, renameFileId, allFiles, isCaseInsensitiveFs, nameExistsIn, renameFile]);

  // ─── File tree callbacks (stabilized so FileTreeNode memo works) ───

  const treeCallbacks: VirtTreeCallbacks = useMemo(() => {
    const toAbsPath = (pathOrRel: string) => {
      const root = useDocumentStore.getState().checkoutRoot;
      if (!root) return pathOrRel;
      if (/^([A-Za-z]:\\|\/)/.test(pathOrRel)) return pathOrRel;
      return pathOrRel ? `${root}/${pathOrRel}` : root;
    };
    return {
      onNewFile: (path: string) => setEditing({ type: "file", parentPath: resolveCreateFolder(path) }),
      onNewFolder: (path: string) => setEditing({ type: "folder", parentPath: resolveCreateFolder(path) }),
      onRenameFile: openRenameDialog,
      onDeleteFile: handleDeleteFile,
      onDeleteFolder: handleDeleteFolder,
      onRenameFolder: openFolderRenameDialog,
      onRevealInFinder: (pathOrRel: string) => {
        const abs = toAbsPath(pathOrRel);
        if (abs) void shellDesktop.shellShowItemInFolder(abs);
      },
      onCopyPath: (text: string) => void navigator.clipboard.writeText(text),
      onCopyRelativePath: (rel: string) => void navigator.clipboard.writeText(rel),
    };
  }, [resolveCreateFolder, openRenameDialog, handleDeleteFile, handleDeleteFolder, openFolderRenameDialog]);

  const headerCallbacks: FilesHeaderCallbacks = useMemo(() => ({
    onNewFile: () => setEditing({ type: "file", parentPath: resolveCreateFolder(selectedFolder ?? undefined) }),
    onNewFolder: () => setEditing({ type: "folder", parentPath: resolveCreateFolder(selectedFolder ?? undefined) }),
  }), [resolveCreateFolder, selectedFolder]);

  const handleSelectFile = useCallback(
    (id: string, name: string, pin = false) => {
      setSelectedFolder(null);
      if (projectRoot) void setProjectLastActiveFileId(projectRoot, id);
      void trackRecentOpenedFile(id, name);
      setActiveFile(id);
      openFile(id, id, name, { pin });
    },
    [projectRoot, setActiveFile, openFile],
  );

  const handleSelectFolder = useCallback((path: string) => {
    setSelectedFolder(path);
    setActiveFile(""); // Clear file highlight when selecting a folder
  }, [setActiveFile]);

  /** Blank tree area → project root (no folder/file selected; create at root in All mode). */
  const handleSelectTreeRoot = useCallback(() => {
    setSelectedFolder(null);
    setActiveFile("");
  }, [setActiveFile]);

  const handleTreeBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(`[${FILE_TREE_ROW_ATTR}]`)) return;
      handleSelectTreeRoot();
    },
    [handleSelectTreeRoot],
  );
  const handleEditingDone = useCallback(() => setEditing(null), []);

  // ─── Virtual tree: flat visible nodes + Virtuoso ref ───
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const flatItems = useMemo(() => {
    const visible = flattenVisibleTree(tree, expandedFolders);
    if (editing) {
      const synthetic: FlatVisibleNode = {
        key: editing.parentPath ? `__editing_${editing.parentPath}__` : "__editing_root__",
        name: "",
        type: "file",
        node: { name: "", relativePath: "", type: "file", children: [] } as TreeNode,
        depth: 0,
        editingType: editing.type,
        editingParentPath: editing.parentPath,
      };
      if (!editing.parentPath) {
        visible.unshift(synthetic);
      } else {
        const idx = visible.findIndex((v) => v.type === "folder" && v.key === editing.parentPath);
        if (idx >= 0) {
          synthetic.depth = visible[idx].depth + 1;
          visible.splice(idx + 1, 0, synthetic);
        }
      }
    }
    return visible;
  }, [tree, expandedFolders, editing]);

  // ─── Git status lookup helper (same 3-level fallback as before) ───
  const getGitBadge = useCallback(
    (fileId: string, fileName: string, relativePath: string) => {
      const direct = resolveGitChangeBadgeForPath(gitFiles, fileId);
      if (direct) return direct;
      const byRel = resolveGitChangeBadgeForPath(gitFiles, relativePath);
      if (byRel) return byRel;
      for (const f of gitFiles) {
        if (f.path === fileName || f.path.endsWith("/" + fileName)) {
          return resolveGitChangeBadgeForPath(gitFiles, f.path);
        }
      }
      return undefined;
    },
    [gitFiles],
  );

  // ─── Virtuoso item renderer ───
  const renderVirtuosoItem = useCallback(
    (_index: number, item: FlatVisibleNode) => {
      if (item.editingType) {
        return (
          <InlineEditRow
            type={item.editingType}
            depth={item.depth}
            parentPath={item.editingParentPath}
            onCreated={handleEditingDone}
            onCancel={handleEditingDone}
          />
        );
      }
      if (item.type === "folder") {
        const isExpanded = expandedFolders.has(item.key);
        const isSelected = selectedFolder === item.key;
        const wsFolder = findWorkspaceFolder(item.key, workspaceDirs);
        const workspaceFunc = folderWorkspaceFunction(item.key, workspaceDirs);
        return (
          <FolderVirtRow
            item={item}
            depth={item.depth}
            isExpanded={isExpanded}
            isSelected={isSelected}
            onToggle={() => {
              handleToggleFolder(item.key);
              handleSelectFolder(item.key);
            }}
            callbacks={treeCallbacks}
            workspaceFunction={workspaceFunc}
            folderIconName={wsFolder ? resolveFolderIconName(wsFolder) : null}
            folderBadgeTitle={wsFolder ? FOLDER_FUNCTION_LABELS[wsFolder.function] : undefined}
          />
        );
      }
      // File row
      const file = item.node.file!;
      return (
        <FileVirtRow
          item={item}
          depth={item.depth}
          isActive={file.id === activeFileId}
          isDirty={dirtyFiles.has(file.id)}
          gitBadge={getGitBadge(file.id, file.name, file.relativePath)}
          onSelect={() => handleSelectFile(file.id, file.name)}
          onOpenPinned={() => handleSelectFile(file.id, file.name, true)}
          callbacks={treeCallbacks}
        />
      );
    },
    [
      expandedFolders,
      selectedFolder,
      activeFileId,
      dirtyFiles,
      getGitBadge,
      handleToggleFolder,
      handleSelectFolder,
      handleSelectFile,
      handleEditingDone,
      treeCallbacks,
      workspaceDirs,
    ],
  );

  // ─── Breadcrumb navigation (must be after flatItems declaration) ───
  const fileTreeNavigatePath = useLayoutStore((s) => s.fileTreeNavigatePath);
  const setFileTreeNavigatePath = useLayoutStore((s) => s.setFileTreeNavigatePath);

  useEffect(() => {
    if (fileTreeNavigatePath === null) return;

    let targetPath = fileTreeNavigatePath;

    if (currentMode !== "all") {
      const prefix = `${getModeDir(currentMode, manuscriptDir)}/`;
      if (targetPath.startsWith(prefix)) {
        targetPath = targetPath.slice(prefix.length);
      } else if (targetPath === getModeDir(currentMode, manuscriptDir)) {
        targetPath = "";
      } else {
        setFileTreeNavigatePath(null);
        return;
      }
    }

    if (targetPath !== "") {
      const parts = targetPath.split("/");
      const requiredFolders: string[] = [];
      for (let i = 1; i < parts.length; i++) {
        requiredFolders.push(parts.slice(0, i).join("/"));
      }
      const missing = requiredFolders.some((p) => !expandedFolders.has(p));
      if (missing) {
        const next = new Set(expandedFolders);
        for (const p of requiredFolders) next.add(p);
        setPersistedExpanded([...next]);
        return;
      }
    }

    if (!targetPath) {
      setFileTreeNavigatePath(null);
      return;
    }

    const idx = flatItems.findIndex((item) => item.key === targetPath);
    if (idx >= 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: idx, align: "center" });
      setFileTreeNavigatePath(null);
    } else {
      setFileTreeNavigatePath(null);
    }
  }, [
    fileTreeNavigatePath,
    currentMode,
    manuscriptDir,
    expandedFolders,
    persistedExpanded,
    setPersistedExpanded,
    setFileTreeNavigatePath,
    flatItems,
  ]);

  return (
    <>
      <FilesHeader
        projectName={projectRoot?.split(/[/\\]/).pop()}
        callbacks={headerCallbacks}
        anyExpanded={anyExpanded}
        onToggleAll={handleToggleAll}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {/* ─── Virtualized file tree ─── */}
        <div className="flex-1 min-h-0">
          <AppContextMenu>
            <AppContextMenuTrigger asChild>
              <div
                className="flex-1 h-full min-h-0 px-1.5"
                data-sidebar="content"
                onClick={handleTreeBackgroundClick}
              >
                <Virtuoso
                  ref={virtuosoRef}
                  data={flatItems}
                  fixedItemHeight={24}
                  computeItemKey={(_index: number, item: FlatVisibleNode) => item.key}
                  itemContent={renderVirtuosoItem}
                  components={{
                    EmptyPlaceholder: () => (
                      <div className="flex flex-1 items-center justify-center px-4 py-8">
                        <p className="text-center text-[length:var(--font-empty-state)] leading-relaxed text-muted-foreground">
                          {t("modes.files.noFilesYet")}
                          <span className="mt-1 block text-[length:var(--font-hint)] opacity-60">
                            {t("modes.files.openProjectToStart")}
                          </span>
                        </p>
                      </div>
                    ),
                  }}
                  style={{ height: "100%" }}
                  className="py-1"
                  increaseViewportBy={{ top: 100, bottom: 100 }}
                />
              </div>
            </AppContextMenuTrigger>
            <AppContextMenuContent>
              <AppContextMenuItem onClick={() => setEditing({ type: "file", parentPath: resolveCreateFolder() })}>
                {t("modes.files.newFile")}
              </AppContextMenuItem>
              <AppContextMenuItem onClick={() => setEditing({ type: "folder", parentPath: resolveCreateFolder() })}>
                {t("modes.files.newFolder")}
              </AppContextMenuItem>
            </AppContextMenuContent>
          </AppContextMenu>
        </div>

      </div>

      {/* ── Bottom status bar ── */}
      {(isGitRepo || activeWorktree) && (
        <div className={cn("flex items-center gap-2 h-[var(--height-mode-selector)] px-3 shrink-0 text-muted-foreground", appMenuFontClass)}>
          {activeWorktree ? (
            <>
              {/* ── View switcher: worktree ↔ project ── */}
              {filesView === "worktree" ? (
                <>
                  <AppMenu>
                    <AppMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded px-1 -ml-1 h-5 hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <SplitIcon className="size-3.5 shrink-0" />
                        <span className="truncate max-w-[100px]">{activeWorktree.name}</span>
                      </button>
                    </AppMenuTrigger>
                    <AppMenuContent align="start" side="top" className="w-44">
                      <AppMenuItem onClick={handleViewProject}>{t("modes.files.viewProjectFiles")}</AppMenuItem>
                      {allWorktrees.filter((w) => w.name !== activeWorktree.name).length > 0 && (
                        <>
                          <AppMenuSeparator />
                          {allWorktrees
                            .filter((w) => w.name !== activeWorktree.name)
                            .map((w) => (
                              <AppMenuItem key={w.name} onClick={() => handleSwitchWorktree(w)}>
                                {w.name}
                              </AppMenuItem>
                            ))}
                        </>
                      )}
                    </AppMenuContent>
                  </AppMenu>

                  <span className="text-muted-foreground/30 shrink-0">→</span>

                  {/* Base branch the worktree was created from (persisted in metadata) */}
                  {activeWorktree.baseBranch && (
                    <span className="flex items-center gap-1.5">
                      <GitBranchIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{activeWorktree.baseBranch}</span>
                    </span>
                  )}
                </>
              ) : (
                <>
                  {/* Viewing project files while worktree exists.
                      Show interactive branch switcher.
                      Only show the worktree label when the current branch
                      matches the worktree's base — otherwise it's irrelevant. */}
                  {isGitRepo && gitBranch ? (
                    <AppMenu>
                      <AppMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded px-1 -ml-1 h-5 hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          {gitSwitching ? (
                            <RefreshCwIcon className="size-3.5 shrink-0 animate-spin" />
                          ) : (
                            <GitBranchIcon className="size-3.5 shrink-0" />
                          )}
                          <span className="truncate max-w-[100px]">
                            {gitSwitching ? "Switching…" : gitBranch}
                          </span>
                        </button>
                      </AppMenuTrigger>
                      <AppMenuContent align="start" side="top" className="w-48 max-h-56 overflow-y-auto">
                        {activeWorktree?.baseBranch === gitBranch && (
                          <>
                            <AppMenuItem onClick={handleViewWorktree}>{t("modes.files.viewWorktreeFiles")}</AppMenuItem>
                            {branches.length > 0 && <AppMenuSeparator />}
                          </>
                        )}
                        {branches.map((b) => (
                          <AppMenuCheckItem
                            key={b}
                            selected={b === gitBranch}
                            onClick={() => handleSwitchBranch(b)}
                            className={cn(b === gitBranch && "font-medium")}
                          >
                            {b}
                          </AppMenuCheckItem>
                        ))}
                      </AppMenuContent>
                    </AppMenu>
                  ) : (
                    <span className="truncate max-w-[100px]">{projectRoot?.split(/[/\\]/).pop()}</span>
                  )}

                  {/* Worktree label — only when on the base branch */}
                  {activeWorktree?.baseBranch === gitBranch && (
                    <>
                      <span className="text-muted-foreground/30 shrink-0">←</span>
                      <span className="flex items-center gap-1.5">
                        <SplitIcon className="size-3.5 shrink-0" />
                        <span className="truncate max-w-[100px]">{activeWorktree.name}</span>
                      </span>
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* ── Branch switcher ── */}
              {isGitRepo && gitBranch && (
                <AppMenu>
                  <AppMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded px-1 -ml-1 h-5 hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {gitSwitching ? (
                        <RefreshCwIcon className="size-3.5 shrink-0 animate-spin" />
                      ) : (
                        <GitBranchIcon className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate max-w-[120px]">
                        {gitSwitching ? "Switching…" : gitBranch}
                      </span>
                    </button>
                  </AppMenuTrigger>
                  <AppMenuContent align="start" side="top" className="w-48 max-h-56 overflow-y-auto">
                    {branches.length === 0 ? (
                      <p className={cn("px-2 py-3 text-center text-muted-foreground", appMenuFontClass)}>
                        No branches
                      </p>
                    ) : (
                      branches.map((b) => (
                        <AppMenuCheckItem
                          key={b}
                          selected={b === gitBranch}
                          onClick={() => handleSwitchBranch(b)}
                          className={cn(b === gitBranch && "font-medium")}
                        >
                          {b}
                        </AppMenuCheckItem>
                      ))
                    )}
                  </AppMenuContent>
                </AppMenu>
              )}
            </>
          )}

          <span className="flex-1" />

          {/* ── Git summary (read-only) ── */}
          {gitSummary && (gitSummary.staged > 0 || gitSummary.changed > 0) && (
            <span className="tabular-nums shrink-0">
              <span className="text-emerald-500">+{gitSummary.staged}</span>
              {gitSummary.staged > 0 && gitSummary.changed > 0 && (
                <span className="text-muted-foreground/30 mx-0.5">·</span>
              )}
              <span className="text-amber-500">~{gitSummary.changed}</span>
            </span>
          )}
          {isGitRepo && gitSummary && gitSummary.staged === 0 && gitSummary.changed === 0 && (
            <span className="text-muted-foreground/50 shrink-0">clean</span>
          )}
        </div>
      )}


      {/* ─── Rename Dialog ─── */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isFolderRename ? t("dialogs.files.renameFolder") : t("dialogs.files.rename")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Input
              className={SETTINGS_FORM_INPUT}
              value={renameValue}
              onChange={(e) => { setRenameValue(e.target.value); setNameError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
              autoFocus
            />
            {nameError && (
              <p className="text-destructive text-[length:var(--font-error)]">{nameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="xs" onClick={() => setRenameDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="xs" onClick={handleRename}>{t("dialogs.files.rename")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Folder Confirmation Dialog ─── */}
      <Dialog open={!!deleteDialog} onOpenChange={(o) => { if (!o) setDeleteDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dialogs.files.deleteFolder")}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                {deleteDialog?.workspaceFunc ? (
                  <>
                    <p>
                      <span className="inline-flex items-center gap-1.5">
                        {(() => {
                          const ws = findWorkspaceFolder(deleteDialog.folderPath, workspaceDirs);
                          if (!ws) return null;
                          return (
                            <WorkspaceFolderIcon
                              name={resolveFolderIconName(ws)}
                              className="size-3.5"
                            />
                          );
                        })()}
                        {t("dialogs.files.workspaceWarn", {
                          function: FOLDER_FUNCTION_LABELS[deleteDialog.workspaceFunc],
                        })}
                      </span>
                    </p>
                    {deleteDialog.workspaceFunc === "manuscript" &&
                      useWorkspaceConfigStore.getState().workspaceDirs.filter(
                        (d) => d.function === "manuscript",
                      ).length === 1 && (
                        <p className="text-warning">
                          {t("dialogs.files.manuscriptWarn")}
                        </p>
                      )}
                  </>
                ) : null}
                <p>
                  {t("dialogs.files.deleteFolderBody", {
                    name: deleteDialog?.folderName ?? "",
                  })}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">
              <code className="rounded bg-destructive/10 px-1 font-sans text-destructive">
                {deleteDialog?.folderPath}/
              </code>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="xs" onClick={() => setDeleteDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" size="xs" onClick={confirmDeleteFolder}>
              {t("dialogs.files.deleteFolder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
