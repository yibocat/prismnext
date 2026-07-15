import { SIDEBAR_RIGHT_MIN, SIDEBAR_RIGHT_MAX } from "@/styles/constants";
import { PANEL_COLLAPSE_THRESHOLD_PX } from "@/lib/workspace/layout-constants";

/** Minimum main-pane width when sidebar is split alongside content. */
export const RIGHT_AREA_MIN_CONTENT = 150;

/** Below this container width, split layout cannot fit min sidebar + min content. */
export const RIGHT_AREA_SPLIT_THRESHOLD = SIDEBAR_RIGHT_MIN + RIGHT_AREA_MIN_CONTENT;

/** Hysteresis: widen past this before leaving full-mode overlay. */
export const RIGHT_AREA_SPLIT_RECOVER = RIGHT_AREA_SPLIT_THRESHOLD + 40;

export function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_RIGHT_MIN, Math.min(SIDEBAR_RIGHT_MAX, width));
}

/** Hard upper bound for rendered sidebar width. */
export function clampSidebarMax(width: number): number {
  return Math.min(width, SIDEBAR_RIGHT_MAX);
}

/**
 * Clamp live drag preview — hard stop at min/max when already open.
 * Sub-min preview is allowed only when opening from collapsed (< SIDEBAR_RIGHT_MIN).
 * Collapse detection still uses the raw drag width (below collapse threshold).
 */
export function clampSidebarDragPreviewWidth(
  width: number,
  dragStartWidth: number,
): number {
  if (width < PANEL_COLLAPSE_THRESHOLD_PX) return width;

  const capped = clampSidebarMax(width);

  if (dragStartWidth < SIDEBAR_RIGHT_MIN && capped < SIDEBAR_RIGHT_MIN) {
    return Math.max(capped, PANEL_COLLAPSE_THRESHOLD_PX);
  }

  return Math.max(capped, SIDEBAR_RIGHT_MIN);
}

export function computeEffectiveSidebarWidth(
  containerWidth: number,
  preferredWidth: number,
  minContent = RIGHT_AREA_MIN_CONTENT,
  /** Lower bound for rendered width (default SIDEBAR_RIGHT_MIN; use collapse threshold while dragging). */
  widthFloor = SIDEBAR_RIGHT_MIN,
): number {
  if (containerWidth <= 0) return clampSidebarMax(preferredWidth);
  const squeezed = Math.min(
    preferredWidth,
    Math.max(widthFloor, containerWidth - minContent),
  );
  return clampSidebarMax(squeezed);
}

/** True when rendered width is capped by container squeeze, not user preference. */
export function isSidebarSqueezedByContainer(
  actualWidth: number,
  containerWidth: number,
  preferredWidth: number,
): boolean {
  if (containerWidth <= 0) return false;
  const effective = computeEffectiveSidebarWidth(containerWidth, preferredWidth);
  return preferredWidth > effective + 1 && actualWidth <= effective + 1;
}

/** Auto-close only applies to split sidebar — not user-opened full overlay. */
export function shouldAutoCloseSplitSidebar(
  containerWidth: number,
  isFullMode: boolean,
): boolean {
  if (isFullMode) return false;
  return containerWidth > 0 && containerWidth < RIGHT_AREA_SPLIT_THRESHOLD;
}

export function shouldExitFullMode(containerWidth: number): boolean {
  return containerWidth >= RIGHT_AREA_SPLIT_RECOVER;
}

export function canAutoOpenSplitSidebar(containerWidth: number): boolean {
  return containerWidth >= RIGHT_AREA_SPLIT_RECOVER;
}
