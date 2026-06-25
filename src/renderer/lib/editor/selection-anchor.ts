import type { EditorView } from "@codemirror/view";
import {
  chipPositionAtSelectionTopRight,
  SELECTION_CHIP_HEIGHT,
  type SelectionChipAnchor,
} from "@/lib/selection-chip-position";

const CHIP_GAP_ABOVE = 4;
/** Max vertical delta (px) to treat selection rects as the same line. */
const SAME_LINE_SLACK = 4;

export type EditorSelectionAnchor = SelectionChipAnchor;

/** Viewport position for SelectionInsertAction (anchor=viewport, translateX -100% on left). */
export interface ViewportChipPosition {
  /** Viewport X of selection trailing edge on the first selected line. */
  left: number;
  top: number;
}

/** 1-based line / column from document offset. */
export function offsetToLineCol(
  text: string,
  offset: number,
): { line: number; col: number } {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

/** Chip position in viewport coords for the editor selection. */
export function getEditorSelectionChipPosition(
  view: EditorView,
): ViewportChipPosition | null {
  const anchor = getEditorSelectionAnchorViewport(view);
  if (!anchor) return null;

  const top = anchor.top - SELECTION_CHIP_HEIGHT - CHIP_GAP_ABOVE;
  const left = anchor.rightX;

  return {
    left: Math.min(left, window.innerWidth - 8),
    top: Math.max(8, Math.min(top, window.innerHeight - SELECTION_CHIP_HEIGHT - 8)),
  };
}

/**
 * Chip position relative to a host container — clamps to the active editor pane.
 * Use with SelectionInsertAction anchor="parent" (e.g. git split merge).
 */
export function getEditorSelectionChipPositionInContainer(
  view: EditorView,
  container: HTMLElement,
): { left: number; top: number } | null {
  const anchor = getEditorSelectionAnchorViewport(view);
  if (!anchor) return null;

  const containerBounds = container.getBoundingClientRect();
  const editorBounds = view.dom.getBoundingClientRect();
  const clampedRight = Math.min(anchor.rightX, editorBounds.right);
  const clampedTop = Math.max(editorBounds.top, Math.min(anchor.top, editorBounds.bottom));

  const relativeAnchor: SelectionChipAnchor = {
    top: clampedTop - containerBounds.top,
    rightX: clampedRight - containerBounds.left,
  };

  return chipPositionAtSelectionTopRight(relativeAnchor, container);
}

function getEditorSelectionAnchorViewport(view: EditorView): SelectionChipAnchor | null {
  const main = view.state.selection.main;
  if (main.empty) return null;

  const from = main.from;
  const to = main.to;
  if (!view.state.sliceDoc(from, to).trim()) return null;

  // CM-painted highlight — same idea as xterm .xterm-selection (do NOT use document.getSelection).
  const layerAnchor = getCmSelectionLayerAnchor(view);
  if (layerAnchor) return layerAnchor;

  return getCmCoordsAnchor(view, from, to);
}

/** Read CodeMirror's .cm-selectionBackground rects (first line, trailing edge). */
function getCmSelectionLayerAnchor(view: EditorView): SelectionChipAnchor | null {
  const nodes = view.dom.querySelectorAll(".cm-selectionBackground");
  if (nodes.length === 0) return null;

  const rects: DOMRect[] = [];
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
  }
  if (rects.length === 0) return null;

  rects.sort((a, b) => a.top - b.top || a.left - b.left);
  const firstTop = rects[0].top;

  let maxRight = rects[0].right;
  for (const rect of rects) {
    if (Math.abs(rect.top - firstTop) <= SAME_LINE_SLACK) {
      maxRight = Math.max(maxRight, rect.right);
    }
  }

  const editorRight = view.dom.getBoundingClientRect().right;
  return { top: firstTop, rightX: Math.min(maxRight, editorRight) };
}

/** Fallback when selection layer is not painted yet. */
function getCmCoordsAnchor(
  view: EditorView,
  from: number,
  to: number,
): SelectionChipAnchor | null {
  const startCoords = view.coordsAtPos(from, -1);
  if (!startCoords) return null;

  const startLine = view.state.doc.lineAt(from);
  const firstLineEnd = from === to ? to : Math.min(startLine.to, to);
  const endCoords = view.coordsAtPos(firstLineEnd, 1);
  if (!endCoords) return null;

  const editorRight = view.dom.getBoundingClientRect().right;
  return {
    top: startCoords.top,
    rightX: Math.min(Math.max(startCoords.right, endCoords.right), editorRight),
  };
}

/** @deprecated Use getEditorSelectionChipPosition */
export function getEditorSelectionAnchor(
  view: EditorView,
  container: HTMLElement,
): SelectionChipAnchor | null {
  const viewport = getEditorSelectionAnchorViewport(view);
  if (!viewport) return null;
  const bounds = container.getBoundingClientRect();
  return {
    top: viewport.top - bounds.top,
    rightX: viewport.rightX - bounds.left,
  };
}

/** @deprecated Use getEditorSelectionChipPosition */
export function chipPositionFromEditorAnchor(
  anchor: SelectionChipAnchor,
  container: HTMLElement,
): { left: number; top: number } {
  return chipPositionAtSelectionTopRight(anchor, container);
}
