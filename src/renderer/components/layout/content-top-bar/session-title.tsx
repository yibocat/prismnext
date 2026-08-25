import { useChatStore } from "@/stores/chat-store";
import { SessionContextCard } from "./session-context-card";

interface SessionTitleProps {
  title: string;
  /** Session-bound cwd — preferred over global active worktree. */
  sessionDirectory?: string | null;
}

/** Single-tab title control — hover shows session-scoped context. */
export function SessionTitle({
  title,
  sessionDirectory,
}: SessionTitleProps) {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const sessionId = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.sessionId ?? null;
  });

  if (!activeTabId) {
    return (
      <div className="flex items-center min-w-0 max-w-[240px]">
        <span className="truncate rounded px-2 py-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground max-w-full">
          {title}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center min-w-0 max-w-[240px]">
      <SessionContextCard
        tabId={activeTabId}
        title={title}
        sessionId={sessionId}
        sessionDirectory={sessionDirectory}
      >
        <button
          type="button"
          className="truncate rounded px-2 py-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground hover:text-foreground transition-colors max-w-full cursor-pointer"
        >
          {title}
        </button>
      </SessionContextCard>
    </div>
  );
}
