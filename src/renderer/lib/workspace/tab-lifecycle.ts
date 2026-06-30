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
