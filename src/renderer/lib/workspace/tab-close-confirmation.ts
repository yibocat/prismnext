import type { RightTab } from "./mode-registry";
import { isFileTabDirty } from "./tab-lifecycle";
import { useTerminalStore } from "@/stores/terminal-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useSettingsStore } from "@/stores/settings-store";
import { i18n } from "@/lib/i18n";

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
        title: i18n.t("dialogs.tabClose.closeAiTerminal"),
        description: killOnClose
          ? i18n.t("dialogs.tabClose.aiRunningKill")
          : i18n.t("dialogs.tabClose.aiRunningKeep"),
        detail: killOnClose
          ? i18n.t("dialogs.tabClose.aiDetailKill")
          : i18n.t("dialogs.tabClose.aiDetailKeep"),
        confirmLabel: i18n.t("dialogs.tabClose.closeAiTerminal"),
        destructive: killOnClose,
      };
    }
    return {
      tabId: tab.id,
      title: i18n.t("dialogs.tabClose.closeTerminal"),
      description: i18n.t("dialogs.tabClose.terminalRunning"),
      detail: i18n.t("dialogs.tabClose.terminalDetail"),
      confirmLabel: i18n.t("dialogs.tabClose.closeTerminal"),
      destructive: true,
    };
  }

  if (tab.kind === "file" && tab.fileId && isFileTabDirty(tab)) {
    const label = tab.title || tab.fileId;
    return {
      tabId: tab.id,
      title: i18n.t("dialogs.tabClose.closeFile"),
      description: i18n.t("dialogs.tabClose.fileUnsaved", { label }),
      detail: i18n.t("dialogs.tabClose.fileDetail"),
      confirmLabel: i18n.t("dialogs.tabClose.closeWithoutSaving"),
      destructive: true,
    };
  }

  return null;
}

/** Confirmation for closing multiple tabs at once (mode exit / close all). */
export function getBatchTabCloseConfirmation(tabs: RightTab[]): TabCloseConfirmation | null {
  const busyTerminals = tabs.filter((t) => t.kind === "terminal" && isTerminalTabBusy(t.id));
  if (busyTerminals.length > 0) {
    const count = busyTerminals.length;
    return {
      tabId: busyTerminals[0].id,
      title:
        count === 1
          ? i18n.t("dialogs.tabClose.closeTerminal")
          : i18n.t("dialogs.tabClose.closeTerminals"),
      description:
        count === 1
          ? i18n.t("dialogs.tabClose.terminalRunning")
          : i18n.t("dialogs.tabClose.terminalsRunning", { count }),
      detail: i18n.t("dialogs.tabClose.terminalsDetail"),
      confirmLabel:
        count === 1
          ? i18n.t("dialogs.tabClose.closeTerminal")
          : i18n.t("dialogs.tabClose.closeAll"),
      destructive: true,
    };
  }

  const dirtyFile = tabs.find((t) => t.kind === "file" && t.fileId && isFileTabDirty(t));
  if (dirtyFile) {
    return getTabCloseConfirmation(dirtyFile);
  }

  return null;
}
