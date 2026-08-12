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
import { resolveSessionWorktreeContext } from "@/lib/git/session-worktree-context";
import { openSessionCitations } from "@/lib/literature/jump-to-staged-citation";
import { InlineEditableField } from "@/modes/literature-mode/literature-inline-field";
import { cn } from "@/lib/utils";
import type { SessionAgent } from "../../../../shared/session-agent";
import {
  BookMarkedIcon,
  BookOpenIcon,
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
 * Session-scoped facts only: title, checkout, mode, citations, intensive.
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

  const sessionAgent = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === tabId);
    return tab?.sessionAgent ?? "build";
  });
  const intensiveCount = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === tabId);
    return tab?.intensivePaperIds.length ?? 0;
  });
  const ModeIcon = SESSION_AGENT_ICONS[sessionAgent] ?? HammerIcon;

  const citationCount = useCitationStagingStore((s) =>
    sessionId ? s.getCitationsForSession(sessionId).length : 0,
  );

  // Keep the panel open while the title InlineEditableField has focus. Without
  // this, a trackpad or hand movement during typing can move the cursor out
  // of the panel, the 100ms closeDelay fires, and the input unmounts mid-type.
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
        if (!open) setIsInlineEditing(false);
      }}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent ref={contentRef} side="bottom" align="start" className="w-64 p-3">
        <div className="space-y-2">
          <div className="min-w-0">
            <InlineEditableField
              value={title}
              onSave={async (next) => {
                await useChatStore.getState().renameSession(tabId, next);
              }}
              displayClassName={cn(
                "text-[length:var(--font-chat-meta)] text-foreground truncate font-medium",
                "block w-full min-w-0 cursor-pointer rounded-[3px] px-1 py-0.5 -mx-1",
                "hover:bg-muted/50 transition-colors",
              )}
              placeholder={t("chat.openTabs.renamePlaceholder")}
            />
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

          <div className="flex items-center gap-2 min-w-0">
            <ModeIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-[length:var(--font-chat-meta)] text-foreground truncate">
              {sessionAgent === "plan"
                ? t("chat.sessionAgent.plan")
                : t("chat.sessionAgent.build")}
            </span>
          </div>

          {sessionId ? (
            <button
              type="button"
              className="flex items-center gap-2 w-full min-w-0 text-left rounded-sm cursor-pointer transition-colors -mx-1 px-1 py-0.5 text-foreground hover:bg-accent/50"
              onClick={() => openSessionCitations(sessionId)}
            >
              <BookMarkedIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[length:var(--font-chat-meta)] truncate">
                {citationCount > 0
                  ? t("chat.openTabs.citationsCount", { count: citationCount })
                  : t("chat.openTabs.citationsNone")}
              </span>
            </button>
          ) : null}

          {intensiveCount > 0 ? (
            <div className="flex items-center gap-2 min-w-0">
              <BookOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[length:var(--font-chat-meta)] text-foreground truncate">
                {t("chat.openTabs.intensiveCount", { count: intensiveCount })}
              </span>
            </div>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
