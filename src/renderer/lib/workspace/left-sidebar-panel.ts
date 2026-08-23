import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import {
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MAX,
  SIDEBAR_LEFT_MIN,
  SIDEBAR_OVERLAY_THRESHOLD,
} from "@/styles/constants";
import {
  LEFT_SIDEBAR_TOGGLE_MS,
  SIDEBAR_FULLY_COLLAPSED_PX,
} from "@/lib/workspace/layout-constants";
import { reconcileRightAreaOnMainAreaResize } from "@/lib/workspace/right-area-layout";

/** Live collapsed mark — CSS can inset the title bar without remounting chrome. */
export const LEFT_SIDEBAR_COLLAPSED_ATTR = "data-left-sidebar-collapsed";

/** Click toggle: ease the shell slot (flex-grow). Sidebar content stays a pixel slab. */
export const LEFT_SIDEBAR_ANIMATING_ATTR = "data-left-sidebar-animating";

/** Pixel width of the left-sidebar slab — not a percentage of the window. */
export const LEFT_SIDEBAR_WIDTH_VAR = "--left-sidebar-width";

let primaryPointerDown = false;
let toggleAnimating = false;
let toggleGeneration = 0;
let toggleTimer: ReturnType<typeof setTimeout> | undefined;

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.isPrimary !== false;
}

export function syncLeftSidebarCollapsedMark(inPixels: number): void {
  document.documentElement.toggleAttribute(
    LEFT_SIDEBAR_COLLAPSED_ATTR,
    inPixels <= SIDEBAR_FULLY_COLLAPSED_PX,
  );
}

/** Keep the slab at the persisted pixel width (280–520). Do not write live collapse widths. */
export function syncLeftSidebarWidthVar(widthPx: number): void {
  const px = Math.min(Math.max(widthPx || SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MIN), SIDEBAR_LEFT_MAX);
  document.documentElement.style.setProperty(LEFT_SIDEBAR_WIDTH_VAR, `${px}px`);
}

/** Title-bar store flag — chrome buttons follow the CSS mark, not this. */
export function commitLeftSidebarChrome(inPixels: number): void {
  const next = inPixels <= SIDEBAR_FULLY_COLLAPSED_PX;
  const st = useLayoutStore.getState();
  if (st.sidebarFullyCollapsed === next) return;
  st.setSidebarFullyCollapsed(next);
}

/** After a gesture, trust the live mark — panel getSize() can still report the expanded width. */
export function commitLeftSidebarChromeFromMark(): void {
  const collapsed = document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR);
  commitLeftSidebarChrome(collapsed ? 0 : SIDEBAR_LEFT_DEFAULT);
}

/** True while a click/shortcut toggle is interpolating. Sash drag is never this. */
export function isLeftSidebarToggleAnimating(): boolean {
  return toggleAnimating;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function stopLeftSidebarToggleAnimation(generation?: number): void {
  if (generation != null && generation !== toggleGeneration) return;
  toggleAnimating = false;
  if (toggleTimer != null) {
    clearTimeout(toggleTimer);
    toggleTimer = undefined;
  }
  document.documentElement.removeAttribute(LEFT_SIDEBAR_ANIMATING_ATTR);
}

function startLeftSidebarToggleAnimation(onEnd?: () => void): number {
  toggleGeneration += 1;
  const generation = toggleGeneration;
  toggleAnimating = true;
  document.documentElement.setAttribute(LEFT_SIDEBAR_ANIMATING_ATTR, "");
  if (toggleTimer != null) clearTimeout(toggleTimer);
  toggleTimer = setTimeout(() => {
    stopLeftSidebarToggleAnimation(generation);
    if (generation === toggleGeneration) onEnd?.();
  }, LEFT_SIDEBAR_TOGGLE_MS);
  return generation;
}

function runSidebarSizeChange(apply: () => void, after?: () => void): void {
  if (prefersReducedMotion()) {
    stopLeftSidebarToggleAnimation();
    apply();
    after?.();
    return;
  }
  const generation = startLeftSidebarToggleAnimation(after);
  requestAnimationFrame(() => {
    if (generation !== toggleGeneration) return;
    apply();
  });
}

/** Panel resize: CSS mark always; store flag only when no sash gesture is active. */
export function onLeftSidebarPanelResize(inPixels: number): void {
  if (toggleAnimating) return;
  syncLeftSidebarCollapsedMark(inPixels);
  if (!primaryPointerDown) commitLeftSidebarChrome(inPixels);
}

/** Track the primary pointer so a live sash drag does not flip the store mid-gesture. */
export function watchLeftSidebarResizeChrome(): () => void {
  const onDown = (event: PointerEvent) => {
    if (!isPrimaryPointer(event)) return;
    primaryPointerDown = true;
    stopLeftSidebarToggleAnimation();
  };
  const onUp = (event: PointerEvent) => {
    if (!isPrimaryPointer(event)) return;
    primaryPointerDown = false;
    commitLeftSidebarChromeFromMark();
  };
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  return () => {
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    primaryPointerDown = false;
    stopLeftSidebarToggleAnimation();
  };
}

function isSettingsShell(): boolean {
  return useLayoutStore.getState().leftSidebarView === "settings";
}

export function isLeftSidebarOverlayWidth(width = window.innerWidth): boolean {
  return width < SIDEBAR_OVERLAY_THRESHOLD;
}

/** Wide Settings keeps the category rail open; a narrow window uses overlay instead. */
function isSettingsSidebarLocked(): boolean {
  return isSettingsShell() && !isLeftSidebarOverlayWidth();
}

/**
 * Settings landing layout:
 * - wide window → keep the category rail inline (do not leave it folded)
 * - narrow window → collapse the slot and show the list as overlay so the
 *   settings cards keep a readable width
 */
export function syncSettingsLeftSidebar(
  leftSidebarRef: { current: PanelImperativeHandle | null },
): void {
  const st = useLayoutStore.getState();
  const p = leftSidebarRef.current;

  if (isLeftSidebarOverlayWidth()) {
    if (p && !p.isCollapsed()) p.collapse();
    st.setSidebarExpanded(false);
    st.setSidebarFullyCollapsed(true);
    syncLeftSidebarCollapsedMark(0);
    st.setLeftSidebarOverlay(true);
    return;
  }

  if (st.leftSidebarOverlay) st.setLeftSidebarOverlay(false);
  const width = Math.min(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX);
  st.setSidebarExpanded(true);
  st.setSidebarFullyCollapsed(false);
  syncLeftSidebarCollapsedMark(width);
  if (!p) return;
  if (p.isCollapsed()) {
    p.expand();
    p.resize(width);
  }
}

/** Toggle the left sidebar panel (same behavior as the title-bar PanelLeft button). */
export function toggleLeftSidebarPanel(
  leftSidebarRef: { current: PanelImperativeHandle | null },
  opts?: {
    centerRef?: { current: PanelImperativeHandle | null };
    rightAreaRef?: { current: PanelImperativeHandle | null };
    isMobile?: boolean;
  },
): void {
  const st = useLayoutStore.getState();
  if (isSettingsSidebarLocked()) return;
  if (st.leftSidebarOverlay) {
    st.setLeftSidebarOverlay(false);
    return;
  }
  const p = leftSidebarRef.current;
  if (!p) return;
  if (p.isCollapsed()) {
    if (window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD) {
      st.setLeftSidebarOverlay(true);
    } else {
      const width = Math.min(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX);
      st.setLeftSidebarOverlay(false);
      st.setSidebarExpanded(true);
      st.setSidebarFullyCollapsed(false);
      // Clear the mark immediately so the pinned + / title-bar spacer ease away
      // while the panel grows — do not wait for the last frame.
      syncLeftSidebarCollapsedMark(width);
      runSidebarSizeChange(() => {
        p.expand();
        p.resize(width);
        if (opts?.centerRef || opts?.rightAreaRef) {
          reconcileRightAreaOnMainAreaResize({
            centerRef: opts.centerRef?.current,
            rightAreaRef: opts.rightAreaRef?.current,
            leftSidebarRef: p,
            isMobile: opts.isMobile,
          });
        }
      });
    }
  } else {
    st.setSidebarExpanded(false);
    st.setSidebarFullyCollapsed(true);
    // Hand chrome to the pinned cluster at the start so + / status-dot move
    // with the panel instead of popping in after the slide finishes.
    syncLeftSidebarCollapsedMark(0);
    runSidebarSizeChange(() => {
      p.collapse();
    });
  }
}
