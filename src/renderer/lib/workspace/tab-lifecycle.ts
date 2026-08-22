import type { RightTab, RightTabKind } from "./mode-registry";
import { isFileBackedTab, modeRegistry } from "./mode-registry";
import { useDocumentStore } from "@/stores/document-store";
import { literatureTabNotePath } from "@/lib/literature/literature-note-tab";
import { settingsPanelSlotTitle } from "@/lib/settings/settings-panel-slots";
import { i18n } from "@/lib/i18n";

export function createHomeTab(kind: RightTabKind, id: string, title?: string): RightTab {
  const resolvedTitle = title ?? modeRegistry.findByTabKind(kind)?.initialTitle ?? kind;
  const base = { id, title: resolvedTitle, isInitial: true as const };
  switch (kind) {
    case "file":
      return { ...base, kind: "file" };
    case "research-plan":
      return { ...base, kind: "research-plan" };
    case "browser":
      return { ...base, kind: "browser" };
    case "git-overview":
      return { ...base, kind: "git-overview" };
    case "git-diff":
      return { ...base, kind: "git-diff" };
    case "texworkspace":
      return { ...base, kind: "texworkspace" };
    case "terminal":
      return { ...base, kind: "terminal" };
    case "settings-editor":
      return { ...base, kind: "settings-editor" };
    case "literature":
      return { ...base, kind: "literature" };
    case "experiments":
      return { ...base, kind: "experiments" };
    case "interaction":
      return { ...base, kind: "interaction" };
  }
}

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
  if (isFileBackedTab(tab) && tab.fileId && dirtyFileIds?.has(tab.fileId)) return true;
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
  return createHomeTab(tab.kind, tab.id, initialTitle);
}
