import type { Annotation, ColoredHighlight, HighlightRect } from "@anaralabs/lector";
import type { LiteratureAnnotation } from "@/types/electron.d";

const DEFAULT_COLOR = "#fde047";
const DEFAULT_BORDER = "#ca8a04";

export function dbAnnotationToLector(row: LiteratureAnnotation): Annotation {
  const rects = JSON.parse(row.rects) as HighlightRect[];
  return {
    id: row.id,
    pageNumber: row.page,
    highlights: rects.map((r) => ({
      pageNumber: row.page,
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    })),
    color: row.color ?? DEFAULT_COLOR,
    borderColor: row.color ?? DEFAULT_BORDER,
    comment: row.note ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function coloredHighlightToDb(
  paperId: string,
  highlight: ColoredHighlight,
  note?: string,
): Omit<LiteratureAnnotation, "created_at" | "updated_at"> {
  return {
    id: highlight.uuid,
    paper_id: paperId,
    kind: "highlight",
    page: highlight.pageNumber,
    rects: JSON.stringify(highlight.rectangles),
    quoted_text: highlight.text,
    color: highlight.color,
    note: note ?? null,
  };
}

export function lectorAnnotationsToColoredHighlights(annotations: Annotation[]): ColoredHighlight[] {
  return annotations.flatMap((ann) =>
    ann.highlights.length
      ? [{
          uuid: ann.id,
          color: ann.color,
          pageNumber: ann.pageNumber,
          text: ann.comment ?? "",
          rectangles: ann.highlights.map((h) => ({
            pageNumber: h.pageNumber,
            top: h.top,
            left: h.left,
            width: h.width,
            height: h.height,
          })),
        }]
      : [],
  );
}
