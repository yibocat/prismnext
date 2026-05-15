import { useState, useCallback, useMemo, useEffect } from "react";
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
} from "lucide-react";
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
  lines.forEach((line, index) => {
    const match = line.match(sectionRegex);
    if (match) {
      const [, type, title] = match;
      toc.push({
        level: levelMap[type] ?? 2,
        title: title.trim(),
        line: index + 1,
      });
    }
  });
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

function buildFileTree(files: ProjectFile[]): TreeNode[] {
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
}

function FileTreeNode({
  node,
  depth,
  activeFileId,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: FileTreeNodeProps) {
  if (node.type === "folder") {
    const isExpanded = expandedFolders.has(node.relativePath);

    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-sidebar-accent/50"
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
            />
          ))}
      </div>
    );
  }

  const file = node.file!;
  const isActive = file.id === activeFileId;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/50",
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={() => onSelectFile(file.id)}
    >
      {getFileIcon(file)}
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
    </button>
  );
}

// ─── Sidebar ───

export function Sidebar() {
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const activeFileContent = useDocumentStore((s) => {
    const active = s.files.find((f) => f.id === s.activeFileId);
    return active?.content ?? "";
  });

  const { theme, setTheme } = useTheme();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );

  // Build file tree
  const tree = useMemo(() => buildFileTree(files), [files]);

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

  // Parse outline
  const toc = useMemo(
    () => parseTableOfContents(activeFileContent),
    [activeFileContent],
  );

  const handleTocClick = useCallback(
    (line: number) => {
      // Since we don't have jumpToPosition yet, dispatch a custom event
      const lines = activeFileContent.split("\n");
      let position = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i++) {
        position += lines[i].length + 1;
      }
      // TODO: wire jumpToPosition through document store
      window.dispatchEvent(
        new CustomEvent("prism:jump-to-position", { detail: { position } }),
      );
    },
    [activeFileContent],
  );

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="relative flex h-12 items-center justify-center border-sidebar-border border-b px-3 pt-[var(--titlebar-height)]">
        <div className="flex flex-col items-center">
          <span className="font-semibold text-sm">Prism Next</span>
          <span className="text-muted-foreground text-xs">Desktop</span>
        </div>
      </div>

      {/* Files section */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-between border-sidebar-border border-b px-3">
          <div className="flex items-center gap-2">
            <FolderIcon className="size-3.5 text-muted-foreground" />
            <span className="font-medium text-xs">Files</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              title="New File"
            >
              <PlusIcon className="size-3" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
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
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Outline section */}
      <div className="flex min-h-0 flex-1 flex-col border-sidebar-border border-t">
        <div className="flex h-8 shrink-0 items-center gap-2 px-3">
          <ListIcon className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-xs">Outline</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1">
            {toc.length > 0 ? (
              toc.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-sidebar-accent/50"
                  style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                  onClick={() => handleTocClick(item.line)}
                >
                  <HashIcon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.title}</span>
                </button>
              ))
            ) : (
              <div className="px-2 py-1 text-muted-foreground text-xs">
                No sections found
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-sidebar-border border-t px-3 py-2 text-muted-foreground text-xs">
        <span className="truncate">Prism Next v0.1.0</span>
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
    </div>
  );
}
