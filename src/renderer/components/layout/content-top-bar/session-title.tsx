import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useChatStore } from "@/stores/chat-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useSettingsStore } from "@/stores/settings-store";
import { formatAiTerminalStatus } from "@/lib/terminal/ai-terminal-lifecycle";
import { resolveAiMirrorKey } from "@/lib/terminal/mirror-key";
import {
  FolderOpenIcon,
  BotIcon,
  GitBranchIcon,
  TerminalIcon,
} from "lucide-react";

interface SessionTitleProps {
  title: string;
  projectRoot: string | null;
  agentName: string;
}

export function SessionTitle({
  title,
  projectRoot,
  agentName,
}: SessionTitleProps) {
  const projectName = projectRoot
    ? projectRoot.split("/").pop() || projectRoot
    : "—";

  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const mode = useWorktreeStore((s) => s.mode);
  const worktreeLabel = activeWorktree?.name
    ? `📂 ${activeWorktree.name}`
    : mode === "worktree"
      ? "Pending worktree"
      : "Local";

  const activeTabId = useChatStore((s) => s.activeTabId);
  const mirrorKey = activeTabId ? resolveAiMirrorKey(activeTabId) : "";
  const sessionState = useTerminalAiStore((s) =>
    mirrorKey ? s.sessionStates[mirrorKey] : undefined,
  );
  const showIndicator =
    useSettingsStore((s) => s.settings.aiTerminalShowSessionIndicator !== false);
  const terminalStatus = showIndicator ? formatAiTerminalStatus(sessionState) : null;
  const focusOrOpen = useTerminalAiStore((s) => s.focusOrOpenAiTerminal);

  return (
    <div className="flex items-center min-w-0 max-w-[240px]">
      <HoverCard openDelay={300} closeDelay={100}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="truncate rounded px-2 py-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground hover:text-foreground transition-colors max-w-full"
          >
            {title}
          </button>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-64 p-3">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
              <div className="min-w-0">
                <div className="text-[length:var(--font-chat-meta)] text-foreground truncate">
                  {projectName}
                </div>
                <div className="text-[length:var(--font-hint)] text-muted-foreground truncate">
                  {projectRoot || "—"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[length:var(--font-chat-meta)] text-foreground">
                {agentName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
                {worktreeLabel}
              </span>
            </div>
            {terminalStatus && activeTabId ? (
              <button
                type="button"
                className="flex items-center gap-2 w-full pt-1 border-t border-border/60 text-left rounded-sm cursor-pointer transition-colors -mx-1 px-1 py-1 text-muted-foreground hover:bg-accent/50 hover:text-warning group/term"
                onClick={() => focusOrOpen(activeTabId)}
              >
                <TerminalIcon className="size-3.5 shrink-0 text-warning/80 group-hover/term:text-warning transition-colors" />
                <span className="min-w-0 flex-1 text-[length:var(--font-chat-meta)] truncate group-hover/term:text-warning transition-colors">
                  {terminalStatus}
                </span>
              </button>
            ) : null}
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
