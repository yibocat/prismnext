import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  closeLibraryDb,
  createPaper,
  getLibraryPaths,
  openLibraryDb,
} from "../../src/main/literature/facade";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

const roots: string[] = [];

function tempProject(): string {
  const dir = tempLiteratureProject();
  roots.push(dir);
  return dir;
}

/** Simulate a v10 library where incremental FTS migration only rebuilt (old columns). */
function seedLegacyFtsLibrary(root: string): void {
  const paths = getLibraryPaths(root);
  fs.mkdirSync(paths.libraryDir, { recursive: true });
  const db = new DatabaseSync(paths.dbPath);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_version', '10');
    CREATE TABLE papers (
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
    CREATE VIRTUAL TABLE papers_fts USING fts5(
      title, abstract, authors, content='papers', content_rowid='rowid'
    );
    CREATE TABLE zotero_mirror (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      zotero_key TEXT NOT NULL UNIQUE,
      zotero_version INTEGER,
      zotero_attach_key TEXT,
      PRIMARY KEY (paper_id)
    );
    CREATE TABLE paper_ai_metadata (
      paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'idle',
      error TEXT,
      model TEXT,
      queued_at INTEGER,
      finished_at INTEGER
    );
  `);
  db.close();
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    closeLibraryDb(root);
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("papers_fts schema upgrade", () => {
  it("upgrades legacy FTS without tags column when adding a paper", () => {
    const root = tempProject();
    seedLegacyFtsLibrary(root);

    const result = createPaper(root, {
      title: "Legacy FTS Upgrade Test",
      bibkey: "legacy_fts_test",
      authors: '["Alice"]',
      year: 2024,
      tags: '["ml"]',
    });

    expect(result.paper.title).toBe("Legacy FTS Upgrade Test");

    const db = openLibraryDb(root);
    const ftsCols = db
      .prepare("PRAGMA table_info(papers_fts)")
      .all() as Array<{ name: string }>;
    expect(ftsCols.map((c) => c.name)).toEqual(
      expect.arrayContaining(["tags", "ai_summary"]),
    );

    const hit = db
      .prepare(
        `SELECT p.title FROM papers p
         JOIN papers_fts fts ON p.rowid = fts.rowid
         WHERE papers_fts MATCH ?`,
      )
      .get("Legacy") as { title: string } | undefined;
    expect(hit?.title).toBe("Legacy FTS Upgrade Test");
  });
});
