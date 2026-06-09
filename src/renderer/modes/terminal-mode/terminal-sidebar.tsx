import { useState } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalStore } from "@/stores/terminal-store";
import {
  SidebarHeader,
  SidebarContent,
} from "@/components/ui/sidebar";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickCommandDialog } from "./quick-command-dialog";
import type { TerminalQuickCommand } from "@/types/terminal";

export function TerminalSidebar() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCommand, setEditCommand] = useState<TerminalQuickCommand | null>(null);

  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = useRightPanelStore((s) =>
    s.tabs.find((t) => t.id === s.activeTabId),
  );

  const quickCommands = useTerminalStore((s) => s.quickCommands);
  const commandHistory = useTerminalStore((s) => s.commandHistory);
  const sessionIds = useTerminalStore((s) => s.sessionIds);
  const addQuickCommand = useTerminalStore((s) => s.addQuickCommand);
  const updateQuickCommand = useTerminalStore((s) => s.updateQuickCommand);
  const removeQuickCommand = useTerminalStore((s) => s.removeQuickCommand);
  const clearHistory = useTerminalStore((s) => s.clearHistory);

  const activeSessionId = activeTabId ? sessionIds[activeTabId] : undefined;

  const handleRunCommand = (command: string) => {
    if (!activeSessionId || activeTab?.kind !== "terminal") return;
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

  const handleEditClick = (cmd: TerminalQuickCommand) => {
    setEditCommand(cmd);
    setDialogOpen(true);
  };

  const handleAddClick = () => {
    setEditCommand(null);
    setDialogOpen(true);
  };

  return (
    <>
      {/* ── Header ── */}
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center px-3">
        <span className="truncate text-[length:var(--font-size-12)] font-medium text-muted-foreground">
          Terminal
        </span>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-auto">
        {/* ── Quick Commands ── */}
        <div className="flex items-center gap-1.5 px-3.5 py-1 text-[length:var(--font-size-12)] font-medium text-muted-foreground/70">
          <span className="flex-1">
            Quick Commands
            {quickCommands.length > 0 && (
              <span className="ml-1 text-muted-foreground/40">{quickCommands.length}</span>
            )}
          </span>
          <button
            type="button"
            className="flex size-4 items-center justify-center rounded-sm text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors"
            onClick={handleAddClick}
            title="Add command"
          >
            <PlusIcon className="size-3" />
          </button>
        </div>

        {quickCommands.length === 0 ? (
          <p className="px-3.5 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
            No saved commands — add your first one
          </p>
        ) : (
          <div className="space-y-0.5 px-2 mb-2">
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
                  <ContextMenuItem onClick={() => handleEditClick(cmd)}>
                    <PencilIcon className="size-3.5 mr-2" />
                    Edit
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}

        {/* ── History ── */}
        <div className="flex items-center gap-1.5 px-3.5 py-1 text-[length:var(--font-size-12)] font-medium text-muted-foreground/70">
          <span className="flex-1">
            History
            {commandHistory.length > 0 && (
              <span className="ml-1 text-muted-foreground/40">{commandHistory.length}</span>
            )}
          </span>
          {commandHistory.length > 0 && (
            <button
              type="button"
              className="flex size-4 items-center justify-center rounded-sm text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors"
              onClick={clearHistory}
              title="Clear history"
            >
              <Trash2Icon className="size-3" />
            </button>
          )}
        </div>

        {commandHistory.length === 0 ? (
          <p className="px-3.5 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
            No commands run yet
          </p>
        ) : (
          <div className="space-y-0.5 px-2 mb-2">
            {commandHistory.slice(0, 50).map((cmd, i) => (
              <button
                key={`${cmd}-${i}`}
                type="button"
                onClick={() => handleRunCommand(cmd)}
                title={cmd}
                className="flex items-center gap-1.5 h-6 px-1.5 rounded-sm w-full cursor-pointer transition-colors text-left text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent/50"
              >
                <span className="truncate">{cmd}</span>
              </button>
            ))}
          </div>
        )}
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
