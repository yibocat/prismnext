import type { LeftNavContext } from "./types";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { RESIZE_FILL_PX } from "@/lib/workspace/layout-constants";
import { runWithProgrammaticCenterResize } from "@/lib/workspace/layout-resize-guard";
import {
  openRightArea,
  type RightAreaLayoutCtx,
} from "@/lib/workspace/right-area-layout";

export function isTexWorkspaceOpen(): boolean {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  return (
    rps.tabs.some((t) => t.kind === "texworkspace") &&
    st.rightAreaExpanded &&
    st.focusedMode === "texworkspace"
  );
}

function finishTexClose(ctx: LeftNavContext, onClosed?: () => void): void {
  const st = useLayoutStore.getState();
  st.setEditorMaximized(false);
  st.setRightAreaExpanded(false);
  ctx.panelRefs.centerRef?.current?.expand();
  ctx.panelRefs.rightAreaRef?.current?.collapse();
  onClosed?.();
}

/** Close TeX Workspace tab and return layout to the chat-centered view. */
export function closeTexWorkspace(ctx: LeftNavContext, onClosed?: () => void): void {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  const hasTab = rps.tabs.some((t) => t.kind === "texworkspace");

  st.setEditorMaximized(false);
  if (!hasTab && st.focusedMode !== "texworkspace") {
    finishTexClose(ctx, onClosed);
    return;
  }

  st.deactivateMode("texworkspace");
  if (hasTab) {
    rps.closeTabsOfKind("texworkspace", { onClosed: () => finishTexClose(ctx, onClosed) });
  } else {
    finishTexClose(ctx, onClosed);
  }
}

function finishLiteratureClose(ctx: LeftNavContext, onClosed?: () => void): void {
  const st = useLayoutStore.getState();
  st.setEditorMaximized(false);
  st.setRightAreaExpanded(false);
  ctx.panelRefs.centerRef?.current?.expand();
  ctx.panelRefs.rightAreaRef?.current?.collapse();
  onClosed?.();
}

export function isLiteraturePanelOpen(): boolean {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  return (
    rps.tabs.some((t) => t.kind === "literature") &&
    st.rightAreaExpanded &&
    st.focusedMode === "literature"
  );
}

/** Open Literature library full-width in RightArea (same maximize pattern as TeX Workspace). */
export function openLiteratureLibrary(ctx: LeftNavContext): void {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  const r = ctx.panelRefs.rightAreaRef?.current;
  const c = ctx.panelRefs.centerRef?.current;
  if (!r || !c) return;

  useLiteratureStore.getState().setLibrarySubview("library");
  rps.ensureTab("literature");
  st.setLeftSidebarView("sessions");
  st.activateMode("literature");
  st.setRightAreaExpanded(true);
  st.setEditorMaximized(true);
  runWithProgrammaticCenterResize(() => {
    if (r.isCollapsed()) r.expand();
    c.collapse();
    r.resize(RESIZE_FILL_PX);
  });
}

/** Exit maximized Literature and restore chat-centered layout (tabs kept). */
export function closeLiteraturePanel(ctx: LeftNavContext, onClosed?: () => void): void {
  const st = useLayoutStore.getState();
  st.setEditorMaximized(false);
  if (st.focusedMode !== "literature") {
    finishLiteratureClose(ctx, onClosed);
    return;
  }
  st.deactivateMode("literature");
  finishLiteratureClose(ctx, onClosed);
}

function finishExperimentsClose(ctx: LeftNavContext, onClosed?: () => void): void {
  const st = useLayoutStore.getState();
  st.setEditorMaximized(false);
  st.setRightAreaExpanded(false);
  ctx.panelRefs.centerRef?.current?.expand();
  ctx.panelRefs.rightAreaRef?.current?.collapse();
  onClosed?.();
}

export function isExperimentsPanelOpen(): boolean {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  return (
    rps.tabs.some((t) => t.kind === "experiments") &&
    st.rightAreaExpanded &&
    st.focusedMode === "experiments"
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

/** Open Literature in split (or chat-first maximize when too narrow). */
export function openLiteratureSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  closeTexWorkspace(ctx);
  closeExperimentsPanel(ctx);
  useLiteratureStore.getState().setLibrarySubview("library");
  rps.ensureTab("literature");
  st.setLeftSidebarView("sessions");
  st.activateMode("literature");
  openRightArea(rightAreaCtxFromLeftNav(ctx, layout));
}

/**
 * Shortcut: maximize Literature (toggle off when already maximized).
 * From split → promote to maximize.
 */
export function toggleLiteratureMaximize(ctx: LeftNavContext): void {
  const st = useLayoutStore.getState();
  if (isLiteraturePanelOpen() && st.editorMaximized) {
    closeLiteraturePanel(ctx);
    st.setLeftSidebarView("sessions");
    return;
  }
  closeTexWorkspace(ctx);
  closeExperimentsPanel(ctx);
  openLiteratureLibrary(ctx);
}

/** Shortcut: split Literature (toggle off when already split; demote when maximized). */
export function toggleLiteratureSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  const st = useLayoutStore.getState();
  if (isLiteraturePanelOpen() && !st.editorMaximized) {
    closeLiteraturePanel(ctx);
    st.setLeftSidebarView("sessions");
    return;
  }
  openLiteratureSplit(ctx, layout);
}

/** Open Experiments in split (or chat-first maximize when too narrow). */
export function openExperimentsSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  closeTexWorkspace(ctx);
  closeLiteraturePanel(ctx);
  rps.ensureTab("experiments");
  st.setLeftSidebarView("sessions");
  st.activateMode("experiments");
  openRightArea(rightAreaCtxFromLeftNav(ctx, layout));
}

export function toggleExperimentsMaximize(ctx: LeftNavContext): void {
  const st = useLayoutStore.getState();
  if (isExperimentsPanelOpen() && st.editorMaximized) {
    closeExperimentsPanel(ctx);
    st.setLeftSidebarView("sessions");
    return;
  }
  closeTexWorkspace(ctx);
  closeLiteraturePanel(ctx);
  openExperimentsPanel(ctx);
}

export function toggleExperimentsSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  const st = useLayoutStore.getState();
  if (isExperimentsPanelOpen() && !st.editorMaximized) {
    closeExperimentsPanel(ctx);
    st.setLeftSidebarView("sessions");
    return;
  }
  openExperimentsSplit(ctx, layout);
}

/** Open TeX Workspace in split (or chat-first maximize when too narrow). */
export function openTexWorkspaceSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  closeLiteraturePanel(ctx);
  closeExperimentsPanel(ctx);
  rps.ensureTab("texworkspace");
  st.setLeftSidebarView("sessions");
  st.activateMode("texworkspace");
  openRightArea(rightAreaCtxFromLeftNav(ctx, layout));
}

export function toggleTexWorkspaceMaximize(ctx: LeftNavContext): void {
  const st = useLayoutStore.getState();
  if (isTexWorkspaceOpen() && st.editorMaximized) {
    closeTexWorkspace(ctx);
    return;
  }
  closeLiteraturePanel(ctx);
  closeExperimentsPanel(ctx);
  const rps = useRightPanelStore.getState();
  const r = ctx.panelRefs.rightAreaRef?.current;
  const c = ctx.panelRefs.centerRef?.current;
  if (!r || !c) return;
  rps.ensureTab("texworkspace");
  st.setLeftSidebarView("sessions");
  st.activateMode("texworkspace");
  st.setRightAreaExpanded(true);
  st.setEditorMaximized(true);
  runWithProgrammaticCenterResize(() => {
    if (r.isCollapsed()) r.expand();
    c.collapse();
    r.resize(RESIZE_FILL_PX);
  });
}

export function toggleTexWorkspaceSplit(
  ctx: LeftNavContext,
  layout?: Pick<RightAreaLayoutCtx, "leftSidebarRef" | "isMobile">,
): void {
  const st = useLayoutStore.getState();
  if (isTexWorkspaceOpen() && !st.editorMaximized) {
    closeTexWorkspace(ctx);
    return;
  }
  openTexWorkspaceSplit(ctx, layout);
}

/** Open Experiments mode full-width in RightArea (same maximize pattern as Literature / TeX). */
export function openExperimentsPanel(ctx: LeftNavContext): void {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  const r = ctx.panelRefs.rightAreaRef?.current;
  const c = ctx.panelRefs.centerRef?.current;
  if (!r || !c) return;

  rps.ensureTab("experiments");
  st.setLeftSidebarView("sessions");
  st.activateMode("experiments");
  st.setRightAreaExpanded(true);
  st.setEditorMaximized(true);
  runWithProgrammaticCenterResize(() => {
    if (r.isCollapsed()) r.expand();
    c.collapse();
    r.resize(RESIZE_FILL_PX);
  });
}

/** Exit maximized Experiments and restore chat-centered layout (tabs kept). */
export function closeExperimentsPanel(ctx: LeftNavContext, onClosed?: () => void): void {
  const st = useLayoutStore.getState();
  st.setEditorMaximized(false);
  if (st.focusedMode !== "experiments") {
    finishExperimentsClose(ctx, onClosed);
    return;
  }
  st.deactivateMode("experiments");
  finishExperimentsClose(ctx, onClosed);
}
