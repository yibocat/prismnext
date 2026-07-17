/**
 * Left-nav / shortcut helpers for TeX · Library · Experiments in RightArea.
 * Opening a mode focuses it in parallel with other modes (no sibling teardown).
 * Dismissing a mode closes only that mode’s tabs; RightArea collapses only when empty.
 */
import type { LeftNavContext } from "./types";
import type { RightToolbarTab } from "@/stores/layout-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { deactivateModeFromToolbar } from "@/lib/workspace/deactivate-mode";
import {
  openRightArea,
  openRightAreaMaximized,
  type RightAreaLayoutCtx,
} from "@/lib/workspace/right-area-layout";

export type LeftNavWorkspaceMode = "texworkspace" | "literature" | "experiments";

export function isTexWorkspaceOpen(): boolean {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  return (
    rps.tabs.some((t) => t.kind === "texworkspace")
    && st.rightAreaExpanded
    && st.focusedMode === "texworkspace"
  );
}

export function isLiteraturePanelOpen(): boolean {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  return (
    rps.tabs.some((t) => t.kind === "literature")
    && st.rightAreaExpanded
    && st.focusedMode === "literature"
  );
}

export function isExperimentsPanelOpen(): boolean {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  return (
    rps.tabs.some((t) => t.kind === "experiments")
    && st.rightAreaExpanded
    && st.focusedMode === "experiments"
  );
}

function rightAreaCtxFromLeftNav(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): RightAreaLayoutCtx {
  return {
    centerRef: ctx.panelRefs.centerRef?.current,
    rightAreaRef: ctx.panelRefs.rightAreaRef?.current,
    leftSidebarRef: layout?.leftSidebarRef,
    isMobile: layout?.isMobile,
  };
}

/** Collapse RightArea only when no tabs remain. */
export function maybeCollapseRightAreaIfEmpty(ctx: LeftNavContext): void {
  const rps = useRightPanelStore.getState();
  if (rps.tabs.length > 0) return;

  const st = useLayoutStore.getState();
  st.setEditorMaximized(false);
  st.setRightAreaExpanded(false);
  ctx.panelRefs.centerRef?.current?.expand();
  ctx.panelRefs.rightAreaRef?.current?.collapse();
}

/**
 * Ensure mode tab + focus + open RightArea.
 * Does not close sibling modes or their tabs.
 */
export function focusModeInRightArea(
  modeId: LeftNavWorkspaceMode,
  ctx: LeftNavContext,
  options?: {
    maximize?: boolean;
    layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">;
  },
): void {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();

  if (modeId === "literature") {
    useLiteratureStore.getState().setLibrarySubview("library");
  }

  rps.ensureTab(modeId);
  st.setLeftSidebarView("sessions");
  st.activateMode(modeId as RightToolbarTab);

  const layoutCtx = rightAreaCtxFromLeftNav(ctx, options?.layout);
  if (options?.maximize) {
    openRightAreaMaximized(layoutCtx);
  } else {
    openRightArea(layoutCtx);
  }
}

/**
 * Dismiss one mode (close its tabs like the toolbar), keep sibling tabs.
 * Collapse RightArea only when nothing is left.
 */
export function dismissModeFromRightArea(
  modeId: LeftNavWorkspaceMode,
  ctx: LeftNavContext,
  onClosed?: () => void,
): void {
  deactivateModeFromToolbar(modeId, {
    onComplete: () => {
      maybeCollapseRightAreaIfEmpty(ctx);
      onClosed?.();
    },
  });
}

/** @deprecated Prefer dismissModeFromRightArea — kept for immersive nav callers. */
export function closeTexWorkspace(ctx: LeftNavContext, onClosed?: () => void): void {
  dismissModeFromRightArea("texworkspace", ctx, onClosed);
}

/** @deprecated Prefer dismissModeFromRightArea */
export function closeLiteraturePanel(ctx: LeftNavContext, onClosed?: () => void): void {
  dismissModeFromRightArea("literature", ctx, onClosed);
}

/** @deprecated Prefer dismissModeFromRightArea */
export function closeExperimentsPanel(ctx: LeftNavContext, onClosed?: () => void): void {
  dismissModeFromRightArea("experiments", ctx, onClosed);
}

export function openLiteratureLibrary(ctx: LeftNavContext): void {
  focusModeInRightArea("literature", ctx, { maximize: true });
}

export function openLiteratureSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  focusModeInRightArea("literature", ctx, { layout });
}

export function toggleLiteratureMaximize(ctx: LeftNavContext): void {
  const st = useLayoutStore.getState();
  if (isLiteraturePanelOpen() && st.editorMaximized) {
    dismissModeFromRightArea("literature", ctx, () => {
      st.setLeftSidebarView("sessions");
    });
    return;
  }
  openLiteratureLibrary(ctx);
}

export function toggleLiteratureSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  const st = useLayoutStore.getState();
  if (isLiteraturePanelOpen() && !st.editorMaximized) {
    dismissModeFromRightArea("literature", ctx, () => {
      st.setLeftSidebarView("sessions");
    });
    return;
  }
  openLiteratureSplit(ctx, layout);
}

export function openExperimentsSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  focusModeInRightArea("experiments", ctx, { layout });
}

export function openExperimentsPanel(ctx: LeftNavContext): void {
  focusModeInRightArea("experiments", ctx, { maximize: true });
}

export function toggleExperimentsMaximize(ctx: LeftNavContext): void {
  const st = useLayoutStore.getState();
  if (isExperimentsPanelOpen() && st.editorMaximized) {
    dismissModeFromRightArea("experiments", ctx, () => {
      st.setLeftSidebarView("sessions");
    });
    return;
  }
  openExperimentsPanel(ctx);
}

export function toggleExperimentsSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  const st = useLayoutStore.getState();
  if (isExperimentsPanelOpen() && !st.editorMaximized) {
    dismissModeFromRightArea("experiments", ctx, () => {
      st.setLeftSidebarView("sessions");
    });
    return;
  }
  openExperimentsSplit(ctx, layout);
}

export function openTexWorkspaceSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  focusModeInRightArea("texworkspace", ctx, { layout });
}

export function openTexWorkspaceMaximized(ctx: LeftNavContext): void {
  focusModeInRightArea("texworkspace", ctx, { maximize: true });
}

export function toggleTexWorkspaceMaximize(ctx: LeftNavContext): void {
  const st = useLayoutStore.getState();
  if (isTexWorkspaceOpen() && st.editorMaximized) {
    dismissModeFromRightArea("texworkspace", ctx);
    return;
  }
  openTexWorkspaceMaximized(ctx);
}

export function toggleTexWorkspaceSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  const st = useLayoutStore.getState();
  if (isTexWorkspaceOpen() && !st.editorMaximized) {
    dismissModeFromRightArea("texworkspace", ctx);
    return;
  }
  openTexWorkspaceSplit(ctx, layout);
}
