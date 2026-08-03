/** Shared floating chip geometry for selection → Add to Chat. */

export const SELECTION_CHIP_WIDTH = 148;
export const SELECTION_CHIP_HEIGHT = 28;
const CHIP_PAD = 6;
const CHIP_GAP = 4;

export type SelectionChipPlacement =
  | "after-top"
  | "after-bottom"
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

export interface SelectionChipAnchor {
  top: number;
  bottom: number;
  leftX: number;
  /** Container/viewport X of the selection's trailing edge (chip right aligns here for top-right). */
  rightX: number;
}

export interface ResolvedChipPosition {
  left: number;
  top: number;
  placement: SelectionChipPlacement;
}

const PLACEMENT_ORDER: SelectionChipPlacement[] = [
  "after-top",
  "after-bottom",
  "top-left",
  "bottom-left",
  "top-right",
  "bottom-right",
];

function chipRectForPlacement(
  anchor: SelectionChipAnchor,
  placement: SelectionChipPlacement,
  chipW: number,
  chipH: number,
): { left: number; top: number; right: number; bottom: number } {
  switch (placement) {
    case "after-top":
      return {
        left: anchor.rightX + CHIP_GAP,
        right: anchor.rightX + CHIP_GAP + chipW,
        top: anchor.top - chipH - CHIP_GAP,
        bottom: anchor.top - CHIP_GAP,
      };
    case "after-bottom":
      return {
        left: anchor.rightX + CHIP_GAP,
        right: anchor.rightX + CHIP_GAP + chipW,
        top: anchor.bottom + CHIP_GAP,
        bottom: anchor.bottom + CHIP_GAP + chipH,
      };
    case "top-right":
      return {
        right: anchor.rightX,
        left: anchor.rightX - chipW,
        top: anchor.top - chipH - CHIP_GAP,
        bottom: anchor.top - CHIP_GAP,
      };
    case "top-left":
      return {
        left: anchor.leftX,
        right: anchor.leftX + chipW,
        top: anchor.top - chipH - CHIP_GAP,
        bottom: anchor.top - CHIP_GAP,
      };
    case "bottom-right":
      return {
        right: anchor.rightX,
        left: anchor.rightX - chipW,
        top: anchor.bottom + CHIP_GAP,
        bottom: anchor.bottom + CHIP_GAP + chipH,
      };
    case "bottom-left":
      return {
        left: anchor.leftX,
        right: anchor.leftX + chipW,
        top: anchor.bottom + CHIP_GAP,
        bottom: anchor.bottom + CHIP_GAP + chipH,
      };
  }
}

function fitsInBounds(
  rect: { left: number; top: number; right: number; bottom: number },
  bounds: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    rect.left >= bounds.left + CHIP_PAD
    && rect.top >= bounds.top + CHIP_PAD
    && rect.right <= bounds.right - CHIP_PAD
    && rect.bottom <= bounds.bottom - CHIP_PAD
  );
}

/** Pick the first corner placement that fits inside bounds (default: top-right). */
export function resolveSelectionChipPosition(
  anchor: SelectionChipAnchor,
  bounds: { left: number; top: number; right: number; bottom: number },
  chipW = SELECTION_CHIP_WIDTH,
  chipH = SELECTION_CHIP_HEIGHT,
): ResolvedChipPosition {
  for (const placement of PLACEMENT_ORDER) {
    const rect = chipRectForPlacement(anchor, placement, chipW, chipH);
    if (fitsInBounds(rect, bounds)) {
      return { left: rect.left, top: rect.top, placement };
    }
  }

  const fallback = chipRectForPlacement(anchor, "after-top", chipW, chipH);
  const clampedLeft = Math.max(
    bounds.left + CHIP_PAD,
    Math.min(fallback.left, bounds.right - chipW - CHIP_PAD),
  );
  const clampedTop = Math.max(
    bounds.top + CHIP_PAD,
    Math.min(fallback.top, bounds.bottom - chipH - CHIP_PAD),
  );
  return { left: clampedLeft, top: clampedTop, placement: "after-top" };
}

/** Map resolved chip rect to SelectionInsertAction `x` (handles translateX(-100%) cases). */
export function selectionActionX(
  resolved: ResolvedChipPosition,
  anchor: SelectionChipAnchor,
): number {
  if (resolved.placement === "top-right" || resolved.placement === "bottom-right") {
    return anchor.rightX;
  }
  return resolved.left;
}

/** @deprecated Use resolveSelectionChipPosition */
export function chipPositionAtSelectionTopRight(
  anchor: SelectionChipAnchor,
  container: HTMLElement,
): { left: number; top: number } {
  const bounds = container.getBoundingClientRect();
  const relative: SelectionChipAnchor = {
    top: anchor.top,
    bottom: anchor.bottom,
    leftX: anchor.leftX,
    rightX: anchor.rightX,
  };
  const resolved = resolveSelectionChipPosition(relative, {
    left: 0,
    top: 0,
    right: container.clientWidth,
    bottom: container.clientHeight,
  });
  return { left: resolved.left, top: resolved.top };
}
