import type { EditorView } from "@codemirror/view";
import {
  resolveSelectionChipPosition,
  SELECTION_CHIP_WIDTH,
  SELECTION_CHIP_HEIGHT,
  selectionActionX,
  type SelectionChipAnchor,
  type SelectionChipPlacement,
} from "@/lib/selection-chip-position";

export type EditorSelectionAnchor = SelectionChipAnchor;

/** Viewport position for SelectionInsertAction. */
export interface ViewportChipPosition {
  left: number;
  top: number;
  placement: SelectionChipPlacement;
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

  const resolved = resolveSelectionChipPosition(anchor, {
    left: 8,
    top: 8,
    right: window.innerWidth - 8,
    bottom: window.innerHeight - 8,
  }, SELECTION_CHIP_WIDTH, SELECTION_CHIP_HEIGHT);

  return {
    left: selectionActionX(resolved, anchor),
    top: resolved.top,
    placement: resolved.placement,
  };
}

/**
 * Chip position relative to a host container — clamps to the active editor pane.
 * Use with SelectionInsertAction anchor="parent" (e.g. git split merge).
 */
export function getEditorSelectionChipPositionInContainer(
  view: EditorView,
  container: HTMLElement,
): { left: number; top: number; placement: SelectionChipPlacement } | null {
  const anchor = getEditorSelectionAnchorViewport(view);
  if (!anchor) return null;

  const containerBounds = container.getBoundingClientRect();
  const editorBounds = view.dom.getBoundingClientRect();

  const firstLineAnchor = firstLineBoundsFromAnchor(anchor, editorBounds);

  const relativeAnchor: SelectionChipAnchor = {
    top: firstLineAnchor.top - containerBounds.top,
    bottom: firstLineAnchor.bottom - containerBounds.top,
    leftX: firstLineAnchor.leftX - containerBounds.left,
    rightX: firstLineAnchor.rightX - containerBounds.left,
  };

  const resolved = resolveSelectionChipPosition(relativeAnchor, {
    left: 0,
    top: 0,
    right: container.clientWidth,
    bottom: container.clientHeight,
  });

  return {
    left: selectionActionX(resolved, relativeAnchor),
    top: resolved.top,
    placement: resolved.placement,
  };
}

function getEditorSelectionAnchorViewport(view: EditorView): SelectionChipAnchor | null {
  const main = view.state.selection.main;
  if (main.empty) return null;

  const from = main.from;
  const to = main.to;
  if (!view.state.sliceDoc(from, to).trim()) return null;

  return getCmCoordsAnchorAtHead(view);
}

/** Anchor at the active end (head / cursor), not the full selection highlight width. */
function getCmCoordsAnchorAtHead(view: EditorView): SelectionChipAnchor | null {
  const main = view.state.selection.main;
  const head = main.head;
  const side = head >= main.anchor ? 1 : -1;
  const headCoords = view.coordsAtPos(head, side);
  if (!headCoords) return null;

  const editorBounds = view.dom.getBoundingClientRect();
  return {
    top: headCoords.top,
    bottom: headCoords.bottom,
    leftX: Math.max(headCoords.left, editorBounds.left),
    rightX: Math.min(headCoords.right, editorBounds.right),
  };
}

function firstLineBoundsFromAnchor(
  anchor: SelectionChipAnchor,
  editorBounds: DOMRect,
): SelectionChipAnchor {
  return {
    top: Math.max(anchor.top, editorBounds.top),
    bottom: Math.min(anchor.bottom, editorBounds.bottom),
    leftX: Math.max(anchor.leftX, editorBounds.left),
    rightX: Math.min(anchor.rightX, editorBounds.right),
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
    bottom: viewport.bottom - bounds.top,
    leftX: viewport.leftX - bounds.left,
    rightX: viewport.rightX - bounds.left,
  };
}

/** @deprecated Use resolveSelectionChipPosition */
export function chipPositionFromEditorAnchor(
  anchor: SelectionChipAnchor,
  container: HTMLElement,
): { left: number; top: number } {
  const resolved = resolveSelectionChipPosition(anchor, {
    left: 0,
    top: 0,
    right: container.clientWidth,
    bottom: container.clientHeight,
  });
  return { left: resolved.left, top: resolved.top };
}
