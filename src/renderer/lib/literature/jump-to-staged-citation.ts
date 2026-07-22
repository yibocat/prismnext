/**
 * Jump to Session citations in the Literature library.
 *
 * Expands RightArea, activates Literature mode, switches to Session citations,
 * and optionally scrolls/expands a matching staged citation row.
 */
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useCitationStagingStore } from "@/stores/citation-staging-store";

/** Open Literature → Session citations for a chat session (no row jump). */
export function openSessionCitations(sessionId: string): void {
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

  useLiteratureStore.getState().setLibrarySubview("session-citations");
}

/** Open Session citations and scroll/expand the matching staged citation. */
export function jumpToStagedCitation(sessionId: string, refId: number): void {
  openSessionCitations(sessionId);
  useLiteratureStore.getState().setPendingCitationJump(refId);
}
