/** Shared floating chip geometry for selection → Add to Chat. */

export const SELECTION_CHIP_WIDTH = 132;
export const SELECTION_CHIP_HEIGHT = 26;
const CHIP_PAD = 6;
const CHIP_GAP_ABOVE = 4;

export interface SelectionChipAnchor {
  top: number;
  /** Container-local X of the selection's trailing edge (chip right aligns here). */
  rightX: number;
}

/** Place chip at top-right of selection, slightly above the highlight (Cursor-style). */
export function chipPositionAtSelectionTopRight(
  anchor: SelectionChipAnchor,
  container: HTMLElement,
): { left: number; top: number } {
  const w = container.clientWidth;
  const h = container.clientHeight;
  const chipW = SELECTION_CHIP_WIDTH;
  const chipH = SELECTION_CHIP_HEIGHT;

  let top = anchor.top - chipH - CHIP_GAP_ABOVE;
  top = Math.max(CHIP_PAD, Math.min(top, h - chipH - CHIP_PAD));

  let left = anchor.rightX;
  left = Math.max(chipW + CHIP_PAD, Math.min(left, w - CHIP_PAD));

  return { left, top };
}
