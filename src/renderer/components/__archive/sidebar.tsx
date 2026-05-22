import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  FileCodeIcon,
  FileIcon,
  FileSpreadsheetIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ListIcon,
  HashIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  PlusIcon,
  FolderPlusIcon,
  UploadIcon,
  PencilIcon,
  Trash2Icon,
  HomeIcon,
} from "lucide-react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useTheme } from "next-themes";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { TOC_PARSE_DEBOUNCE } from "@/styles/constants";
import { Input } from "@/components/ui/input";

// ─── File Icon ───

function getFileIcon(file: ProjectFile) {
  if (file.type === "image") return <ImageIcon className="size-4 shrink-0" />;
  if (file.type === "pdf")
    return <FileSpreadsheetIcon className="size-4 shrink-0" />;
  if (file.type === "style")
    return <FileCodeIcon className="size-4 shrink-0" />;
  if (file.type === "other") return <FileIcon className="size-4 shrink-0" />;
  return <FileTextIcon className="size-4 shrink-0" />;
}

// ─── Table of Contents Parser ───

interface TocItem {
  level: number;
  title: string;
  line: number;
}

function parseTableOfContents(content: string): TocItem[] {
  const lines = content.split("\n");
  const toc: TocItem[] = [];
  const sectionRegex =
    /\\(section|subsection|subsubsection|chapter|part)\*?\s*\{([^}]*)\}/;
  const levelMap: Record<string, number> = {
    part: 0,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = line.match(sectionRegex);
    if (match) {
      const [, type, title] = match;
      toc.push({
        level: levelMap[type] ?? 2,
        title: title.trim(),
        line: index + 1,
      });
    }
  }
  return toc;
}

// ─── File Tree Builder ───

interface TreeNode {
  name: string;
  relativePath: string;
  type: "folder" | "file";
  file?: ProjectFile;
  children: TreeNode[];
}

function buildFileTree(files: ProjectFile[], folders: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  function getOrCreateFolder(path: string): TreeNode[] {
    if (!path) return root;
    if (folderMap.has(path)) return folderMap.get(path)!.children;

    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parentChildren = getOrCreateFolder(parentPath);

    const folder: TreeNode = {
      name,
      relativePath: path,
      type: "folder",
      children: [],
    };
    folderMap.set(path, folder);
    parentChildren.push(folder);
    return folder.children;
  }

  for (const folderPath of folders) {
    getOrCreateFolder(folderPath);
  }

  for (const file of files) {
    const parts = file.relativePath.split("/");
    const fileName = parts[parts.length - 1];
    const folderPath = parts.slice(0, -1).join("/");
    const parentChildren = getOrCreateFolder(folderPath);

    parentChildren.push({
      name: fileName,
      relativePath: file.relativePath,
      type: "file",
      file,
      children: [],
    });
  }

  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.type === "folder") sortNodes(node.children);
    }
  }
  sortNodes(root);

  return root;
}

// ─── File Tree Node ───

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (id: string) => void;
  fileCount: number;
  dirtyFiles: Set<string>;
  onNewFile: (folder?: string) => void;
  onNewFolder: (parent?: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDeleteFolder: (folderPath: string) => void;
}

const FileTreeNode = ({
  node,
  depth,
  activeFileId,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  fileCount,
  dirtyFiles,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onDeleteFolder,
}: FileTreeNodeProps) => {
  if (node.type === "folder") {
    const isExpanded = expandedFolders.has(node.relativePath);

    return (
      <div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[length:var(--font-file-tree-node)] transition-colors hover:bg-sidebar-accent/50"
              style={{ paddingLeft: `${depth * 16 + 4}px` }}
              onClick={() => onToggleFolder(node.relativePath)}
            >
              {isExpanded ? (
                <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <FolderIcon className="size-4 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => onNewFile(node.relativePath)}>
              <FileTextIcon className="mr-2 size-4" />
              New File Here
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onNewFolder(node.relativePath)}>
              <FolderPlusIcon className="mr-2 size-4" />
              New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onRename(node.relativePath, node.name)}
            >
              <PencilIcon className="mr-2 size-4" />
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onClick={() => onDeleteFolder(node.relativePath)}
            >
              <Trash2Icon className="mr-2 size-4" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {isExpanded &&
          node.children.map((child) => (
            <FileTreeNode
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
              fileCount={fileCount}
              dirtyFiles={dirtyFiles}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onRename={onRename}
              onDelete={onDelete}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
      </div>
    );
  }

  const file = node.file!;
  const isActive = file.id === activeFileId;
  const isDirty = dirtyFiles.has(file.id);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[length:var(--font-file-tree-node)] transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/50",
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onSelectFile(file.id)}
        >
          {getFileIcon(file)}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {isDirty && (
            <span
              className="ml-auto size-2 shrink-0 rounded-full bg-blue-500"
              title="Modified"
            />
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onRename(file.id, file.name)}>
          <PencilIcon className="mr-2 size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onClick={() => onDelete(file.id)}
        >
          <Trash2Icon className="mr-2 size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

// ─── Sidebar ───

export function Sidebar() {
  // Only subscribe to metadata, not content
  const files = useDocumentStore((s) => s.files);
  const folders = useDocumentStore((s) => s.folders);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const deleteFile = useDocumentStore((s) => s.deleteFile);
  const deleteFolder = useDocumentStore((s) => s.deleteFolder);
  const renameFile = useDocumentStore((s) => s.renameFile);
  const createNewFile = useDocumentStore((s) => s.createNewFile);
  const createFolder = useDocumentStore((s) => s.createFolder);
  const requestJumpToPosition = useDocumentStore((s) => s.requestJumpToPosition);
  const fileContents = useDocumentStore((s) => s.fileContents);

  const { theme, setTheme } = useTheme();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );

  // Build file tree - only depends on files/folders metadata
  const tree = useMemo(() => buildFileTree(files, folders), [files, folders]);

  // Build dirty files set from fileContents
  const dirtyFiles = useMemo(() => {
    const dirty = new Set<string>();
    fileContents.forEach((value, key) => {
      if (value.isDirty) dirty.add(key);
    });
    return dirty;
  }, [fileContents]);

  // Get active file content for TOC - use ref to avoid subscription
  const activeFileContentRef = useRef("");
  useEffect(() => {
    if (activeFileId) {
      activeFileContentRef.current = useDocumentStore.getState().getContent(activeFileId);
    }
  }, [activeFileId]);

  // TOC parsing with debounce
  const [toc, setToc] = useState<TocItem[]>([]);
  const tocTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (tocTimeoutRef.current) {
      clearTimeout(tocTimeoutRef.current);
    }
    tocTimeoutRef.current = window.setTimeout(() => {
      const content = activeFileId ? useDocumentStore.getState().getContent(activeFileId) : "";
      setToc(parseTableOfContents(content));
    }, TOC_PARSE_DEBOUNCE);
    return () => {
      if (tocTimeoutRef.current) {
        clearTimeout(tocTimeoutRef.current);
      }
    };
  }, [activeFileId, fileContents]);

  // Auto-expand parent folders of active file
  useEffect(() => {
    if (!activeFileId) return;
    const parts = activeFileId.split("/");
    if (parts.length <= 1) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (let i = 1; i < parts.length; i++) {
        const folder = parts.slice(0, i).join("/");
        if (!next.has(folder)) {
          next.add(folder);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeFileId]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleTocClick = useCallback(
    (line: number) => {
      const content = activeFileId ? useDocumentStore.getState().getContent(activeFileId) : "";
      const lines = content.split("\n");
      let position = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i++) {
        position += lines[i].length + 1;
      }
      requestJumpToPosition(position);
    },
    [activeFileId, requestJumpToPosition],
  );

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogFolder, setAddDialogFolder] = useState<string | undefined>();
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParent, setFolderDialogParent] = useState<
    string | undefined
  >();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [nameError, setNameError] = useState("");

  const isCaseInsensitiveFs =
    navigator.platform.startsWith("Mac") ||
    navigator.platform.startsWith("Win");

  const nameExistsIn = useCallback(
    (name: string, folder?: string) => {
      const targetPath = folder ? `${folder}/${name}` : name;
      const cmp = (a: string, b: string) =>
        isCaseInsensitiveFs ? a.toLowerCase() === b.toLowerCase() : a === b;
      const existsAsFile = files.some((f) => cmp(f.relativePath, targetPath));
      const existsAsFolder = folders.some((f) => cmp(f, targetPath));
      return existsAsFile || existsAsFolder;
    },
    [files, folders, isCaseInsensitiveFs],
  );

  const handleAddFile = async () => {
    const name = newFileName.trim();
    if (!name) return;
    if (nameExistsIn(name, addDialogFolder)) {
      setNameError("A file or folder with this name already exists");
      return;
    }
    const finalName = /\.\w+$/.test(name) ? name : `${name}.tex`;
    const lower = finalName.toLowerCase();
    const type: "tex" | "image" = /\.(png|jpg|jpeg|gif|svg|bmp|webp)$/.test(
      lower,
    )
      ? "image"
      : "tex";
    try {
      await createNewFile(finalName, type, addDialogFolder);
      setNewFileName("");
      setNameError("");
      setAddDialogOpen(false);
      setAddDialogFolder(undefined);
    } catch {
      // Error already handled in store
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (nameExistsIn(name, folderDialogParent)) {
      setNameError("A file or folder with this name already exists");
      return;
    }
    try {
      await createFolder(name, folderDialogParent);
      setNewFolderName("");
      setNameError("");
      setFolderDialogOpen(false);
      setFolderDialogParent(undefined);
    } catch {
      // Error already handled in store
    }
  };

  const openRenameDialog = (id: string, name: string) => {
    setRenameFileId(id);
    setRenameValue(name);
    setNameError("");
    setRenameDialogOpen(true);
  };

  const openNewFileDialog = (folder?: string) => {
    setAddDialogFolder(folder);
    setNewFileName("");
    setNameError("");
    setAddDialogOpen(true);
  };

  const openNewFolderDialog = (parent?: string) => {
    setFolderDialogParent(parent);
    setNewFolderName("");
    setNameError("");
    setFolderDialogOpen(true);
  };

  const handleRename = async () => {
    const name = renameValue.trim();
    if (!renameFileId || !name) return;
    const file = files.find((f) => f.id === renameFileId);
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
      await renameFile(renameFileId, name);
      setRenameDialogOpen(false);
      setRenameFileId(null);
      setRenameValue("");
      setNameError("");
    } catch {
      // Error already handled in store
    }
  };

  const closeProject = useDocumentStore((s) => s.closeProject);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header - macOS drag region */}
      <div className="drag-region relative flex h-[var(--height-sidebar-brand)] items-center justify-center border-sidebar-border border-b px-3">
        <div className="flex flex-col items-center">
          <span className="font-semibold text-[length:var(--font-file-tree-node)]">Prism</span>
          <span className="text-muted-foreground text-[length:var(--font-sidebar-footer)]">
            {projectRoot?.split(/[/\\]/).pop() || "Desktop"}
          </span>
        </div>
        <div className="absolute right-3 flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={closeProject}
            title="Close Project"
          >
            <HomeIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Resizable sections */}
      <Group id="sidebar-panels" orientation="vertical" className="min-h-0 flex-1 overflow-hidden">
        {/* Files */}
        <Panel id="files" defaultSize="60%" minSize="15%">
          <div className="flex min-h-0 h-full flex-col">
            <div className="relative flex h-[var(--height-files-header)] shrink-0 items-center justify-center border-sidebar-border border-b px-3">
              <div className="flex items-center gap-2">
                <FolderIcon className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-[length:var(--font-sidebar-section)]">Files</span>
              </div>
              <div className="absolute right-3 flex items-center gap-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      title="Add"
                    >
                      <PlusIcon className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openNewFileDialog()}>
                      <FileTextIcon className="mr-2 size-4" />
                      New LaTeX File
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openNewFolderDialog()}>
                      <FolderPlusIcon className="mr-2 size-4" />
                      New Folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { /* TODO: Import file in Step 3 */ }}>
                      <UploadIcon className="mr-2 size-4" />
                      Import File
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <ContextMenu>
              <ContextMenuTrigger asChild>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="p-1">
                    {tree.map((node) => (
                      <FileTreeNode
                        key={node.relativePath}
                        node={node}
                        depth={0}
                        activeFileId={activeFileId}
                        expandedFolders={expandedFolders}
                        onToggleFolder={toggleFolder}
                        onSelectFile={(id) => setActiveFile(id)}
                        fileCount={files.length}
                        dirtyFiles={dirtyFiles}
                        onNewFile={openNewFileDialog}
                        onNewFolder={openNewFolderDialog}
                        onRename={openRenameDialog}
                        onDelete={deleteFile}
                        onDeleteFolder={deleteFolder}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => openNewFileDialog()}>
                  <FileTextIcon className="mr-2 size-4" />
                  New File
                </ContextMenuItem>
                <ContextMenuItem onClick={() => openNewFolderDialog()}>
                  <FolderPlusIcon className="mr-2 size-4" />
                  New Folder
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </Panel>

        <Separator id="files-outline-sep" className="bg-sidebar-border hover:bg-ring" />

        {/* Outline */}
        <Panel id="outline" defaultSize="40%" minSize="10%">
          <div className="flex min-h-0 h-full flex-col">
            <div className="flex h-[var(--height-files-header)] shrink-0 items-center justify-center gap-2 px-3">
              <ListIcon className="size-3.5 text-muted-foreground" />
              <span className="font-medium text-[length:var(--font-sidebar-section)]">Outline</span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-1">
                {toc.length > 0 ? (
                  toc.map((item, index) => (
                    <button
                      key={index}
                      type="button"
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[length:var(--font-toc-item)] transition-colors hover:bg-sidebar-accent/50"
                      style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                      onClick={() => handleTocClick(item.line)}
                    >
                      <HashIcon className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-1 text-muted-foreground text-[length:var(--font-empty-state)]">
                    No sections found
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </Panel>
      </Group>

      {/* Footer */}
      <div className="flex items-center justify-between border-sidebar-border border-t px-3 py-2 text-muted-foreground text-[length:var(--font-sidebar-footer)]">
        <span className="truncate">Prism v0.1.0</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={() => {
            if (theme === "system") setTheme("light");
            else if (theme === "light") setTheme("dark");
            else setTheme("system");
          }}
          title={
            theme === "system"
              ? "System theme"
              : theme === "light"
                ? "Light mode"
                : "Dark mode"
          }
        >
          {theme === "system" ? (
            <MonitorIcon className="size-3.5" />
          ) : theme === "light" ? (
            <SunIcon className="size-3.5" />
          ) : (
            <MoonIcon className="size-3.5" />
          )}
        </Button>
      </div>

      {/* New File Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              New File{addDialogFolder ? ` in ${addDialogFolder}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Input
              placeholder="filename.tex"
              value={newFileName}
              onChange={(e) => {
                setNewFileName(e.target.value);
                setNameError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddFile();
              }}
              autoFocus
            />
            {nameError && (
              <p className="text-destructive text-[length:var(--font-error)]">{nameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddFile} disabled={!newFileName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              New Folder
              {folderDialogParent ? ` in ${folderDialogParent}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Input
              placeholder="folder name"
              value={newFolderName}
              onChange={(e) => {
                setNewFolderName(e.target.value);
                setNameError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
              autoFocus
            />
            {nameError && (
              <p className="text-destructive text-[length:var(--font-error)]">{nameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFolderDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Input
              value={renameValue}
              onChange={(e) => {
                setRenameValue(e.target.value);
                setNameError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
              autoFocus
            />
            {nameError && (
              <p className="text-destructive text-[length:var(--font-error)]">{nameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
