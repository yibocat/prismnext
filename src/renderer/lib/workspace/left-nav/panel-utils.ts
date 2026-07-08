import type { LeftNavContext } from "./types";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLiteratureStore } from "@/stores/literature-store";

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
    st.focusedMode === "literature" &&
    st.editorMaximized
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
  st.setEditorMaximized(true);
  if (r.isCollapsed()) r.expand();
  c.collapse();
  r.resize(9999);
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
    st.focusedMode === "experiments" &&
    st.editorMaximized
  );
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
  st.setEditorMaximized(true);
  if (r.isCollapsed()) r.expand();
  c.collapse();
  r.resize(9999);
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
