/**
 * Jump to a staged citation in the Literature "Session citations" subview.
 *
 * Expands RightArea, activates Literature mode, switches to Session citations,
 * and scrolls/expands the matching row.
 */
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useCitationStagingStore } from "@/stores/citation-staging-store";

export function jumpToStagedCitation(sessionId: string, refId: number): void {
  useCitationStagingStore.getState().setActiveSession(sessionId);
  useCitationStagingStore.getState().revealPanelForSession(sessionId);

  const layout = useLayoutStore.getState();
  layout.activateMode("literature");
  // Only expand when RightArea is hidden — never reset an existing split on citation jump.
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

  const litStore = useLiteratureStore.getState();
  litStore.setLibrarySubview("session-citations");
  litStore.setPendingCitationJump(refId);
}
