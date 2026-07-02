import type { RightTab } from "./mode-registry";
import { useDocumentStore } from "@/stores/document-store";
import { literatureTabNotePath } from "@/lib/literature/literature-note-tab";

export function isFileTabDirty(tab: RightTab): boolean {
  if (tab.kind !== "file" || !tab.fileId) return false;
  return useDocumentStore.getState().isFileDirty(tab.fileId);
}

export function isTabDirty(tab: RightTab, dirtyFileIds?: Set<string>): boolean {
  if (tab.kind === "file" && tab.fileId) {
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
  if (tab.kind === "file" && tab.isInitial) return "folder";
  const isDirty = isTabDirty(tab, dirtyFileIds);
  return isDirty ? `*${tab.title}` : tab.title;
}

export function isLiteratureHomeTab(tab: RightTab): boolean {
  return tab.kind === "literature" && !tab.literaturePaperId;
}

export function isLiteraturePaperTab(tab: RightTab): boolean {
  return tab.kind === "literature" && Boolean(tab.literaturePaperId);
}

/** Literature tab close overrides the generic persistent-mode reset behavior. */
export type LiteratureTabCloseAction = "deactivate-mode" | "remove-and-ensure-home";

export function getLiteratureTabCloseAction(
  closingTab: RightTab,
  allTabs: RightTab[],
): LiteratureTabCloseAction | null {
  if (closingTab.kind !== "literature") return null;

  const literatureTabs = allTabs.filter((t) => t.kind === "literature");

  if (isLiteratureHomeTab(closingTab)) {
    return "deactivate-mode";
  }

  if (isLiteraturePaperTab(closingTab) && literatureTabs.length === 1) {
    return "remove-and-ensure-home";
  }

  return null;
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
