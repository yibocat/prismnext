import { useState } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useLayoutStore } from "@/stores/layout-store";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  PlayIcon,
  ChevronRightIcon,
  SparklesIcon,
  TerminalIcon,
  XIcon,
  PinIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickCommandDialog } from "./quick-command-dialog";
import type { TerminalQuickCommand } from "@/types/terminal";
import {
  collectTerminalSidebarAiItems,
  collectTerminalSidebarUserItems,
  partitionAiSidebarItems,
  type TerminalSidebarAiItem,
} from "@/lib/terminal/terminal-sidebar-items";

function SidebarSectionTrigger({
  label,
  count,
  extraAction,
}: {
  label: string;
  count?: number;
  extraAction?: React.ReactNode;
}) {
  return (
    <AccordionTrigger
      className={cn(
        "h-7 py-0 px-0 rounded-sm text-muted-foreground hover:no-underline group",
        "[&>svg]:hidden",
      )}
    >
      <SidebarMenuButton
        size="sm"
        asChild
        className="[&>svg]:!size-3 h-7 w-full text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
      >
        <span className="flex items-center gap-1.5 w-full">
          <ChevronRightIcon className="size-3 shrink-0 group-data-[state=open]:rotate-90" />
          <span className="flex-1 text-left truncate">{label}</span>
          {count != null && count > 0 && (
            <span className="text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums shrink-0">
              {count}
            </span>
          )}
          {extraAction && (
            <span
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {extraAction}
            </span>
          )}
        </span>
      </SidebarMenuButton>
    </AccordionTrigger>
  );
}

function aiModeLabel(item: TerminalSidebarAiItem): string {
  if (item.phase === "running") return "Live";
  return "Replay";
}

function phaseBadgeClass(phase: string, busy?: boolean): string {
  if (phase === "running" || busy) return "text-warning";
  if (phase === "completed") return "text-muted-foreground";
  return "text-muted-foreground/60";
}

function AiSessionRow({
  item,
  onFocus,
  onClose,
}: {
  item: TerminalSidebarAiItem;
  onFocus: (item: TerminalSidebarAiItem) => void;
  onClose?: (aiTabId: string) => void;
}) {
  const isLive = item.phase === "running";
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-sm",
        item.isActiveTab && "bg-accent/40",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left text-[length:var(--font-size-12)] hover:bg-accent/50 rounded-sm transition-colors"
        onClick={() => onFocus(item)}
        title={item.statusLabel}
      >
        <SparklesIcon className={cn("size-3 shrink-0", phaseBadgeClass(item.phase))} />
        <span className="truncate flex-1 text-foreground/90">{item.title}</span>
        <span className={cn("shrink-0 text-[length:var(--font-hint)]", phaseBadgeClass(item.phase))}>
          {aiModeLabel(item)}
        </span>
        {item.pinned ? (
          <PinIcon className="size-2.5 shrink-0 text-muted-foreground/50" />
        ) : null}
      </button>
      {item.aiTabId && onClose ? (
        <button
          type="button"
          className="size-5 shrink-0 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/15 flex items-center justify-center"
          title={
            isLive
              ? "Close view (command keeps running unless configured to cancel)"
              : "Close replay view (output log is kept)"
          }
          onClick={() => onClose(item.aiTabId!)}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

function AiSessionGroup({
  label,
  items,
  onFocus,
  onClose,
}: {
  label: string;
  items: TerminalSidebarAiItem[];
  onFocus: (item: TerminalSidebarAiItem) => void;
  onClose?: (aiTabId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <p className="px-1.5 pt-1 text-[length:var(--font-hint)] uppercase tracking-wide text-muted-foreground/50">
        {label}
      </p>
      {items.map((item) => (
        <AiSessionRow key={item.key} item={item} onFocus={onFocus} onClose={onClose} />
      ))}
    </div>
  );
}

export function TerminalSidebar() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCommand, setEditCommand] = useState<TerminalQuickCommand | null>(null);
  const [accordionValue, setAccordionValue] = useState<string[]>(["quick", "sessions"]);

  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const setActiveTab = useRightPanelStore((s) => s.setActiveTab);
  const closeTab = useRightPanelStore((s) => s.closeTab);
  const closeAiTab = useRightPanelStore((s) => s.closeAiTab);
  const activateMode = useLayoutStore((s) => s.activateMode);

  const activeTab = useRightPanelStore((s) =>
    s.tabs.find((t) => t.id === s.activeTabId),
  );

  const quickCommands = useTerminalStore((s) => s.quickCommands);
  const sessionStates = useTerminalAiStore((s) => s.sessionStates);
  const rightTabs = useRightPanelStore((s) => s.tabs);
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const activeSession = activeTabId ? terminalSessions[activeTabId] : undefined;
  const addQuickCommand = useTerminalStore((s) => s.addQuickCommand);
  const updateQuickCommand = useTerminalStore((s) => s.updateQuickCommand);
  const removeQuickCommand = useTerminalStore((s) => s.removeQuickCommand);
  const setSessionCommand = useTerminalStore((s) => s.setSessionCommand);
  const focusOrOpenAiTerminal = useTerminalAiStore((s) => s.focusOrOpenAiTerminal);
  const focusLiveAiTerminal = useTerminalAiStore((s) => s.focusLiveAiTerminal);

  void sessionStates;
  void rightTabs;

  const aiItems = collectTerminalSidebarAiItems(activeTabId);
  const { live: aiLiveItems, saved: aiSavedItems } = partitionAiSidebarItems(aiItems);
  const userItems = collectTerminalSidebarUserItems(activeTabId);
  const sessionCount = aiItems.length + userItems.length;

  const activeSessionId = activeSession?.sessionId;

  const handleRunCommand = (command: string) => {
    if (!activeSessionId || activeTab?.kind !== "terminal" || activeTab.terminalSource === "ai") return;
    if (activeSession?.status !== "running" && activeSession?.status !== "starting") return;
    if (activeTabId) {
      useTerminalStore.getState().markCommandSubmitted(activeTabId);
      setSessionCommand(activeTabId, command);
    }
    window.electronAPI.terminalWrite({ sessionId: activeSessionId, data: command + "\r" });
  };

  const handleSaveCommand = async (
    label: string,
    command: string,
    description?: string,
  ) => {
    if (editCommand) {
      updateQuickCommand(editCommand.id, { label, command, description });
    } else {
      await addQuickCommand(label, command, description);
    }
    setEditCommand(null);
  };

  const focusTerminalTab = (tabId: string) => {
    activateMode("terminal");
    setActiveTab(tabId);
  };

  const focusAiItem = (item: TerminalSidebarAiItem) => {
    activateMode("terminal");
    if (item.aiTabId) {
      focusTerminalTab(item.aiTabId);
      return;
    }
    if (item.phase === "running") {
      focusLiveAiTerminal(item.chatTabId);
    } else {
      focusOrOpenAiTerminal(item.chatTabId);
    }
  };

  return (
    <>
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center px-3">
        <span className="truncate text-[length:var(--font-size-12)] font-medium text-muted-foreground">
          Terminal
        </span>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-auto px-2">
        <Accordion
          type="multiple"
          value={accordionValue}
          onValueChange={setAccordionValue}
          className="w-full"
        >
          <AccordionItem value="quick" className="border-0">
            <SidebarSectionTrigger
              label="Quick Commands"
              count={quickCommands.length}
              extraAction={
                <button
                  type="button"
                  className="flex size-4 items-center justify-center rounded-sm text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors"
                  onClick={() => {
                    setEditCommand(null);
                    setDialogOpen(true);
                  }}
                  title="Add command"
                >
                  <PlusIcon className="size-3" />
                </button>
              }
            />
            <AccordionContent className="pb-1 pt-0">
              {quickCommands.length === 0 ? (
                <p className="px-1.5 py-1 text-[length:var(--font-hint)] text-muted-foreground/60">
                  No saved commands
                </p>
              ) : (
                <div className="space-y-0.5">
                  {quickCommands.map((cmd) => (
                    <ContextMenu key={cmd.id}>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleRunCommand(cmd.command)}
                          title={cmd.description || cmd.command}
                          className={cn(
                            "flex items-center gap-1.5 h-6 px-1.5 rounded-sm w-full cursor-pointer transition-colors text-left",
                            "text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent/50 group/cmd",
                          )}
                        >
                          <PlayIcon className="size-3 shrink-0 text-muted-foreground/40 group-hover/cmd:text-foreground" />
                          <span className="truncate flex-1">{cmd.label}</span>
                          <button
                            type="button"
                            className="size-4 shrink-0 rounded-sm opacity-0 group-hover/cmd:opacity-100 hover:bg-muted-foreground/20 flex items-center justify-center transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeQuickCommand(cmd.id);
                            }}
                            title="Remove command"
                          >
                            <Trash2Icon className="size-3" />
                          </button>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-36">
                        <ContextMenuItem onClick={() => handleRunCommand(cmd.command)}>
                          <PlayIcon className="size-3.5 mr-2" />
                          Run
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => {
                            setEditCommand(cmd);
                            setDialogOpen(true);
                          }}
                        >
                          <PencilIcon className="size-3.5 mr-2" />
                          Edit
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sessions" className="border-0">
            <SidebarSectionTrigger label="Sessions" count={sessionCount} />
            <AccordionContent className="pb-2 pt-0 space-y-1">
              {sessionCount === 0 ? (
                <p className="px-1.5 py-1 text-[length:var(--font-hint)] text-muted-foreground/60">
                  No open terminals
                </p>
              ) : null}

              <AiSessionGroup
                label="Live"
                items={aiLiveItems}
                onFocus={focusAiItem}
                onClose={closeAiTab}
              />
              <AiSessionGroup
                label="Saved"
                items={aiSavedItems}
                onFocus={focusAiItem}
                onClose={closeAiTab}
              />

              {userItems.length > 0 ? (
                <div className="space-y-0.5">
                  {userItems.length > 0 && aiItems.length > 0 ? (
                    <p className="px-1.5 pt-1 text-[length:var(--font-hint)] uppercase tracking-wide text-muted-foreground/50">
                      Shells
                    </p>
                  ) : null}
                  {userItems.map((item) => (
                    <div
                      key={item.tabId}
                      className={cn(
                        "group flex items-center gap-1 rounded-sm",
                        item.isActiveTab && "bg-accent/40",
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left text-[length:var(--font-size-12)] hover:bg-accent/50 rounded-sm transition-colors"
                        onClick={() => focusTerminalTab(item.tabId)}
                        title={item.lastCommand || item.shellLabel}
                      >
                        <TerminalIcon className={cn("size-3 shrink-0", phaseBadgeClass("", item.busy))} />
                        <span className="truncate flex-1 text-foreground/90">{item.title}</span>
                        <span className={cn("shrink-0 text-[length:var(--font-hint)]", phaseBadgeClass("", item.busy))}>
                          {item.busy ? "busy" : item.shellLabel}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="size-5 shrink-0 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/15 flex items-center justify-center"
                        title="Close terminal tab"
                        onClick={() => closeTab(item.tabId)}
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SidebarContent>

      <QuickCommandDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditCommand(null);
        }}
        onSave={handleSaveCommand}
        editCommand={editCommand}
      />
    </>
  );
}
