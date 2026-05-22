import { useState, useMemo } from "react";
import { useLayoutStore, type AppMode } from "@/stores/layout-store";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  GitBranchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildFileTree, getFileIcon, type TreeNode } from "@/lib/file-tree";

type SidebarMode = Exclude<AppMode, "chat">;

const MODE_EXTENSIONS: Record<string, string[]> = {
  manuscript: [".tex", ".bib", ".cls", ".sty", ".bst"],
  vault: [".md", ".mdx"],
  code: [".py", ".js", ".ts", ".jsx", ".tsx", ".json", ".yaml", ".yml"],
  assets: [".png", ".jpg", ".jpeg", ".svg", ".gif", ".pdf", ".csv"],
  zotero: [".bib"],
  other: [],
};

function filterFilesByMode(files: ProjectFile[], mode: string): ProjectFile[] {
  const extensions = MODE_EXTENSIONS[mode];
  if (!extensions || extensions.length === 0) return files;
  return files.filter((f) => extensions.some((ext) => f.name.endsWith(ext)));
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
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-1 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          style={{ paddingLeft: 12 + depth * 14 }}
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
        </button>
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
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1 text-[13px] transition-colors cursor-default",
        isActive
          ? "text-foreground bg-primary/5"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      style={{ paddingLeft: 12 + depth * 14 }}
      onClick={() => onSelectFile(node.relativePath, node.name)}
    >
      {node.file && getFileIcon(node.file)}
      <span className="truncate">{node.name}</span>
    </div>
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
  const tree = useMemo(() => buildFileTree(files, allFolders), [files, allFolders]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(allFolders));

  if (tree.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
          No files yet
          <span className="mt-1 block text-[11px] opacity-60">Open a project to get started</span>
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
      <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
        <GitBranchIcon className="size-6 mx-auto mb-2 opacity-40" />
        Git changes
        <span className="mt-1 block text-[11px] opacity-60">coming soon</span>
      </p>
    </div>
  );
}

// ─── RightSidebar ───

export function RightSidebar() {
  const rightToolbarTab = useLayoutStore((s) => s.rightToolbarTab);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);
  const setRightSidebarWidth = useLayoutStore((s) => s.setRightSidebarWidth);

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-card"
      style={{ width: rightSidebarWidth }}
    >
      {/* Resize handle — left edge */}
      <div
        className="absolute left-0 top-0 h-full w-[5px] cursor-col-resize hover:bg-primary/30 z-10 transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = rightSidebarWidth;
          const onMove = (ev: MouseEvent) => {
            setRightSidebarWidth(Math.min(380, Math.max(180, startWidth + startX - ev.clientX)));
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      />

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {rightToolbarTab === "files" && <FileTree />}
        {rightToolbarTab === "git" && <GitTab />}
      </div>
    </aside>
  );
}
