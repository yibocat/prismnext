import { openLibraryDb } from "./db";
import type { AnnotationRow } from "./types";

export function getAnnotations(projectRoot: string, paperId: string): AnnotationRow[] {
  const db = openLibraryDb(projectRoot);
  return db
    .prepare("SELECT * FROM annotations WHERE paper_id = ? ORDER BY page, created_at")
    .all(paperId) as unknown as AnnotationRow[];
}

export function saveAnnotation(
  projectRoot: string,
  annotation: Omit<AnnotationRow, "created_at" | "updated_at"> & { created_at?: number; updated_at?: number },
): AnnotationRow {
  const db = openLibraryDb(projectRoot);
  const now = Date.now();
  const created = annotation.created_at ?? now;
  db.prepare(
    `INSERT INTO annotations (id, paper_id, kind, page, rects, quoted_text, color, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       page = excluded.page,
       rects = excluded.rects,
       quoted_text = excluded.quoted_text,
       color = excluded.color,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  ).run(
    annotation.id,
    annotation.paper_id,
    annotation.kind,
    annotation.page,
    annotation.rects,
    annotation.quoted_text ?? null,
    annotation.color ?? null,
    annotation.note ?? null,
    created,
    now,
  );
  return db.prepare("SELECT * FROM annotations WHERE id = ?").get(annotation.id) as unknown as AnnotationRow;
}

export function deleteAnnotation(projectRoot: string, annotationId: string): void {
  const db = openLibraryDb(projectRoot);
  db.prepare("DELETE FROM annotations WHERE id = ?").run(annotationId);
}
