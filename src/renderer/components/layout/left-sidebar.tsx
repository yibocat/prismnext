import { useState } from "react";
import { useLayoutStore, type AppMode } from "@/stores/layout-store";
import {
  PlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  BookmarkIcon,
  NotepadTextIcon,
  BookOpenIcon,
  Code2Icon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type SidebarMode = Exclude<AppMode, "chat">;

const MODES: { id: SidebarMode; icon: React.ReactNode; label: string; disabled?: boolean }[] = [
  { id: "manuscript", icon: <FileTextIcon className="size-3.5" />, label: "Manuscript" },
  { id: "vault", icon: <NotepadTextIcon className="size-3.5" />, label: "Vault" },
  { id: "zotero", icon: <BookOpenIcon className="size-3.5" />, label: "Zotero", disabled: true },
  { id: "code", icon: <Code2Icon className="size-3.5" />, label: "Code", disabled: true },
];

const MODE_LABELS: Record<SidebarMode, string> = {
  manuscript: "Manuscript",
  vault: "Vault",
  zotero: "Zotero",
  code: "Code",
};

function FileTree() {
  const [expanded, setExpanded] = useState(true);
  const activeFile = "main.tex";

  return (
    <div className="py-1">
      {/* Folder: sections */}
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

      {/* Nested files with indent guide */}
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

      {/* Root files */}
      {["main.tex", "refs.bib"].map((name) => (
        <div
          key={name}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 text-[13px] transition-colors cursor-default",
            activeFile === name
              ? "text-foreground border-l-[3px] border-primary bg-primary/5"
              : name === "refs.bib"
                ? "text-muted-foreground border-l-[3px] border-transparent hover:bg-muted hover:text-foreground"
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
        <span className="mt-1 block text-[11px] opacity-60">coming soon</span>
      </p>
    </div>
  );
}

export function LeftSidebar() {
  const activeMode = useLayoutStore((s) => s.activeMode);
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);

  if (!sidebarExpanded) return null;

  const currentMode: SidebarMode = activeMode === "chat" ? "manuscript" : activeMode;

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-border bg-card"
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold text-foreground hover:bg-muted transition-colors"
            >
              {MODES.find((m) => m.id === currentMode)?.icon}
              <span>{MODE_LABELS[currentMode]}</span>
              <span className="text-muted-foreground">
                <ChevronRightIcon className="size-3 rotate-90" />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {MODES.map((m) => (
              <DropdownMenuItem
                key={m.id}
                disabled={m.disabled}
                className={cn(m.disabled && "opacity-50")}
                onClick={() => setActiveMode(m.id)}
              >
                {m.icon}
                <span>{m.label}</span>
                {m.disabled && (
                  <span className="ml-auto text-[10px] text-muted-foreground">soon</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={`New ${MODE_LABELS[currentMode]}`}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        {currentMode === "manuscript" ? (
          <FileTree />
        ) : (
          <EmptyState mode={currentMode} />
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 h-full w-[3px] cursor-col-resize hover:bg-primary/30 transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = sidebarWidth;

          const onMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX;
            setSidebarWidth(Math.min(400, Math.max(180, startWidth + delta)));
          };

          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };

          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      />
    </aside>
  );
}
