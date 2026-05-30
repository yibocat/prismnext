import { useChatStore } from "@/stores/chat-store";

/**
 * Returns the active chat session title, or null when there are no messages.
 * Abstracts the chat-store internals away from layout components.
 */
export function useSessionTitle(): string | null {
  return useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!tab || tab.messages.length === 0) return null;
    return tab.title;
  });
}
