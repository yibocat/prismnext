import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { resolveAiMirrorKey } from "@/lib/terminal/mirror-key";
import { terminalTabLabelFromCommand } from "./root";

/** Stable title for a chat-bound AI terminal session tab. */
export function aiSessionTabTitle(command?: string): string {
  if (command?.trim()) {
    return `AI · ${terminalTabLabelFromCommand(command)}`;
  }
  return "AI · Terminal";
}

/** Find the open AI terminal tab owned by a chat tab (source of truth in right-panel). */
export function findOpenAiTabForChat(chatTabId: string): string | undefined {
  return useRightPanelStore
    .getState()
    .tabs.find(
      (t) =>
        t.kind === "terminal"
        && t.terminalSource === "ai"
        && t.linkedChatTabId === chatTabId,
    )?.id;
}

/** Keep one AI terminal tab per chat; close accidental duplicates. */
export function consolidateAiTabsForChat(chatTabId: string): string | undefined {
  const tabs = useRightPanelStore.getState().tabs;
  const matches = tabs.filter(
    (t) =>
      t.kind === "terminal"
      && t.terminalSource === "ai"
      && t.linkedChatTabId === chatTabId,
  );
  if (matches.length === 0) return undefined;
  const [keeper, ...dupes] = matches;
  if (dupes.length > 0) {
    for (const dup of dupes) {
      useRightPanelStore.getState().removeAiTabSilently(dup.id);
    }
    useTerminalAiStore.getState().discardAiTabUiState(dupes.map((d) => d.id));
  }
  return keeper.id;
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

/** Resolve mirror text for an AI terminal tab (session log is source of truth). */
export function resolveAiTabMirror(
  aiTabId: string,
  sessionMirrorLog: Record<string, string>,
  mirrorText: Record<string, string>,
): string {
  const tab = useRightPanelStore.getState().tabs.find((t) => t.id === aiTabId);
  const chatTabId = tab?.linkedChatTabId;
  const session = chatTabId ? sessionMirrorLog[resolveAiMirrorKey(chatTabId)] ?? "" : "";
  const local = mirrorText[aiTabId] ?? "";
  if (!session) return local;
  if (!local) return session;
  return session.length >= local.length ? session : local;
}
