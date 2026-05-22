import { useState, useMemo } from "react";
import { useLayoutStore, type AppMode } from "@/stores/layout-store";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  GitBranchIcon,
  PlusIcon,
  FilePlusIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SIDEBAR_RIGHT_MIN, SIDEBAR_RIGHT_MAX } from "@/styles/constants";
import { buildFileTree, getFileIcon, type TreeNode } from "@/lib/file-tree";

type SidebarMode = Exclude<AppMode, "chat">;

const MODE_OPTIONS: { id: SidebarMode; label: string }[] = [
  { id: "manuscript", label: "Manuscript" },
  { id: "vault", label: "Vault" },
  { id: "zotero", label: "Zotero" },
  { id: "code", label: "Code" },
  { id: "assets", label: "Assets" },
  { id: "other", label: "Other" },
];

// Mode → project directory mapping
const MODE_DIR: Record<SidebarMode, string> = {
  manuscript: "manuscript",
  vault: "vault",
  zotero: "zotero",
  code: "code",
  assets: "assets",
  other: "other",
};

function filterFilesByMode(files: ProjectFile[], mode: SidebarMode): ProjectFile[] {
  const dir = MODE_DIR[mode];
  const prefix = `${dir}/`;
  return files
    .filter((f) => f.relativePath === dir || f.relativePath.startsWith(prefix))
    .map((f) => {
      // Strip mode directory prefix so the tree shows contents directly
      if (f.relativePath === dir) return { ...f, relativePath: f.relativePath.slice(dir.length + 1) };
      return f;
    });
}

function filterFoldersByMode(folders: string[], mode: SidebarMode): string[] {
  const dir = MODE_DIR[mode];
  const prefix = `${dir}/`;
  return folders
    .filter((f) => f === dir || f.startsWith(prefix))
    .map((f) => {
      // Strip mode directory prefix for tree root
      if (f === dir) return "";
      return f.slice(dir.length + 1);
    })
    .filter((f) => f !== ""); // Remove empty string (mode dir itself)
}

function FileTreeNodeRow({
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
  const isActive = node.type === "file" && node.relativePath === activeFileId;

  if (node.type === "folder") {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-auto py-1.5 my-px text-[length:var(--font-file-tree)]"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => onToggleFolder(node.relativePath)}
        >
          <ChevronRightIcon
            className={cn("size-3.5 shrink-0 transition-transform", isExpanded && "rotate-90")}
          />
          {isExpanded ? (
            <FolderOpenIcon className="size-3.5 shrink-0" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </Button>
        {isExpanded &&
          node.children.map((child) => (
            <FileTreeNodeRow
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          ))}
      </>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start h-auto py-1.5 my-px text-[length:var(--font-file-tree)]",
        isActive && "bg-accent text-accent-foreground hover:bg-accent/90",
      )}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={() => onSelectFile(node.relativePath, node.name)}
    >
      {node.file && getFileIcon(node.file)}
      <span className="truncate">{node.name}</span>
    </Button>
  );
}

// ─── File Tree ───

function FileTree() {
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

  if (tree.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="text-center text-[length:var(--font-empty-state)] leading-relaxed text-muted-foreground">
          No files yet
          <span className="mt-1 block text-[length:var(--font-hint)] opacity-60">Open a project to get started</span>
        </p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {tree.map((node) => (
        <FileTreeNodeRow
          key={node.relativePath}
          node={node}
          depth={0}
          activeFileId={activeFileId}
          expandedFolders={expandedFolders}
          onToggleFolder={(path) => {
            setExpandedFolders((prev) => {
              const next = new Set(prev);
              next.has(path) ? next.delete(path) : next.add(path);
              return next;
            });
          }}
          onSelectFile={(id, name) => {
            setActiveFile(id);
            openFile(id, id, name);
          }}
        />
      ))}
    </div>
  );
}

// ─── Git Tab ───

function GitTab() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <p className="text-center text-[length:var(--font-empty-state)] leading-relaxed text-muted-foreground">
        <GitBranchIcon className="size-6 mx-auto mb-2 opacity-40" />
        Git changes
        <span className="mt-1 block text-[length:var(--font-hint)] opacity-60">coming soon</span>
      </p>
    </div>
  );
}

// ─── RightSidebar ───

export function RightSidebar() {
  const rightToolbarTab = useLayoutStore((s) => s.rightToolbarTab);
  const activeMode = useLayoutStore((s) => s.activeMode);
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);
  const setRightSidebarWidth = useLayoutStore((s) => s.setRightSidebarWidth);

  const currentMode = MODE_OPTIONS.find((m) => m.id === activeMode) || MODE_OPTIONS[0];

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-card"
      style={{ width: rightSidebarWidth }}
    >
      {/* Resize handle — left edge */}
      <div
        className="absolute left-0 top-0 h-full w-[var(--layout-resize-handle)] cursor-col-resize hover:bg-primary/30 z-[var(--z-base)] transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = rightSidebarWidth;
          const onMove = (ev: MouseEvent) => {
            setRightSidebarWidth(Math.min(SIDEBAR_RIGHT_MAX, Math.max(SIDEBAR_RIGHT_MIN, startWidth + startX - ev.clientX)));
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      />

      {/* Mode selector — only for Files */}
      {rightToolbarTab === "files" && (
        <div className="flex h-[var(--height-mode-selector)] shrink-0 items-center justify-between border-b border-border px-3">
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
              {MODE_OPTIONS.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  className="text-[length:var(--font-toolbar-tab)]"
                  onClick={() => setActiveMode(m.id)}
                >
                  <span>{m.label}</span>
                  {activeMode === m.id && (
                    <span className="ml-auto text-[length:var(--font-badge)] text-muted-foreground">active</span>
                  )}
                </DropdownMenuItem>
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
                <DropdownMenuItem
                  key={m.id}
                  className="text-[length:var(--font-toolbar-tab)]"
                  disabled
                >
                  <FilePlusIcon className="size-3.5" />
                  <span>{m.label} file</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-y-auto px-2 py-1 gap-1">
        {rightToolbarTab === "files" && <FileTree />}
        {rightToolbarTab === "git" && <GitTab />}
      </div>
    </aside>
  );
}
