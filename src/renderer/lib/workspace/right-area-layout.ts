/**
 * RightArea L1 panel orchestration — closed / split (minimize) / maximize.
 * Single home for store ↔ react-resizable-panels sync.
 */
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import {
  MAIN_AREA_MIN,
  RIGHT_AREA_DEFAULT,
  RIGHT_AREA_MIN,
  RIGHT_AREA_MAX,
  SIDEBAR_LEFT_MIN,
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MAX,
} from "@/styles/constants";
import {
  PANEL_COLLAPSE_THRESHOLD_PX,
  RESIZE_FILL_PX,
  SPLIT_MARGIN_PX,
} from "@/lib/workspace/layout-constants";
import { runWithProgrammaticCenterResize } from "@/lib/workspace/layout-resize-guard";

export type RightAreaPanelRefs = {
  centerRef: PanelImperativeHandle | null | undefined;
  rightAreaRef: PanelImperativeHandle | null | undefined;
  leftSidebarRef?: PanelImperativeHandle | null | undefined;
};

export type RightAreaLayoutCtx = RightAreaPanelRefs & {
  isMobile?: boolean;
};

export type RightAreaVisualState = "closed" | "split" | "maximize";

/** Minimum main-area width that can host center + right at their mins. */
export const SPLIT_MAIN_MIN_PX = MAIN_AREA_MIN + RIGHT_AREA_MIN + SPLIT_MARGIN_PX;

export function deriveRightAreaVisualState(
  expanded: boolean,
  maximized: boolean,
): RightAreaVisualState {
  if (!expanded) return "closed";
  return maximized ? "maximize" : "split";
}

function clampRightWidth(width: number): number {
  return Math.min(Math.max(width, RIGHT_AREA_MIN), RIGHT_AREA_MAX);
}

function leftSidebarPx(leftSidebarRef?: PanelImperativeHandle | null): number {
  const raw = leftSidebarRef?.getSize().inPixels ?? 0;
  if (raw < PANEL_COLLAPSE_THRESHOLD_PX) return 0;
  return raw;
}

/** main-area width = window − inline left sidebar. */
export function measureMainAreaWidthPx(
  leftSidebarRef?: PanelImperativeHandle | null,
): number {
  if (typeof window === "undefined") return 0;
  return Math.max(window.innerWidth - leftSidebarPx(leftSidebarRef), 0);
}

/**
 * Fit a preferred RightArea width into the current main-area so center keeps
 * MAIN_AREA_MIN (+ SPLIT_MARGIN). Without this, opening split with a large
 * persisted `rightAreaWidth` (e.g. 500) on a medium main (~720) crushes center
 * to ~0 → looks maximized and trips editorMaximized via onResize.
 */
export function fitSplitRightWidthPx(mainPx: number, preferredPx: number): number {
  const maxRight = Math.max(RIGHT_AREA_MIN, mainPx - MAIN_AREA_MIN - SPLIT_MARGIN_PX);
  return Math.min(clampRightWidth(preferredPx), maxRight);
}

/** Split mode needs center ≥ MAIN_AREA_MIN and right ≥ RIGHT_AREA_MIN (+ margin). */
export function computeCanSplitRightArea(
  leftSidebarRef?: PanelImperativeHandle | null,
): boolean {
  return measureMainAreaWidthPx(leftSidebarRef) >= SPLIT_MAIN_MIN_PX;
}

function saveSplitRightWidth(rightAreaRef: PanelImperativeHandle | null | undefined): void {
  const st = useLayoutStore.getState();
  if (st.editorMaximized) return;
  const r = rightAreaRef;
  if (!r || r.isCollapsed()) return;
  const w = r.getSize().inPixels;
  if (w >= RIGHT_AREA_MIN) {
    st.setRightAreaWidth(clampRightWidth(w));
  }
}

function applyMaximizePanels(refs: RightAreaPanelRefs): void {
  runWithProgrammaticCenterResize(() => {
    refs.centerRef?.collapse();
    if (refs.rightAreaRef?.isCollapsed()) {
      refs.rightAreaRef.expand();
    }
    refs.rightAreaRef?.resize(RESIZE_FILL_PX);
  });
}

function applySplitPanels(
  refs: RightAreaPanelRefs,
  widthPx: number = useLayoutStore.getState().rightAreaWidth || RIGHT_AREA_DEFAULT,
): void {
  const main = measureMainAreaWidthPx(refs.leftSidebarRef);
  const w = fitSplitRightWidthPx(main, widthPx);
  runWithProgrammaticCenterResize(() => {
    if (refs.rightAreaRef?.isCollapsed()) {
      refs.rightAreaRef.expand();
    }
    refs.centerRef?.expand();
    refs.rightAreaRef?.resize(w);
  });
}

function applyClosedPanels(refs: RightAreaPanelRefs): void {
  runWithProgrammaticCenterResize(() => {
    refs.rightAreaRef?.collapse();
    refs.centerRef?.resize(RESIZE_FILL_PX);
  });
}

/** Open RightArea already maximized (toolbar / mode shortcuts with Shift). */
export function openRightAreaMaximized(ctx: RightAreaLayoutCtx): void {
  if (!ctx.rightAreaRef) return;
  const st = useLayoutStore.getState();
  st.setRightAreaExpanded(true);
  st.setEditorMaximized(true);
  applyMaximizePanels(ctx);
}

/** Open RightArea — split when wide enough, else chat-first maximize.
 *  When already visually open, leave panel sizes alone (preserve user drag width / maximize).
 *  Store `rightAreaExpanded` alone is not enough: chat deep links call
 *  `requestRightAreaExpand()` (sets the flag) before App runs `openRightArea` on a
 *  still-collapsed panel — those must still apply split/maximize.
 */
export function openRightArea({ centerRef, rightAreaRef, leftSidebarRef, isMobile }: RightAreaLayoutCtx): void {
  const r = rightAreaRef;
  if (!r) return;

  const st = useLayoutStore.getState();
  if (st.rightAreaExpanded && !r.isCollapsed()) {
    // Truly open — do not re-apply split/maximize (would jump width back to store default).
    return;
  }

  const canSplit = !isMobile && computeCanSplitRightArea(leftSidebarRef);

  st.setRightAreaExpanded(true);

  if (canSplit) {
    st.setEditorMaximized(false);
    applySplitPanels({ centerRef, rightAreaRef, leftSidebarRef });
    return;
  }

  st.setEditorMaximized(true);
  applyMaximizePanels({ centerRef, rightAreaRef, leftSidebarRef });
}

/**
 * Deep links (chat inline tokens, tool widgets) — open RightArea when closed,
 * but preserve maximize vs split when already expanded.
 */
export function openRightAreaForDeepLink(ctx: RightAreaLayoutCtx): void {
  const st = useLayoutStore.getState();
  const collapsed = ctx.rightAreaRef?.isCollapsed() ?? true;
  if (!st.rightAreaExpanded || collapsed) {
    openRightArea(ctx);
    return;
  }
  if (st.editorMaximized) {
    applyMaximizePanels(ctx);
    return;
  }
  // Split — mode/tab focus only; do not re-run openRightArea (would reset drag width).
}

/** Close RightArea — center fills main-area; preserve last split width when not maximized. */
export function closeRightArea({ centerRef, rightAreaRef }: RightAreaPanelRefs): void {
  saveSplitRightWidth(rightAreaRef);
  const st = useLayoutStore.getState();
  st.setEditorMaximized(false);
  st.setRightAreaExpanded(false);
  st.clearPendingRightAreaRestore();
  applyClosedPanels({ centerRef, rightAreaRef });
}

/**
 * Toolbar / ⌘⇧J maximize control:
 * - closed → open already maximized
 * - split ↔ maximize when canSplit
 * - maximize → close when !canSplit or mobile
 */
export function toggleRightAreaMaximize(ctx: RightAreaLayoutCtx): void {
  const st = useLayoutStore.getState();
  if (!st.rightAreaExpanded) {
    if (!ctx.rightAreaRef) return;
    st.setRightAreaExpanded(true);
    st.setEditorMaximized(true);
    applyMaximizePanels(ctx);
    return;
  }

  if (st.editorMaximized) {
    const canSplit = !ctx.isMobile && computeCanSplitRightArea(ctx.leftSidebarRef);
    if (canSplit) {
      st.setEditorMaximized(false);
      applySplitPanels(ctx);
    } else {
      closeRightArea(ctx);
    }
    return;
  }

  saveSplitRightWidth(ctx.rightAreaRef);
  st.setEditorMaximized(true);
  applyMaximizePanels(ctx);
}

/**
 * When main-area shrinks below split minimum:
 * - split mode → close RightArea, keep Content (chat-first)
 * - maximize mode → stay maximized (workspace full screen)
 */
export function reconcileRightAreaOnMainAreaResize(ctx: RightAreaLayoutCtx): void {
  const st = useLayoutStore.getState();
  if (!st.rightAreaExpanded) return;
  if (st.leftSidebarView === "settings") return;

  const canSplit = !ctx.isMobile && computeCanSplitRightArea(ctx.leftSidebarRef);
  if (canSplit) return;

  if (st.editorMaximized) {
    applyMaximizePanels(ctx);
    return;
  }

  closeRightArea(ctx);
}

/** Reset RightArea when opening a project (spec A12). */
export function resetRightAreaForProjectOpen(refs: RightAreaPanelRefs): void {
  const st = useLayoutStore.getState();
  st.setRightAreaExpanded(false);
  st.setEditorMaximized(false);
  applyClosedPanels(refs);
}

/** Clamp persisted sidebar defaults on read (legacy 220 < min 280). */
export function clampPersistedLeftSidebarWidth(width: number | undefined): number {
  const w = width || SIDEBAR_LEFT_DEFAULT;
  return Math.min(Math.max(w, SIDEBAR_LEFT_MIN), SIDEBAR_LEFT_MAX);
}
