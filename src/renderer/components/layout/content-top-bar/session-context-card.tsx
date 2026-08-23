import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import { useDocumentStore } from "@/stores/document-store";
import { useChatStore } from "@/stores/chat-store";
import { useGitStore } from "@/stores/git-store";
import {
  readCurrentGitBranch,
  resolveSessionWorktreeContext,
} from "@/lib/git/session-worktree-context";
import { openSessionCitations } from "@/lib/literature/jump-to-staged-citation";
import { InlineEditableField } from "@/modes/literature-mode/literature-inline-field";
import { cn } from "@/lib/utils";
import type { SessionAgent } from "../../../../shared/agent/session-agent";
import {
  BookMarkedIcon,
  BookOpenIcon,
  Folder,
  GitBranchIcon,
  HammerIcon,
  ListTodoIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";

const SESSION_AGENT_ICONS: Record<SessionAgent, LucideIcon> = {
  build: HammerIcon,
  plan: ListTodoIcon,
};

const ROW = "flex items-center gap-1.5 min-w-0";
const ICON = "size-3 shrink-0 text-muted-foreground";
const TEXT = "text-[length:var(--font-menu-item)] text-foreground truncate leading-tight";
const TEXT_WRAP = "text-[length:var(--font-menu-item)] text-foreground break-all leading-tight";
const HINT = "text-[length:var(--font-hint)] text-muted-foreground truncate leading-tight";

interface SessionContextCardProps {
  title: string;
  /** Open tab id when the chat is already in the strip. */
  tabId?: string | null;
  sessionId?: string | null;
  /** Session-bound cwd — preferred over global active worktree. */
  sessionDirectory?: string | null;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  children: ReactElement;
}

/**
 * Hover panel for a chat tab / session title.
 * Session-scoped facts only: title, checkout, mode, citations, intensive.
 */
export function SessionContextCard({
  tabId,
  title,
  sessionId,
  sessionDirectory,
  side = "bottom",
  align = "start",
  children,
}: SessionContextCardProps) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const liveBranch = useGitStore((s) => s.branch);
  const checkoutContext = resolveSessionWorktreeContext(
    sessionDirectory ?? projectRoot,
    projectRoot,
    worktrees,
  );

  const resolvedTabId = useChatStore((s) => {
    if (tabId) return tabId;
    if (!sessionId) return null;
    return s.tabs.find((item) => item.id === sessionId || item.sessionId === sessionId)?.id ?? null;
  });
  const conversationId = sessionId || resolvedTabId || null;

  const sessionAgent = useChatStore((s) => {
    if (!resolvedTabId) return null;
    const tab = s.tabs.find((item) => item.id === resolvedTabId);
    return tab?.sessionAgent ?? null;
  });
  const intensiveCount = useChatStore((s) => {
    if (!resolvedTabId) return 0;
    const tab = s.tabs.find((item) => item.id === resolvedTabId);
    return tab?.intensivePaperIds.length ?? 0;
  });
  const ModeIcon = sessionAgent ? SESSION_AGENT_ICONS[sessionAgent] ?? HammerIcon : null;

  const citationCount = useCitationStagingStore((s) =>
    conversationId ? s.getCitationsForSession(conversationId).length : 0,
  );

  const [fetchedBranch, setFetchedBranch] = useState<string | null>(null);
  const sameProjectLocal =
    checkoutContext.kind === "local"
    && Boolean(projectRoot)
    && (!sessionDirectory || sessionDirectory === projectRoot);
  const gitBranch =
    checkoutContext.gitBranch
    || (sameProjectLocal && liveBranch && liveBranch !== "(no branch)" ? liveBranch : null)
    || fetchedBranch;

  const contentRef = useRef<HTMLDivElement>(null);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const onFocusIn = (e: FocusEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-lit-inline-editor]")) {
        setIsInlineEditing(true);
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (!next || !content.contains(next)) {
        setIsInlineEditing(false);
      }
    };
    content.addEventListener("focusin", onFocusIn);
    content.addEventListener("focusout", onFocusOut);
    return () => {
      content.removeEventListener("focusin", onFocusIn);
      content.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return (
    <HoverCard
      openDelay={300}
      closeDelay={100}
      open={isInlineEditing || undefined}
      onOpenChange={(open) => {
        if (!open) {
          setIsInlineEditing(false);
          return;
        }
        if (gitBranch || !checkoutContext.directory) return;
        void readCurrentGitBranch(checkoutContext.directory).then(setFetchedBranch);
      }}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        ref={contentRef}
        side={side}
        align={align}
        sideOffset={6}
        className="w-64 p-2"
      >
        <div className="space-y-1">
          <div className="min-w-0">
            <InlineEditableField
              value={title}
              onSave={async (next) => {
                const id = resolvedTabId || conversationId;
                if (!id) return;
                await useChatStore.getState().renameSession(id, next);
              }}
              displayClassName={cn(
                TEXT,
                "font-medium block w-full min-w-0 cursor-pointer rounded-[3px] px-1 py-0.5 -mx-1",
                "hover:bg-muted transition-colors",
              )}
              placeholder={t("chat.openTabs.renamePlaceholder")}
            />
          </div>

          {checkoutContext.directory ? (
            <div className={cn(ROW, "items-start")}>
              <Folder className={cn(ICON, "mt-px")} />
              <span className={cn(TEXT_WRAP, "select-text")}>
                {checkoutContext.directory}
              </span>
            </div>
          ) : null}

          {checkoutContext.kind === "worktree" || checkoutContext.kind === "closed-worktree" ? (
            <div className={ROW}>
              <WorkflowIcon className={cn(ICON, checkoutContext.kind === "worktree" && "text-primary")} />
              <div className="min-w-0">
                <div className={TEXT}>{checkoutContext.worktreeName ?? checkoutContext.label}</div>
                {checkoutContext.kind === "closed-worktree" ? (
                  <div className={HINT}>{t("chat.openTabs.worktreeRemoved")}</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={ROW}>
            <GitBranchIcon className={ICON} />
            <div className="min-w-0">
              <div className={TEXT}>
                {gitBranch || t("chat.openTabs.noBranch")}
              </div>
              {checkoutContext.kind === "worktree" && checkoutContext.baseBranch ? (
                <div className={HINT}>
                  {t("chat.openTabs.mergesInto", { branch: checkoutContext.baseBranch })}
                </div>
              ) : null}
            </div>
          </div>

          {sessionAgent && ModeIcon ? (
            <div className={ROW}>
              <ModeIcon className={ICON} />
              <span className={TEXT}>
                {sessionAgent === "plan"
                  ? t("chat.sessionAgent.plan")
                  : t("chat.sessionAgent.build")}
              </span>
            </div>
          ) : null}

          {conversationId ? (
            <button
              type="button"
              className={cn(ROW, "w-full text-left rounded-sm cursor-pointer transition-colors -mx-1 px-1 py-0.5 hover:bg-accent")}
              onClick={() => openSessionCitations(conversationId)}
            >
              <BookMarkedIcon className={ICON} />
              <span className={TEXT}>
                {citationCount > 0
                  ? t("chat.openTabs.citationsCount", { count: citationCount })
                  : t("chat.openTabs.citationsNone")}
              </span>
            </button>
          ) : null}

          {intensiveCount > 0 ? (
            <div className={ROW}>
              <BookOpenIcon className={ICON} />
              <span className={TEXT}>
                {t("chat.openTabs.intensiveCount", { count: intensiveCount })}
              </span>
            </div>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
