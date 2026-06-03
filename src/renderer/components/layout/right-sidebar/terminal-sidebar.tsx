import { useState } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalStore } from "@/stores/terminal-store";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ChevronRightIcon,
  Terminal as TerminalIcon,
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  PlayIcon,
  MonitorIcon,
  CpuIcon,
  HomeIcon,
  LayersIcon,
  FolderOpenIcon,
  HashIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickCommandDialog } from "@/components/modules/terminal/quick-command-dialog";
import type { TerminalQuickCommand } from "@/types/terminal";

// ─── Accordion Section ───

function AccordionSection({
  title,
  icon,
  open,
  onToggle,
  badge,
  extraAction,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  badge?: string;
  extraAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <SidebarMenuButton
        size="sm"
        onClick={onToggle}
        className="[&>svg]:!size-3 h-7 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
      >
        <ChevronRightIcon
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
        />
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {badge && (
          <span className="text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums">
            {badge}
          </span>
        )}
        {extraAction}
      </SidebarMenuButton>
      {open && <SidebarMenu className="gap-0.5 pt-0.5 pb-0.5">{children}</SidebarMenu>}
    </div>
  );
}

// ─── Main Component ───

export function TerminalSidebar() {
  const [sections, setSections] = useState({
    quickCommands: true,
    environment: false,
    history: false,
  });
  const toggle = (key: keyof typeof sections) =>
    setSections((s) => ({ ...s, [key]: !s[key] }));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCommand, setEditCommand] = useState<TerminalQuickCommand | null>(null);

  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = useRightPanelStore((s) =>
    s.tabs.find((t) => t.id === s.activeTabId),
  );

  const quickCommands = useTerminalStore((s) => s.quickCommands);
  const envInfo = useTerminalStore((s) => s.envInfo);
  const commandHistory = useTerminalStore((s) => s.commandHistory);
  const sessions = useTerminalStore((s) => s.sessions);
  const sessionIds = useTerminalStore((s) => s.sessionIds);
  const addQuickCommand = useTerminalStore((s) => s.addQuickCommand);
  const updateQuickCommand = useTerminalStore((s) => s.updateQuickCommand);
  const removeQuickCommand = useTerminalStore((s) => s.removeQuickCommand);
  const clearHistory = useTerminalStore((s) => s.clearHistory);

  const sessionInfo = activeTabId ? sessions[activeTabId] : undefined;
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
      <SidebarHeader className="flex h-8 shrink-0 flex-row items-center px-3 py-0 gap-0">
        <span className="text-[length:var(--font-size-12)] font-medium text-muted-foreground truncate">
          Terminal
        </span>
        <div className="flex-1" />
      </SidebarHeader>

      <SidebarContent className="overflow-auto px-1.5 py-1">
        {/* ── Quick Commands ── */}
        <AccordionSection
          title="Quick Commands"
          open={sections.quickCommands}
          onToggle={() => toggle("quickCommands")}
          badge={quickCommands.length > 0 ? String(quickCommands.length) : undefined}
          extraAction={
            <button
              type="button"
              className="size-4 shrink-0 rounded-sm opacity-60 hover:opacity-100 hover:bg-muted-foreground/20 flex items-center justify-center ml-1"
              onClick={(e) => {
                e.stopPropagation();
                handleAddClick();
              }}
              title="Add command"
            >
              <PlusIcon className="size-3" />
            </button>
          }
        >
          {quickCommands.length === 0 ? (
            <p className="pl-5 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
              No commands yet — add your first one
            </p>
          ) : (
            quickCommands.map((cmd) => (
              <ContextMenu key={cmd.id}>
                <ContextMenuTrigger asChild>
                  <SidebarMenuButton
                    size="sm"
                    onClick={() => handleRunCommand(cmd.command)}
                    title={cmd.description || cmd.command}
                    className={cn(
                      "[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground pl-5",
                      "group/cmd",
                    )}
                  >
                    <PlayIcon className="size-3 shrink-0 text-muted-foreground/40 group-hover/cmd:text-foreground" />
                    <span className="truncate flex-1">{cmd.label}</span>
                    <button
                      type="button"
                      className="size-4 shrink-0 rounded-sm opacity-0 group-hover/cmd:opacity-100 hover:bg-muted-foreground/20 flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeQuickCommand(cmd.id);
                      }}
                      title="Remove command"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </SidebarMenuButton>
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
            ))
          )}
        </AccordionSection>

        {/* ── Environment ── */}
        <AccordionSection
          title="Environment"
          open={sections.environment}
          onToggle={() => toggle("environment")}
          icon={<MonitorIcon className="size-3 text-muted-foreground/60" />}
        >
          <div className="pl-5 py-1.5 space-y-0.5 text-[length:var(--font-size-12)] text-muted-foreground">
            {/* Session-specific info */}
            {sessionInfo ? (
              <>
                <div className="flex items-center gap-1.5">
                  <TerminalIcon className="size-3 shrink-0 text-muted-foreground/40" />
                  <span className="truncate">{sessionInfo.shell}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FolderOpenIcon className="size-3 shrink-0 text-muted-foreground/40" />
                  <span className="truncate">{sessionInfo.cwd}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <HashIcon className="size-3 shrink-0 text-muted-foreground/40" />
                  <span className="truncate">PID {sessionInfo.pid}</span>
                </div>
                <div className="my-1 border-t border-border/40" />
              </>
            ) : (
              <p className="py-1 text-[length:var(--font-hint)] text-muted-foreground/60">
                No active terminal session
              </p>
            )}

            {/* Global env info */}
            {envInfo ? (
              <>
                <div className="flex items-center gap-1.5">
                  <CpuIcon className="size-3 shrink-0 text-muted-foreground/40" />
                  <span className="truncate">{envInfo.nodeVersion} — {envInfo.platform}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <HomeIcon className="size-3 shrink-0 text-muted-foreground/40" />
                  <span className="truncate">{envInfo.home}</span>
                </div>
              </>
            ) : (
              <p className="py-1 text-[length:var(--font-hint)] text-muted-foreground/60">
                Loading system info...
              </p>
            )}
          </div>
        </AccordionSection>

        {/* ── History ── */}
        <AccordionSection
          title="History"
          open={sections.history}
          onToggle={() => toggle("history")}
          icon={<LayersIcon className="size-3 text-muted-foreground/60" />}
          badge={commandHistory.length > 0 ? String(commandHistory.length) : undefined}
          extraAction={
            commandHistory.length > 0 ? (
              <button
                type="button"
                className="size-4 shrink-0 rounded-sm opacity-60 hover:opacity-100 hover:bg-muted-foreground/20 flex items-center justify-center ml-1"
                onClick={(e) => {
                  e.stopPropagation();
                  clearHistory();
                }}
                title="Clear history"
              >
                <Trash2Icon className="size-3" />
              </button>
            ) : undefined
          }
        >
          {commandHistory.length === 0 ? (
            <p className="pl-5 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
              No commands run yet
            </p>
          ) : (
            commandHistory.slice(0, 50).map((cmd, i) => (
              <SidebarMenuButton
                key={`${cmd}-${i}`}
                size="sm"
                onClick={() => handleRunCommand(cmd)}
                title={cmd}
                className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground pl-5 font-mono"
              >
                <span className="truncate">{cmd}</span>
              </SidebarMenuButton>
            ))
          )}
        </AccordionSection>
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
