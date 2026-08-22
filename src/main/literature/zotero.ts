import {
  patchRawBibtexKey,
  resolveIncomingBibkey,
  resolveStoredBibkey,
} from "../../shared/literature/bibkey-utils";
import { coerceStoredDoi, normalizeArxivId } from "../../shared/literature/doi-utils";
import { broadcastToRenderer } from "./broadcast";
import { findExistingPaper, newId, openLibraryDb, syncFtsForPaper, uniqueBibkey } from "./db";
import {
  deletePaper,
  getPaper,
  isPaperLocallyMaterialized,
  paperHasReadyExtract,
} from "./papers";
import type { CollectionRow, PaperRow } from "./types";

const ORPHAN_MERGE_MIN_SCORE = 40;
const ORPHAN_MERGE_WIN_MARGIN = 20;

export type OrphanZoteroPaperResolution = "deleted" | "detached";

/** Drop a Zotero mirror that left the bound collection — keep local work when materialized. */
export function resolveOrphanZoteroPaper(
  projectRoot: string,
  paperId: string,
): OrphanZoteroPaperResolution {
  if (isPaperLocallyMaterialized(projectRoot, paperId)) {
    detachZoteroMirror(projectRoot, paperId);
    return "detached";
  }
  deletePaper(projectRoot, paperId);
  return "deleted";
}

/**
 * Promote a Zotero mirror to a project-local entry while keeping `zotero_mirror`
 * so the next Zotero sync updates the same row (avoids duplicates).
 * Mirror is removed only on disconnect (`detachAllZoteroMirrors`) or explicit detach.
 */
export function promoteZoteroPaperToProject(projectRoot: string, paperId: string): boolean {
  const mirror = getZoteroMirrorByPaperId(projectRoot, paperId);
  if (!mirror) return false;
  const paper = getPaper(projectRoot, paperId);
  if (!paper || paper.origin === "manual") return false;
  const db = openLibraryDb(projectRoot);
  db.prepare("UPDATE papers SET origin = 'manual', updated_at = ? WHERE id = ?").run(
    Date.now(),
    paperId,
  );
  broadcastToRenderer("literature:paperMaterialized", { projectRoot, paperId });
  return true;
}

/**
 * When a Zotero mirror gains local assets, promote to a project-local entry so
 * PDF / extracted text / notes survive disconnect.
 */
export function materializeZoteroPaperIfLinked(projectRoot: string, paperId: string): boolean {
  return promoteZoteroPaperToProject(projectRoot, paperId);
}

/**
 * Import a Zotero-linked paper to local library.
 * Removes the zotero_mirror association and sets origin='manual'.
 * The paper (with metadata, annotations, cached PDF) survives disconnect.
 *
 * Also invoked automatically when PDF is cached or text is extracted (see
 * `materializeZoteroPaperIfLinked`). Manual "Keep in project" uses the same path.
 */
export function detachZoteroMirror(projectRoot: string, paperId: string): void {
  const db = openLibraryDb(projectRoot);
  db.prepare("DELETE FROM zotero_mirror WHERE paper_id = ?").run(paperId);
  db.prepare(
    `UPDATE papers SET
      origin = 'manual',
      updated_at = ?
     WHERE id = ?`,
  ).run(Date.now(), paperId);
}

/**
 * Disconnect from Zotero:
 * - Remove pure Zotero mirrors (no local work)
 * - Detach (keep as local) entries that were materialized in this project
 * - Delete Zotero-mirrored collections
 */
export function detachAllZoteroMirrors(projectRoot: string): { papers: number; collections: number } {
  const db = openLibraryDb(projectRoot);
  const zoteroPaperIds = db.prepare(
    "SELECT paper_id FROM zotero_mirror",
  ).all() as Array<{ paper_id: string }>;

  let deletedPapers = 0;
  for (const { paper_id: paperId } of zoteroPaperIds) {
    if (resolveOrphanZoteroPaper(projectRoot, paperId) === "deleted") {
      deletedPapers++;
    }
  }

  db.prepare("DELETE FROM zotero_mirror").run();

  // Delete Zotero-mirrored collections (keep local-only collections)
  const colRes = db.prepare(
    "DELETE FROM collections WHERE zotero_key IS NOT NULL",
  ).run();

  return { papers: deletedPapers, collections: Number(colRes.changes) };
}

export function upsertZoteroCollectionRow(
  projectRoot: string,
  input: {
    key: string;
    name: string;
    parentKey: string | null;
    version: number;
    sortOrder: number;
  },
): CollectionRow {
  const db = openLibraryDb(projectRoot);
  const now = Date.now();

  let parentId: string | null = null;
  if (input.parentKey) {
    const parent = db
      .prepare("SELECT id FROM collections WHERE id = ? OR zotero_key = ?")
      .get(input.parentKey, input.parentKey) as { id: string } | undefined;
    if (!parent) {
      throw new Error(
        `Zotero parent collection "${input.parentKey}" is not in library cache yet (sync order bug).`,
      );
    }
    parentId = parent.id;
  }

  const existing = db
    .prepare("SELECT * FROM collections WHERE zotero_key = ? OR id = ?")
    .get(input.key, input.key) as unknown as CollectionRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE collections SET
        name = ?,
        parent_id = ?,
        zotero_key = ?,
        zotero_parent = ?,
        zotero_version = ?,
        updated_at = ?
       WHERE id = ?`,
    ).run(input.name, parentId, input.key, input.parentKey, input.version, now, existing.id);
    return db.prepare("SELECT * FROM collections WHERE id = ?").get(existing.id) as unknown as CollectionRow;
  }

  db.prepare(
    `INSERT INTO collections (
      id, name, parent_id, sort_order, zotero_key, zotero_parent, zotero_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.key,
    input.name,
    parentId,
    input.sortOrder,
    input.key,
    input.parentKey,
    input.version,
    now,
    now,
  );
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(input.key) as unknown as CollectionRow;
}

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeBibkeyKey(bibkey: string): string {
  return bibkey.trim().toLowerCase();
}

function normalizeVenueKey(venue: string | null | undefined): string {
  return (venue ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseAuthorLastNames(authors: string | null): string[] {
  if (!authors?.trim()) return [];
  try {
    const parsed = JSON.parse(authors) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (typeof entry !== "string") return "";
        const s = entry.trim().toLowerCase();
        if (!s) return "";
        if (s.includes(",")) return s.split(",")[0]!.trim();
        const parts = s.split(/\s+/).filter(Boolean);
        return parts[parts.length - 1] ?? "";
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function authorsOverlap(a: string | null, b: string | null): boolean {
  const left = parseAuthorLastNames(a);
  const right = parseAuthorLastNames(b);
  if (left.length === 0 || right.length === 0) return false;
  const set = new Set(left);
  return right.some((name) => set.has(name));
}

/** Same item when Zotero bibkey differs slightly (e.g. manning2022 vs manning2022z). */
function bibkeysLooselyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (longer.startsWith(shorter) && shorter.length >= 6) return true;
  const baseA = a.replace(/_\d+$/, "");
  const baseB = b.replace(/_\d+$/, "");
  return baseA === baseB && baseA.length >= 6;
}

/** Confidence score for linking a Zotero sync row to a materialized orphan. */
export function scoreOrphanMergeConfidence(
  input: UpsertZoteroPaperInput,
  candidate: PaperRow,
): number {
  let score = 0;
  const inBib = normalizeBibkeyKey(input.bibkey);
  const candBib = normalizeBibkeyKey(candidate.bibkey);
  if (inBib && candBib && inBib === candBib) score += 100;
  else if (inBib && candBib && bibkeysLooselyMatch(inBib, candBib)) score += 50;

  if (authorsOverlap(input.authors, candidate.authors)) score += 40;

  const inVenue = normalizeVenueKey(input.venue);
  const candVenue = normalizeVenueKey(candidate.venue);
  if (inVenue && inVenue === candVenue) score += 30;

  return score;
}

const MATERIALIZED_ORPHANS_BY_YEAR_SQL = `
  SELECT p.* FROM papers p
  LEFT JOIN zotero_mirror zm ON zm.paper_id = p.id
  WHERE zm.paper_id IS NULL
    AND ((? IS NULL AND p.year IS NULL) OR p.year = ?)
    AND (
      p.origin = 'manual'
      OR p.pdf_path IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM paper_extracts pe
        WHERE pe.paper_id = p.id AND pe.status = 'ready'
        LIMIT 1
      )
    )
`;

function listMaterializedOrphansByYear(db: LibraryDb, year: number | null): PaperRow[] {
  return db.prepare(MATERIALIZED_ORPHANS_BY_YEAR_SQL).all(year, year) as unknown as PaperRow[];
}

function pickOrphanMergeCandidate(
  input: UpsertZoteroPaperInput,
  candidates: PaperRow[],
): PaperRow | undefined {
  const titleKey = normalizeTitleKey(input.title.trim() || input.bibkey);
  const scored = candidates
    .filter((row) => normalizeTitleKey(row.title) === titleKey)
    .map((row) => ({ row, score: scoreOrphanMergeConfidence(input, row) }))
    .filter((entry) => entry.score >= ORPHAN_MERGE_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return undefined;
  if (scored.length === 1) return scored[0]!.row;
  if (scored[0]!.score - scored[1]!.score >= ORPHAN_MERGE_WIN_MARGIN) return scored[0]!.row;
  return undefined;
}

/** Zotero mirror row with no local PDF or ready extract — typical duplicate shell. */
export function isEmptyZoteroShellPaper(projectRoot: string, paper: PaperRow): boolean {
  if (paper.origin !== "zotero") return false;
  if (paper.pdf_path) return false;
  if (paperHasReadyExtract(projectRoot, paper.id)) return false;
  return true;
}

/**
 * Materialized paper that lost `zotero_mirror` (e.g. old auto-materialize bug).
 * Indexed by year + SQL filters; merge only when confidence score is high enough.
 */
export function findOrphanMaterializedPaperForZoteroSync(
  projectRoot: string,
  input: UpsertZoteroPaperInput,
  excludePaperId?: string,
): PaperRow | undefined {
  const db = openLibraryDb(projectRoot);
  const titleKey = normalizeTitleKey(input.title.trim() || input.bibkey);

  if (input.bibkey.trim()) {
    const byBibkey = db
      .prepare("SELECT * FROM papers WHERE bibkey = ?")
      .get(input.bibkey.trim()) as unknown as PaperRow | undefined;
    if (
      byBibkey &&
      byBibkey.id !== excludePaperId &&
      !getZoteroMirrorByPaperId(projectRoot, byBibkey.id) &&
      isPaperLocallyMaterialized(projectRoot, byBibkey.id) &&
      normalizeTitleKey(byBibkey.title) === titleKey
    ) {
      return byBibkey;
    }
  }

  const candidates = listMaterializedOrphansByYear(db, input.year).filter(
    (row) => !excludePaperId || row.id !== excludePaperId,
  );
  return pickOrphanMergeCandidate(input, candidates);
}

/** Drop empty Zotero shell when a materialized orphan matches the same item. */
export function reconcileZoteroShellWithOrphan(
  projectRoot: string,
  shellPaper: PaperRow,
  input: UpsertZoteroPaperInput,
): PaperRow | null {
  const orphan = findOrphanMaterializedPaperForZoteroSync(projectRoot, input, shellPaper.id);
  if (!orphan || !isEmptyZoteroShellPaper(projectRoot, shellPaper)) return null;
  deletePaper(projectRoot, shellPaper.id);
  return orphan;
}

export interface UpsertZoteroPaperInput {
  zoteroKey: string;
  zoteroVersion: number;
  zoteroAttachKey: string | null;
  bibkey: string;
  rawBibtex?: string | null;
  cslJson?: string | null;
  title: string;
  authors: string | null;
  year: number | null;
  abstract: string | null;
  doi: string | null;
  arxivId: string | null;
  venue: string | null;
  type: string | null;
}

export function upsertZoteroPaperRow(projectRoot: string, input: UpsertZoteroPaperInput): PaperRow {
  const db = openLibraryDb(projectRoot);
  const now = Date.now();
  const normDoi = coerceStoredDoi(input.doi ?? undefined);
  const normArxiv = normalizeArxivId(input.arxivId ?? undefined);
  const title = input.title.trim() || input.bibkey;

  // Look up by zotero_mirror, not papers.zotero_key (which is deprecated)
  const mirrorRow = db
    .prepare("SELECT paper_id FROM zotero_mirror WHERE zotero_key = ?")
    .get(input.zoteroKey) as { paper_id: string } | undefined;
  let existing = mirrorRow
    ? (db.prepare("SELECT * FROM papers WHERE id = ?").get(mirrorRow.paper_id) as PaperRow | undefined)
    : undefined;

  let orphanMatched: PaperRow | undefined;
  if (existing) {
    const reconciled = reconcileZoteroShellWithOrphan(projectRoot, existing, input);
    if (reconciled) {
      existing = undefined;
      orphanMatched = reconciled;
    }
  } else {
    orphanMatched = findOrphanMaterializedPaperForZoteroSync(projectRoot, input);
  }

  // Identity merge: a manually-ingested paper with the same DOI/arXiv
  // should be upgraded to a Zotero mirror instead of duplicated.
  const identityMatched =
    existing || orphanMatched
      ? null
      : (findExistingPaper(db, { doi: normDoi, arxivId: normArxiv }) ?? null);

  const upsertMirror = (paperId: string) => {
    db.prepare(
      "INSERT OR REPLACE INTO zotero_mirror (paper_id, zotero_key, zotero_version, zotero_attach_key) VALUES (?, ?, ?, ?)",
    ).run(paperId, input.zoteroKey, input.zoteroVersion, input.zoteroAttachKey);
  };

  if (existing || identityMatched || orphanMatched) {
    const target = existing ?? identityMatched ?? orphanMatched!;
    const resolved = resolveStoredBibkey(
      target.bibkey,
      input.bibkey,
      title,
      input.year,
      input.authors,
    );
    const bibkey = resolved === target.bibkey ? target.bibkey : uniqueBibkey(db, resolved);
    const rawBibtex =
      bibkey !== target.bibkey
        ? patchRawBibtexKey(input.rawBibtex?.trim() || target.raw_bibtex, bibkey)
        : input.rawBibtex?.trim() || null;
    const keepLocalOrigin =
      target.origin === "manual" ||
      Boolean(target.pdf_path) ||
      paperHasReadyExtract(projectRoot, target.id);
    db.prepare(
      `UPDATE papers SET
        bibkey = ?,
        title = ?,
        authors = ?,
        year = ?,
        abstract = ?,
        doi = ?,
        arxiv_id = ?,
        venue = ?,
        type = ?,
        origin = ?,
        raw_bibtex = COALESCE(?, raw_bibtex),
        csl_json = COALESCE(?, csl_json),
        updated_at = ?
       WHERE id = ?`,
    ).run(
      bibkey,
      title,
      input.authors,
      input.year,
      input.abstract,
      normDoi,
      normArxiv,
      input.venue,
      input.type,
      keepLocalOrigin ? "manual" : "zotero",
      rawBibtex,
      input.cslJson?.trim() || null,
      now,
      target.id,
    );
    upsertMirror(target.id);
    const updated = db
      .prepare(
        `SELECT p.*, zm.zotero_key FROM papers p
         LEFT JOIN zotero_mirror zm ON zm.paper_id = p.id
         WHERE p.id = ?`,
      )
      .get(target.id) as unknown as PaperRow;
    const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(updated.id) as { rowid: number };
    syncFtsForPaper(db, rowid.rowid, updated);
    return updated;
  }

  const bibkey = uniqueBibkey(
    db,
    resolveIncomingBibkey(input.bibkey, title, input.year, input.authors),
  );
  const rawBibtex =
    patchRawBibtexKey(input.rawBibtex, bibkey) ?? input.rawBibtex?.trim() ?? null;
  const id = newId();
  db.prepare(
    `INSERT INTO papers (
      id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type,
      pdf_path, pdf_sha, origin, raw_bibtex, csl_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, 'zotero', ?, ?, ?, ?)`,
  ).run(
    id,
    bibkey,
    title,
    input.authors,
    input.year,
    input.abstract,
    normDoi,
    normArxiv,
    input.venue,
    input.type,
    rawBibtex,
    input.cslJson?.trim() || null,
    now,
    now,
  );
  upsertMirror(id);
  const row = db
    .prepare(
      `SELECT p.*, zm.zotero_key FROM papers p
       LEFT JOIN zotero_mirror zm ON zm.paper_id = p.id
       WHERE p.id = ?`,
    )
    .get(id) as unknown as PaperRow;
  const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(id) as { rowid: number };
  syncFtsForPaper(db, rowid.rowid, row);
  return row;
}

/** Look up zotero_key for a paper via zotero_mirror table (not papers.zotero_key). */
export function getZoteroMirrorByPaperId(projectRoot: string, paperId: string): { zotero_key: string; zotero_version: number | null; zotero_attach_key: string | null } | null {
  const db = openLibraryDb(projectRoot);
  const row = db.prepare("SELECT zotero_key, zotero_version, zotero_attach_key FROM zotero_mirror WHERE paper_id = ?").get(paperId) as
    | { zotero_key: string; zotero_version: number | null; zotero_attach_key: string | null }
    | undefined;
  return row ?? null;
}

/** Look up paper by zotero_key via zotero_mirror table. */
export function getPaperByZoteroKey(projectRoot: string, zoteroKey: string): PaperRow | null {
  const db = openLibraryDb(projectRoot);
  const mirror = db.prepare("SELECT paper_id FROM zotero_mirror WHERE zotero_key = ?").get(zoteroKey) as { paper_id: string } | undefined;
  if (!mirror) return null;
  return db
    .prepare(
      `SELECT p.*, zm.zotero_key FROM papers p
       LEFT JOIN zotero_mirror zm ON zm.paper_id = p.id
       WHERE p.id = ?`,
    )
    .get(mirror.paper_id) as unknown as PaperRow | null;
}
