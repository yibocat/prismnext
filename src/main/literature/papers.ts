import * as fs from "node:fs";
import * as path from "node:path";
import {
  patchRawBibtexKey,
  resolveIncomingBibkey,
} from "../../shared/literature/bibkey-utils";
import { coerceStoredDoi, normalizeArxivId } from "../../shared/literature/doi-utils";
import type { LiteraturePaper, PaperAiMetadataStatus } from "../../shared/literature/paper";
import {
  normalizePaperTag,
  normalizePaperTagsWithCatalog,
  paperTagKey,
  parsePaperTagsJson,
  serializePaperTagsJson,
} from "../../shared/literature/paper-tags";
import { broadcastToRenderer } from "./broadcast";
import {
  PAPER_SELECT,
  findExistingPaper,
  newId,
  openLibraryDb,
  removeFromFts,
  syncFtsForPaper,
  uniqueBibkey,
} from "./db";
import { getLibraryPaths } from "./paths";
import { listCollectionPaperIds, listCollections } from "./collections";
import type { LibraryDb, PaperRow } from "./types";

export interface PaperUpdateInput {
  title?: string;
  bibkey?: string;
  authors?: string | null;
  year?: number | null;
  abstract?: string | null;
  doi?: string | null;
  arxiv_id?: string | null;
  venue?: string | null;
  type?: string | null;
  isbn?: string | null;
  tags?: string[] | null;
  ai_summary?: string | null;
  ai_metadata_at?: number | null;
  ai_metadata_sha?: string | null;
}

export interface CreatePaperResult {
  paper: PaperRow;
  created: boolean;
  duplicateReason?: "pdf" | "doi" | "arxiv";
}

export function collectProjectTagDisplays(db: LibraryDb): string[] {
  const rows = db
    .prepare("SELECT tags FROM papers WHERE tags IS NOT NULL AND tags != ''")
    .all() as Array<{ tags: string }>;
  const catalog: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const tag of parsePaperTagsJson(row.tags)) {
      const key = paperTagKey(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push(tag);
    }
  }
  return catalog;
}

export function upsertPaperAiMetadata(
  db: LibraryDb,
  paperId: string,
  patch: {
    status: PaperAiMetadataStatus;
    error?: string | null;
    model?: string | null;
    queued_at?: number | null;
    finished_at?: number | null;
  },
): void {
  db.prepare(
    `INSERT INTO paper_ai_metadata (paper_id, status, error, model, queued_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(paper_id) DO UPDATE SET
       status = excluded.status,
       error = excluded.error,
       model = COALESCE(excluded.model, paper_ai_metadata.model),
       queued_at = COALESCE(excluded.queued_at, paper_ai_metadata.queued_at),
       finished_at = COALESCE(excluded.finished_at, paper_ai_metadata.finished_at)`,
  ).run(
    paperId,
    patch.status,
    patch.error ?? null,
    patch.model ?? null,
    patch.queued_at ?? null,
    patch.finished_at ?? null,
  );
}

export function mapPaperForRenderer(row: PaperRow): LiteraturePaper {
  const {
    tags: tagsJson,
    ai_metadata_status: aiMetadataStatus,
    ai_metadata_error: aiMetadataError,
    ...rest
  } = row;
  return {
    ...rest,
    tags: parsePaperTagsJson(tagsJson),
    source: rest.origin,
    ai_metadata_status: (aiMetadataStatus as PaperAiMetadataStatus | null) ?? "idle",
    ai_metadata_error: aiMetadataError,
  };
}

const AGENT_SEARCH_SUMMARY_MAX = 320;

/** Agent-facing paper payload — parsed tags, no raw csl_json blob. */
export function mapPaperForAgent(row: PaperRow) {
  const {
    csl_json: _csl,
    tags: tagsJson,
    ai_metadata_status: _ams,
    ai_metadata_error: _ame,
    zotero_key: _zk,
    ...rest
  } = row;
  return {
    ...rest,
    tags: parsePaperTagsJson(tagsJson),
    ai_summary: row.ai_summary,
  };
}

/** Compact search hit for agent tool output (truncates long AI summaries). */
export function mapPaperSearchHitForAgent(row: PaperRow) {
  const paper = mapPaperForAgent(row);
  const summary = paper.ai_summary?.trim();
  return {
    bibkey: paper.bibkey,
    title: paper.title,
    year: paper.year,
    authors: paper.authors,
    doi: paper.doi,
    arxiv_id: paper.arxiv_id,
    abstract: paper.abstract,
    venue: paper.venue,
    tags: paper.tags,
    ai_summary: summary
      ? summary.length > AGENT_SEARCH_SUMMARY_MAX
        ? `${summary.slice(0, AGENT_SEARCH_SUMMARY_MAX)}…`
        : summary
      : null,
  };
}

export function filterPapersByTag(papers: PaperRow[], tag: string): PaperRow[] {
  const key = paperTagKey(normalizePaperTag(tag) ?? tag);
  if (!key) return [];
  return papers.filter((p) => parsePaperTagsJson(p.tags).some((t) => paperTagKey(t) === key));
}

export interface SearchPapersOptions {
  tag?: string | null;
  /** Collection name (case-insensitive) — restrict results to papers in this collection. */
  collection?: string | null;
}

function libraryDbExists(projectRoot: string): boolean {
  return fs.existsSync(getLibraryPaths(projectRoot).dbPath);
}

export function listPapers(projectRoot: string): PaperRow[] {
  const db = openLibraryDb(projectRoot);
  return db.prepare(`${PAPER_SELECT} ORDER BY p.updated_at DESC`).all() as unknown as PaperRow[];
}

export function getPaper(projectRoot: string, paperId: string): PaperRow | null {
  const db = openLibraryDb(projectRoot);
  const row = db.prepare(`${PAPER_SELECT} WHERE p.id = ?`).get(paperId) as unknown as PaperRow | undefined;
  return row ?? null;
}

export function getPaperByBibkey(projectRoot: string, bibkey: string): PaperRow | null {
  const db = openLibraryDb(projectRoot);
  const row = db.prepare(`${PAPER_SELECT} WHERE p.bibkey = ?`).get(bibkey) as unknown as PaperRow | undefined;
  return row ?? null;
}

/**
 * Look up an existing library paper by DOI or arXiv ID (read-only).
 * Used by the citation-staging flow to mark a staged citation as
 * already-in-library without writing to `library.db`.
 */
export function findExistingByIdentifier(
  projectRoot: string,
  ids: { doi?: string | null; arxivId?: string | null },
): { paperId: string; bibkey: string } | null {
  const db = openLibraryDb(projectRoot);
  const row = findExistingPaper(db, { doi: ids.doi ?? null, arxivId: ids.arxivId ?? null });
  if (!row) return null;
  return { paperId: row.id, bibkey: row.bibkey };
}

export function searchPapers(
  projectRoot: string,
  query: string,
  limit = 50,
  opts?: SearchPapersOptions,
): PaperRow[] {
  const q = query.trim();
  const tagKey = opts?.tag?.trim()
    ? paperTagKey(normalizePaperTag(opts.tag.trim()) ?? opts.tag.trim())
    : null;

  const fetchLimit = tagKey && q ? Math.max(limit * 4, 50) : limit;
  let rows: PaperRow[] = [];

  if (q) {
    const db = openLibraryDb(projectRoot);
    try {
      rows = db
        .prepare(
          `SELECT p.*, zm.zotero_key, am.status AS ai_metadata_status, am.error AS ai_metadata_error
           FROM papers_fts fts
           JOIN papers p ON p.rowid = fts.rowid
           LEFT JOIN zotero_mirror zm ON zm.paper_id = p.id
           LEFT JOIN paper_ai_metadata am ON am.paper_id = p.id
           WHERE papers_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(`${q}*`, fetchLimit) as unknown as PaperRow[];
    } catch {
      // fallback to LIKE
    }
    if (rows.length === 0) {
      const like = `%${q}%`;
      rows = db
        .prepare(
          `${PAPER_SELECT}
           WHERE p.title LIKE ? OR p.abstract LIKE ? OR p.authors LIKE ? OR p.bibkey LIKE ?
              OR p.tags LIKE ? OR p.ai_summary LIKE ?
           ORDER BY p.updated_at DESC LIMIT ?`,
        )
        .all(like, like, like, like, like, like, fetchLimit) as unknown as PaperRow[];
    }
  } else {
    rows = listPapers(projectRoot);
  }

  if (tagKey) {
    rows = rows.filter((p) => parsePaperTagsJson(p.tags).some((t) => paperTagKey(t) === tagKey));
  }

  const collectionName = opts?.collection?.trim();
  if (collectionName) {
    const cols = listCollections(projectRoot);
    const col = cols.find((c) => c.name.toLowerCase() === collectionName.toLowerCase());
    if (!col) return [];
    const collectionPaperIds = new Set(listCollectionPaperIds(projectRoot, col.id));
    rows = rows.filter((p) => collectionPaperIds.has(p.id));
  }

  return rows.slice(0, limit);
}


export function paperHasReadyExtract(projectRoot: string, paperId: string): boolean {
  const db = openLibraryDb(projectRoot);
  const row = db
    .prepare("SELECT 1 FROM paper_extracts WHERE paper_id = ? AND status = 'ready' LIMIT 1")
    .get(paperId);
  return Boolean(row);
}

/** Local PDF, ready extract, tags/summary, or explicit manual origin — survives Zotero orphan prune / disconnect. */
export function isPaperLocallyMaterialized(projectRoot: string, paperId: string): boolean {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) return false;
  if (paper.origin === "manual") return true;
  if (paper.pdf_path) return true;
  if (paper.ai_summary?.trim()) return true;
  if (parsePaperTagsJson(paper.tags).length > 0) return true;
  return paperHasReadyExtract(projectRoot, paperId);
}

export interface ApplyIdentifiersResult {
  applied: boolean;
  paper?: PaperRow;
  duplicatePaper?: PaperRow;
}

export function applyIdentifiers(
  projectRoot: string,
  paperId: string,
  ids: { doi?: string | null; arxivId?: string | null },
): ApplyIdentifiersResult {
  const db = openLibraryDb(projectRoot);
  const normDoi = ids.doi ? normalizeDoi(ids.doi) : null;
  const normArxiv = ids.arxivId ? normalizeArxivId(ids.arxivId) : null;
  if (!normDoi && !normArxiv) {
    return { applied: false, paper: getPaper(projectRoot, paperId) ?? undefined };
  }

  const dup = findExistingPaper(db, { doi: normDoi, arxivId: normArxiv, excludeId: paperId });
  if (dup) {
    return { applied: false, duplicatePaper: dup };
  }

  const patch: PaperUpdateInput = {};
  if (normDoi) patch.doi = normDoi;
  if (normArxiv) patch.arxiv_id = normArxiv;
  const paper = updatePaper(projectRoot, paperId, patch);
  return { applied: true, paper };
}

/** Create a paper; returns existing row when DOI / arXiv already in library. */
export function createPaper(projectRoot: string, meta: Partial<PaperRow>): CreatePaperResult {
  const db = openLibraryDb(projectRoot);
  const normDoi = meta.doi ? coerceStoredDoi(meta.doi) : null;
  const normArxiv = meta.arxiv_id ? normalizeArxivId(meta.arxiv_id) : null;
  const dup = findExistingPaper(db, { doi: normDoi, arxivId: normArxiv });
  if (dup) {
    const enriched = applyMetadata(projectRoot, dup.id, {
      title: meta.title?.trim() || undefined,
      authors: meta.authors,
      year: meta.year,
      abstract: meta.abstract,
      doi: normDoi,
      arxiv_id: normArxiv,
      venue: meta.venue,
      type: meta.type,
      csl_json: meta.csl_json,
    });
    broadcastToRenderer("literature:paperMaterialized", { projectRoot, paperId: dup.id });
    return {
      paper: enriched,
      created: false,
      duplicateReason: normDoi ? "doi" : "arxiv",
    };
  }

  const title = meta.title?.trim() || "Untitled";
  const preferredKey = resolveIncomingBibkey(meta.bibkey, title, meta.year, meta.authors ?? null);
  const bibkey = uniqueBibkey(db, preferredKey);
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, metadata_source, raw_bibtex, csl_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    id, bibkey, title,
    meta.authors ?? null,
    meta.year ?? null,
    meta.abstract ?? null,
    normDoi,
    normArxiv,
    meta.isbn ?? null,
    meta.venue ?? null,
    meta.type ?? "article",
    meta.origin ?? "manual",
    meta.metadata_source ?? null,
    meta.csl_json ?? null,
    now, now,
  );
  const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(id) as { rowid: number };
  syncFtsForPaper(db, rowid.rowid, {
    title,
    abstract: meta.abstract ?? null,
    authors: meta.authors ?? null,
    tags: null,
    ai_summary: null,
  });
  const paper = getPaper(projectRoot, id)!;
  broadcastToRenderer("literature:paperMaterialized", { projectRoot, paperId: id });
  return { paper, created: true };
}

export function updatePaper(projectRoot: string, paperId: string, input: PaperUpdateInput): PaperRow {
  const existing = getPaper(projectRoot, paperId);
  if (!existing) throw new Error("Paper not found");

  const title = input.title !== undefined ? input.title.trim() : existing.title;
  if (!title) throw new Error("Title is required");

  const db = openLibraryDb(projectRoot);

  let bibkey = existing.bibkey;
  if (input.bibkey !== undefined) {
    const key = input.bibkey.trim();
    if (!key) throw new Error("Bibkey is required");
    const clash = db.prepare("SELECT id FROM papers WHERE bibkey = ? AND id != ?").get(key, paperId) as
      | { id: string }
      | undefined;
    if (clash) throw new Error(`Bibkey "${key}" already in use`);
    bibkey = key;
  }

  let raw_bibtex = existing.raw_bibtex;
  if (input.bibkey !== undefined && bibkey !== existing.bibkey) {
    raw_bibtex = patchRawBibtexKey(existing.raw_bibtex, bibkey) ?? existing.raw_bibtex;
  }

  const authors = input.authors !== undefined ? input.authors : existing.authors;
  const year = input.year !== undefined ? input.year : existing.year;
  const abstract = input.abstract !== undefined ? input.abstract : existing.abstract;
  const doi =
    input.doi !== undefined
      ? input.doi
        ? coerceStoredDoi(input.doi)
        : null
      : existing.doi;
  const arxiv_id =
    input.arxiv_id !== undefined
      ? input.arxiv_id
        ? normalizeArxivId(input.arxiv_id)
        : null
      : existing.arxiv_id;
  const venue = input.venue !== undefined ? input.venue : existing.venue;
  const type = input.type !== undefined ? input.type : existing.type;
  const isbn = input.isbn !== undefined ? input.isbn : existing.isbn;
  const catalog = collectProjectTagDisplays(db);
  const tags =
    input.tags !== undefined
      ? serializePaperTagsJson(normalizePaperTagsWithCatalog(input.tags ?? [], catalog))
      : existing.tags;
  const ai_summary = input.ai_summary !== undefined ? input.ai_summary : existing.ai_summary;
  const ai_metadata_at =
    input.ai_metadata_at !== undefined ? input.ai_metadata_at : existing.ai_metadata_at;
  const ai_metadata_sha =
    input.ai_metadata_sha !== undefined ? input.ai_metadata_sha : existing.ai_metadata_sha;

  const dup = findExistingPaper(db, { doi, arxivId: arxiv_id, excludeId: paperId });
  if (dup) {
    throw new Error(`Duplicate: "${dup.title}" already uses this DOI or arXiv ID`);
  }

  const now = Date.now();

  db.prepare(
    `UPDATE papers SET
      title = ?, bibkey = ?, authors = ?, year = ?, abstract = ?,
      doi = ?, arxiv_id = ?, venue = ?, type = ?, isbn = ?, raw_bibtex = ?, tags = ?,
      ai_summary = ?, ai_metadata_at = ?, ai_metadata_sha = ?,
      updated_at = ?
     WHERE id = ?`,
  ).run(
    title,
    bibkey,
    authors,
    year,
    abstract,
    doi,
    arxiv_id,
    venue,
    type,
    isbn,
    raw_bibtex,
    tags,
    ai_summary,
    ai_metadata_at,
    ai_metadata_sha,
    now,
    paperId,
  );

  const updated = getPaper(projectRoot, paperId)!;
  const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(paperId) as { rowid: number };
  syncFtsForPaper(db, rowid.rowid, updated);
  return updated;
}

/** User-initiated metadata lookup from DOI or arXiv on an existing entry. */
export async function fetchAndApplyMetadata(
  projectRoot: string,
  paperId: string,
  opts?: { doi?: string; arxivId?: string },
): Promise<{
  paper: PaperRow;
  enriched: boolean;
  enrichError?: string;
  pdfAttached?: boolean;
  pdfAttachError?: string;
}> {
  const { enrichPaperFromCatalog } = await import("./enrich");
  const result = await enrichPaperFromCatalog(projectRoot, paperId, opts);
  if (!result.enriched) {
    throw new Error(result.enrichError ?? "Metadata fetch failed");
  }
  return result;
}

export function deletePaper(projectRoot: string, paperId: string): void {
  const paths = getLibraryPaths(projectRoot);
  const paper = getPaper(projectRoot, paperId);
  if (!paper) throw new Error("Paper not found");

  const db = openLibraryDb(projectRoot);
  const rowidRow = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(paperId) as { rowid: number } | undefined;

  db.prepare("DELETE FROM reading_list WHERE paper_id = ?").run(paperId);
  db.prepare("DELETE FROM annotations WHERE paper_id = ?").run(paperId);
  db.prepare("DELETE FROM collection_papers WHERE paper_id = ?").run(paperId);
  db.prepare("DELETE FROM zotero_mirror WHERE paper_id = ?").run(paperId);
  if (rowidRow) removeFromFts(db, rowidRow.rowid);
  db.prepare("DELETE FROM papers WHERE id = ?").run(paperId);

  if (paper.pdf_path && paper.pdf_sha) {
    const stillUsed = db.prepare("SELECT 1 FROM papers WHERE pdf_sha = ? LIMIT 1").get(paper.pdf_sha);
    if (!stillUsed) {
      const full = path.join(paths.libraryDir, paper.pdf_path);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
  }

  const extractPaperDir = path.join(paths.extractDir, paperId);
  if (fs.existsSync(extractPaperDir)) {
    fs.rmSync(extractPaperDir, { recursive: true, force: true });
  }
}

export function applyMetadata(projectRoot: string, paperId: string, meta: Partial<PaperRow>): PaperRow {
  const db = openLibraryDb(projectRoot);
  const existing = getPaper(projectRoot, paperId);
  if (!existing) throw new Error("Paper not found");
  const now = Date.now();
  db.prepare(
    `UPDATE papers SET
      title = COALESCE(?, title),
      authors = COALESCE(?, authors),
      year = COALESCE(?, year),
      abstract = COALESCE(?, abstract),
      doi = COALESCE(?, doi),
      arxiv_id = COALESCE(?, arxiv_id),
      venue = COALESCE(?, venue),
      type = COALESCE(?, type),
      origin = COALESCE(?, origin),
      metadata_source = COALESCE(?, metadata_source),
      csl_json = COALESCE(?, csl_json),
      updated_at = ?
     WHERE id = ?`,
  ).run(
    meta.title ?? null,
    meta.authors ?? null,
    meta.year ?? null,
    meta.abstract ?? null,
    meta.doi ?? null,
    meta.arxiv_id ?? null,
    meta.venue ?? null,
    meta.type ?? null,
    meta.origin ?? null,
    meta.metadata_source ?? null,
    meta.csl_json ?? null,
    now,
    paperId,
  );
  const updated = getPaper(projectRoot, paperId)!;
  const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(paperId) as { rowid: number };
  syncFtsForPaper(db, rowid.rowid, updated);
  return updated;
}
