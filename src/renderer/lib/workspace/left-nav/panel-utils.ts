/**
 * Left-nav helpers for any RightArea workspace mode.
 * Opening a mode focuses it in parallel with other modes (no sibling teardown).
 * Dismissing a mode closes only that mode’s tabs; RightArea collapses only when empty.
 */
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { focusedModeId } from "@/lib/workspace/modes-from-tabs";
import { closeModeTabs } from "@/lib/workspace/close-mode-tabs";
import {
  closeRightArea,
  openRightAreaMaximized,
  openRightAreaForDeepLink,
  type RightAreaLayoutCtx,
} from "@/lib/workspace/right-area-layout";

export type LeftNavWorkspaceMode = string;

/** True when this RightArea mode is focused and the panel is expanded. */
export function isWorkspaceModeOpen(modeId: string): boolean {
  const def = modeRegistry.get(modeId);
  if (!def) return false;
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  return (
    rps.tabs.some((t) => def.tabKinds.includes(t.kind))
    && st.rightAreaExpanded
    && focusedModeId(rps.tabs, rps.activeTabId) === modeId
  );
}

export function isLiteraturePanelOpen(): boolean {
  return isWorkspaceModeOpen("literature");
}

export function isExperimentsPanelOpen(): boolean {
  return isWorkspaceModeOpen("experiments");
}

/** Collapse RightArea only when no tabs remain. */
export function maybeCollapseRightAreaIfEmpty(): void {
  const rps = useRightPanelStore.getState();
  if (rps.tabs.length > 0) return;

  closeRightArea(false);
}

/**
 * Ensure mode tab + focus + open RightArea.
 * Does not close sibling modes or their tabs.
 */
export function focusModeInRightArea(
  modeId: LeftNavWorkspaceMode,
  options?: {
    maximize?: boolean;
    layout?: Pick<RightAreaLayoutCtx, "isMobile">;
  },
): void {
  const def = modeRegistry.get(modeId);
  if (!def) return;

  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();

  if (modeId === "literature") {
    useLiteratureStore.getState().setLibrarySubview("library");
  }

  const kind = def.tabKinds[0];
  if (kind) rps.ensureTab(kind);
  st.setLeftSidebarView("sessions");

  // Modes with a list sidebar (Files / Literature / Experiments / …) open it by default.
  if (def.Sidebar && !def.hideRightSidebar) {
    st.revealRightSidebar();
  }

  if (options?.maximize) {
    openRightAreaMaximized();
    return;
  }
  openRightAreaForDeepLink(options?.layout);
}

/**
 * Dismiss one mode (close its tabs like the toolbar), keep sibling tabs.
 * Collapse RightArea only when nothing is left.
 */
export function dismissModeFromRightArea(
  modeId: LeftNavWorkspaceMode,
  onClosed?: () => void,
): void {
  closeModeTabs(modeId, {
    onComplete: () => {
      maybeCollapseRightAreaIfEmpty();
      onClosed?.();
    },
  });
}

export function openLiteratureLibrary(): void {
  focusModeInRightArea("literature", { maximize: true });
}

export function openLiteratureSplit(layout?: Pick<RightAreaLayoutCtx, "isMobile">): void {
  focusModeInRightArea("literature", { layout });
}

export function toggleLiteratureMaximize(): void {
  const st = useLayoutStore.getState();
  if (isLiteraturePanelOpen() && st.editorMaximized) {
    dismissModeFromRightArea("literature", () => {
      st.setLeftSidebarView("sessions");
    });
    return;
  }
  openLiteratureLibrary();
}

export function toggleLiteratureSplit(layout?: Pick<RightAreaLayoutCtx, "isMobile">): void {
  const st = useLayoutStore.getState();
  if (isLiteraturePanelOpen() && !st.editorMaximized) {
    dismissModeFromRightArea("literature", () => {
      st.setLeftSidebarView("sessions");
    });
    return;
  }
  openLiteratureSplit(layout);
}

export function openExperimentsSplit(layout?: Pick<RightAreaLayoutCtx, "isMobile">): void {
  focusModeInRightArea("experiments", { layout });
}

export function openExperimentsPanel(): void {
  focusModeInRightArea("experiments", { maximize: true });
}

export function toggleExperimentsMaximize(): void {
  const st = useLayoutStore.getState();
  if (isExperimentsPanelOpen() && st.editorMaximized) {
    dismissModeFromRightArea("experiments", () => {
      st.setLeftSidebarView("sessions");
    });
    return;
  }
  openExperimentsPanel();
}

export function toggleExperimentsSplit(layout?: Pick<RightAreaLayoutCtx, "isMobile">): void {
  const st = useLayoutStore.getState();
  if (isExperimentsPanelOpen() && !st.editorMaximized) {
    dismissModeFromRightArea("experiments", () => {
      st.setLeftSidebarView("sessions");
    });
    return;
  }
  openExperimentsSplit(layout);
}

export function isFilesPanelOpen(): boolean {
  return isWorkspaceModeOpen("files");
}

export function openFilesSplit(layout?: Pick<RightAreaLayoutCtx, "isMobile">): void {
  focusModeInRightArea("files", { layout });
}

export function openFilesMaximized(): void {
  focusModeInRightArea("files", { maximize: true });
}

export function toggleFilesMaximize(): void {
  const st = useLayoutStore.getState();
  if (isFilesPanelOpen() && st.editorMaximized) {
    dismissModeFromRightArea("files");
    return;
  }
  openFilesMaximized();
}

export function toggleFilesSplit(layout?: Pick<RightAreaLayoutCtx, "isMobile">): void {
  const st = useLayoutStore.getState();
  if (isFilesPanelOpen() && !st.editorMaximized) {
    dismissModeFromRightArea("files");
    return;
  }
  openFilesSplit(layout);
}
