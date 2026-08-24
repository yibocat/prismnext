import { newId, openLibraryDb } from "./db";
import type { CollectionRow, PaperRow } from "./types";

export function addToReadingList(projectRoot: string, paperId: string): void {
  const db = openLibraryDb(projectRoot);
  db.prepare(
    "INSERT OR IGNORE INTO reading_list (paper_id, added_at) VALUES (?, ?)",
  ).run(paperId, Date.now());
}

export function listReadingList(projectRoot: string): PaperRow[] {
  const db = openLibraryDb(projectRoot);
  return db
    .prepare(
      `SELECT p.* FROM reading_list rl
       JOIN papers p ON p.id = rl.paper_id
       ORDER BY rl.added_at DESC`,
    )
    .all() as unknown as PaperRow[];
}

export function listCollections(projectRoot: string): CollectionRow[] {
  const db = openLibraryDb(projectRoot);
  return db
    .prepare(
      `SELECT c.*, COUNT(cp.paper_id) AS paper_count
       FROM collections c
       LEFT JOIN collection_papers cp ON cp.collection_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name ASC`,
    )
    .all() as unknown as CollectionRow[];
}

export function getCollectionRow(projectRoot: string, collectionId: string): CollectionRow {
  const db = openLibraryDb(projectRoot);
  const row = db.prepare("SELECT * FROM collections WHERE id = ?").get(collectionId) as
    | CollectionRow
    | undefined;
  if (!row) throw new Error("Collection not found");
  return row;
}

export function createCollection(
  projectRoot: string,
  name: string,
  parentId?: string | null,
): CollectionRow {
  const db = openLibraryDb(projectRoot);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Collection name is required");
  if (parentId) {
    const parent = db.prepare("SELECT id FROM collections WHERE id = ?").get(parentId);
    if (!parent) throw new Error("Parent collection not found");
  }
  const now = Date.now();
  const maxOrder = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS n FROM collections WHERE parent_id IS ?",
    )
    .get(parentId ?? null) as { n: number };
  const id = newId();
  db.prepare(
    `INSERT INTO collections (id, name, parent_id, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, trimmed, parentId ?? null, maxOrder.n + 1, now, now);
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(id) as unknown as CollectionRow;
}

export function updateCollection(
  projectRoot: string,
  collectionId: string,
  patch: { name?: string },
): CollectionRow {
  const db = openLibraryDb(projectRoot);
  const row = db.prepare("SELECT * FROM collections WHERE id = ?").get(collectionId) as
    | CollectionRow
    | undefined;
  if (!row) throw new Error("Collection not found");
  const name = patch.name?.trim() ?? row.name;
  if (!name) throw new Error("Collection name is required");
  const now = Date.now();
  db.prepare("UPDATE collections SET name = ?, updated_at = ? WHERE id = ?").run(name, now, collectionId);
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(collectionId) as unknown as CollectionRow;
}

export function deleteCollection(projectRoot: string, collectionId: string): void {
  const db = openLibraryDb(projectRoot);
  const row = db.prepare("SELECT id FROM collections WHERE id = ?").get(collectionId);
  if (!row) throw new Error("Collection not found");
  db.prepare("DELETE FROM collections WHERE id = ?").run(collectionId);
}

export function listCollectionPaperIds(projectRoot: string, collectionId: string): string[] {
  const db = openLibraryDb(projectRoot);
  const rows = db
    .prepare(
      "SELECT paper_id FROM collection_papers WHERE collection_id = ? ORDER BY added_at DESC",
    )
    .all(collectionId) as Array<{ paper_id: string }>;
  return rows.map((r) => r.paper_id);
}

export function replaceCollectionPaperLinks(
  projectRoot: string,
  collectionId: string,
  paperIds: string[],
): void {
  const db = openLibraryDb(projectRoot);
  const col = db
    .prepare("SELECT id FROM collections WHERE id = ? OR zotero_key = ?")
    .get(collectionId, collectionId) as { id: string } | undefined;
  if (!col) throw new Error("Collection not found");
  const resolvedId = col.id;
  db.prepare("DELETE FROM collection_papers WHERE collection_id = ?").run(resolvedId);
  const now = Date.now();
  const insert = db.prepare(
    "INSERT INTO collection_papers (collection_id, paper_id, added_at) VALUES (?, ?, ?)",
  );
  for (const paperId of paperIds) {
    const paper = db.prepare("SELECT id FROM papers WHERE id = ?").get(paperId);
    if (!paper) continue;
    insert.run(resolvedId, paperId, now);
  }
}


export function addPapersToCollection(
  projectRoot: string,
  collectionId: string,
  paperIds: string[],
): number {
  const db = openLibraryDb(projectRoot);
  const col = db.prepare("SELECT id FROM collections WHERE id = ?").get(collectionId);
  if (!col) throw new Error("Collection not found");
  const now = Date.now();
  let added = 0;
  const insert = db.prepare(
    "INSERT OR IGNORE INTO collection_papers (collection_id, paper_id, added_at) VALUES (?, ?, ?)",
  );
  for (const paperId of paperIds) {
    const paper = db.prepare("SELECT id FROM papers WHERE id = ?").get(paperId);
    if (!paper) continue;
    const result = insert.run(collectionId, paperId, now);
    if (result.changes > 0) added++;
  }
  return added;
}

export function removePapersFromCollection(
  projectRoot: string,
  collectionId: string,
  paperIds: string[],
): number {
  const db = openLibraryDb(projectRoot);
  if (!paperIds.length) return 0;
  const placeholders = paperIds.map(() => "?").join(",");
  const result = db
    .prepare(
      `DELETE FROM collection_papers WHERE collection_id = ? AND paper_id IN (${placeholders})`,
    )
    .run(collectionId, ...paperIds);
  return Number(result.changes);
}
