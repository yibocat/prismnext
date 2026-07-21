import { useState, useRef, useEffect, memo } from "react";
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
import { SortableTabStrip } from "@/components/layout/sortable-tab-strip";

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

export const TabBar = memo(function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onReorder,
  onPinTab,
  dirtyFileIds,
  forceOverflow,
}: TabBarProps) {
  const terminalSessions = useTerminalStore((s) => s.sessions);

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

  if (tabs.length === 0) return null;

  // Overflow: hide tabs — dropdown is rendered by parent (right-area)
  if (overflow || forceOverflow) {
    return null;
  }

  return (
    <SortableTabStrip
      ref={scrollerRef}
      items={tabs}
      getKey={(tab) => tab.id}
      onReorder={onReorder}
      onDragItem={(tab) => onSelect(tab.id)}
      className="min-w-0"
      rowClassName="scrollbar-none min-w-0 gap-0.5 overflow-x-auto justify-end"
      renderItem={({ item: tab, dragging, dragHandleProps }) => (
        <AppContextMenu>
          <AppContextMenuTrigger asChild>
            <div
              {...dragHandleProps}
              role="button"
              className={cn(
                "group flex w-[120px] shrink-0 items-center rounded px-2 py-1",
                "text-[length:var(--font-toolbar-tab)] cursor-default select-none transition-colors",
                "border-r border-border/50 last:border-r-0",
                tab.id === activeTabId
                  ? "bg-muted text-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                dragging && "opacity-40",
              )}
              onClick={() => onSelect(tab.id)}
              onDoubleClick={() => {
                if (
                  (tab.kind === "file" || tab.kind === "research-plan")
                  && tab.isPreview
                ) {
                  onPinTab?.(tab.id);
                }
              }}
            >
              {tabIcon(tab, dirtyFileIds, terminalSessions[tab.id]?.status)}
              <span className={cn("truncate", tab.isPreview && "italic")}>
                {tabDisplayTitle(tab, dirtyFileIds)}
              </span>
              <button
                type="button"
                className="ml-auto flex size-4 shrink-0 items-center justify-center rounded invisible group-hover:visible hover:bg-muted-foreground/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <XIcon className="size-2.5" />
              </button>
            </div>
          </AppContextMenuTrigger>
          <AppContextMenuContent className="min-w-[8rem]">
            <AppContextMenuItem onClick={() => onClose(tab.id)}>Close</AppContextMenuItem>
            <AppContextMenuItem
              onClick={() => {
                for (const t of tabs) {
                  if (t.id !== tab.id) onClose(t.id);
                }
              }}
            >
              Close Others
            </AppContextMenuItem>
          </AppContextMenuContent>
        </AppContextMenu>
      )}
    />
  );
});
