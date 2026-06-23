import type { RightTab } from "./mode-registry";
import { isFileTabDirty } from "./tab-lifecycle";
import { useTerminalStore } from "@/stores/terminal-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";

export interface TabCloseConfirmation {
  tabId: string;
  title: string;
  description: string;
  detail?: string;
  confirmLabel: string;
  destructive?: boolean;
}

export function isTerminalTabBusy(tabId: string): boolean {
  const tab = useRightPanelStore.getState().tabs.find((t) => t.id === tabId);
  if (tab?.terminalSource === "ai") {
    return useTerminalAiStore.getState().getSessionStateForAiTab(tabId)?.phase === "running";
  }
  return useTerminalStore.getState().sessions[tabId]?.busy === true;
}

export function getTabCloseConfirmation(tab: RightTab): TabCloseConfirmation | null {
  if (tab.kind === "terminal") {
    if (!isTerminalTabBusy(tab.id)) return null;
    const killOnClose =
      useSettingsStore.getState().settings.aiTerminalCloseTabKillsProcess === true;
    if (tab.terminalSource === "ai") {
      return {
        tabId: tab.id,
        title: "Close AI Terminal",
        description: killOnClose
          ? "A command is still running. Closing will cancel it."
          : "A command is still running. The tab will close but the command continues in the background.",
        detail: killOnClose
          ? "You can reopen the terminal from the session panel or bash widget."
          : "Use the session title menu to watch progress or reopen the terminal.",
        confirmLabel: "Close AI Terminal",
        destructive: killOnClose,
      };
    }
    return {
      tabId: tab.id,
      title: "Close Terminal",
      description: "A command is still running in this terminal.",
      detail: "Closing will interrupt the running process.",
      confirmLabel: "Close Terminal",
      destructive: true,
    };
  }

  if (tab.kind === "file" && tab.fileId && isFileTabDirty(tab)) {
    const label = tab.title || tab.fileId;
    return {
      tabId: tab.id,
      title: "Close File",
      description: `"${label}" has unsaved changes.`,
      detail: "Your edits will be lost unless you save first.",
      confirmLabel: "Close Without Saving",
      destructive: true,
    };
  }

  return null;
}

/** Confirmation for closing multiple tabs at once (mode exit / close all). */
export function getBatchTabCloseConfirmation(tabs: RightTab[]): TabCloseConfirmation | null {
  const busyTerminals = tabs.filter((t) => t.kind === "terminal" && isTerminalTabBusy(t.id));
  if (busyTerminals.length > 0) {
    return {
      tabId: busyTerminals[0].id,
      title: busyTerminals.length === 1 ? "Close Terminal" : "Close Terminals",
      description:
        busyTerminals.length === 1
          ? "A command is still running in this terminal."
          : `${busyTerminals.length} terminals still have running commands.`,
      detail: "Closing will interrupt the running processes.",
      confirmLabel: busyTerminals.length === 1 ? "Close Terminal" : "Close All",
      destructive: true,
    };
  }

  const dirtyFile = tabs.find((t) => getTabCloseConfirmation(t)?.title === "Close File");
  if (dirtyFile) {
    return getTabCloseConfirmation(dirtyFile);
  }

  return null;
}
