/**
 * Pure session list status for left-sidebar rows.
 * Priority: archived > waiting > running > unread > read
 */

export type SessionListStatusKind =
  | "archived"
  | "waiting"
  | "running-stream"
  | "running-terminal"
  | "unread"
  | "read";

export interface SessionListStatusInput {
  archivedRow?: boolean;
  isActive?: boolean;
  isWaitingPermission?: boolean;
  isStreaming?: boolean;
  isAiTerminalRunning?: boolean;
  isUnread?: boolean;
}

export interface SessionListStatus {
  kind: SessionListStatusKind;
  /** When true, show a bottom-right badge on a custom / implicit icon. */
  showStatusBadge: boolean;
}

export function isActiveSessionId(
  sessionId: string,
  active: { activeTabId?: string | null; sessionId?: string | null },
  activeTab?: {
    id?: string | null;
    sessionId?: string | null;
    conversationId?: string | null;
  } | null,
): boolean {
  if (!sessionId.trim()) return false;
  if (active.sessionId === sessionId || active.activeTabId === sessionId) return true;
  if (!activeTab) return false;
  return (
    activeTab.id === sessionId
    || activeTab.sessionId === sessionId
    || activeTab.conversationId === sessionId
  );
}

export function isActiveSessionFromChatState(
  sessionId: string,
  chat: {
    activeTabId?: string | null;
    sessionId?: string | null;
    tabs: Array<{
      id: string;
      sessionId?: string | null;
      conversation?: { conversationId?: string };
    }>;
  },
): boolean {
  const tab = chat.tabs.find((item) => item.id === chat.activeTabId);
  return isActiveSessionId(
    sessionId,
    chat,
    tab
      ? {
          id: tab.id,
          sessionId: tab.sessionId ?? null,
          conversationId: tab.conversation?.conversationId ?? null,
        }
      : null,
  );
}

export type SessionStatusFilter = "all" | "waiting" | "running" | "unread" | "read";

export function matchesSessionStatusFilter(
  kind: SessionListStatusKind,
  filter: SessionStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "running") {
    return kind === "running-stream" || kind === "running-terminal";
  }
  return kind === filter;
}

export function deriveSessionListStatus(input: SessionListStatusInput): SessionListStatus {
  if (input.archivedRow) {
    return { kind: "archived", showStatusBadge: false };
  }
  if (input.isWaitingPermission) {
    return { kind: "waiting", showStatusBadge: true };
  }
  if (input.isStreaming) {
    return { kind: "running-stream", showStatusBadge: true };
  }
  if (input.isAiTerminalRunning) {
    return { kind: "running-terminal", showStatusBadge: true };
  }
  if (input.isUnread && !input.isActive) {
    return { kind: "unread", showStatusBadge: true };
  }
  return { kind: "read", showStatusBadge: false };
}
