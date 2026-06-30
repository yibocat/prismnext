import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-csl";
import {
  authorsFromBibField,
  parseBibTeX,
  patchCslJsonBibkey,
  type BibEntry,
} from "../lib/bibtex-parse";
import {
  isOpaqueBibkey,
  patchRawBibtexKey,
  resolveIncomingBibkey,
  resolveStoredBibkey,
  suggestBibkey,
} from "../../shared/bibkey-utils";
import { normalizeArxivId, normalizeDoi } from "../../shared/doi-utils";
import { cslEntryFromPaperRow } from "../../shared/bibliographic-metadata/helpers";
import "@citation-js/plugin-bibtex";

export interface PaperRow {
  id: string;
  bibkey: string;
  title: string;
  authors: string | null;
  year: number | null;
  abstract: string | null;
  doi: string | null;
  arxiv_id: string | null;
  isbn: string | null;
  venue: string | null;
  type: string | null;
  pdf_path: string | null;
  pdf_sha: string | null;
  origin: string | null;
  metadata_source: string | null;
  raw_bibtex: string | null;
  csl_json: string | null;
  /** Virtual field — JOINed from zotero_mirror, not a papers column. */
  zotero_key: string | null;
  created_at: number;
  updated_at: number;
}

export interface AnnotationRow {
  id: string;
  paper_id: string;
  kind: string;
  page: number;
  rects: string;
  quoted_text: string | null;
  color: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface CollectionRow {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  paper_count?: number;
  zotero_key?: string | null;
  zotero_parent?: string | null;
  zotero_version?: number | null;
}

export interface LibraryPaths {
  libraryDir: string;
  dbPath: string;
  attachmentsDir: string;
}

export type LibraryDb = DatabaseSync;

const dbCache = new Map<string, LibraryDb>();

export function getLibraryPaths(projectRoot: string): LibraryPaths {
  const libraryDir = path.join(projectRoot, ".prismnext", "library");
  return {
    libraryDir,
    dbPath: path.join(libraryDir, "library.db"),
    attachmentsDir: path.join(libraryDir, "attachments"),
  };
}

function ensureLibraryDirs(paths: LibraryPaths): void {
  fs.mkdirSync(paths.attachmentsDir, { recursive: true });
}

/** Bump when schema changes. Dev phase: mismatch → wipe + recreate. */
const CURRENT_SCHEMA_VERSION = 4;

function ensureMetaTable(db: LibraryDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
}

function readSchemaVersion(db: LibraryDb): number {
  ensureMetaTable(db);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  return row ? Number.parseInt(row.value, 10) || 0 : 0;
}

function writeSchemaVersion(db: LibraryDb, version: number): void {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(
    String(version),
  );
}

/**
 * Dev phase: no migrations. If the DB schema doesn't match, wipe and recreate.
 * No users, no backward compat needed.
 */
function migrateLibraryDb(db: LibraryDb): void {
  const version = readSchemaVersion(db);
  if (version === CURRENT_SCHEMA_VERSION) return;
  // Schema drift — drop and rebuild (dev only, no user data to preserve)
  db.exec(`
    DROP TABLE IF EXISTS papers_fts;
    DROP TABLE IF EXISTS annotations;
    DROP TABLE IF EXISTS collection_papers;
    DROP TABLE IF EXISTS reading_list;
    DROP TABLE IF EXISTS zotero_mirror;
    DROP TABLE IF EXISTS collections;
    DROP TABLE IF EXISTS papers;
    DROP TABLE IF EXISTS meta;
  `);
  initSchema(db);
  writeSchemaVersion(db, CURRENT_SCHEMA_VERSION);
}

function initSchema(db: LibraryDb): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      bibkey TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      authors TEXT,
      year INTEGER,
      abstract TEXT,
      doi TEXT,
      arxiv_id TEXT,
      isbn TEXT,
      venue TEXT,
      type TEXT,
      pdf_path TEXT,
      pdf_sha TEXT,
      origin TEXT,
      metadata_source TEXT,
      raw_bibtex TEXT,
      csl_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
      title, abstract, authors, content='papers', content_rowid='rowid'
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      page INTEGER NOT NULL,
      rects TEXT NOT NULL,
      quoted_text TEXT,
      color TEXT,
      note TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      zotero_key TEXT,
      zotero_parent TEXT,
      zotero_version INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_zotero_key ON collections(zotero_key) WHERE zotero_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS collection_papers (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      added_at INTEGER NOT NULL,
      PRIMARY KEY(collection_id, paper_id)
    );
    CREATE TABLE IF NOT EXISTS reading_list (
      paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS zotero_mirror (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      zotero_key TEXT NOT NULL UNIQUE,
      zotero_version INTEGER,
      zotero_attach_key TEXT,
      PRIMARY KEY (paper_id)
    );
    CREATE INDEX IF NOT EXISTS idx_zotero_mirror_key ON zotero_mirror(zotero_key);
    CREATE INDEX IF NOT EXISTS idx_papers_doi ON papers(doi) WHERE doi IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_papers_arxiv ON papers(arxiv_id) WHERE arxiv_id IS NOT NULL;
  `);
}

function upgradeOpaqueBibkeysInDb(db: LibraryDb): void {
  const rows = db
    .prepare("SELECT id, bibkey, title, year, authors, raw_bibtex FROM papers")
    .all() as Array<{
    id: string;
    bibkey: string;
    title: string;
    year: number | null;
    authors: string | null;
    raw_bibtex: string | null;
  }>;

  for (const row of rows) {
    if (!isOpaqueBibkey(row.bibkey)) continue;
    const next = uniqueBibkey(db, suggestBibkey(row.title, row.year, row.authors));
    if (next === row.bibkey) continue;
    const raw = patchRawBibtexKey(row.raw_bibtex, next) ?? row.raw_bibtex;
    db.prepare("UPDATE papers SET bibkey = ?, raw_bibtex = ?, updated_at = ? WHERE id = ?").run(
      next,
      raw,
      Date.now(),
      row.id,
    );
  }
}

export function openLibraryDb(projectRoot: string): LibraryDb {
  const paths = getLibraryPaths(projectRoot);
  ensureLibraryDirs(paths);
  let db = dbCache.get(paths.dbPath);
  if (!db) {
    db = new DatabaseSync(paths.dbPath);
    migrateLibraryDb(db);
    ensureFtsHealthy(db);
    upgradeOpaqueBibkeysInDb(db);
    dbCache.set(paths.dbPath, db);
  }
  return db;
}

export function closeLibraryDb(projectRoot: string): void {
  const { dbPath } = getLibraryPaths(projectRoot);
  const db = dbCache.get(dbPath);
  if (db) {
    db.close();
    dbCache.delete(dbPath);
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function uniqueBibkey(db: LibraryDb, preferred: string): string {
  let key = preferred;
  let n = 1;
  while (db.prepare("SELECT 1 FROM papers WHERE bibkey = ?").get(key)) {
    key = `${preferred}_${n++}`;
  }
  return key;
}

function ftsDelete(db: LibraryDb, rowid: number): void {
  db.prepare(
    "INSERT INTO papers_fts(papers_fts, rowid, title, abstract, authors) VALUES ('delete', ?, '', '', '')",
  ).run(rowid);
}

function ftsInsert(
  db: LibraryDb,
  rowid: number,
  title: string,
  abstract: string | null,
  authors: string | null,
): void {
  db.prepare("INSERT INTO papers_fts(rowid, title, abstract, authors) VALUES (?, ?, ?, ?)").run(
    rowid,
    title,
    abstract ?? "",
    authors ?? "",
  );
}

function ftsUpsert(
  db: LibraryDb,
  rowid: number,
  title: string,
  abstract: string | null,
  authors: string | null,
): void {
  try {
    ftsDelete(db, rowid);
  } catch {
    // row may not exist in FTS index yet
  }
  ftsInsert(db, rowid, title, abstract, authors);
}

function isFtsCorruptError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errcode?: number; errstr?: string };
  if (e.errcode === 11 || e.errcode === 267) return true;
  const code = e.code ?? "";
  const msg = e.errstr ?? "";
  return (
    code === "SQLITE_CORRUPT_VTAB" ||
    code === "SQLITE_CORRUPT" ||
    msg.includes("malformed") ||
    msg.includes("corrupt")
  );
}

function repairFtsIndex(db: LibraryDb): void {
  try {
    db.exec("INSERT INTO papers_fts(papers_fts) VALUES('rebuild')");
  } catch (err) {
    console.warn("[literature] FTS rebuild failed, recreating virtual table:", err);
    db.exec(`
      DROP TABLE IF EXISTS papers_fts;
      CREATE VIRTUAL TABLE papers_fts USING fts5(
        title, abstract, authors, content='papers', content_rowid='rowid'
      );
      INSERT INTO papers_fts(rowid, title, abstract, authors)
      SELECT rowid, title, COALESCE(abstract, ''), COALESCE(authors, '') FROM papers;
    `);
  }
}

function ensureFtsHealthy(db: LibraryDb): void {
  try {
    db.prepare("SELECT rowid FROM papers_fts LIMIT 1").get();
  } catch (err) {
    if (isFtsCorruptError(err)) repairFtsIndex(db);
    else throw err;
  }
}

function removeFromFts(db: LibraryDb, rowid: number): void {
  try {
    ftsDelete(db, rowid);
  } catch (err) {
    if (isFtsCorruptError(err)) {
      repairFtsIndex(db);
      try {
        ftsDelete(db, rowid);
      } catch {
        // stale row may already be gone after rebuild
      }
    } else {
      throw err;
    }
  }
}

function syncFts(db: LibraryDb, rowid: number, title: string, abstract: string | null, authors: string | null): void {
  try {
    ftsUpsert(db, rowid, title, abstract, authors);
  } catch (err) {
    if (isFtsCorruptError(err)) {
      repairFtsIndex(db);
      ftsUpsert(db, rowid, title, abstract, authors);
    } else {
      throw err;
    }
  }
}

function findExistingPaper(
  db: LibraryDb,
  opts: { doi?: string | null; arxivId?: string | null; pdfSha?: string | null; excludeId?: string },
): PaperRow | undefined {
  const { excludeId } = opts;
  if (opts.pdfSha) {
    const row = db.prepare("SELECT * FROM papers WHERE pdf_sha = ?").get(opts.pdfSha) as PaperRow | undefined;
    if (row && row.id !== excludeId) return row;
  }
  const normDoi = normalizeDoi(opts.doi ?? undefined);
  if (normDoi) {
    const rows = db.prepare("SELECT * FROM papers WHERE doi IS NOT NULL").all() as PaperRow[];
    const row = rows.find((p) => normalizeDoi(p.doi) === normDoi && p.id !== excludeId);
    if (row) return row;
  }
  const normArxiv = normalizeArxivId(opts.arxivId ?? undefined);
  if (normArxiv) {
    const rows = db.prepare("SELECT * FROM papers WHERE arxiv_id IS NOT NULL").all() as PaperRow[];
    const row = rows.find((p) => normalizeArxivId(p.arxiv_id) === normArxiv && p.id !== excludeId);
    if (row) return row;
  }
  return undefined;
}

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
}

export interface CreatePaperResult {
  paper: PaperRow;
  created: boolean;
  duplicateReason?: "pdf" | "doi" | "arxiv";
}

export function listPapers(projectRoot: string): PaperRow[] {
  const db = openLibraryDb(projectRoot);
  return db
    .prepare(
      `SELECT p.*, zm.zotero_key FROM papers p
       LEFT JOIN zotero_mirror zm ON zm.paper_id = p.id
       ORDER BY p.updated_at DESC`,
    )
    .all() as PaperRow[];
}

export function getPaper(projectRoot: string, paperId: string): PaperRow | null {
  const db = openLibraryDb(projectRoot);
  const row = db
    .prepare(
      `SELECT p.*, zm.zotero_key FROM papers p
       LEFT JOIN zotero_mirror zm ON zm.paper_id = p.id
       WHERE p.id = ?`,
    )
    .get(paperId) as PaperRow | undefined;
  return row ?? null;
}

export function getPaperByBibkey(projectRoot: string, bibkey: string): PaperRow | null {
  const db = openLibraryDb(projectRoot);
  const row = db
    .prepare(
      `SELECT p.*, zm.zotero_key FROM papers p
       LEFT JOIN zotero_mirror zm ON zm.paper_id = p.id
       WHERE p.bibkey = ?`,
    )
    .get(bibkey) as PaperRow | undefined;
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

export function searchPapers(projectRoot: string, query: string, limit = 50): PaperRow[] {
  const db = openLibraryDb(projectRoot);
  const q = query.trim();
  if (!q) return listPapers(projectRoot).slice(0, limit);
  try {
    const rows = db
      .prepare(
        `SELECT p.* FROM papers_fts fts
         JOIN papers p ON p.rowid = fts.rowid
         WHERE papers_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(`${q}*`, limit) as PaperRow[];
    if (rows.length > 0) return rows;
  } catch {
    // fallback to LIKE
  }
  const like = `%${q}%`;
  return db
    .prepare(
      `SELECT * FROM papers
       WHERE title LIKE ? OR abstract LIKE ? OR authors LIKE ? OR bibkey LIKE ?
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(like, like, like, like, limit) as PaperRow[];
}

/** Unified PDF storage — writes bytes to attachments/<sha16>.pdf, returns relative path + sha. */
function storePdfBytes(projectRoot: string, buf: Buffer): { relativePath: string; sha: string } {
  const paths = getLibraryPaths(projectRoot);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const rel = path.join("attachments", `${sha.slice(0, 16)}.pdf`);
  const dest = path.join(paths.libraryDir, rel);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(paths.attachmentsDir, { recursive: true });
    fs.writeFileSync(dest, buf);
  }
  return { relativePath: rel.replace(/\\/g, "/"), sha };
}

/** Copy a PDF file from disk into attachments/ (used by ingestPdf). */
function storePdfAttachment(projectRoot: string, sourcePath: string): { relativePath: string; sha: string } {
  const buf = fs.readFileSync(sourcePath);
  return storePdfBytes(projectRoot, buf);
}

/** Attach downloaded or in-memory PDF bytes to a library entry (skip if already has PDF). */
export function attachPdfBufferToPaper(projectRoot: string, paperId: string, buf: Buffer): PaperRow {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) throw new Error("Paper not found");
  if (paper.pdf_path) return paper;

  const { relativePath, sha } = storePdfBytes(projectRoot, buf);
  const db = openLibraryDb(projectRoot);
  const now = Date.now();
  db.prepare("UPDATE papers SET pdf_path = ?, pdf_sha = ?, updated_at = ? WHERE id = ?").run(
    relativePath,
    sha,
    now,
    paperId,
  );
  return getPaper(projectRoot, paperId)!;
}

export interface IngestPdfResult {
  paper: PaperRow;
  created: boolean;
  duplicateReason?: "pdf";
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
    return { applied: false, paper: getPaper(projectRoot, paperId) };
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

export function ingestPdf(projectRoot: string, pdfPath: string, opts?: { title?: string; doi?: string }): IngestPdfResult {
  const paths = getLibraryPaths(projectRoot);
  const db = openLibraryDb(projectRoot);
  const buf = fs.readFileSync(pdfPath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const existing = db.prepare("SELECT * FROM papers WHERE pdf_sha = ?").get(sha) as PaperRow | undefined;
  if (existing) return { paper: existing, created: false, duplicateReason: "pdf" };

  const { relativePath, sha: storedSha } = storePdfAttachment(projectRoot, pdfPath);
  // Do not store crude buffer DOI — renderer will extract via pdfjs and fetch metadata
  const doi = opts?.doi ? normalizeDoi(opts.doi) : null;
  const baseTitle = opts?.title ?? path.basename(pdfPath, path.extname(pdfPath));
  const now = Date.now();
  const id = newId();
  const bibkey = uniqueBibkey(db, suggestBibkey(baseTitle));
  db.prepare(
    `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, raw_bibtex, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, 'article', ?, ?, 'manual', NULL, ?, ?)`,
  ).run(id, bibkey, baseTitle, doi, relativePath, storedSha, now, now);
  const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(id) as { rowid: number };
  syncFts(db, rowid.rowid, baseTitle, null, null);
  const paper = getPaper(projectRoot, id)!;
  return { paper, created: true };
}

/** Create a paper; returns existing row when DOI / arXiv already in library. */
export function createPaper(projectRoot: string, meta: Partial<PaperRow>): CreatePaperResult {
  const db = openLibraryDb(projectRoot);
  const normDoi = meta.doi ? normalizeDoi(meta.doi) : null;
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
  syncFts(db, rowid.rowid, title, meta.abstract ?? null, meta.authors ?? null);
  return { paper: getPaper(projectRoot, id)!, created: true };
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
        ? normalizeDoi(input.doi)
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

  const dup = findExistingPaper(db, { doi, arxivId: arxiv_id, excludeId: paperId });
  if (dup) {
    throw new Error(`Duplicate: "${dup.title}" already uses this DOI or arXiv ID`);
  }

  const now = Date.now();

  db.prepare(
    `UPDATE papers SET
      title = ?, bibkey = ?, authors = ?, year = ?, abstract = ?,
      doi = ?, arxiv_id = ?, venue = ?, type = ?, isbn = ?, raw_bibtex = ?, updated_at = ?
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
    now,
    paperId,
  );

  const updated = getPaper(projectRoot, paperId)!;
  const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(paperId) as { rowid: number };
  syncFts(db, rowid.rowid, updated.title, updated.abstract, updated.authors);
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
  const { enrichPaperFromCatalog } = await import("./literature-enrich");
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
}

/**
 * Import a Zotero-linked paper to local library.
 * Removes the zotero_mirror association and sets origin='manual'.
 * The paper (with metadata, annotations, cached PDF) survives disconnect.
 *
 * This is the "Import to local" action — only papers explicitly imported
 * this way survive a Zotero disconnect.
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
 * - Delete papers that are still Zotero-linked (not imported to local)
 * - Delete Zotero-mirrored collections
 * - Papers already imported to local (no zotero_mirror entry) are untouched
 *
 * "Import to local" = detachZoteroMirror (removes mirror, paper becomes local).
 * Only papers explicitly imported survive disconnect.
 */
export function detachAllZoteroMirrors(projectRoot: string): { papers: number; collections: number } {
  const db = openLibraryDb(projectRoot);
  // Find papers that are still Zotero-linked (not imported to local)
  const zoteroPaperIds = db.prepare(
    "SELECT paper_id FROM zotero_mirror",
  ).all() as Array<{ paper_id: string }>;
  const paperIds = zoteroPaperIds.map((r) => r.paper_id);

  let deletedPapers = 0;
  for (const paperId of paperIds) {
    deletePaper(projectRoot, paperId);
    deletedPapers++;
  }

  db.prepare("DELETE FROM zotero_mirror").run();

  // Delete Zotero-mirrored collections (keep local-only collections)
  const colRes = db.prepare(
    "DELETE FROM collections WHERE zotero_key IS NOT NULL",
  ).run();

  return { papers: deletedPapers, collections: colRes.changes };
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
  syncFts(db, rowid.rowid, updated.title, updated.abstract, updated.authors);
  return updated;
}

export async function importBibTeX(
  projectRoot: string,
  content: string,
  pdfPathByKey?: Record<string, string>,
  opts?: { enrichAfterImport?: boolean },
): Promise<{ imported: number; skipped: number; importedPaperIds: string[]; pdfsAttached?: number }> {
  const db = openLibraryDb(projectRoot);
  const paths = getLibraryPaths(projectRoot);
  const entries = parseBibTeX(content);
  let imported = 0;
  let skipped = 0;
  const importedPaperIds: string[] = [];
  const now = Date.now();

  for (const entry of entries) {
    if (db.prepare("SELECT 1 FROM papers WHERE bibkey = ?").get(entry.citekey)) {
      skipped++;
      continue;
    }
    const normDoi = entry.fields.doi ? normalizeDoi(entry.fields.doi) : null;
    const normArxiv = normalizeArxivId(entry.fields.eprint ?? entry.fields.arxiv ?? undefined);
    const dup = findExistingPaper(db, { doi: normDoi, arxivId: normArxiv });
    if (dup) {
      skipped++;
      continue;
    }
    const title = entry.fields.title ?? entry.citekey;
    const year = entry.fields.year ? Number.parseInt(entry.fields.year, 10) : null;
    const id = newId();
    const authorsField = authorsFromBibField(entry.fields.author);
    const citekey = uniqueBibkey(
      db,
      resolveIncomingBibkey(entry.citekey, title, year, authorsField),
    );
    let pdfPath: string | null = null;
    let pdfSha: string | null = null;
    const attachment = pdfPathByKey?.[entry.citekey];
    if (attachment && fs.existsSync(attachment)) {
      const stored = storePdfAttachment(projectRoot, attachment);
      pdfPath = stored.relativePath;
      pdfSha = stored.sha;
    }
    const rawBibtex = patchRawBibtexKey(entry.raw, citekey) ?? entry.raw;
    const cslJson = patchCslJsonBibkey(entry.cslJson, citekey);
    db.prepare(
      `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, raw_bibtex, csl_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bibtex', ?, ?, ?, ?)`,
    ).run(
      id,
      citekey,
      title,
      authorsField,
      Number.isFinite(year) ? year : null,
      entry.fields.abstract ?? null,
      normDoi,
      normArxiv,
      entry.fields.isbn ?? null,
      entry.fields.journal ?? entry.fields.booktitle ?? null,
      entry.entryType,
      pdfPath,
      pdfSha,
      rawBibtex,
      cslJson,
      now,
      now,
    );
    const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(id) as { rowid: number };
    syncFts(db, rowid.rowid, title, entry.fields.abstract ?? null, authorsFromBibField(entry.fields.author));
    importedPaperIds.push(id);
    imported++;
  }

  let pdfsAttached = 0;
  if (opts?.enrichAfterImport && importedPaperIds.length > 0) {
    const { enrichImportedPapers } = await import("./literature-enrich");
    const summary = await enrichImportedPapers(projectRoot, importedPaperIds);
    pdfsAttached = summary.pdfsAttached;
  }

  return { imported, skipped, importedPaperIds, pdfsAttached };
}

export function getAnnotations(projectRoot: string, paperId: string): AnnotationRow[] {
  const db = openLibraryDb(projectRoot);
  return db
    .prepare("SELECT * FROM annotations WHERE paper_id = ? ORDER BY page, created_at")
    .all(paperId) as AnnotationRow[];
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
  return db.prepare("SELECT * FROM annotations WHERE id = ?").get(annotation.id) as AnnotationRow;
}

export function deleteAnnotation(projectRoot: string, annotationId: string): void {
  const db = openLibraryDb(projectRoot);
  db.prepare("DELETE FROM annotations WHERE id = ?").run(annotationId);
}

export function resolvePaperPdfPath(projectRoot: string, paper: PaperRow): string | null {
  if (!paper.pdf_path) return null;
  return path.join(getLibraryPaths(projectRoot).libraryDir, paper.pdf_path);
}

export function readPaperPdfBytes(projectRoot: string, paperId: string): Buffer | null {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) return null;
  const abs = resolvePaperPdfPath(projectRoot, paper);
  if (!abs || !fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
}

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
    .all() as PaperRow[];
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
    .all() as CollectionRow[];
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
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(id) as CollectionRow;
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
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(collectionId) as CollectionRow;
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
    .get(input.key, input.key) as CollectionRow | undefined;

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
    return db.prepare("SELECT * FROM collections WHERE id = ?").get(existing.id) as CollectionRow;
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
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(input.key) as CollectionRow;
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
  const normDoi = normalizeDoi(input.doi ?? undefined);
  const normArxiv = normalizeArxivId(input.arxivId ?? undefined);
  const title = input.title.trim() || input.bibkey;

  // Look up by zotero_mirror, not papers.zotero_key (which is deprecated)
  const mirrorRow = db
    .prepare("SELECT paper_id FROM zotero_mirror WHERE zotero_key = ?")
    .get(input.zoteroKey) as { paper_id: string } | undefined;
  const existing = mirrorRow
    ? (db.prepare("SELECT * FROM papers WHERE id = ?").get(mirrorRow.paper_id) as PaperRow | undefined)
    : undefined;

  // Identity merge: a manually-ingested paper with the same DOI/arXiv
  // should be upgraded to a Zotero mirror instead of duplicated.
  const identityMatched = existing
    ? null
    : (findExistingPaper(db, { doi: normDoi, arxivId: normArxiv }) ?? null);

  const upsertMirror = (paperId: string) => {
    db.prepare(
      "INSERT OR REPLACE INTO zotero_mirror (paper_id, zotero_key, zotero_version, zotero_attach_key) VALUES (?, ?, ?, ?)",
    ).run(paperId, input.zoteroKey, input.zoteroVersion, input.zoteroAttachKey);
  };

  if (existing || identityMatched) {
    const target = existing ?? identityMatched!;
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
        origin = 'zotero',
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
      .get(target.id) as PaperRow;
    const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(updated.id) as { rowid: number };
    syncFts(db, rowid.rowid, updated.title, updated.abstract, updated.authors);
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
    .get(id) as PaperRow;
  const rowid = db.prepare("SELECT rowid FROM papers WHERE id = ?").get(id) as { rowid: number };
  syncFts(db, rowid.rowid, row.title, row.abstract, row.authors);
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
    .get(mirror.paper_id) as PaperRow | null;
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
  return result.changes;
}

export function exportBibTeX(projectRoot: string, paperIds?: string[]): string {
  const db = openLibraryDb(projectRoot);
  let rows: PaperRow[];
  if (paperIds?.length) {
    const placeholders = paperIds.map(() => "?").join(",");
    rows = db.prepare(`SELECT * FROM papers WHERE id IN (${placeholders})`).all(...paperIds) as PaperRow[];
  } else {
    rows = listPapers(projectRoot);
  }
  const chunks: string[] = [];
  for (const row of rows) {
    chunks.push(bibTeXEntryFromPaperRow(row));
  }
  return chunks.join("\n\n") + (chunks.length ? "\n" : "");
}

/** BibTeX for one library row — prefers `raw_bibtex`, else CSL-derived entry with volume/pages. */
export function bibTeXEntryFromPaperRow(row: PaperRow): string {
  if (row.raw_bibtex?.trim()) return row.raw_bibtex.trim();
  const entry = cslEntryFromPaperRow(row);
  const generated = new Cite(entry).format("bibtex") as string;
  return patchRawBibtexKey(generated, row.bibkey) ?? generated.replace(
    /^@([A-Za-z]+)\s*\{\s*[^,\s]+\s*,/m,
    `@$1{${row.bibkey},`,
  );
}

/** Common CSL citation styles for `formatBibliography`. */
export const CSL_STYLES = ["apa", "ieee", "chicago", "mla", "harvard1"] as const;
export type CslStyle = (typeof CSL_STYLES)[number];

/** Format selected papers as a bibliography string in a given CSL style (APA/IEEE/Chicago/MLA). */
export function formatBibliography(
  projectRoot: string,
  paperIds: string[],
  style: CslStyle = "ieee",
): string {
  const db = openLibraryDb(projectRoot);
  const placeholders = paperIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT bibkey, title, authors, year, doi, venue, type, abstract, csl_json FROM papers WHERE id IN (${placeholders})`,
  ).all(...paperIds) as Array<{
    bibkey: string; title: string; authors: string | null; year: number | null;
    doi: string | null; venue: string | null; type: string | null;
    abstract: string | null; csl_json: string | null;
  }>;
  if (!rows.length) return "";
  const entries = rows.map((r) => cslEntryFromPaperRow(r));
  return new Cite(entries).format("bibliography", { template: style }) as string;
}

const CITE_COMMAND_RE =
  /\\(?:cite|citep|citet|autocite|footcite|parencite|textcite|Cite|Citep|Citet)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g;

const TEX_SCAN_SKIP_DIRS = new Set([
  ".prismnext",
  "node_modules",
  ".git",
  "out",
  "dist",
  "build",
  ".cursor",
]);

export interface CiteCheckResult {
  texFilesScanned: number;
  citeKeysInTex: string[];
  knownKeys: string[];
  missingKeys: string[];
  unusedKeys: string[];
}

function parseCiteKeysFromBraceContent(content: string): string[] {
  return content
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractCiteKeysFromTex(tex: string): string[] {
  const keys: string[] = [];
  for (const match of tex.matchAll(CITE_COMMAND_RE)) {
    keys.push(...parseCiteKeysFromBraceContent(match[1]));
  }
  return keys;
}

function collectTexFiles(projectRoot: string, maxFiles = 200): string[] {
  const result: string[] = [];
  function walk(dir: string): void {
    if (result.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (TEX_SCAN_SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".tex")) {
        result.push(path.join(dir, entry.name));
        if (result.length >= maxFiles) return;
      }
    }
  }
  walk(projectRoot);
  return result;
}

export function citeCheckLiterature(projectRoot: string, paperIds?: string[]): CiteCheckResult {
  const db = openLibraryDb(projectRoot);
  let papers: PaperRow[];
  if (paperIds?.length) {
    const placeholders = paperIds.map(() => "?").join(",");
    papers = db
      .prepare(`SELECT * FROM papers WHERE id IN (${placeholders})`)
      .all(...paperIds) as PaperRow[];
  } else {
    papers = listPapers(projectRoot);
  }

  const knownKeys = [...new Set(papers.map((p) => p.bibkey).filter(Boolean))];
  const knownSet = new Set(knownKeys);

  const citeKeysInTex: string[] = [];
  const texFiles = collectTexFiles(projectRoot);
  for (const file of texFiles) {
    try {
      citeKeysInTex.push(...extractCiteKeysFromTex(fs.readFileSync(file, "utf-8")));
    } catch {
      // skip unreadable files
    }
  }

  const uniqueInTex = [...new Set(citeKeysInTex)];
  const usedSet = new Set(uniqueInTex);
  return {
    texFilesScanned: texFiles.length,
    citeKeysInTex: uniqueInTex,
    knownKeys,
    missingKeys: uniqueInTex.filter((k) => !knownSet.has(k)),
    unusedKeys: knownKeys.filter((k) => !usedSet.has(k)),
  };
}

export function findProjectBibPath(projectRoot: string): string {
  const candidates = [
    path.join(projectRoot, "references.bib"),
    path.join(projectRoot, "bibliography.bib"),
    path.join(projectRoot, ".prismnext", "library", "references.bib"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export function citePaperInProject(projectRoot: string, bibkey: string): { bibPath: string; appended: boolean } {
  const paper = getPaperByBibkey(projectRoot, bibkey);
  if (!paper) throw new Error(`Unknown bibkey: ${bibkey}`);
  const bibPath = findProjectBibPath(projectRoot);
  fs.mkdirSync(path.dirname(bibPath), { recursive: true });
  const existing = fs.existsSync(bibPath) ? fs.readFileSync(bibPath, "utf-8") : "";
  if (existing.includes(`{${bibkey},`) || existing.includes(`{${bibkey}}`)) {
    addToReadingList(projectRoot, paper.id);
    return { bibPath, appended: false };
  }
  const entry = bibTeXEntryFromPaperRow(paper);
  fs.appendFileSync(bibPath, (existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "") + entry + "\n");
  addToReadingList(projectRoot, paper.id);
  return { bibPath, appended: true };
}

export function importFromProject(
  targetRoot: string,
  sourceRoot: string,
  paperIds: string[],
  opts?: { includeAnnotations?: boolean; includePdf?: boolean },
): { imported: number; skipped: number } {
  const sourceDb = openLibraryDb(sourceRoot);
  const targetDb = openLibraryDb(targetRoot);
  const sourcePaths = getLibraryPaths(sourceRoot);
  const targetPaths = getLibraryPaths(targetRoot);
  let imported = 0;
  let skipped = 0;
  const now = Date.now();

  for (const paperId of paperIds) {
    const row = sourceDb.prepare("SELECT * FROM papers WHERE id = ?").get(paperId) as PaperRow | undefined;
    if (!row) continue;
    if (targetDb.prepare("SELECT 1 FROM papers WHERE bibkey = ?").get(row.bibkey)) {
      skipped++;
      continue;
    }
    const targetId = newId();
    let pdfPath = row.pdf_path;
    let pdfSha = row.pdf_sha;
    if (opts?.includePdf !== false && row.pdf_path) {
      const srcAbs = path.join(sourcePaths.libraryDir, row.pdf_path);
      if (fs.existsSync(srcAbs)) {
        const stored = storePdfAttachment(targetRoot, srcAbs);
        pdfPath = stored.relativePath;
        pdfSha = stored.sha;
      }
    }
    targetDb.prepare(
      `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, metadata_source, raw_bibtex, csl_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      targetId,
      uniqueBibkey(targetDb, row.bibkey),
      row.title,
      row.authors,
      row.year,
      row.abstract,
      row.doi,
      row.arxiv_id,
      row.isbn,
      row.venue,
      row.type,
      pdfPath,
      pdfSha,
      row.origin ?? "manual",
      row.metadata_source ?? null,
      row.raw_bibtex,
      row.csl_json ?? null,
      now,
      now,
    );
    // Copy Zotero mirror association if exists
    const sourceMirror = sourceDb
      .prepare("SELECT zotero_key, zotero_version, zotero_attach_key FROM zotero_mirror WHERE paper_id = ?")
      .get(paperId) as { zotero_key: string; zotero_version: number | null; zotero_attach_key: string | null } | undefined;
    if (sourceMirror) {
      targetDb.prepare(
        "INSERT OR REPLACE INTO zotero_mirror (paper_id, zotero_key, zotero_version, zotero_attach_key) VALUES (?, ?, ?, ?)",
      ).run(targetId, sourceMirror.zotero_key, sourceMirror.zotero_version, sourceMirror.zotero_attach_key);
    }
    const rowid = targetDb.prepare("SELECT rowid FROM papers WHERE id = ?").get(targetId) as { rowid: number };
    syncFts(targetDb, rowid.rowid, row.title, row.abstract, row.authors);

    if (opts?.includeAnnotations !== false) {
      const anns = sourceDb
        .prepare("SELECT * FROM annotations WHERE paper_id = ?")
        .all(paperId) as AnnotationRow[];
      for (const ann of anns) {
        targetDb.prepare(
          `INSERT INTO annotations (id, paper_id, kind, page, rects, quoted_text, color, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(newId(), targetId, ann.kind, ann.page, ann.rects, ann.quoted_text, ann.color, ann.note, now, now);
      }
    }
    imported++;
  }
  return { imported, skipped };
}

export function parseBetterBibTeXJson(content: string): Record<string, string> {
  try {
    const data = JSON.parse(content) as Array<{ citationKey?: string; id?: string; attachments?: Array<{ path?: string }> }>;
    const map: Record<string, string> = {};
    for (const item of data) {
      const key = item.citationKey ?? item.id;
      const attachment = item.attachments?.find((a) => a.path?.toLowerCase().endsWith(".pdf"));
      if (key && attachment?.path && fs.existsSync(attachment.path)) {
        map[key] = attachment.path;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export type { BibEntry };
