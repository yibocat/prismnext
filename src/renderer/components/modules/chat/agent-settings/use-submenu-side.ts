import { useCallback, useState, type RefObject } from "react";

/** Main model list max width (matches `min(20rem, …)`). */
export const MODEL_MENU_MAX_WIDTH = 320;
export const MODEL_MENU_MIN_WIDTH = 208;
/** Reasoning submenu width. */
export const SUBMENU_WIDTH = 120;
/** Rough height for Default + 4 reasoning levels. */
export const SUBMENU_HEIGHT = 168;
const VIEWPORT_PADDING = 16;

export type MenuAlign = "start" | "end";
export type SubmenuSide = "left" | "right" | "bottom" | "top";

export interface MenuBounds {
  left: number;
  right: number;
  width: number;
}

/** Nearest clipping ancestor intersected with the viewport — not just window.innerWidth. */
export function resolveMenuBounds(triggerEl: HTMLElement): MenuBounds {
  const pad = VIEWPORT_PADDING;
  let left = pad;
  let right = window.innerWidth - pad;

  let node: HTMLElement | null = triggerEl.parentElement;
  while (node && node !== document.documentElement) {
    const { overflow, overflowX, overflowY } = getComputedStyle(node);
    const clips =
      /(auto|scroll|hidden|clip)/.test(overflow) ||
      /(auto|scroll|hidden|clip)/.test(overflowX) ||
      /(auto|scroll|hidden|clip)/.test(overflowY);
    if (clips) {
      const r = node.getBoundingClientRect();
      left = Math.max(left, r.left + pad);
      right = Math.min(right, r.right - pad);
    }
    node = node.parentElement;
  }

  if (right <= left) {
    left = pad;
    right = window.innerWidth - pad;
  }

  return { left, right, width: right - left };
}

export function estimateModelMenuWidth(anchorRect: DOMRect): number {
  const viewportCap = Math.max(
    MODEL_MENU_MIN_WIDTH,
    window.innerWidth - VIEWPORT_PADDING * 2,
  );
  return Math.min(MODEL_MENU_MAX_WIDTH, viewportCap);
}

export function estimateModelMenuWidthForBounds(bounds: MenuBounds): number {
  return Math.min(MODEL_MENU_MAX_WIDTH, Math.max(MODEL_MENU_MIN_WIDTH, bounds.width));
}

export function modelMenuLeftEdge(menuAlign: MenuAlign, anchorRect: DOMRect, menuWidth: number): number {
  if (menuAlign === "start") return anchorRect.left;
  return Math.max(VIEWPORT_PADDING, anchorRect.right - menuWidth);
}

export function isVerticalSubmenuSide(side: SubmenuSide): boolean {
  return side === "top" || side === "bottom";
}

/**
 * Pick submenu side so Reasoning Depth stays visible.
 * When horizontal space is tight, stack on the row (top/bottom) — composer sits at the
 * bottom so prefer opening upward; do not rely on Radix collision flip (it picks left).
 */
export function computeSubmenuSide(
  menuAlign: MenuAlign,
  anchorRect: DOMRect,
  bounds: MenuBounds = {
    left: VIEWPORT_PADDING,
    right: window.innerWidth - VIEWPORT_PADDING,
    width: window.innerWidth - VIEWPORT_PADDING * 2,
  },
): SubmenuSide {
  const menuWidth = estimateModelMenuWidthForBounds(bounds);
  const menuLeft = modelMenuLeftEdge(menuAlign, anchorRect, menuWidth);
  const menuRight = menuLeft + menuWidth;

  const spaceRight = bounds.right - menuRight;
  const spaceLeft = menuLeft - bounds.left;

  if (spaceRight >= SUBMENU_WIDTH) return "right";
  if (spaceLeft >= SUBMENU_WIDTH) return "left";

  const spaceBelow = window.innerHeight - anchorRect.bottom - VIEWPORT_PADDING;
  const spaceAbove = anchorRect.top - VIEWPORT_PADDING;
  const canBelow = spaceBelow >= SUBMENU_HEIGHT;
  const canAbove = spaceAbove >= SUBMENU_HEIGHT;

  if (canBelow && canAbove) return "bottom";
  if (canBelow) return "bottom";
  if (canAbove) return "top";
  return spaceBelow >= spaceAbove ? "bottom" : "top";
}

/**
 * Place the model dropdown so model list + reasoning submenu fit in the viewport.
 */
export function useModelMenuPlacement(
  triggerRef: RefObject<HTMLElement | null>,
): {
  menuAlign: MenuAlign;
  submenuSide: SubmenuSide;
  refreshPlacement: () => void;
} {
  const [menuAlign, setMenuAlign] = useState<MenuAlign>("start");
  const [submenuSide, setSubmenuSide] = useState<SubmenuSide>("right");

  const refreshPlacement = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const bounds = resolveMenuBounds(el);
    const menuWidth = estimateModelMenuWidthForBounds(bounds);
    const spaceRight = bounds.right - rect.left;
    const spaceLeft = rect.right - bounds.left;
    const combinedWidth = menuWidth + SUBMENU_WIDTH;

    let align: MenuAlign;
    if (spaceRight >= combinedWidth) {
      align = "start";
    } else if (spaceLeft >= combinedWidth) {
      align = "end";
    } else {
      align = spaceLeft > spaceRight ? "end" : "start";
    }

    setMenuAlign(align);
    setSubmenuSide(computeSubmenuSide(align, rect, bounds));
  }, [triggerRef]);

  return { menuAlign, submenuSide, refreshPlacement };
}
