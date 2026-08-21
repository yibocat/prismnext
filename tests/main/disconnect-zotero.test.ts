import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  openLibraryDb,
  createPaper,
  upsertZoteroPaperRow,
  upsertZoteroCollectionRow,
  detachZoteroMirror,
  detachAllZoteroMirrors,
  getZoteroMirrorByPaperId,
  listPapers,
  listCollections,
  getLibraryPaths,
} from "../../src/main/services/literature-service";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

const roots: string[] = [];

function tempProject(): string {
  const dir = tempLiteratureProject();
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

describe("detachAllZoteroMirrors — disconnect deletes Zotero-only data", () => {
  let root: string;
  beforeEach(() => { root = tempProject(); });

  it("deletes Zotero-linked papers, keeps local papers", () => {
    // Zotero paper (not imported to local)
    upsertZoteroPaperRow(root, {
      zoteroKey: "ZK1",
      zoteroVersion: 1,
      zoteroAttachKey: null,
      bibkey: "zot2024",
      rawBibtex: null,
      title: "Zotero Paper",
      authors: "[]",
      year: 2024,
      abstract: null,
      doi: "10.1000/z",
      arxivId: null,
      venue: null,
      type: "article",
    });

    // Local paper
    createPaper(root, { title: "Local Paper" });

    expect(listPapers(root)).toHaveLength(2);

    const result = detachAllZoteroMirrors(root);
    expect(result.papers).toBe(1);

    const papers = listPapers(root);
    expect(papers).toHaveLength(1);
    expect(papers[0].title).toBe("Local Paper");
  });

  it("deletes Zotero-mirrored collections, keeps local collections", () => {
    // Zotero collection
    upsertZoteroCollectionRow(root, {
      key: "ZCOL1",
      name: "Zotero Collection",
      parentKey: null,
      version: 1,
      sortOrder: 0,
    });

    // Local collection (created via createCollection)
    const db = openLibraryDb(root);
    db.prepare(
      "INSERT INTO collections (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, NULL, 0, ?, ?)",
    ).run("local-col", "My Local Collection", Date.now(), Date.now());

    expect(listCollections(root)).toHaveLength(2);

    const result = detachAllZoteroMirrors(root);
    expect(result.collections).toBe(1);

    const cols = listCollections(root);
    expect(cols).toHaveLength(1);
    expect(cols[0].name).toBe("My Local Collection");
    expect(cols[0].zotero_key).toBeNull();
  });

  it("imported papers (detachZoteroMirror) survive disconnect", () => {
    const zotPaper = upsertZoteroPaperRow(root, {
      zoteroKey: "ZK2",
      zoteroVersion: 1,
      zoteroAttachKey: null,
      bibkey: "import2024",
      rawBibtex: null,
      title: "Imported Paper",
      authors: "[]",
      year: 2024,
      abstract: null,
      doi: "10.1000/imp",
      arxivId: null,
      venue: null,
      type: "article",
    });

    // Import to local
    detachZoteroMirror(root, zotPaper.id);
    expect(getZoteroMirrorByPaperId(root, zotPaper.id)).toBeNull();

    // Now disconnect — imported paper should survive
    const result = detachAllZoteroMirrors(root);
    expect(result.papers).toBe(0); // no zotero_mirror entries left

    const papers = listPapers(root);
    expect(papers).toHaveLength(1);
    expect(papers[0].title).toBe("Imported Paper");
    expect(papers[0].origin).toBe("manual");
  });

  it("preserves PDF on imported papers after disconnect", () => {
    const paths = getLibraryPaths(root);

    const zotPaper = upsertZoteroPaperRow(root, {
      zoteroKey: "ZK3",
      zoteroVersion: 1,
      zoteroAttachKey: null,
      bibkey: "pdf2024",
      rawBibtex: null,
      title: "Paper with PDF",
      authors: "[]",
      year: 2024,
      abstract: null,
      doi: "10.1000/pdf",
      arxivId: null,
      venue: null,
      type: "article",
    });

    // Download a PDF (stored in attachments/)
    const rel = "attachments/downloaded.pdf";
    fs.writeFileSync(path.join(paths.libraryDir, rel), Buffer.from("%PDF-1.4 content"));
    const db = openLibraryDb(root);
    db.prepare("UPDATE papers SET pdf_path = ?, pdf_sha = ? WHERE id = ?").run(rel, "sha123", zotPaper.id);

    // Import to local
    detachZoteroMirror(root, zotPaper.id);

    // Disconnect
    detachAllZoteroMirrors(root);

    const paper = listPapers(root).find((p) => p.title === "Paper with PDF")!;
    expect(paper).toBeDefined();
    expect(paper.pdf_path).toBe(rel);
    expect(fs.existsSync(path.join(paths.libraryDir, rel))).toBe(true);
  });

  it("returns zero when nothing is Zotero-linked", () => {
    createPaper(root, { title: "Pure local" });
    const result = detachAllZoteroMirrors(root);
    expect(result.papers).toBe(0);
    expect(result.collections).toBe(0);
  });
});
