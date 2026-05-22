import { useState, useMemo } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  PlusIcon,
  FilePlusIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MODE_OPTIONS, type SidebarMode, filterFilesByMode, filterFoldersByMode } from "./shared";

// ─── File Tree Node ───

function FileTreeNode({
  node,
  depth,
  activeFileId,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (id: string, name: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.relativePath);

  if (node.type === "folder") {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          onClick={() => onToggleFolder(node.relativePath)}
          className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)]"
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
        {isExpanded && (
          <SidebarMenuSub className="border-l-0 mx-0 px-0 py-0 gap-0.5">
            {node.children.map((child) => (
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
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    );
  }

  const file = node.file!;
  const isActive = file.id === activeFileId;

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        size="sm"
        onClick={() => onSelectFile(file.id, file.name)}
        isActive={isActive}
        className="[&>svg]:!size-3 h-6 py-0.5 translate-x-0 text-[length:var(--font-size-12)]"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {getFileIcon(file)}
        <span className="truncate">{node.name}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

// ─── Files Header ───

function FilesHeader() {
  const activeMode = useLayoutStore((s) => s.activeMode);
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);
  const currentMode = MODE_OPTIONS.find((m) => m.id === activeMode) || MODE_OPTIONS[0];

  return (
    <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between border-b border-border px-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[length:var(--font-toolbar-tab)] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {currentMode.label}
            <ChevronRightIcon className="size-3 rotate-90 text-muted-foreground/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {MODE_OPTIONS.map((m, i) => (
            <div key={m.id}>
              <DropdownMenuItem className="text-xs" onClick={() => setActiveMode(m.id)}>
                <span>{m.label}</span>
                {activeMode === m.id && (
                  <span className="ml-auto text-[length:var(--font-badge)] text-muted-foreground">active</span>
                )}
              </DropdownMenuItem>
              {i === 0 && <DropdownMenuSeparator />}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="New file"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {MODE_OPTIONS.map((m) => (
            <DropdownMenuItem key={m.id} className="text-xs" disabled>
              <FilePlusIcon className="size-3.5" />
              <span>{m.label} file</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarHeader>
  );
}

// ─── Files Sidebar ───

export function FilesSidebar() {
  const activeMode = useLayoutStore((s) => s.activeMode);
  const allFiles = useDocumentStore((s) => s.files);
  const allFolders = useDocumentStore((s) => s.folders);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const openFile = useRightPanelStore((s) => s.openFile);

  const currentMode: SidebarMode = activeMode === "chat" ? "manuscript" : activeMode;
  const files = useMemo(() => filterFilesByMode(allFiles, currentMode), [allFiles, currentMode]);
  const folders = useMemo(() => filterFoldersByMode(allFolders, currentMode), [allFolders, currentMode]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(folders));
  const tree = useMemo(() => buildFileTree(files, folders), [files, folders]);

  return (
    <>
      <FilesHeader />
      <SidebarContent className="px-1.5 py-1" onClick={(e) => { if (e.target === e.currentTarget) setActiveFile(""); }}>
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
            {tree.map((node) => (
              <FileTreeNode
                key={node.relativePath}
                node={node}
                depth={0}
                activeFileId={activeFileId}
                expandedFolders={expandedFolders}
                onToggleFolder={(path) =>
                  setExpandedFolders((prev) => {
                    const next = new Set(prev);
                    next.has(path) ? next.delete(path) : next.add(path);
                    return next;
                  })
                }
                onSelectFile={(id, name) => {
                  setActiveFile(id);
                  openFile(id, id, name);
                }}
              />
            ))}
          </SidebarMenu>
        )}
      </SidebarContent>
    </>
  );
}
