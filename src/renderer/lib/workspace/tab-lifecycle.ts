import type { RightTab } from "./mode-registry";
import { modeRegistry } from "./mode-registry";
import { useDocumentStore } from "@/stores/document-store";
import { literatureTabNotePath } from "@/lib/literature/literature-note-tab";
import { settingsPanelSlotTitle } from "@/lib/settings/settings-panel-slots";
import { i18n } from "@/lib/i18n";

export function isFileTabDirty(tab: RightTab): boolean {
  if ((tab.kind !== "file" && tab.kind !== "research-plan") || !tab.fileId) return false;
  return useDocumentStore.getState().isFileDirty(tab.fileId);
}

export function isTabDirty(tab: RightTab, dirtyFileIds?: Set<string>): boolean {
  if ((tab.kind === "file" || tab.kind === "research-plan") && tab.fileId) {
    return dirtyFileIds?.has(tab.fileId) ?? isFileTabDirty(tab);
  }
  if (tab.kind === "literature") {
    const notePath = literatureTabNotePath(tab);
    return notePath ? (dirtyFileIds?.has(notePath) ?? useDocumentStore.getState().isFileDirty(notePath)) : false;
  }
  if (tab.fileId && dirtyFileIds?.has(tab.fileId)) return true;
  return false;
}

export function tabDisplayTitle(tab: RightTab, dirtyFileIds?: Set<string>): string {
  if (tab.kind === "file" && tab.isInitial) {
    return i18n.t("modes.files.folder", { defaultValue: "folder" });
  }
  let title = tab.title;
  if (tab.kind === "settings-editor" && tab.settingsSlot) {
    title = settingsPanelSlotTitle(tab.settingsSlot) ?? tab.title;
  } else if (tab.isInitial) {
    const mode = modeRegistry.findByTabKind(tab.kind);
    if (mode?.initialTitleKey) {
      title = i18n.t(mode.initialTitleKey, { defaultValue: mode.initialTitle });
    }
  }
  const isDirty = isTabDirty(tab, dirtyFileIds);
  return isDirty ? `*${title}` : title;
}

export function isLiteratureHomeTab(tab: RightTab): boolean {
  return tab.kind === "literature" && !tab.literaturePaperId;
}

export function isLiteraturePaperTab(tab: RightTab): boolean {
  return tab.kind === "literature" && Boolean(tab.literaturePaperId);
}

export function isExperimentsHomeTab(tab: RightTab): boolean {
  return tab.kind === "experiments" && !tab.experimentId;
}

export function isExperimentsDetailTab(tab: RightTab): boolean {
  return tab.kind === "experiments" && Boolean(tab.experimentId);
}

/** Strip mode-specific payload when resetting a persistent home tab. */
export function buildInitialTabShell(tab: RightTab, initialTitle: string): RightTab {
  return {
    id: tab.id,
    kind: tab.kind,
    title: initialTitle,
    isInitial: true,
  };
}
