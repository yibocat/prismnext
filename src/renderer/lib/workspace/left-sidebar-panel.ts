import { useLayoutStore } from "@/stores/layout-store";
import {
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MAX,
  SIDEBAR_LEFT_MIN,
} from "@/styles/constants";
import {
  LEFT_SIDEBAR_TOGGLE_MS,
  SIDEBAR_FULLY_COLLAPSED_PX,
} from "@/lib/workspace/layout-constants";
import { applyShellWindowLayout } from "@/lib/workspace/shell-layout-controller";

/** Live collapsed mark — CSS can inset the title bar without remounting chrome. */
export const LEFT_SIDEBAR_COLLAPSED_ATTR = "data-left-sidebar-collapsed";

/** Click toggle: ease the shell column width. Sidebar slab stays at preferred px. */
export const LEFT_SIDEBAR_ANIMATING_ATTR = "data-left-sidebar-animating";

/** Pixel width of the left-sidebar slab — sash preferred, not the live yield. */
export const LEFT_SIDEBAR_WIDTH_VAR = "--left-sidebar-width";

let toggleGeneration = 0;
let toggleTimer: ReturnType<typeof setTimeout> | undefined;

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

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function stopLeftSidebarToggleAnimation(generation?: number): void {
  if (generation != null && generation !== toggleGeneration) return;
  if (toggleTimer != null) {
    clearTimeout(toggleTimer);
    toggleTimer = undefined;
  }
  document.documentElement.removeAttribute(LEFT_SIDEBAR_ANIMATING_ATTR);
}

function startLeftSidebarToggleAnimation(onEnd?: () => void): number {
  toggleGeneration += 1;
  const generation = toggleGeneration;
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

function isLeftVisuallyOpen(): boolean {
  const st = useLayoutStore.getState();
  return st.leftUserExpanded && !st.leftWindowCollapsed;
}

/** Toggle the left sidebar (same behavior as the title-bar PanelLeft button). */
export function toggleLeftSidebarPanel(): void {
  const st = useLayoutStore.getState();
  if (isLeftVisuallyOpen()) {
    st.setLeftUserExpanded(false);
    st.setLeftWindowCollapsed(false);
    st.setLeftPinToMin(false);
    syncLeftSidebarCollapsedMark(0);
    runSidebarSizeChange(() => {
      applyShellWindowLayout({ source: "toggle" });
    });
    return;
  }

  const width = Math.min(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX);
  st.setLeftUserExpanded(true);
  st.setLeftWindowCollapsed(false);
  st.setLeftPinToMin(false);
  syncLeftSidebarCollapsedMark(width);
  runSidebarSizeChange(() => {
    applyShellWindowLayout({ source: "toggle" });
  });
}
