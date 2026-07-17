import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

/** Save the dirty file / literature note bound to the active RightArea tab. */
export function saveActiveWorkspaceFile(): boolean {
  const rp = useRightPanelStore.getState();
  const activeTab = rp.tabs.find((t) => t.id === rp.activeTabId);
  if (!activeTab) return false;

  if (activeTab.kind === "literature" && activeTab.literaturePaperId) {
    const notePath =
      useLiteratureReaderStore.getState().activeNotePathByPaper[activeTab.literaturePaperId];
    if (notePath && useDocumentStore.getState().isFileDirty(notePath)) {
      void useDocumentStore.getState().saveFile(notePath);
      return true;
    }
    return false;
  }

  const fileId = activeTab.fileId;
  if (
    fileId &&
    (activeTab.kind === "file" || activeTab.kind === "texworkspace") &&
    useDocumentStore.getState().isFileDirty(fileId)
  ) {
    void useDocumentStore.getState().saveFile(fileId);
    return true;
  }

  return false;
}
