import {
  MAIN_AREA_MIN,
  RIGHT_AREA_DEFAULT,
  RIGHT_AREA_MIN,
} from "@/styles/constants";

/** Minimum main-area width to show settings list + detail side-by-side. */
export const SETTINGS_DETAIL_SPLIT_MIN = MAIN_AREA_MIN + RIGHT_AREA_MIN;

export function canSplitSettingsDetail(availableWidth: number): boolean {
  return availableWidth >= SETTINGS_DETAIL_SPLIT_MIN;
}

/**
 * Right-panel width for settings detail in split mode.
 * Caller must use stacked mode when `canSplitSettingsDetail` is false.
 */
export function resolveSettingsDetailSplitWidth(
  availableWidth: number,
  preferredWidth: number = RIGHT_AREA_DEFAULT,
): number {
  const maxRight = availableWidth - MAIN_AREA_MIN;
  return Math.min(Math.max(preferredWidth, RIGHT_AREA_MIN), maxRight);
}

export function measureCenterRightWidthPx(
  centerPx: number,
  rightPx: number,
  fallbackMainAreaPx: number,
): number {
  const sum = centerPx + rightPx;
  return sum > 0 ? sum : fallbackMainAreaPx;
}
