/**
 * RightArea L1 — closed / split / maximize.
 * Store intents + 220ms mark. Pixel placement is `applyShellWindowLayout`.
 */
import { useLayoutStore } from "@/stores/layout-store";
import {
  MAIN_AREA_MIN,
  RIGHT_AREA_MIN,
  RIGHT_AREA_MAX,
} from "@/styles/constants";
import {
  PANEL_COLLAPSE_THRESHOLD_PX,
  RIGHT_AREA_TOGGLE_MS,
} from "@/lib/workspace/layout-constants";
import {
  applyShellWindowLayout,
  getShellLive,
  measureShellGroupPx,
} from "@/lib/workspace/shell-layout-controller";

/** Click/shortcut toggle: ease column width. */
export const RIGHT_AREA_ANIMATING_ATTR = "data-right-area-animating";

/** Live open mark — pinned + / maximize ease against this, not the last panel frame. */
export const RIGHT_AREA_OPEN_ATTR = "data-right-area-open";

export function syncRightAreaOpenMark(open: boolean): void {
  document.documentElement.toggleAttribute(RIGHT_AREA_OPEN_ATTR, open);
}

let toggleAnimating = false;
let toggleGeneration = 0;
let toggleTimer: ReturnType<typeof setTimeout> | undefined;

export function isRightAreaToggleAnimating(): boolean {
  return toggleAnimating;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function stopRightAreaToggleAnimation(generation?: number): void {
  if (generation != null && generation !== toggleGeneration) return;
  toggleAnimating = false;
  if (toggleTimer != null) {
    clearTimeout(toggleTimer);
    toggleTimer = undefined;
  }
  document.documentElement.removeAttribute(RIGHT_AREA_ANIMATING_ATTR);
}

function startRightAreaToggleAnimation(): number {
  toggleGeneration += 1;
  const generation = toggleGeneration;
  toggleAnimating = true;
  document.documentElement.setAttribute(RIGHT_AREA_ANIMATING_ATTR, "");
  if (toggleTimer != null) clearTimeout(toggleTimer);
  toggleTimer = setTimeout(() => {
    stopRightAreaToggleAnimation(generation);
  }, RIGHT_AREA_TOGGLE_MS);
  return generation;
}

function runRightAreaSizeChange(apply: () => void, animate = true): void {
  if (!animate || prefersReducedMotion()) {
    stopRightAreaToggleAnimation();
    apply();
    return;
  }
  const generation = startRightAreaToggleAnimation();
  requestAnimationFrame(() => {
    if (generation !== toggleGeneration) return;
    apply();
  });
}

/** Sash drag must stay 1:1 — drop the click-toggle transition. */
export function watchRightAreaToggleAnimation(): () => void {
  const onDown = (event: PointerEvent) => {
    if (event.isPrimary === false) return;
    stopRightAreaToggleAnimation();
  };
  window.addEventListener("pointerdown", onDown, true);
  return () => {
    window.removeEventListener("pointerdown", onDown, true);
    stopRightAreaToggleAnimation();
  };
}

export type RightAreaLayoutCtx = {
  isMobile?: boolean;
};

/** Minimum main-area width that can host center + right at their mins. */
export const SPLIT_MAIN_MIN_PX = MAIN_AREA_MIN + RIGHT_AREA_MIN;

function clampRightWidth(width: number): number {
  return Math.min(Math.max(width, RIGHT_AREA_MIN), RIGHT_AREA_MAX);
}

/** main-area width = shell − live left rail. */
export function measureMainAreaWidthPx(): number {
  if (typeof document !== "undefined") {
    const px = document.getElementById("main-area")?.clientWidth ?? 0;
    if (px > 0) return px;
  }
  if (typeof window === "undefined") return 0;
  return Math.max(measureShellGroupPx() - getShellLive().leftPx, 0);
}

export function computeCanSplitRightArea(): boolean {
  return measureMainAreaWidthPx() >= SPLIT_MAIN_MIN_PX;
}

function saveSplitRightWidth(): void {
  const st = useLayoutStore.getState();
  if (st.editorMaximized) return;
  const w = getShellLive().rightPx;
  if (w >= RIGHT_AREA_MIN) {
    st.setRightAreaWidth(clampRightWidth(w));
  }
}

function isSettingsShell(): boolean {
  return useLayoutStore.getState().leftSidebarView === "settings";
}

function isRightVisuallyOpen(): boolean {
  const st = useLayoutStore.getState();
  return st.rightAreaExpanded && getShellLive().rightPx >= PANEL_COLLAPSE_THRESHOLD_PX;
}

function applyIntent(): void {
  applyShellWindowLayout({ source: "programmatic" });
}

/** Open RightArea already maximized (⌃⌘B / toolbar maximize from closed). */
export function openRightAreaMaximized(): void {
  if (isSettingsShell()) return;
  const st = useLayoutStore.getState();
  syncRightAreaOpenMark(true);
  st.setRightAreaExpanded(true);
  st.setEditorMaximized(true);
  runRightAreaSizeChange(() => applyIntent());
}

/** Open RightArea — split when wide enough, else chat-first maximize. */
export function openRightArea({ isMobile }: RightAreaLayoutCtx = {}): void {
  if (isSettingsShell()) return;

  const st = useLayoutStore.getState();
  if (st.rightAreaExpanded && isRightVisuallyOpen()) {
    return;
  }

  const canSplit = !isMobile && computeCanSplitRightArea();

  syncRightAreaOpenMark(true);
  st.setRightAreaExpanded(true);

  if (canSplit) {
    st.setEditorMaximized(false);
    runRightAreaSizeChange(() => applyIntent());
    return;
  }

  st.setEditorMaximized(true);
  runRightAreaSizeChange(() => applyIntent());
}

export function openRightAreaForDeepLink(ctx: RightAreaLayoutCtx = {}): void {
  const st = useLayoutStore.getState();
  if (!st.rightAreaExpanded || !isRightVisuallyOpen()) {
    openRightArea(ctx);
    return;
  }
  if (st.editorMaximized) {
    runRightAreaSizeChange(() => applyIntent(), false);
  }
}

export function closeRightArea(animate = true): void {
  saveSplitRightWidth();
  const st = useLayoutStore.getState();
  syncRightAreaOpenMark(false);
  st.setEditorMaximized(false);
  st.setRightAreaExpanded(false);
  st.clearPendingRightAreaRestore();
  runRightAreaSizeChange(() => applyIntent(), animate);
}

export function toggleRightArea(ctx: RightAreaLayoutCtx = {}): void {
  if (isSettingsShell()) return;
  if (!isRightVisuallyOpen()) {
    openRightArea(ctx);
    return;
  }
  closeRightArea();
}

export function toggleMaximizedRightArea(): void {
  if (isSettingsShell()) return;
  const st = useLayoutStore.getState();
  const open = isRightVisuallyOpen();
  if (open && st.editorMaximized) {
    closeRightArea();
    return;
  }
  if (open && !st.editorMaximized) {
    saveSplitRightWidth();
  }
  openRightAreaMaximized();
}

export function toggleRightAreaMaximize(ctx: RightAreaLayoutCtx = {}): void {
  if (isSettingsShell()) return;
  const st = useLayoutStore.getState();
  if (!st.rightAreaExpanded) {
    syncRightAreaOpenMark(true);
    st.setRightAreaExpanded(true);
    st.setEditorMaximized(true);
    runRightAreaSizeChange(() => applyIntent());
    return;
  }

  if (st.editorMaximized) {
    const canSplit = !ctx.isMobile && computeCanSplitRightArea();
    if (canSplit) {
      st.setEditorMaximized(false);
      runRightAreaSizeChange(() => applyIntent());
    } else {
      closeRightArea();
    }
    return;
  }

  saveSplitRightWidth();
  st.setEditorMaximized(true);
  runRightAreaSizeChange(() => applyIntent());
}

/** Leave maximize and reapply the pixel shell. */
export function leaveRightAreaMaximize(): void {
  const st = useLayoutStore.getState();
  if (!st.editorMaximized) return;
  st.setEditorMaximized(false);
  applyIntent();
}

export function resetRightAreaForProjectOpen(): void {
  const st = useLayoutStore.getState();
  syncRightAreaOpenMark(false);
  st.setRightAreaExpanded(false);
  st.setEditorMaximized(false);
  runRightAreaSizeChange(() => applyIntent(), false);
}
