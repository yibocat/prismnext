import { memo } from "react";
import { useTranslation } from "react-i18next";
import { tabFileId, tabFilePath, type RightTab } from "@/lib/workspace/mode-registry";
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
import { rightTabComposerDragPayload } from "@/lib/workspace/right-tab-drag";

interface TabBarProps {
  tabs: RightTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  onPinTab?: (id: string) => void;
  dirtyFileIds?: Set<string>;
}

function tabIcon(
  tab: RightTab,
  dirtyFileIds?: Set<string>,
  terminalStatus?: string,
) {
  const litNotePath = tab.kind === "literature" ? literatureTabNotePath(tab) : null;
  const isDirty =
    dirtyFileIds?.has(tabFileId(tab) ?? "")
    || dirtyFileIds?.has(tabFilePath(tab) ?? "")
    || (litNotePath ? dirtyFileIds?.has(litNotePath) : false);
  if (isDirty) {
    return <DotIcon className="size-3.5 shrink-0 text-info" strokeWidth={4} />;
  }
  if (tab.kind === "terminal") {
    if (tab.terminalSource === "job-monitor" || tab.terminalSource === "ai") {
      return <SparklesIcon className="size-3.5 shrink-0 text-primary" />;
    }
    const muted = terminalStatus === "exited" || terminalStatus === "error" || terminalStatus === "killed";
    return (
      <TerminalIcon
        className={cn(
          "size-3.5 shrink-0",
          muted ? "text-muted-foreground/40" : "text-muted-foreground",
        )}
      />
    );
  }
  if (tab.kind === "file" && tab.isInitial) {
    return <FoldersIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  const fileName = tabFilePath(tab) ?? tab.title;
  const iconName = getFileIconName(fileName);
  return <Icon icon={iconName} className="size-3.5 shrink-0" />;
}

function TabLeadingClose({
  tab,
  dirtyFileIds,
  terminalStatus,
  onClose,
}: {
  tab: RightTab;
  dirtyFileIds?: Set<string>;
  terminalStatus?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="relative mr-1 flex size-3.5 shrink-0 items-center justify-center">
      <span className="flex items-center justify-center group-hover/tab:invisible" aria-hidden>
        {tabIcon(tab, dirtyFileIds, terminalStatus)}
      </span>
      <button
        type="button"
        title={t("menu.closeTab")}
        aria-label={t("menu.closeTab")}
        className={cn(
          "absolute inset-0 flex items-center justify-center rounded",
          "invisible group-hover/tab:visible",
          "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

export const TabBar = memo(function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onReorder,
  onPinTab,
  dirtyFileIds,
}: TabBarProps) {
  const terminalSessions = useTerminalStore((s) => s.sessions);

  if (tabs.length === 0) return null;

  return (
    <SortableTabStrip
      items={tabs}
      getKey={(tab) => tab.id}
      onReorder={onReorder}
      onDragItem={(tab) => onSelect(tab.id)}
      getComposerDragPayload={rightTabComposerDragPayload}
      className="min-w-0"
      rowClassName="scrollbar-none min-w-0 gap-0.5 overflow-x-auto"
      renderItem={({ item: tab, dragging, dragHandleProps }) => (
        <AppContextMenu>
          <AppContextMenuTrigger asChild>
            <div
              {...dragHandleProps}
              role="button"
              className={cn(
                "group/tab flex w-[120px] shrink-0 items-center rounded px-2 py-1",
                "text-[length:var(--font-toolbar-tab)] cursor-default select-none transition-colors",
                "border-r border-border-subtle last:border-r-0",
                tab.id === activeTabId
                  ? "bg-accent text-accent-foreground"
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
              <TabLeadingClose
                tab={tab}
                dirtyFileIds={dirtyFileIds}
                terminalStatus={terminalSessions[tab.id]?.status}
                onClose={() => onClose(tab.id)}
              />
              <span className={cn("min-w-0 truncate", tab.isPreview && "italic")}>
                {tabDisplayTitle(tab, dirtyFileIds)}
              </span>
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
