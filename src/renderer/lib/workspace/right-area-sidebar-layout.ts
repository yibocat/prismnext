import { SIDEBAR_RIGHT_MIN, SIDEBAR_RIGHT_MAX } from "@/styles/constants";

/** Minimum main-pane width when sidebar is split alongside content. */
export const RIGHT_AREA_MIN_CONTENT = 150;

/** Below this container width, split layout cannot fit min sidebar + min content. */
export const RIGHT_AREA_SPLIT_THRESHOLD = SIDEBAR_RIGHT_MIN + RIGHT_AREA_MIN_CONTENT;

/** Hysteresis: widen past this before leaving full-mode overlay. */
export const RIGHT_AREA_SPLIT_RECOVER = RIGHT_AREA_SPLIT_THRESHOLD + 40;

export function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_RIGHT_MIN, Math.min(SIDEBAR_RIGHT_MAX, width));
}

export function computeEffectiveSidebarWidth(
  containerWidth: number,
  preferredWidth: number,
  minContent = RIGHT_AREA_MIN_CONTENT,
): number {
  if (containerWidth <= 0) return preferredWidth;
  return Math.min(
    preferredWidth,
    Math.max(SIDEBAR_RIGHT_MIN, containerWidth - minContent),
  );
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
