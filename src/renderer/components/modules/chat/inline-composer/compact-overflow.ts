import type { EditorView } from "@codemirror/view";

export interface CompactOverflowMetrics {
  lineCount: number;
  textWidth: number;
  availableWidth: number;
  charWidth: number;
}

/** Pure helper — expand when the single line has filled the visible width. */
export function compactContentNeedsExpand({
  lineCount,
  textWidth,
  availableWidth,
  charWidth,
}: CompactOverflowMetrics): boolean {
  if (lineCount > 1) return true;
  if (availableWidth <= 0 || textWidth <= 0) return false;
  return textWidth >= availableWidth - charWidth * 0.75;
}

export function measureCompactOverflow(
  view: EditorView,
  availableWidth?: number,
): CompactOverflowMetrics {
  const doc = view.state.doc;
  const available = availableWidth ?? view.scrollDOM.clientWidth;
  const charWidth = view.defaultCharacterWidth || 7;

  if (doc.length === 0) {
    return { lineCount: doc.lines, textWidth: 0, availableWidth: available, charWidth };
  }

  const line = doc.line(1);
  const start = view.coordsAtPos(line.from, -1);
  const end = view.coordsAtPos(line.to, 1);
  const textWidth = start && end ? Math.max(0, end.right - start.left) : 0;

  return {
    lineCount: doc.lines,
    textWidth,
    availableWidth: available,
    charWidth,
  };
}

/** True when compact capsule content needs the expanded composer layout. */
export function compactComposerNeedsExpand(
  view: EditorView,
  availableWidth?: number,
): boolean {
  const metrics = measureCompactOverflow(view, availableWidth);
  if (metrics.textWidth > 0) {
    return compactContentNeedsExpand(metrics);
  }

  // Before first layout pass, fall back to scroll overflow.
  if (metrics.lineCount > 1) return true;
  const scroller = view.scrollDOM;
  return scroller.scrollWidth > scroller.clientWidth + 1;
}
