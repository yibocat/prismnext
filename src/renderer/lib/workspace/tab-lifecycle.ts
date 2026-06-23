import type { RightTab } from "./mode-registry";
import { useDocumentStore } from "@/stores/document-store";

export function isFileTabDirty(tab: RightTab): boolean {
  if (tab.kind !== "file" || !tab.fileId) return false;
  return useDocumentStore.getState().isFileDirty(tab.fileId);
}

export function tabDisplayTitle(tab: RightTab, dirtyFileIds?: Set<string>): string {
  if (tab.kind === "file" && tab.isInitial) return "folder";
  const isDirty = !!(tab.fileId && dirtyFileIds?.has(tab.fileId));
  return isDirty ? `*${tab.title}` : tab.title;
}
