import * as crypto from "node:crypto";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createLogger, shortLogDetail } from "../app/logger";
import {
  isOpaqueBibkey,
  patchRawBibtexKey,
  suggestBibkey,
} from "../../shared/literature/bibkey-utils";
import { arxivIdFromDoi, normalizeArxivId, normalizeDoi } from "../../shared/literature/doi-utils";
import {
  isValidPaperTagKey,
  normalizePaperTag,
  normalizePaperTagsWithCatalog,
  paperTagKey,
  parsePaperTagsJson,
  serializePaperTagsJson,
} from "../../shared/literature/paper-tags";
import type { LibraryDb, PaperRow } from "./types";
import { ensureLibraryDirs, getLibraryPaths } from "./paths";

const log = createLogger("literature", "general");

const dbCache = new Map<string, LibraryDb>();

const CURRENT_SCHEMA_VERSION = 10;

export const PAPER_SELECT = `
  SELECT p.*, zm.zotero_key, am.status AS ai_metadata_status, am.error AS ai_metadata_error
  FROM papers p
  LEFT JOIN zotero_mirror zm ON zm.paper_id = p.id
  LEFT JOIN paper_ai_metadata am ON am.paper_id = p.id
`;

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


function migrateLibraryDbIncremental(db: LibraryDb, fromVersion: number): void {
  if (fromVersion < 7) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);");
    writeSchemaVersion(db, 7);
  }
  if (fromVersion < 8) {
    const cols = db.prepare("PRAGMA table_info(papers)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "tags")) {
      db.exec("ALTER TABLE papers ADD COLUMN tags TEXT;");
    }
    writeSchemaVersion(db, 8);
  }
  if (fromVersion < 9) {
    const cols = db.prepare("PRAGMA table_info(papers)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "ai_summary")) {
      db.exec("ALTER TABLE papers ADD COLUMN ai_summary TEXT;");
    }
    if (!cols.some((c) => c.name === "ai_metadata_at")) {
      db.exec("ALTER TABLE papers ADD COLUMN ai_metadata_at INTEGER;");
    }
    if (!cols.some((c) => c.name === "ai_metadata_sha")) {
      db.exec("ALTER TABLE papers ADD COLUMN ai_metadata_sha TEXT;");
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS paper_ai_metadata (
        paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'idle',
        error TEXT,
        model TEXT,
        queued_at INTEGER,
        finished_at INTEGER
      );
    `);
    migrateTagsToCanonical(db);
    writeSchemaVersion(db, 9);
  }
  if (fromVersion < 10) {
    migrateFtsTagsAndSummary(db);
    writeSchemaVersion(db, 10);
  }
}

function migrateTagsToCanonical(db: LibraryDb): void {
  const rows = db
    .prepare("SELECT id, tags FROM papers WHERE tags IS NOT NULL AND tags != ''")
    .all() as Array<{ id: string; tags: string }>;
  const catalog: string[] = [];
  const seenKeys = new Set<string>();
  for (const row of rows) {
    for (const raw of parsePaperTagsJson(row.tags)) {
      const key = paperTagKey(raw);
      if (!isValidPaperTagKey(key) || seenKeys.has(key)) continue;
      seenKeys.add(key);
      const display = normalizePaperTag(raw);
      if (display) catalog.push(display);
    }
  }
  const update = db.prepare("UPDATE papers SET tags = ? WHERE id = ?");
  for (const row of rows) {
    const normalized = normalizePaperTagsWithCatalog(parsePaperTagsJson(row.tags), catalog);
    update.run(serializePaperTagsJson(normalized), row.id);
  }
}

function migrateLibraryDb(db: LibraryDb): void {
  const version = readSchemaVersion(db);
  if (version === CURRENT_SCHEMA_VERSION) return;
  if (version > 0 && version < CURRENT_SCHEMA_VERSION) {
    migrateLibraryDbIncremental(db, version);
    if (readSchemaVersion(db) === CURRENT_SCHEMA_VERSION) return;
  }
  // Schema drift — drop and rebuild (dev only, no user data to preserve)
  db.exec(`
    DROP TABLE IF EXISTS papers_fts;
    DROP TABLE IF EXISTS paper_extracts;
    DROP TABLE IF EXISTS paper_ai_metadata;
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
      tags TEXT,
      ai_summary TEXT,
      ai_metadata_at INTEGER,
      ai_metadata_sha TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
      title, abstract, authors, tags, ai_summary, content='papers', content_rowid='rowid'
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
    CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
    CREATE TABLE IF NOT EXISTS paper_ai_metadata (
      paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'idle',
      error TEXT,
      model TEXT,
      queued_at INTEGER,
      finished_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS paper_extracts (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      md_path TEXT,
      pages INTEGER,
      remote_job_id TEXT,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      next_retry_at INTEGER,
      queued_at INTEGER,
      started_at INTEGER,
      finished_at INTEGER,
      PRIMARY KEY (paper_id, source)
    );
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
    let opened: LibraryDb | undefined;
    try {
      opened = new DatabaseSync(paths.dbPath);
      migrateLibraryDb(opened);
      ensureFtsHealthy(opened);
      upgradeOpaqueBibkeysInDb(opened);
      dbCache.set(paths.dbPath, opened);
      db = opened;
    } catch (err) {
      log.warn("literature.open.fail", {
        project: path.basename(projectRoot),
        error: shortLogDetail(err),
      });
      if (opened) {
        try {
          opened.close();
        } catch {
          // ignore close after a failed open
        }
      }
      throw err;
    }
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

export function newId(): string {
  return crypto.randomUUID();
}

export function uniqueBibkey(db: LibraryDb, preferred: string): string {
  let key = preferred;
  let n = 1;
  while (db.prepare("SELECT 1 FROM papers WHERE bibkey = ?").get(key)) {
    key = `${preferred}_${n++}`;
  }
  return key;
}

function ftsDelete(db: LibraryDb, rowid: number): void {
  db.prepare(
    "INSERT INTO papers_fts(papers_fts, rowid, title, abstract, authors, tags, ai_summary) VALUES ('delete', ?, '', '', '', '', '')",
  ).run(rowid);
}

const EXPECTED_FTS_COLUMNS = ["title", "abstract", "authors", "tags", "ai_summary"] as const;

const FTS5_CREATE_SQL = `
  CREATE VIRTUAL TABLE papers_fts USING fts5(
    title, abstract, authors, tags, ai_summary, content='papers', content_rowid='rowid'
  );
`;

function ftsColumnNames(db: LibraryDb): Set<string> {
  try {
    const rows = db.prepare("PRAGMA table_info(papers_fts)").all() as Array<{ name: string }>;
    return new Set(rows.map((r) => r.name));
  } catch {
    return new Set();
  }
}

function ftsSchemaNeedsUpgrade(db: LibraryDb): boolean {
  const cols = ftsColumnNames(db);
  if (cols.size === 0) return true;
  return !EXPECTED_FTS_COLUMNS.every((name) => cols.has(name));
}

function reindexAllPapersInFts(db: LibraryDb): void {
  const rows = db
    .prepare("SELECT rowid, title, abstract, authors, tags, ai_summary FROM papers")
    .all() as unknown as Array<PaperRow & { rowid: number }>;
  for (const row of rows) {
    ftsInsert(db, row.rowid, row);
  }
}

function recreateFtsIndex(db: LibraryDb): void {
  db.exec("DROP TABLE IF EXISTS papers_fts;");
  db.exec(FTS5_CREATE_SQL);
  reindexAllPapersInFts(db);
}

type FtsPaperSource = Pick<PaperRow, "title" | "abstract" | "authors" | "tags" | "ai_summary">;

function ftsFieldsFromPaper(paper: FtsPaperSource): {
  title: string;
  abstract: string;
  authors: string;
  tags: string;
  ai_summary: string;
} {
  return {
    title: paper.title,
    abstract: paper.abstract ?? "",
    authors: paper.authors ?? "",
    tags: parsePaperTagsJson(paper.tags).join(" "),
    ai_summary: paper.ai_summary ?? "",
  };
}

function ftsInsert(db: LibraryDb, rowid: number, paper: FtsPaperSource): void {
  const fields = ftsFieldsFromPaper(paper);
  db.prepare(
    "INSERT INTO papers_fts(rowid, title, abstract, authors, tags, ai_summary) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(rowid, fields.title, fields.abstract, fields.authors, fields.tags, fields.ai_summary);
}

function ftsUpsert(db: LibraryDb, rowid: number, paper: FtsPaperSource): void {
  try {
    ftsDelete(db, rowid);
  } catch {
    // row may not exist in FTS index yet
  }
  ftsInsert(db, rowid, paper);
}

function isFtsCorruptError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errcode?: number; errstr?: string; message?: string };
  if (e.errcode === 11 || e.errcode === 267) return true;
  const code = e.code ?? "";
  const msg = e.errstr ?? e.message ?? "";
  return (
    code === "SQLITE_CORRUPT_VTAB" ||
    code === "SQLITE_CORRUPT" ||
    msg.includes("malformed") ||
    msg.includes("corrupt")
  );
}

function isFtsSchemaError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  return msg.includes("no column named") || msg.includes("has no column");
}

function repairFtsIndex(db: LibraryDb): void {
  if (ftsSchemaNeedsUpgrade(db)) {
    recreateFtsIndex(db);
    return;
  }
  try {
    db.exec("INSERT INTO papers_fts(papers_fts) VALUES('rebuild')");
  } catch (err) {
    log.warn("literature.fts_rebuild", {
      error: shortLogDetail(err),
    });
    recreateFtsIndex(db);
  }
}

function migrateFtsTagsAndSummary(db: LibraryDb): void {
  recreateFtsIndex(db);
}

function ensureFtsHealthy(db: LibraryDb): void {
  if (ftsSchemaNeedsUpgrade(db)) {
    recreateFtsIndex(db);
    return;
  }
  try {
    db.prepare("SELECT rowid FROM papers_fts LIMIT 1").get();
  } catch (err) {
    if (isFtsCorruptError(err) || isFtsSchemaError(err)) repairFtsIndex(db);
    else throw err;
  }
}

export function removeFromFts(db: LibraryDb, rowid: number): void {
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

export function syncFtsForPaper(db: LibraryDb, rowid: number, paper: FtsPaperSource): void {
  try {
    ftsUpsert(db, rowid, paper);
  } catch (err) {
    if (isFtsCorruptError(err) || isFtsSchemaError(err)) {
      repairFtsIndex(db);
      ftsUpsert(db, rowid, paper);
    } else {
      throw err;
    }
  }
}

export function findExistingPaper(
  db: LibraryDb,
  opts: { doi?: string | null; arxivId?: string | null; pdfSha?: string | null; excludeId?: string },
): PaperRow | undefined {
  const { excludeId } = opts;
  if (opts.pdfSha) {
    const row = db.prepare("SELECT * FROM papers WHERE pdf_sha = ?").get(opts.pdfSha) as unknown as PaperRow | undefined;
    if (row && row.id !== excludeId) return row;
  }
  const normDoi = normalizeDoi(opts.doi ?? undefined);
  if (normDoi) {
    const rows = db.prepare("SELECT * FROM papers WHERE doi IS NOT NULL").all() as unknown as PaperRow[];
    const row = rows.find((p) => normalizeDoi(p.doi) === normDoi && p.id !== excludeId);
    if (row) return row;
    const arxivFromDoi = arxivIdFromDoi(normDoi);
    if (arxivFromDoi) {
      const arxivRows = db.prepare("SELECT * FROM papers WHERE arxiv_id IS NOT NULL").all() as unknown as PaperRow[];
      const arxivRow = arxivRows.find(
        (p) => normalizeArxivId(p.arxiv_id) === arxivFromDoi && p.id !== excludeId,
      );
      if (arxivRow) return arxivRow;
    }
  }
  const normArxiv = normalizeArxivId(opts.arxivId ?? undefined);
  if (normArxiv) {
    const rows = db.prepare("SELECT * FROM papers WHERE arxiv_id IS NOT NULL").all() as unknown as PaperRow[];
    const row = rows.find((p) => normalizeArxivId(p.arxiv_id) === normArxiv && p.id !== excludeId);
    if (row) return row;
    const doiRows = db.prepare("SELECT * FROM papers WHERE doi IS NOT NULL").all() as unknown as PaperRow[];
    const doiRow = doiRows.find((p) => {
      const fromDoi = arxivIdFromDoi(normalizeDoi(p.doi));
      return fromDoi === normArxiv && p.id !== excludeId;
    });
    if (doiRow) return doiRow;
  }
  return undefined;
}
