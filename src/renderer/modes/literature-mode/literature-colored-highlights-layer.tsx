import { useMemo, useState } from "react";
import { usePDFPageNumber, usePdf } from "@anaralabs/lector";
import type { ColoredHighlight } from "@anaralabs/lector";
import { Trash2Icon } from "lucide-react";

/** Render persisted colored highlights without lector's built-in ColorSelectionTool (avoids duplicate toolbars). */
export function LiteratureColoredHighlightsLayer() {
  const pageNumber = usePDFPageNumber();
  const highlights = usePdf((s) => s.coloredHighlights);
  const pageHighlights = useMemo(
    () =>
      highlights.filter(
        (s) =>
          s.pageNumber === pageNumber ||
          s.rectangles.some((r) => r.pageNumber === pageNumber),
      ),
    [highlights, pageNumber],
  );

  return (
    <div className="colored-highlights-layer pointer-events-none">
      {pageHighlights.map((selection) => (
        <ColoredHighlightRects key={selection.uuid} selection={selection} />
      ))}
    </div>
  );
}

function ColoredHighlightRects({ selection }: { selection: ColoredHighlight }) {
  const pageNumber = usePDFPageNumber();
  const deleteColoredHighlight = usePdf((s) => s.deleteColoredHighlight);
  const [showDelete, setShowDelete] = useState(false);

  const pageRectangles = useMemo(
    () => selection.rectangles.filter((r) => r.pageNumber === pageNumber),
    [selection.rectangles, pageNumber],
  );
  if (pageRectangles.length === 0) return null;

  const last = pageRectangles[pageRectangles.length - 1]!;

  return (
    <div className="colored-highlight pointer-events-auto">
      {pageRectangles.map((rect, index) => (
        <span
          key={`${selection.uuid}-${index}`}
          onClick={() => setShowDelete((v) => !v)}
          style={{
            position: "absolute",
            top: rect.top,
            left: rect.left,
            height: rect.height,
            width: rect.width,
            cursor: "pointer",
            zIndex: 30,
            backgroundColor: selection.color,
            mixBlendMode: "darken",
            borderRadius: "0.2rem",
          }}
        />
      ))}
      {showDelete ? (
        <button
          type="button"
          title="Remove highlight"
          aria-label="Remove highlight"
          className="absolute z-30 flex size-6 items-center justify-center rounded-md border border-border bg-popover text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
          style={{
            top: last.top + last.height / 2,
            left: last.left + last.width + 6,
            transform: "translateY(-50%)",
          }}
          onClick={() => deleteColoredHighlight(selection.uuid)}
        >
          <Trash2Icon className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
