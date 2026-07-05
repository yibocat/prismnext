/** Precise PDF text-selection rects — skips Lector's consolidateRects merge-to-line behavior. */

const LAYER_ATTRIBUTION_TOLERANCE_PX = 4;

export interface PdfSelectionHighlightRect {
  pageNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

function getTextNodeClientRects(range: Range): { rect: DOMRect; element: Node | null }[] {
  const ownerDoc = range.commonAncestorContainer.ownerDocument ?? document;
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE && root.parentElement) {
    return Array.from(range.getClientRects()).map((rect) => ({
      rect,
      element: root.parentElement,
    }));
  }

  const walker = ownerDoc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.nodeValue.length === 0) {
        return NodeFilter.FILTER_REJECT;
      }
      try {
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      } catch {
        return NodeFilter.FILTER_REJECT;
      }
    },
  });

  const results: { rect: DOMRect; element: Node | null }[] = [];
  let current = walker.nextNode();
  while (current) {
    const textNode = current;
    const parentElement = textNode.parentElement;
    const length = textNode.nodeValue?.length ?? 0;
    const isStartNode = textNode === range.startContainer;
    const isEndNode = textNode === range.endContainer;
    const start = isStartNode ? range.startOffset : 0;
    const end = isEndNode ? range.endOffset : length;
    if (end > start) {
      const sub = ownerDoc.createRange();
      try {
        sub.setStart(textNode, start);
        sub.setEnd(textNode, end);
        const subRects = sub.getClientRects();
        for (let i = 0; i < subRects.length; i++) {
          const r2 = subRects[i];
          if (r2) results.push({ rect: r2, element: parentElement });
        }
      } catch {
        // ignore partial range errors
      } finally {
        sub.detach?.();
      }
    }
    current = walker.nextNode();
  }
  return results;
}

function mapSelectionRectsToLayers(range: Range) {
  const clientRects = getTextNodeClientRects(range).filter(
    ({ rect }) => rect.width > 2 && rect.height > 2,
  );
  const textLayerEntries = Array.from(document.querySelectorAll(".textLayer")).map((el) => ({
    el,
    rect: el.getBoundingClientRect(),
  }));

  const layerForRect = (rect: DOMRect): Element | null => {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const T = LAYER_ATTRIBUTION_TOLERANCE_PX;
    const geomMatch = textLayerEntries.find(
      ({ rect: lr }) =>
        cx >= lr.left - T && cx <= lr.right + T && cy >= lr.top - T && cy <= lr.bottom + T,
    );
    if (geomMatch) return geomMatch.el;

    const points: [number, number][] = [
      [rect.left + 1, cy],
      [cx, cy],
      [rect.right - 1, cy],
      [cx, rect.top + 1],
      [cx, rect.bottom - 1],
    ];
    for (const [px, py] of points) {
      const el = document.elementFromPoint(px, py);
      const layer = el?.closest(".textLayer");
      if (layer) return layer;
    }
    return null;
  };

  const result: {
    clientRect: DOMRect;
    layerRect: DOMRect;
    pageNumber: number;
  }[] = [];

  for (const { rect: clientRect } of clientRects) {
    const layer = layerForRect(clientRect);
    if (!layer) continue;
    const layerRect = layer.getBoundingClientRect();
    const pageNumber = Number.parseInt(layer.getAttribute("data-page-number") || "1", 10);
    result.push({ clientRect, layerRect, pageNumber });
  }
  return result;
}

/** Map the current text selection to per-glyph highlight rects (no line consolidation). */
export function preciseSelectionHighlights(zoom: number): PdfSelectionHighlightRect[] | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const mapped = mapSelectionRectsToLayers(range);
  const highlights: PdfSelectionHighlightRect[] = mapped.map(({ clientRect, layerRect, pageNumber }) => ({
    pageNumber,
    width: clientRect.width / zoom,
    height: clientRect.height / zoom,
    top: (clientRect.top - layerRect.top) / zoom,
    left: (clientRect.left - layerRect.left) / zoom,
  }));
  return highlights.length > 0
    ? highlights.sort((a, b) => a.pageNumber - b.pageNumber)
    : null;
}

export function preciseSelectionText(): string | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const text = selection.getRangeAt(0).toString().trim();
  return text || null;
}
