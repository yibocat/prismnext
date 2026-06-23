import type { Terminal } from "@xterm/xterm";

/** Anchor for inline "Add to Chat" — container-local coords, top-right of selection. */
export interface TerminalSelectionAnchor {
  top: number;
  /** Container-local X of the anchor point (button right edge aligns here). */
  rightX: number;
}

/** Pixel anchor for the current xterm selection (first line, trailing edge). */
export function getTerminalSelectionAnchor(
  term: Terminal,
  container: HTMLElement,
): TerminalSelectionAnchor | null {
  const range = term.getSelectionPosition();
  const text = term.getSelection().trim();
  if (!range || !text) return null;

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
  const contentRight = screenBounds.left - containerBounds.left + selectionEndCol * cellW;
  const screenRight = screenBounds.right - containerBounds.left;

  return {
    top: Math.max(0, top),
    rightX: Math.min(contentRight, screenRight),
  };
}

/** Estimated chip width — keeps clamp stable before paint. */
export const TERMINAL_SELECTION_CHIP_WIDTH = 132;

/** Place chip inside container; right edge prefers anchor.rightX. */
export function chipPositionFromAnchor(
  anchor: TerminalSelectionAnchor,
  container: HTMLElement,
): { left: number; top: number } {
  const pad = 6;
  const chipW = TERMINAL_SELECTION_CHIP_WIDTH;
  const chipH = 22;
  const w = container.clientWidth;
  const h = container.clientHeight;

  let left = anchor.rightX - chipW;
  left = Math.max(pad, Math.min(left, w - chipW - pad));

  let top = anchor.top;
  top = Math.max(pad, Math.min(top, h - chipH - pad));

  return { left, top };
}
