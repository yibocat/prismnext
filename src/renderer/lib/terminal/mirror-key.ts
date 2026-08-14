import { useChatStore } from "@/stores/chat-store";

/**
 * Durable key for dismiss flags and session lifecycle.
 * OpenCode sessionId when bound; provisional chatTabId until then.
 */
export function resolveAiMirrorKey(chatTabId: string): string {
  const tab = useChatStore.getState().tabs.find((t) => t.id === chatTabId);
  return tab?.sessionId ?? chatTabId;
}

/** Resolve chat tab from OpenCode sessionId (inverse lookup). */
export function resolveChatTabIdForSession(sessionId: string): string | undefined {
  return useChatStore.getState().tabs.find((t) => t.sessionId === sessionId)?.id;
}
