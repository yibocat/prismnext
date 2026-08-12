import type { Terminal } from "@xterm/xterm";
import {
  chipPositionAtSelectionTopRight,
  type SelectionChipAnchor,
} from "@/lib/selection-chip-position";

export type TerminalSelectionAnchor = SelectionChipAnchor;

/** Pixel anchor for the current xterm selection (first line, trailing edge). */
export function getTerminalSelectionAnchor(
  term: Terminal,
  container: HTMLElement,
): SelectionChipAnchor | null {
  const text = term.getSelection().trim();
  if (!text) return null;

  const domAnchor = getTerminalSelectionAnchorFromDom(container);
  if (domAnchor) return domAnchor;

  return getTerminalSelectionAnchorFromCells(term, container);
}

/** Prefer xterm's rendered selection layer — most accurate. */
function getTerminalSelectionAnchorFromDom(
  container: HTMLElement,
): SelectionChipAnchor | null {
  const containerBounds = container.getBoundingClientRect();
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
    top: minTop - containerBounds.top,
    bottom: maxBottom - containerBounds.top,
    leftX: minLeft - containerBounds.left,
    rightX: maxRight - containerBounds.left,
  };
}

function getTerminalSelectionAnchorFromCells(
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

  const containerBounds = container.getBoundingClientRect();
  const screen = container.querySelector(".xterm-screen") as HTMLElement | null;
  const screenBounds = screen?.getBoundingClientRect() ?? containerBounds;

  const top = screenBounds.top - containerBounds.top + displayRow * cellH;
  const bottom = top + (bottomRow - topRow + 1) * cellH;
  const startCol = Math.min(range.start.x, range.end.x);
  const contentLeft = screenBounds.left - containerBounds.left + startCol * cellW;
  const contentRight = screenBounds.left - containerBounds.left + selectionEndCol * cellW;
  const screenLeft = screenBounds.left - containerBounds.left;
  const screenRight = screenBounds.right - containerBounds.left;

  return {
    top: Math.max(0, top),
    bottom: Math.max(0, bottom),
    leftX: Math.max(screenLeft, contentLeft),
    rightX: Math.min(contentRight, screenRight),
  };
}

/** @deprecated Use chipPositionAtSelectionTopRight */
export function chipPositionFromAnchor(
  anchor: SelectionChipAnchor,
  container: HTMLElement,
): { left: number; top: number } {
  return chipPositionAtSelectionTopRight(anchor, container);
}
