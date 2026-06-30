import type { RightTab } from "@/lib/workspace/mode-registry";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";

/** Active reading-note path for a literature tab, if any. */
export function literatureTabNotePath(tab: RightTab): string | null {
  if (tab.kind !== "literature" || !tab.literaturePaperId) return null;
  return useLiteratureReaderStore.getState().activeNotePathByPaper[tab.literaturePaperId] ?? null;
}

export function isLiteratureTabNoteDirty(tab: RightTab): boolean {
  const notePath = literatureTabNotePath(tab);
  if (!notePath) return false;
  return useDocumentStore.getState().isFileDirty(notePath);
}

export function literatureTabDirtyFileId(tab: RightTab): string | null {
  if (tab.kind !== "literature") return null;
  const notePath = literatureTabNotePath(tab);
  if (!notePath) return null;
  return useDocumentStore.getState().isFileDirty(notePath) ? notePath : null;
}
