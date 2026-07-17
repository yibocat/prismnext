import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import { useDocumentStore } from "@/stores/document-store";
import { formatAiTerminalStatus } from "@/lib/terminal/ai-terminal-lifecycle";
import { resolveAiMirrorKey } from "@/lib/terminal/mirror-key";
import { resolveSessionWorktreeContext } from "@/lib/git/session-worktree-context";
import {
  GitBranchIcon,
  TerminalIcon,
  WorkflowIcon,
  BookMarkedIcon,
} from "lucide-react";

interface SessionContextCardProps {
  tabId: string;
  title: string;
  sessionId?: string | null;
  /** Session-bound cwd — preferred over global active worktree. */
  sessionDirectory?: string | null;
  children: ReactElement;
}

/**
 * Hover panel for a chat tab / session title.
 * Prefers session-scoped facts (checkout, citations, AI terminal) over project chrome.
 */
export function SessionContextCard({
  tabId,
  title,
  sessionId,
  sessionDirectory,
  children,
}: SessionContextCardProps) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const checkoutContext = resolveSessionWorktreeContext(
    sessionDirectory ?? projectRoot,
    projectRoot,
    worktrees,
  );

  const mirrorKey = tabId ? resolveAiMirrorKey(tabId) : "";
  const sessionState = useTerminalAiStore((s) =>
    mirrorKey ? s.sessionStates[mirrorKey] : undefined,
  );
  const showIndicator =
    useSettingsStore((s) => s.settings.aiTerminalShowSessionIndicator !== false);
  const terminalStatus = showIndicator ? formatAiTerminalStatus(sessionState) : null;
  const focusOrOpen = useTerminalAiStore((s) => s.focusOrOpenAiTerminal);

  const citationCount = useCitationStagingStore((s) =>
    sessionId ? s.getCitationsForSession(sessionId).length : 0,
  );

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-64 p-3">
        <div className="space-y-2">
          <div className="min-w-0">
            <div className="text-[length:var(--font-chat-meta)] text-foreground truncate font-medium">
              {title}
            </div>
            {sessionId ? (
              <div className="text-[length:var(--font-hint)] text-muted-foreground/70 truncate font-mono">
                {sessionId.slice(0, 12)}…
              </div>
            ) : (
              <div className="text-[length:var(--font-hint)] text-muted-foreground">
                {t("chat.openTabs.unsavedSession")}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            {checkoutContext.kind === "local" ? (
              <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <WorkflowIcon className="size-3.5 shrink-0 text-primary/80" />
            )}
            <div className="min-w-0">
              <div className="text-[length:var(--font-chat-meta)] text-foreground truncate">
                {checkoutContext.label}
              </div>
              {checkoutContext.kind === "worktree" && checkoutContext.baseBranch ? (
                <div className="text-[length:var(--font-hint)] text-muted-foreground truncate">
                  {t("chat.openTabs.mergesInto", { branch: checkoutContext.baseBranch })}
                </div>
              ) : checkoutContext.kind === "closed-worktree" ? (
                <div className="text-[length:var(--font-hint)] text-muted-foreground truncate">
                  {t("chat.openTabs.worktreeRemoved")}
                </div>
              ) : null}
            </div>
          </div>

          {sessionId ? (
            <div className="flex items-center gap-2 min-w-0">
              <BookMarkedIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[length:var(--font-chat-meta)] text-foreground truncate">
                {citationCount > 0
                  ? t("chat.openTabs.citationsCount", { count: citationCount })
                  : t("chat.openTabs.citationsNone")}
              </span>
            </div>
          ) : null}

          {terminalStatus ? (
            <button
              type="button"
              className="flex items-center gap-2 w-full pt-1 border-t border-border/60 text-left rounded-sm cursor-pointer transition-colors -mx-1 px-1 py-1 text-muted-foreground hover:bg-accent/50 hover:text-warning group/term"
              onClick={() => focusOrOpen(tabId)}
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
  );
}
