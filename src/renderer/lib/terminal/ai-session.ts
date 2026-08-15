import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { isJobMonitorTab } from "@/lib/workspace/mode-registry";
import { terminalTabLabelFromCommand } from "./root";

/** Stable title for a chat-bound AI terminal session tab. */
export function aiSessionTabTitle(command?: string): string {
  if (command?.trim()) {
    return `AI · ${terminalTabLabelFromCommand(command)}`;
  }
  return "AI · Terminal";
}

/** Find an open Job Monitor owned by a chat tab (legacy `"ai"` counts). */
export function findOpenAiTabForChat(chatTabId: string): string | undefined {
  return useRightPanelStore
    .getState()
    .tabs.find((t) => isJobMonitorTab(t) && t.linkedChatTabId === chatTabId)?.id;
}

/** Collapse leftover legacy AI tabs only — never close distinct Job Monitors. */
export function consolidateAiTabsForChat(chatTabId: string): string | undefined {
  const tabs = useRightPanelStore.getState().tabs;
  const legacy = tabs.filter(
    (t) =>
      t.kind === "terminal"
      && t.terminalSource === "ai"
      && t.linkedChatTabId === chatTabId,
  );
  if (legacy.length > 1) {
    const [, ...dupes] = legacy;
    for (const dup of dupes) {
      useRightPanelStore.getState().removeAiTabSilently(dup.id);
    }
    useTerminalAiStore.getState().discardAiTabUiState(dupes.map((d) => d.id));
  }
  return findOpenAiTabForChat(chatTabId);
}

export function syncAiTabTitle(aiTabId: string, command?: string): void {
  useRightPanelStore
    .getState()
    .updateTerminalTabTitle(aiTabId, aiSessionTabTitle(command));
}

export function linkAiTabToChat(aiTabId: string, chatTabId: string, toolCallId?: string): void {
  useRightPanelStore.getState().updateTab(aiTabId, {
    linkedChatTabId: chatTabId,
    linkedToolCallId: toolCallId,
  });
}
