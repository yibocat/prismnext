import { useState, useCallback, useRef, useEffect, memo } from "react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { XIcon, DotIcon, FoldersIcon, Terminal as TerminalIcon, SparklesIcon } from "lucide-react";
import { Icon } from "@iconify/react/offline";
import { getFileIconName } from "@/lib/files/file-icon-class";
import { cn } from "@/lib/utils";
import { tabDisplayTitle } from "@/lib/workspace/tab-lifecycle";
import { literatureTabNotePath } from "@/lib/literature/literature-note-tab";
import { useTerminalStore } from "@/stores/terminal-store";
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from "@/components/ui/app-context-menu";

function DropZone({ active, onDragOver, onDrop }: {
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={cn(
        "shrink-0 self-stretch flex items-center cursor-default transition-[width]",
        active ? "w-1.5" : "w-0",
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className={cn(
        "w-px h-full mx-auto transition-colors",
        active ? "bg-primary" : "bg-transparent",
      )} />
    </div>
  );
}

interface TabBarProps {
  tabs: RightTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  onPinTab?: (id: string) => void;
  dirtyFileIds?: Set<string>;
  /** When true, hide tabs regardless of internal scroll detection */
  forceOverflow?: boolean;
}

function tabIcon(
  tab: RightTab,
  dirtyFileIds?: Set<string>,
  terminalStatus?: string,
) {
  const litNotePath = tab.kind === "literature" ? literatureTabNotePath(tab) : null;
  const isDirty =
    dirtyFileIds?.has(tab.fileId ?? "")
    || dirtyFileIds?.has(tab.filePath ?? "")
    || (litNotePath ? dirtyFileIds?.has(litNotePath) : false);
  if (isDirty) {
    return <span title="Unsaved changes"><DotIcon className="mr-1 size-3.5 shrink-0 text-info" strokeWidth={4} /></span>;
  }
  if (tab.kind === "terminal") {
    if (tab.terminalSource === "ai") {
      return (
        <span title="AI Agent Terminal">
          <SparklesIcon className="mr-1 size-3.5 shrink-0 text-primary/80" />
        </span>
      );
    }
    const muted = terminalStatus === "exited" || terminalStatus === "error" || terminalStatus === "killed";
    return (
      <TerminalIcon
        className={cn(
          "mr-1 size-3.5 shrink-0",
          muted ? "text-muted-foreground/40" : "text-muted-foreground",
        )}
      />
    );
  }
  if (tab.kind === "file" && tab.isInitial) {
    return <FoldersIcon className="mr-1 size-3.5 shrink-0 text-muted-foreground" />;
  }
  const fileName = tab.filePath ?? tab.title;
  const iconName = getFileIconName(fileName);
  return <Icon icon={iconName} className="mr-1 size-3.5 shrink-0" />;
}

export const TabBar = memo(function TabBar({ tabs, activeTabId, onSelect, onClose, onReorder, onPinTab, dirtyFileIds, forceOverflow }: TabBarProps) {
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [side, setSide] = useState<"left" | "right">("right");

  // ── Overflow detection ──
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs]);

  const reset = useCallback(() => {
    setDragIndex(null);
    setOverIndex(null);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragIndex === null || dragIndex === index) {
        setOverIndex(null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      setOverIndex(index);
      setSide(e.clientX < mid ? "left" : "right");
    },
    [dragIndex],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      reset();
      if (dragIndex === null || dragIndex === targetIndex || !onReorder) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      const offset = e.clientX < mid ? 0 : 1;
      const to = dragIndex < targetIndex + offset ? targetIndex + offset - 1 : targetIndex + offset;
      onReorder(dragIndex, to);
    },
    [dragIndex, onReorder],
  );

  if (tabs.length === 0) return null;

  // ── Overflow: hide tabs — dropdown is rendered by parent (right-area) ──
  if (overflow || forceOverflow) {
    return null;
  }

  // ── Normal: scrollable tabs ──
  return (
    <div
      ref={scrollerRef}
      className="scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto justify-end"
      onDragEnd={reset}
    >
      {/* Drop zone before first tab */}
      <DropZone
        active={overIndex === 0 && side === "left"}
        onDragOver={(e) => { e.preventDefault(); setOverIndex(0); setSide("left"); }}
        onDrop={(e) => { e.preventDefault(); reset(); if (dragIndex !== null && onReorder) onReorder(dragIndex, 0); }}
      />
      {tabs.map((tab, i) => (
        <AppContextMenu key={tab.id}>
          <AppContextMenuTrigger asChild>
            <div className="flex shrink-0">
              {overIndex === i && side === "left" && (
                <div className="mx-0.5 w-0.5 rounded-full bg-primary" />
              )}
              <div
                draggable
                role="button"
                className={cn(
                  "group flex w-[120px] shrink-0 items-center rounded px-2 py-1",
                  "text-[length:var(--font-toolbar-tab)] cursor-default select-none transition-colors",
                  "border-r border-border/50 last:border-r-0",
                  tab.id === activeTabId
                    ? "bg-muted text-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  dragIndex === i && "opacity-40",
                )}
                onClick={() => onSelect(tab.id)}
                onDoubleClick={() => {
                  if (tab.kind === "file" && tab.isPreview) onPinTab?.(tab.id);
                }}
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
              >
                {tabIcon(tab, dirtyFileIds, terminalSessions[tab.id]?.status)}
                <span className={cn("truncate", tab.isPreview && "italic")}>
                  {tabDisplayTitle(tab, dirtyFileIds)}
                </span>
                <button
                  type="button"
                  className="ml-auto flex size-4 shrink-0 items-center justify-center rounded invisible group-hover:visible hover:bg-muted-foreground/10"
                  onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                >
                  <XIcon className="size-2.5" />
                </button>
              </div>
              {overIndex === i && side === "right" && (
                <div className="mx-0.5 h-[var(--height-tab-bar)] w-0.5 rounded-full bg-primary" />
              )}
            </div>
          </AppContextMenuTrigger>
          <AppContextMenuContent className="min-w-[8rem]">
            <AppContextMenuItem onClick={() => onClose(tab.id)}>Close</AppContextMenuItem>
            <AppContextMenuItem
              onClick={() => { for (const t of tabs) { if (t.id !== tab.id) onClose(t.id); } }}
            >
              Close Others
            </AppContextMenuItem>
          </AppContextMenuContent>
        </AppContextMenu>
      ))}
      {/* Drop zone after last tab */}
      <DropZone
        active={overIndex === tabs.length - 1 && side === "right"}
        onDragOver={(e) => { e.preventDefault(); setOverIndex(tabs.length - 1); setSide("right"); }}
        onDrop={(e) => { e.preventDefault(); reset(); if (dragIndex !== null && onReorder) onReorder(dragIndex, tabs.length); }}
      />
    </div>
  );
});
