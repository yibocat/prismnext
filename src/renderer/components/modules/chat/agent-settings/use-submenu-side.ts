import { useCallback, useRef, useState, type RefObject } from "react";

/** Floor width for the model list (search + short names). */
export const MODEL_MENU_MIN_WIDTH = 208;
/**
 * Hard ceiling so a pathological label cannot dominate the viewport.
 * Preferred width is content-driven below this, then capped by panel bounds.
 */
export const MODEL_MENU_MAX_WIDTH = 512;
/**
 * @deprecated Prefer {@link shouldWrapModelMenuNames} — wrap only when content
 * was clamped narrower than needed, not below an arbitrary pixel threshold.
 */
export const MODEL_MENU_WRAP_NAME_BELOW = 280;
/**
 * Horizontal chrome per row: AppMenu panel pad (p-0.5) + item pad + Edit/check.
 * Keep in sync with model-thought-select / appMenuPanelClass.
 */
export const MODEL_MENU_ROW_CHROME_PX = 80;
/** Extra px so canvas measure under-estimates do not force wrap. */
export const MODEL_MENU_WIDTH_SLACK_PX = 12;
/** Reasoning submenu width. */
export const SUBMENU_WIDTH = 120;
/** Rough height for Default + 4 reasoning levels. */
export const SUBMENU_HEIGHT = 168;
const VIEWPORT_PADDING = 16;

/** Hover model info card (matches model-thought-select card). */
export const MODEL_INFO_PANEL_WIDTH = 248;
/** Small gap between card and menu / row. */
export const MODEL_INFO_PANEL_GAP = 6;
const MODEL_INFO_VIEWPORT_PAD = 12;
/** Rough height only for clamping wide-mode `top` away from the viewport edge. */
export const MODEL_INFO_PANEL_EST_HEIGHT = 120;

export type FixedPanelStyle = {
  position: "fixed";
  top?: number;
  /** Prefer over `top` when stacking above the menu — hugs the menu edge. */
  bottom?: number;
  left: number;
  width: number;
  zIndex: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function hasRoomOnRowRight(
  row: DOMRect,
  panelWidth: number,
  viewportWidth: number,
  gap: number = MODEL_INFO_PANEL_GAP,
  pad: number = MODEL_INFO_VIEWPORT_PAD,
): boolean {
  return viewportWidth - pad - (row.right + gap) >= panelWidth;
}

/**
 * Wide: card to the right of the hovered row (original).
 * Narrow: flush above the model menu, left-aligned, small gap (`bottom` anchored
 * so a wrong height estimate cannot float the card up into empty space).
 */
export function placeModelHoverInfoStyle(
  row: DOMRect,
  avoidMenu: DOMRect | null,
  viewport: { width: number; height: number } = {
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  },
): FixedPanelStyle {
  const vw = viewport.width;
  const vh = viewport.height;
  const pad = MODEL_INFO_VIEWPORT_PAD;
  const gap = MODEL_INFO_PANEL_GAP;
  const width = Math.min(MODEL_INFO_PANEL_WIDTH, vw - pad * 2);

  if (hasRoomOnRowRight(row, width, vw, gap, pad)) {
    return {
      position: "fixed",
      top: clamp(row.top, pad, vh - pad - MODEL_INFO_PANEL_EST_HEIGHT),
      left: row.right + gap,
      width,
      zIndex: 110,
    };
  }

  const box = avoidMenu ?? row;
  // Match menu width + left edge so the card sits flush above the panel.
  const panelWidth = Math.min(Math.max(box.width, 160), vw - pad * 2);
  const left = clamp(box.left, pad, vw - pad - panelWidth);
  // Anchor bottom edge to menu top — no estimated-height gap.
  return {
    position: "fixed",
    left,
    width: panelWidth,
    bottom: vh - box.top + gap,
    zIndex: 110,
  };
}

/**
 * Wide: Edit panel to the right of the row.
 * Narrow: same as hover info — flush above the model menu.
 */
export function placeModelEditPanelStyle(
  row: DOMRect,
  avoidMenu: DOMRect | null = null,
  viewport: { width: number; height: number } = {
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  },
): FixedPanelStyle {
  const vw = viewport.width;
  const vh = viewport.height;
  const pad = MODEL_INFO_VIEWPORT_PAD;
  const gap = MODEL_INFO_PANEL_GAP;
  const width = Math.min(SUBMENU_WIDTH + 24, MODEL_INFO_PANEL_WIDTH, vw - pad * 2);

  if (hasRoomOnRowRight(row, width, vw, gap, pad)) {
    return {
      position: "fixed",
      top: clamp(row.top, pad, vh - pad - SUBMENU_HEIGHT),
      left: row.right + gap,
      width,
      zIndex: 120,
    };
  }

  const box = avoidMenu ?? row;
  const panelWidth = Math.min(Math.max(box.width, 160), vw - pad * 2);
  const left = clamp(box.left, pad, vw - pad - panelWidth);
  return {
    position: "fixed",
    left,
    width: panelWidth,
    bottom: vh - box.top + gap,
    zIndex: 120,
  };
}

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

/** Width needed for labels + row chrome (before panel/viewport clamp). */
export function estimateContentWidthFromLabels(
  labels: string[],
  measureText: (text: string) => number,
  chromePx: number = MODEL_MENU_ROW_CHROME_PX,
): number {
  let maxText = 0;
  for (const label of labels) {
    if (!label) continue;
    maxText = Math.max(maxText, measureText(label));
  }
  return Math.ceil(maxText + chromePx + MODEL_MENU_WIDTH_SLACK_PX);
}

/**
 * Wrap row titles only when the menu was clamped narrower than the longest label
 * needs — prefer growing the panel over two-line names.
 */
export function shouldWrapModelMenuNames(
  menuWidth: number,
  contentWidth: number,
): boolean {
  return contentWidth > menuWidth + 1;
}

let measureCanvas: HTMLCanvasElement | null = null;

/** Measure text with canvas (same family/size as menu items when `font` is passed). */
export function measureMenuTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") {
    return Math.ceil(text.length * 7.2);
  }
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return Math.ceil(text.length * 7.2);
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function resolveMenuMeasureFont(el: HTMLElement | null): string {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const fromEl = el ? getComputedStyle(el) : null;
  const fromRoot = root ? getComputedStyle(root) : null;
  const size =
    fromRoot?.getPropertyValue("--font-menu-item").trim()
    || fromEl?.fontSize
    || "12px";
  const family = fromEl?.fontFamily || "ui-sans-serif, system-ui, sans-serif";
  const weight = fromEl?.fontWeight || "400";
  return `${weight} ${size} ${family}`;
}

/**
 * Preferred menu width: grow with content, never below min, never above
 * panel/viewport room or the hard ceiling.
 */
export function estimateModelMenuWidthForBounds(
  bounds: MenuBounds,
  contentWidth: number = MODEL_MENU_MIN_WIDTH,
): number {
  const room = Math.max(MODEL_MENU_MIN_WIDTH, bounds.width);
  const desired = Math.max(MODEL_MENU_MIN_WIDTH, Math.ceil(contentWidth));
  return Math.min(desired, room, MODEL_MENU_MAX_WIDTH);
}

export function estimateModelMenuWidth(
  _anchorRect: DOMRect,
  contentWidth: number = MODEL_MENU_MIN_WIDTH,
): number {
  const viewportCap = Math.max(
    MODEL_MENU_MIN_WIDTH,
    window.innerWidth - VIEWPORT_PADDING * 2,
  );
  const desired = Math.max(MODEL_MENU_MIN_WIDTH, Math.ceil(contentWidth));
  return Math.min(desired, viewportCap, MODEL_MENU_MAX_WIDTH);
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
  contentWidth: number = MODEL_MENU_MIN_WIDTH,
): SubmenuSide {
  const menuWidth = estimateModelMenuWidthForBounds(bounds, contentWidth);
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
 * Pass `contentWidth` (from longest label) so the panel grows only as needed.
 */
export function useModelMenuPlacement(
  triggerRef: RefObject<HTMLElement | null>,
): {
  menuAlign: MenuAlign;
  submenuSide: SubmenuSide;
  menuWidth: number;
  refreshPlacement: (contentWidth?: number) => void;
} {
  const [menuAlign, setMenuAlign] = useState<MenuAlign>("start");
  const [submenuSide, setSubmenuSide] = useState<SubmenuSide>("right");
  const [menuWidth, setMenuWidth] = useState(MODEL_MENU_MIN_WIDTH);
  const contentWidthRef = useRef(MODEL_MENU_MIN_WIDTH);

  const refreshPlacement = useCallback((contentWidth?: number) => {
    const el = triggerRef.current;
    if (!el) return;

    if (typeof contentWidth === "number" && Number.isFinite(contentWidth)) {
      contentWidthRef.current = contentWidth;
    }

    const rect = el.getBoundingClientRect();
    const bounds = resolveMenuBounds(el);
    const preferred = contentWidthRef.current;
    const nextWidth = estimateModelMenuWidthForBounds(bounds, preferred);
    const spaceRight = bounds.right - rect.left;
    const spaceLeft = rect.right - bounds.left;
    const combinedWidth = nextWidth + SUBMENU_WIDTH;

    let align: MenuAlign;
    if (spaceRight >= combinedWidth) {
      align = "start";
    } else if (spaceLeft >= combinedWidth) {
      align = "end";
    } else {
      align = spaceLeft > spaceRight ? "end" : "start";
    }

    setMenuAlign(align);
    setSubmenuSide(computeSubmenuSide(align, rect, bounds, preferred));
    setMenuWidth(nextWidth);
  }, [triggerRef]);

  return { menuAlign, submenuSide, menuWidth, refreshPlacement };
}
