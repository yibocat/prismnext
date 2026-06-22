/** Viewport-aware placement for cursor-anchored composer menus. */

export interface CursorAnchor {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export const COMPOSER_MENU_WIDTH = 224;
export const COMPOSER_MENU_MAX_HEIGHT = 160;
const VIEWPORT_PADDING = 12;

export function anchorFromCoords(coords: {
  top: number;
  left: number;
  bottom: number;
  right: number;
}): CursorAnchor {
  return {
    top: coords.top,
    left: coords.left,
    bottom: coords.bottom,
    right: coords.right,
  };
}

/** Prefer opening upward when the composer sits near the bottom of the window. */
export function preferredMenuSide(anchor: CursorAnchor): "top" | "bottom" {
  const spaceBelow = window.innerHeight - anchor.bottom - VIEWPORT_PADDING;
  const spaceAbove = anchor.top - VIEWPORT_PADDING;
  if (spaceBelow < COMPOSER_MENU_MAX_HEIGHT * 0.45 && spaceAbove > spaceBelow) {
    return "top";
  }
  return "bottom";
}
