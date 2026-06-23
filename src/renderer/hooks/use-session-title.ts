import { useChatStore } from "@/stores/chat-store";
import { resolveSessionTitle } from "@/lib/chat/session-title";

/**
 * Returns the active chat session title, or null when there is nothing to show.
 * Resolves @ / inline-composer display text even when tab.title is still generic.
 */
export function useSessionTitle(): string | null {
  return useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!tab) return null;
    return resolveSessionTitle(tab);
  });
}
