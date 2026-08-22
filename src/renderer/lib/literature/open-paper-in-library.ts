/**
 * Navigate to a paper in the main Literature library list (not Session citations).
 */
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { paperHasReadablePdf } from "@/lib/literature/literature-format";

function activateLiteratureListTab(): void {
  const layout = useLayoutStore.getState();
  if (!layout.editorMaximized && !layout.rightAreaExpanded) {
    layout.requestRightAreaExpand();
  }

  const rightPanel = useRightPanelStore.getState();
  let litTab = rightPanel.tabs.find(
    (t) => t.kind === "literature" && !t.literaturePaperId,
  );
  if (!litTab) {
    const id = rightPanel.ensureTab("literature");
    litTab = useRightPanelStore.getState().tabs.find((t) => t.id === id) ?? undefined;
  }
  if (litTab) {
    rightPanel.setActiveTab(litTab.id);
  }
}

/** Switch to Library subview and expand the entry in the main list. */
export function openPaperInMainLibrary(paperId: string): void {
  activateLiteratureListTab();
  const litStore = useLiteratureStore.getState();
  litStore.setLibrarySubview("library");
  litStore.selectPaper(paperId);
}

/** Open the PDF reader for a library entry (human reading). */
export function openPaperPdfReader(paperId: string, title: string): void {
  const paper = useLiteratureStore.getState().papers.find((p) => p.id === paperId);
  if (!paper || !paperHasReadablePdf(paper)) return;
  const layout = useLayoutStore.getState();
  if (!layout.editorMaximized && !layout.rightAreaExpanded) {
    layout.requestRightAreaExpand();
  }
  useRightPanelStore.getState().openLiteraturePaper(paperId, title, "reader");
}
