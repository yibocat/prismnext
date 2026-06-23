import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { DEFAULT_MANUSCRIPT_DIR, FOLDER_FUNCTION_LABELS, FOLDER_FUNCTION_ICONS, type FolderFunction } from "@/types/workspace";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useGitStore } from "@/stores/git-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useIsTexworkspace } from "@/modes/texworkspace-mode/use-texworkspace";
import {
  CheckIcon,
  FilePlusCorner,
  FolderOpenIcon,
  FolderPlusIcon,
  FoldVerticalIcon,
  UnfoldVerticalIcon,
  RefreshCwIcon,
  GitBranchIcon,
  SplitIcon,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { buildFileTree, flattenVisibleTree, type TreeNode, type FlatVisibleNode } from "@/lib/files/file-tree";

import {
  SidebarHeader,
} from "@/components/ui/sidebar";
import { getModeDir, type SidebarMode, filterFilesByMode, filterFoldersByMode } from "./file-filter";
import { trackRecentOpenedFile } from "@/lib/files/recent-files";
import { FolderVirtRow, FileVirtRow, InlineEditRow, type VirtTreeCallbacks, type GitStatusInfo } from "@/components/layout/right-sidebar/virtual-tree-rows";



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
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="New File"
          onClick={() => callbacks.onNewFile()}
        >
          <FilePlusCorner className="size-3.5" />
        </button>
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="New Folder"
          onClick={() => callbacks.onNewFolder()}
        >
          <FolderPlusIcon className="size-3.5" />
        </button>
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={anyExpanded ? "Collapse All" : "Expand All"}
          onClick={onToggleAll}
        >
          {anyExpanded ? (
            <FoldVerticalIcon className="size-3.5" />
          ) : (
            <UnfoldVerticalIcon className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Refresh"
          onClick={handleRefresh}
        >
          <RefreshCwIcon className={cn("size-3.5", spinning && "animate-spin")} />
        </button>
      </div>
    </SidebarHeader>
  );
}

// ─── Files Sidebar ───

export function FilesSidebar() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const allFiles = useDocumentStore((s) => s.files);
  const allFolders = useDocumentStore((s) => s.folders);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const dirtyVersion = useDocumentStore((s) => s.dirtyVersion);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);
  const manuscriptDir = manuscriptConfig?.dir ?? DEFAULT_MANUSCRIPT_DIR;
  const openFile = useRightPanelStore((s) => s.openFile);
  const openTexworkspaceFile = useRightPanelStore((s) => s.openTexworkspaceFile);
  const deleteFile = useDocumentStore((s) => s.deleteFile);
  const deleteFolder = useDocumentStore((s) => s.deleteFolder);
  const renameFile = useDocumentStore((s) => s.renameFile);
  const renameFolder = useDocumentStore((s) => s.renameFolder);
  const createNewFile = useDocumentStore((s) => s.createNewFile);
  const createFolder = useDocumentStore((s) => s.createFolder);

  // Delete file AND close any tabs that were viewing it
  const handleDeleteFile = useCallback(
    (fileId: string) => {
      if (!window.confirm(`Delete "${fileId}"? This cannot be undone.`)) return;
      const rps = useRightPanelStore.getState();
      for (const t of rps.tabs) {
        if (t.fileId === fileId || t.filePath === fileId) {
          rps.requestCloseTab(t.id);
        }
      }
      deleteFile(fileId);
    },
    [deleteFile],
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

  const isTexworkspaceActive = useIsTexworkspace();
  const currentMode: SidebarMode = isTexworkspaceActive ? "manuscript" : "all";

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
    // Switch view to project root first
    await useDocumentStore.getState().switchCheckoutRoot(projectRoot);
    setFilesView("project");
    // Then checkout the worktree's base branch so the file tree
    // shows the correct branch content, not whatever the project
    // happened to be on before the worktree was created.
    if (activeWorktree?.baseBranch) {
      const gs = useGitStore.getState();
      if (gs.branch !== activeWorktree.baseBranch) {
        await gs.switchBranch(projectRoot, activeWorktree.baseBranch).catch(() => {});
      }
    }
  }, [projectRoot, activeWorktree?.baseBranch]);

  const handleViewWorktree = useCallback(() => {
    if (!activeWorktree) return;
    useDocumentStore.getState().switchCheckoutRoot(activeWorktree.path);
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
      useWorktreeStore.getState().selectExistingWorktree(wt);
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
  const gitStatusMap = useMemo(() => {
    const map = new Map<string, { isDeleted: boolean; isStagedOnly: boolean; isUnstaged: boolean; isUntracked: boolean }>();
    for (const f of gitFiles) {
      const isDeleted = f.worktreeStatus === "D" || f.indexStatus === "D";
      map.set(f.path, { isStagedOnly: f.staged && !f.unstaged, isUnstaged: f.unstaged, isUntracked: f.untracked, isDeleted });
    }
    return map;
  }, [gitFiles]);

  // ─── Git status summary for context bar ───
  const gitSummary = useMemo(() => {
    if (!isGitRepo) return null;
    let staged = 0;
    let changed = 0;
    gitStatusMap.forEach((v) => {
      if (v.isStagedOnly) staged++;
      if (v.isUnstaged || v.isUntracked) changed++;
    });
    return { staged, changed };
  }, [isGitRepo, gitStatusMap]);

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
    for (const t of rps.tabs) {
      if (t.fileId?.startsWith(prefix) || t.filePath?.startsWith(prefix)) {
        rps.requestCloseTab(t.id);
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
      for (const t of rps.tabs) {
        if (t.fileId === oldPath || t.filePath === oldPath) {
          rps.updateTab(t.id, { fileId: newPath, filePath: newPath, title: name });
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
        if (abs) void window.electronAPI.shellShowItemInFolder(abs);
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
      window.electronAPI.settingsSet({ lastActiveFileId: id } as any);
      void trackRecentOpenedFile(id, name);
      if (isTexworkspaceActive) {
        openTexworkspaceFile(id, id, name);
      } else {
        setActiveFile(id);
        openFile(id, id, name, { pin });
      }
    },
    [isTexworkspaceActive, openTexworkspaceFile, setActiveFile, openFile],
  );

  const handleSelectFolder = useCallback((path: string) => {
    setSelectedFolder(path);
    setActiveFile(""); // Clear file highlight when selecting a folder
  }, [setActiveFile]);
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
  const getGitStatus = useCallback(
    (fileId: string, fileName: string, relativePath: string): GitStatusInfo | undefined => {
      const direct = gitStatusMap.get(fileId);
      if (direct !== undefined) return direct;
      const byRel = gitStatusMap.get(relativePath);
      if (byRel !== undefined) return byRel;
      for (const [key, val] of gitStatusMap) {
        if (key === fileName || key.endsWith("/" + fileName)) return val;
      }
      return undefined;
    },
    [gitStatusMap],
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
          gitStatus={getGitStatus(file.id, file.name, file.relativePath)}
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
      getGitStatus,
      handleToggleFolder,
      handleSelectFolder,
      handleSelectFile,
      handleEditingDone,
      treeCallbacks,
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
      }
    }

    if (targetPath !== "") {
      const parts = targetPath.split("/");
      const next = new Set(persistedExpanded);
      for (let i = 1; i <= parts.length; i++) {
        next.add(parts.slice(0, i).join("/"));
      }
      setPersistedExpanded([...next]);
    }

    // Scroll Virtuoso to the target item after React commits the expand
    if (targetPath) {
      const resolvedPath = targetPath;
      queueMicrotask(() => {
        const idx = flatItems.findIndex(
          (item) => item.key === resolvedPath || item.key.startsWith(resolvedPath + "/"),
        );
        if (idx >= 0 && virtuosoRef.current) {
          virtuosoRef.current.scrollToIndex({ index: idx, align: "start" });
        }
      });
    }

    setFileTreeNavigatePath(null);
  }, [fileTreeNavigatePath, currentMode, persistedExpanded, setPersistedExpanded, setFileTreeNavigatePath, flatItems]);

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
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className="flex-1 h-full min-h-0 px-1.5"
                data-sidebar="content"
                onClick={(e) => { if (e.target === e.currentTarget) { setSelectedFolder(null); setActiveFile(""); } }}
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
                          No files yet
                          <span className="mt-1 block text-[length:var(--font-hint)] opacity-60">
                            Open a project to get started
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
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => setEditing({ type: "file", parentPath: resolveCreateFolder() })}>
                <FilePlusCorner className="mr-2 size-4" />
                New File
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setEditing({ type: "folder", parentPath: resolveCreateFolder() })}>
                <FolderPlusIcon className="mr-2 size-4" />
                New Folder
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>

      </div>

      {/* ── Bottom status bar ── */}
      {(isGitRepo || activeWorktree) && (
        <div className="flex items-center gap-2 h-[var(--height-mode-selector)] px-3 shrink-0 text-[length:var(--font-size-12)] text-muted-foreground">
          {activeWorktree ? (
            <>
              {/* ── View switcher: worktree ↔ project ── */}
              {filesView === "worktree" ? (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded px-1 -ml-1 h-5 hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <SplitIcon className="size-3.5 shrink-0" />
                        <span className="truncate max-w-[100px]">{activeWorktree.name}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="w-44">
                      <DropdownMenuItem onClick={handleViewProject} className="cursor-pointer gap-2 text-xs">
                        <FolderOpenIcon className="size-3.5 shrink-0" />
                        <span>View Project Files</span>
                      </DropdownMenuItem>
                      {allWorktrees.filter((w) => w.name !== activeWorktree.name).length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          {allWorktrees
                            .filter((w) => w.name !== activeWorktree.name)
                            .map((w) => (
                              <DropdownMenuItem
                                key={w.name}
                                onClick={() => handleSwitchWorktree(w)}
                                className="cursor-pointer gap-2 text-xs"
                              >
                                <SplitIcon className="size-3.5 shrink-0" />
                                <span className="truncate">{w.name}</span>
                              </DropdownMenuItem>
                            ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
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
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="top" className="w-48 max-h-56 overflow-y-auto">
                        {activeWorktree?.baseBranch === gitBranch && (
                          <>
                            <DropdownMenuItem onClick={handleViewWorktree} className="cursor-pointer gap-2 text-xs">
                              <SplitIcon className="size-3.5 shrink-0" />
                              <span>View Worktree Files</span>
                            </DropdownMenuItem>
                            {branches.length > 0 && <DropdownMenuSeparator />}
                          </>
                        )}
                        {branches.map((b) => {
                          const isCurrent = b === gitBranch;
                          return (
                            <DropdownMenuItem
                              key={b}
                              onClick={() => handleSwitchBranch(b)}
                              disabled={isCurrent}
                              className="cursor-pointer gap-2 text-xs"
                            >
                              <GitBranchIcon
                                className={`size-3.5 shrink-0 ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}
                              />
                              <span className="truncate flex-1">{b}</span>
                              {isCurrent && <CheckIcon className="size-3.5 shrink-0" />}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
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
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="w-48 max-h-56 overflow-y-auto">
                    {branches.length === 0 ? (
                      <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                        No branches
                      </div>
                    ) : (
                      branches.map((b) => {
                        const isCurrent = b === gitBranch;
                        return (
                          <DropdownMenuItem
                            key={b}
                            onClick={() => handleSwitchBranch(b)}
                            disabled={isCurrent}
                            className="cursor-pointer gap-2 text-xs"
                          >
                            <GitBranchIcon
                              className={`size-3.5 shrink-0 ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}
                            />
                            <span className="truncate flex-1">{b}</span>
                            {isCurrent && <CheckIcon className="size-3.5 shrink-0" />}
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
            <DialogTitle>{isFolderRename ? "Rename Folder" : "Rename"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Input
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
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Folder Confirmation Dialog ─── */}
      <Dialog open={!!deleteDialog} onOpenChange={(o) => { if (!o) setDeleteDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                {deleteDialog?.workspaceFunc ? (
                  <>
                    <p className="text-sm">
                      This folder is configured as a{" "}
                      <strong>
                        {FOLDER_FUNCTION_ICONS[deleteDialog.workspaceFunc]}{" "}
                        {FOLDER_FUNCTION_LABELS[deleteDialog.workspaceFunc]}
                      </strong>{" "}
                      folder in your workspace settings. Deleting it will also
                      remove it from your workspace configuration.
                    </p>
                    {deleteDialog.workspaceFunc === "manuscript" &&
                      useWorkspaceConfigStore.getState().workspaceDirs.filter(
                        (d) => d.function === "manuscript",
                      ).length === 1 && (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          This is the only manuscript folder. Removing it will
                          disable TeX workspace features (editor + PDF preview).
                        </p>
                      )}
                  </>
                ) : (
                  <p className="text-sm">
                    Are you sure you want to permanently delete this folder
                    and all its contents?
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              <code className="text-destructive bg-destructive/10 px-1 rounded">
                {deleteDialog?.folderPath}/
              </code>{" "}
              and all files inside will be permanently deleted. This action
              cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteFolder}>
              Delete Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
