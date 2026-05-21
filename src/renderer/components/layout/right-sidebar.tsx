import { useState, useMemo } from "react";
import { useLayoutStore, type AppMode } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import {
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  NotepadTextIcon,
  BookOpenIcon,
  Code2Icon,
  ImageIcon,
  MoreHorizontalIcon,
  ChevronDownIcon,
  GitBranchIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { buildFileTree, getFileIcon, type TreeNode } from "@/lib/file-tree";

type SidebarMode = Exclude<AppMode, "chat">;
type RightSidebarTab = "files" | "git";

const MODES: { id: SidebarMode; icon: React.ReactNode; label: string }[] = [
  { id: "manuscript", icon: <FileTextIcon className="size-3.5" />, label: "Manuscript" },
  { id: "vault", icon: <NotepadTextIcon className="size-3.5" />, label: "Vault" },
  { id: "zotero", icon: <BookOpenIcon className="size-3.5" />, label: "Zotero" },
  { id: "code", icon: <Code2Icon className="size-3.5" />, label: "Code" },
  { id: "assets", icon: <ImageIcon className="size-3.5" />, label: "Assets" },
  { id: "other", icon: <MoreHorizontalIcon className="size-3.5" />, label: "Other" },
];

const MODE_LABELS: Record<SidebarMode, string> = {
  manuscript: "Manuscript",
  vault: "Vault",
  zotero: "Zotero",
  code: "Code",
  assets: "Assets",
  other: "Other",
};

const TABS: { id: RightSidebarTab; icon: React.ReactNode; label: string }[] = [
  { id: "files", icon: <FileTextIcon className="size-3.5" />, label: "Files" },
  { id: "git", icon: <GitBranchIcon className="size-3.5" />, label: "Git" },
];

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

function RealFileTree() {
  const files = useDocumentStore((s) => s.files);
  const folders = useDocumentStore((s) => s.folders);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const openEditorTab = useLayoutStore((s) => s.openEditorTab);

  const tree = useMemo(() => buildFileTree(files, folders), [files, folders]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(folders),
  );

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
            openEditorTab({ id, name });
          }}
        />
      ))}
    </div>
  );
}

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

export function RightSidebar() {
  const activeMode = useLayoutStore((s) => s.activeMode);
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);
  const setRightSidebarWidth = useLayoutStore((s) => s.setRightSidebarWidth);
  const [activeTab, setActiveTab] = useState<RightSidebarTab>("files");

  const currentMode: SidebarMode = activeMode === "chat" ? "manuscript" : activeMode;

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-card"
      style={{ width: rightSidebarWidth }}
    >
      {/* Resize handle — left edge */}
      <div
        className="absolute left-0 top-0 h-full w-[3px] cursor-col-resize hover:bg-primary/30 z-10 transition-colors"
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

      {/* Tab bar */}
      <div className="flex h-9 shrink-0 items-center border-b border-border px-1 gap-0.5 overflow-hidden">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors",
              activeTab === tab.id
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}

        {/* Mode dropdown — right-aligned, truncates on narrow widths */}
        <div className="flex-1 min-w-0" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <span className="uppercase tracking-wide truncate">{MODE_LABELS[currentMode]}</span>
              <ChevronDownIcon className="size-3 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {MODES.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onClick={() => setActiveMode(m.id)}
              >
                {m.icon}
                <span>{m.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {activeTab === "files" && <RealFileTree />}
        {activeTab === "git" && <GitTab />}
      </div>
    </aside>
  );
}
