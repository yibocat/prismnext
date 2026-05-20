import { useState } from "react";
import { useLayoutStore, type AppMode } from "@/stores/layout-store";
import {
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  BookmarkIcon,
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

function FileTree() {
  const [expanded, setExpanded] = useState(true);
  const activeFile = "main.tex";

  return (
    <div className="py-1">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRightIcon
          className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
        />
        {expanded ? (
          <FolderOpenIcon className="size-3.5 shrink-0" />
        ) : (
          <FolderIcon className="size-3.5 shrink-0" />
        )}
        <span className="truncate font-medium">sections</span>
      </button>

      {expanded && (
        <div className="ml-3.5 border-l border-border/60 pl-1.5">
          {["intro.tex", "methods.tex", "results.tex"].map((name) => (
            <div
              key={name}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 pl-3 text-[13px] transition-colors cursor-default",
                activeFile === name
                  ? "text-foreground border-l-[3px] -ml-px border-primary bg-primary/5"
                  : "text-muted-foreground border-l-[3px] -ml-px border-transparent hover:bg-muted hover:text-foreground",
              )}
            >
              <FileTextIcon className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-0.5" />

      {["main.tex", "refs.bib"].map((name) => (
        <div
          key={name}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 text-[13px] transition-colors cursor-default",
            activeFile === name
              ? "text-foreground border-l-[3px] border-primary bg-primary/5"
              : "text-muted-foreground border-l-[3px] border-transparent hover:bg-muted hover:text-foreground",
          )}
        >
          {name === "refs.bib" ? (
            <BookmarkIcon className="size-3.5 shrink-0 opacity-70" />
          ) : (
            <FileTextIcon className="size-3.5 shrink-0 opacity-70" />
          )}
          <span className="truncate">{name}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ mode }: { mode: SidebarMode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
        {mode === "vault" && "Markdown notes"}
        {mode === "zotero" && "Literature library"}
        {mode === "code" && "Code browser"}
        {mode === "assets" && "Project assets"}
        {mode === "other" && "Other files"}
        <span className="mt-1 block text-[11px] opacity-60">coming soon</span>
      </p>
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
        {activeTab === "files" &&
          (currentMode === "manuscript" ? <FileTree /> : <EmptyState mode={currentMode} />)}
        {activeTab === "git" && <GitTab />}
      </div>
    </aside>
  );
}
