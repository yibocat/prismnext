import { useChatStore } from "@/stores/chat-store";
import { appendRingBuffer } from "./ring-buffer";

/**
 * Durable key for session mirror log + dismiss flags.
 * OpenCode sessionId when bound; provisional chatTabId until then.
 */
export function resolveAiMirrorKey(chatTabId: string): string {
  const tab = useChatStore.getState().tabs.find((t) => t.id === chatTabId);
  return tab?.sessionId ?? chatTabId;
}

/** Merge provisional chat-tab log into OpenCode sessionId when session is bound. */
export function migrateMirrorLogOnSessionBound(
  sessionMirrorLog: Record<string, string>,
  chatTabId: string,
  sessionId: string,
): Record<string, string> {
  if (!sessionId || sessionId === chatTabId) return sessionMirrorLog;

  const provisional = sessionMirrorLog[chatTabId];
  const existing = sessionMirrorLog[sessionId] ?? "";
  const next = { ...sessionMirrorLog };

  if (provisional) {
    if (!existing) {
      next[sessionId] = provisional;
    } else if (provisional.length > existing.length) {
      next[sessionId] = appendRingBuffer(existing, provisional.slice(existing.length));
    }
    delete next[chatTabId];
  }

  return next;
}

/** Resolve mirror key from OpenCode sessionId (inverse lookup). */
export function resolveChatTabIdForSession(sessionId: string): string | undefined {
  return useChatStore.getState().tabs.find((t) => t.sessionId === sessionId)?.id;
}
