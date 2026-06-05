import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useIsTexworkspace } from "@/components/modules/texworkspace-mode";
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  FilePlusCorner,
  FolderPlusIcon,
  PencilIcon,
  Trash2Icon,
  FileTextIcon,
  FoldVerticalIcon,
  UnfoldVerticalIcon,
  RefreshCwIcon,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildFileTree, getFileIcon, type TreeNode } from "@/lib/file-tree";

import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { MODE_DIR, type SidebarMode, filterFilesByMode, filterFoldersByMode } from "./shared";
import { Icon } from "@iconify/react";
import { getFileIconName } from "@/lib/file-icon-class";
import { FolderPenIcon } from "lucide-react";

// ─── Inline New Node ───

function InlineNewNode({
  type,
  depth,
  parentPath,
  onCreated,
  onCancel,
}: {
  type: "file" | "folder";
  depth: number;
  parentPath?: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  const createNewFile = useDocumentStore((s) => s.createNewFile);
  const createFolder = useDocumentStore((s) => s.createFolder);

  const committingRef = useRef(false);

  const commit = useCallback(async () => {
    if (committingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) { onCancel(); return; }
    committingRef.current = true;
    try {
      if (type === "file") {
        await createNewFile(trimmed, undefined, parentPath);
        const relativePath = parentPath ? `${parentPath}/${trimmed}` : trimmed;
        useDocumentStore.getState().setActiveFile(relativePath);
        useRightPanelStore.getState().openFile(relativePath, relativePath, trimmed);
      } else {
        await createFolder(trimmed, parentPath);
      }
    } catch { /* error handled in store */ }
    committingRef.current = false;
    onCreated();
  }, [name, type, parentPath, createNewFile, createFolder, onCreated, onCancel]);

  const iconName = type === "file" ? getFileIconName(name || "file") : null;

  return (
    <SidebarMenuSubItem>
      <div
        className="flex h-6 items-center gap-2 rounded-sm px-2 text-[length:var(--font-size-12)]"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {type === "file" && iconName ? (
          <Icon icon={iconName} className="size-3.5 shrink-0" />
        ) : (
          <FolderIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
        <Input
          autoFocus
          value={name}
          placeholder={type === "file" ? "filename.ext" : "folder name"}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
          onBlur={commit}
          className="h-5 flex-1 min-w-0 rounded-none border-0 !bg-transparent p-0 text-[length:var(--font-size-12)] text-muted-foreground outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    </SidebarMenuSubItem>
  );
}

// ─── File Tree Node ───

interface FileTreeNodeCallbacks {
  onNewFile: (folderPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRenameFile: (fileId: string, name: string) => void;
  onDeleteFile: (fileId: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onRenameFolder: (folderPath: string, name: string) => void;
}

function FileTreeNode({
  node,
  depth,
  activeFileId,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  callbacks,
  dirtyFiles,
  gitStatusMap,
  selectedFolder,
  onSelectFolder,
  editing,
  onEditingDone,
}: {
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (id: string, name: string) => void;
  callbacks: FileTreeNodeCallbacks;
  dirtyFiles: Set<string>;
  gitStatusMap: Map<string, {
    isDeleted: boolean;
    isStagedOnly: boolean;
    isUnstaged: boolean;
    isUntracked: boolean;
  }>;
  selectedFolder: string | null;
  onSelectFolder: (path: string) => void;
  editing: { type: "file" | "folder"; parentPath?: string } | null;
  onEditingDone: () => void;
}) {
  const isExpanded = expandedFolders.has(node.relativePath);

  if (node.type === "folder") {
    const isSelected = selectedFolder === node.relativePath;
    return (
      <SidebarMenuItem>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div>
              <SidebarMenuButton
                size="sm"
                onClick={() => {
                  onToggleFolder(node.relativePath);
                  onSelectFolder(node.relativePath);
                }}
                className={cn(
                  "[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground",
                  isSelected && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
                style={{ paddingLeft: 8 + depth * 16 }}
              >
                <ChevronRightIcon
                  className={cn(
                    "size-3 shrink-0 text-muted-foreground transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
                {isExpanded ? (
                  <FolderOpenIcon className="size-3 shrink-0" />
                ) : (
                  <FolderIcon className="size-3 shrink-0" />
                )}
                <span className="truncate">{node.name}</span>
              </SidebarMenuButton>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => callbacks.onNewFile(node.relativePath)}>
              <FileTextIcon className="mr-2 size-4" />
              New File Here
            </ContextMenuItem>
            <ContextMenuItem onClick={() => callbacks.onNewFolder(node.relativePath)}>
              <FolderPlusIcon className="mr-2 size-4" />
              New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => callbacks.onRenameFolder(node.relativePath, node.name)}>
              <PencilIcon className="mr-2 size-4" />
              Rename
            </ContextMenuItem>
            <ContextMenuItem onClick={() => callbacks.onDeleteFolder(node.relativePath)}>
              <Trash2Icon className="mr-2 size-4" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {isExpanded && (node.children.length > 0 || editing?.parentPath === node.relativePath) && (
          <SidebarMenuSub className="border-l-0 mx-0 px-0 pt-0.5 pb-0 gap-0.5">
            {editing?.parentPath === node.relativePath && (
              <InlineNewNode
                type={editing.type}
                depth={depth + 1}
                parentPath={node.relativePath}
                onCreated={onEditingDone}
                onCancel={onEditingDone}
              />
            )}
            {node.children.map((child) => (
              <FileTreeNode
                key={child.relativePath}
                node={child}
                depth={depth + 1}
                activeFileId={activeFileId}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
                callbacks={callbacks}
                dirtyFiles={dirtyFiles}
                gitStatusMap={gitStatusMap}
                selectedFolder={selectedFolder}
                onSelectFolder={onSelectFolder}
                editing={editing}
                onEditingDone={onEditingDone}
              />
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    );
  }

  const file = node.file!;
  const isActive = file.id === activeFileId;
  const isDirty = dirtyFiles.has(file.id);

  // Git status coloring — multi-level fallback lookup:
  //   1. file.id (full project-relative path)
  //   2. file.relativePath (mode-stripped path)
  //   3. Filename suffix match (last resort)
  const gitStatusDirect = gitStatusMap.get(file.id);
  const gitStatusByRelPath = gitStatusDirect !== undefined
    ? gitStatusDirect
    : gitStatusMap.get(file.relativePath);
  const gitStatus = gitStatusByRelPath !== undefined
    ? gitStatusByRelPath
    : (() => {
        // Last resort: match by filename (last path segment)
        for (const [key, val] of gitStatusMap) {
          if (key === file.name || key.endsWith("/" + file.name)) {
            return val;
          }
        }
        return undefined;
      })();

  const gitFileNameStyle: React.CSSProperties | undefined = gitStatus?.isDeleted
    ? { color: "var(--destructive)", textDecoration: "line-through" }
    : gitStatus?.isStagedOnly
      ? { color: "var(--success)" }
      : gitStatus?.isUnstaged || gitStatus?.isUntracked
        ? { color: "var(--warning)" }
        : undefined;

  return (
    <SidebarMenuSubItem>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>
            <SidebarMenuSubButton
              size="sm"
              onClick={() => onSelectFile(file.id, file.name)}
              isActive={isActive}
              className="[&>svg]:!size-3 h-6 py-0.5 translate-x-0 text-[length:var(--font-size-12)] text-muted-foreground rounded-sm"
              style={{ paddingLeft: 8 + depth * 16 }}
            >
              {getFileIcon(file)}
              <span
                className="truncate"
                style={gitFileNameStyle}
                title={
                  gitStatus
                    ? gitStatus.isStagedOnly
                      ? "Staged"
                      : gitStatus.isUnstaged
                        ? "Modified"
                        : gitStatus.isUntracked
                          ? "Untracked"
                          : gitStatus.isDeleted
                            ? "Deleted"
                            : ""
                    : undefined
                }
              >
                {node.name}
              </span>
              {isDirty && (
                <span className="ml-auto size-2 shrink-0 rounded-full bg-info" title="Unsaved changes" />
              )}
            </SidebarMenuSubButton>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => callbacks.onRenameFile(file.id, file.name)}>
            <PencilIcon className="mr-2 size-4" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => callbacks.onDeleteFile(file.id)}>
            <Trash2Icon className="mr-2 size-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuSubItem>
  );
}

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
  const activeMode = useLayoutStore((s) => s.activeMode);
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const allFiles = useDocumentStore((s) => s.files);
  const allFolders = useDocumentStore((s) => s.folders);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const fileContents = useDocumentStore((s) => s.fileContents);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
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
          rps.closeTab(t.id);
        }
      }
      deleteFile(fileId);
    },
    [deleteFile],
  );

  // Delete folder AND close any tabs viewing files inside it
  const handleDeleteFolder = useCallback(
    (folderPath: string) => {
      if (!window.confirm(`Delete folder "${folderPath}" and all contents?`)) return;
      const rps = useRightPanelStore.getState();
      const prefix = `${folderPath}/`;
      for (const t of rps.tabs) {
        if (t.fileId?.startsWith(prefix) || t.filePath?.startsWith(prefix)) {
          rps.closeTab(t.id);
        }
      }
      deleteFolder(folderPath);
    },
    [deleteFolder],
  );

  const isTexworkspaceActive = useIsTexworkspace();
  const currentMode: SidebarMode = isTexworkspaceActive ? "manuscript" : activeMode === "chat" ? "all" : activeMode;
  const files = useMemo(() => filterFilesByMode(allFiles, currentMode), [allFiles, currentMode]);
  const folders = useMemo(() => filterFoldersByMode(allFolders, currentMode), [allFolders, currentMode]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const tree = useMemo(() => buildFileTree(files, folders), [files, folders]);
  const dirtyFiles = useMemo(() => {
    const dirty = new Set<string>();
    fileContents.forEach((v, k) => { if (v.isDirty) dirty.add(k); });
    return dirty;
  }, [fileContents]);

  // ─── Multi-unit Git status — independent from Zustand useGitStore ───
  // Scans ALL top-level folders for .git repos and fetches status for each,
  // building a unified map keyed by project-relative file path.
  // This works regardless of which unit the Git panel has selected.

  const topFolders = useMemo(
    () => allFolders.filter((f) => !f.includes("/")).sort(),
    [allFolders],
  );

  const [gitStatusMap, setGitStatusMap] = useState<
    Map<string, { isDeleted: boolean; isStagedOnly: boolean; isUnstaged: boolean; isUntracked: boolean }>
  >(new Map());

  const doFetchGitStatus = useCallback(async () => {
    if (!projectRoot) return;
    const combined = new Map<string, { isDeleted: boolean; isStagedOnly: boolean; isUnstaged: boolean; isUntracked: boolean }>();

    const addGitFiles = (
      files: Array<{ path: string; staged: boolean; unstaged: boolean; untracked: boolean; worktreeStatus: string; indexStatus: string }>,
      pathPrefix: string,
    ) => {
      for (const f of files) {
        const isDeleted = f.worktreeStatus === "D" || f.indexStatus === "D";
        const isStagedOnly = f.staged && !f.unstaged;
        const isUnstaged = f.unstaged;
        const isUntracked = f.untracked;
        const key = pathPrefix ? `${pathPrefix}/${f.path}` : f.path;
        const existing = combined.get(key);
        if (existing) {
          if (isUnstaged) existing.isStagedOnly = false;
          existing.isUnstaged = existing.isUnstaged || isUnstaged;
          existing.isUntracked = existing.isUntracked || isUntracked;
          existing.isDeleted = existing.isDeleted || isDeleted;
        } else {
          combined.set(key, { isStagedOnly, isUnstaged, isUntracked, isDeleted });
        }
      }
    };

    // 1) Check if projectRoot itself is a git repo
    try {
      const rootIsRepo = await window.electronAPI.gitIsRepo(projectRoot);
      if (rootIsRepo) {
        const status = await window.electronAPI.gitStatus(projectRoot);
        addGitFiles(status.files, "");
      }
    } catch { /* not a repo or error */ }

    // 2) Scan top-level subfolders for independent git repos
    for (const folder of topFolders) {
      const unitPath = `${projectRoot}/${folder}`;
      try {
        const dotGitExists = await window.electronAPI.fsExists(`${unitPath}/.git`);
        if (!dotGitExists) continue;
        const status = await window.electronAPI.gitStatus(unitPath);
        // Git paths are relative to the unit; prefix with folder name
        addGitFiles(status.files, folder);
      } catch { /* skip unreadable units */ }
    }

    setGitStatusMap(combined);
  }, [projectRoot, topFolders]);

  // Initial fetch + refetch when topFolders or projectRoot change
  useEffect(() => {
    doFetchGitStatus();
  }, [doFetchGitStatus]);

  // Auto-refresh after files change on disk (debounced 1.5 s)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!projectRoot) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      doFetchGitStatus();
    }, 1500);
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [allFiles, projectRoot, doFetchGitStatus]);

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


  // ─── Breadcrumb navigation ───
  const fileTreeNavigatePath = useLayoutStore((s) => s.fileTreeNavigatePath);
  const setFileTreeNavigatePath = useLayoutStore((s) => s.setFileTreeNavigatePath);

  useEffect(() => {
    if (fileTreeNavigatePath === null) return;

    let targetPath = fileTreeNavigatePath;

    if (currentMode !== "all") {
      const prefix = `${MODE_DIR[currentMode]}/`;
      if (targetPath.startsWith(prefix)) {
        targetPath = targetPath.slice(prefix.length);
      } else if (targetPath === MODE_DIR[currentMode]) {
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

    setFileTreeNavigatePath(null);
  }, [fileTreeNavigatePath, currentMode, persistedExpanded, setPersistedExpanded, setFileTreeNavigatePath]);

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
      if (!modeFolderPath) return MODE_DIR[currentMode];
      if (currentMode === "all") return modeFolderPath;
      return `${MODE_DIR[currentMode]}/${modeFolderPath}`;
    },
    [currentMode],
  );

  // ─── Inline editing ───
  const [editing, setEditing] = useState<{ type: "file" | "folder"; parentPath?: string } | null>(null);

  // ─── Rename dialog ───
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [isFolderRename, setIsFolderRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [nameError, setNameError] = useState("");

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

  // ─── File tree callbacks ───

  const treeCallbacks: FileTreeNodeCallbacks = {
    onNewFile: (path) => setEditing({ type: "file", parentPath: resolveCreateFolder(path) }),
    onNewFolder: (path) => setEditing({ type: "folder", parentPath: resolveCreateFolder(path) }),
    onRenameFile: openRenameDialog,
    onDeleteFile: handleDeleteFile,
    onDeleteFolder: handleDeleteFolder,
    onRenameFolder: openFolderRenameDialog,
  };

  const headerCallbacks: FilesHeaderCallbacks = {
    onNewFile: () => setEditing({ type: "file", parentPath: resolveCreateFolder(selectedFolder ?? undefined) }),
    onNewFolder: () => setEditing({ type: "folder", parentPath: resolveCreateFolder(selectedFolder ?? undefined) }),
  };

  return (
    <>
      <FilesHeader
        projectName={projectRoot?.split(/[/\\]/).pop()}
        callbacks={headerCallbacks}
        anyExpanded={anyExpanded}
        onToggleAll={handleToggleAll}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {/* ─── File tree ─── */}
        <div className="flex-1 min-h-0">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="h-full" onClick={(e) => { if (e.target === e.currentTarget) setSelectedFolder(null); }}>
                <SidebarContent className="px-1.5 py-1">
                  {tree.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-4 py-8">
                      <p className="text-center text-[length:var(--font-empty-state)] leading-relaxed text-muted-foreground">
                        No files yet
                        <span className="mt-1 block text-[length:var(--font-hint)] opacity-60">
                          Open a project to get started
                        </span>
                      </p>
                    </div>
                  ) : (
                    <SidebarMenu className="gap-0.5">
                      {editing && !editing.parentPath && (
                        <InlineNewNode
                          type={editing.type}
                          depth={0}
                          parentPath={undefined}
                          onCreated={() => setEditing(null)}
                          onCancel={() => setEditing(null)}
                        />
                      )}
                      {tree.map((node) => (
                        <FileTreeNode
                          key={node.relativePath}
                          node={node}
                          depth={0}
                          activeFileId={activeFileId}
                          expandedFolders={expandedFolders}
                          onToggleFolder={handleToggleFolder}
                          onSelectFile={(id, name) => {
                            setSelectedFolder(null);
                            if (isTexworkspaceActive) {
                              openTexworkspaceFile(id, id, name);
                            } else {
                              setActiveFile(id);
                              openFile(id, id, name);
                            }
                          }}
                          callbacks={treeCallbacks}
                          dirtyFiles={dirtyFiles}
                          gitStatusMap={gitStatusMap}
                          selectedFolder={selectedFolder}
                          onSelectFolder={(path) => setSelectedFolder(path)}
                          editing={editing}
                          onEditingDone={() => setEditing(null)}
                        />
                      ))}
                    </SidebarMenu>
                  )}
                </SidebarContent>
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
    </>
  );
}
