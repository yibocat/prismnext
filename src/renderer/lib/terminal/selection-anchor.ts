import type { Terminal } from "@xterm/xterm";
import {
  chipPositionAtSelectionTopRight,
  chipPositionInViewport,
  type ResolvedChipPosition,
  type SelectionChipAnchor,
} from "@/lib/selection-chip-position";

export type TerminalSelectionAnchor = SelectionChipAnchor;

/** Pixel anchor for the current xterm selection (first line, trailing edge). */
export function getTerminalSelectionAnchor(
  term: Terminal,
  container: HTMLElement,
): SelectionChipAnchor | null {
  const viewport = getTerminalSelectionAnchorViewport(term, container);
  if (!viewport) return null;
  const bounds = container.getBoundingClientRect();
  return {
    top: viewport.top - bounds.top,
    bottom: viewport.bottom - bounds.top,
    leftX: viewport.leftX - bounds.left,
    rightX: viewport.rightX - bounds.left,
  };
}

/** Viewport coords for the current xterm selection — use with `anchor="viewport"`. */
export function getTerminalSelectionAnchorViewport(
  term: Terminal,
  container: HTMLElement,
): SelectionChipAnchor | null {
  const text = term.getSelection().trim();
  if (!text) return null;

  const domAnchor = getTerminalSelectionAnchorFromDomViewport(container);
  if (domAnchor) return domAnchor;

  return getTerminalSelectionAnchorFromCellsViewport(term, container);
}

export function getTerminalSelectionChipPosition(
  term: Terminal,
  container: HTMLElement,
): ResolvedChipPosition | null {
  const anchor = getTerminalSelectionAnchorViewport(term, container);
  if (!anchor) return null;
  return chipPositionInViewport(anchor);
}

/** Prefer xterm's rendered selection layer — most accurate. */
function getTerminalSelectionAnchorFromDomViewport(
  container: HTMLElement,
): SelectionChipAnchor | null {
  const nodes = container.querySelectorAll(".xterm-selection div");

  let minTop = Infinity;
  let maxBottom = -Infinity;
  let minLeft = Infinity;
  let maxRight = -Infinity;
  let found = false;

  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) continue;
    found = true;
    minTop = Math.min(minTop, rect.top);
    maxBottom = Math.max(maxBottom, rect.bottom);
    minLeft = Math.min(minLeft, rect.left);
    maxRight = Math.max(maxRight, rect.right);
  }

  if (!found) return null;

  return {
    top: minTop,
    bottom: maxBottom,
    leftX: minLeft,
    rightX: maxRight,
  };
}

function getTerminalSelectionAnchorFromCellsViewport(
  term: Terminal,
  container: HTMLElement,
): SelectionChipAnchor | null {
  const range = term.getSelectionPosition();
  if (!range) return null;

  const core = (term as {
    _core?: { _renderService?: { dimensions?: { css?: { cell?: { width?: number; height?: number } } } } };
  })._core;
  const cellW = core?._renderService?.dimensions?.css?.cell?.width;
  const cellH = core?._renderService?.dimensions?.css?.cell?.height;
  if (!cellW || !cellH) return null;

  const viewport = term.buffer.active.viewportY;
  const topRow = Math.min(range.start.y, range.end.y);
  const bottomRow = Math.max(range.start.y, range.end.y);
  const displayRow = topRow - viewport;
  if (displayRow < 0 || displayRow >= term.rows) return null;

  const selectionEndCol =
    topRow === bottomRow
      ? Math.max(range.start.x, range.end.x) + 1
      : term.cols;

  const screen = container.querySelector(".xterm-screen") as HTMLElement | null;
  const screenBounds = screen?.getBoundingClientRect() ?? container.getBoundingClientRect();

  const top = screenBounds.top + displayRow * cellH;
  const bottom = top + (bottomRow - topRow + 1) * cellH;
  const startCol = Math.min(range.start.x, range.end.x);
  const contentLeft = screenBounds.left + startCol * cellW;
  const contentRight = screenBounds.left + selectionEndCol * cellW;

  return {
    top,
    bottom,
    leftX: Math.max(screenBounds.left, contentLeft),
    rightX: Math.min(contentRight, screenBounds.right),
  };
}

/** @deprecated Use chipPositionAtSelectionTopRight */
export function chipPositionFromAnchor(
  anchor: SelectionChipAnchor,
  container: HTMLElement,
): { left: number; top: number } {
  return chipPositionAtSelectionTopRight(anchor, container);
}
