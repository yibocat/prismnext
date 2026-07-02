import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  attachPdfBufferToPaper,
  detachAllZoteroMirrors,
  detachZoteroMirror,
  getLibraryPaths,
  getPaper,
  getZoteroMirrorByPaperId,
  isPaperLocallyMaterialized,
  listPapers,
  materializeZoteroPaperIfLinked,
  upsertZoteroPaperRow,
  deletePaper,
  openLibraryDb,
  scoreOrphanMergeConfidence,
  updatePaper,
  resolveOrphanZoteroPaper,
} from "../../src/main/services/literature-service";
import { upsertPaperExtractState, getPaperExtractState } from "../../src/main/services/paper-extract-db";

const roots: string[] = [];

function tempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-zotero-mat-"));
  fs.mkdirSync(path.join(dir, ".prismnext", "library"), { recursive: true });
  roots.push(dir);
  return dir;
}

function seedZoteroPaper(root: string, opts?: { doi?: string | null; zoteroKey?: string; bibkey?: string }) {
  return upsertZoteroPaperRow(root, {
    zoteroKey: opts?.zoteroKey ?? "ZKMAT",
    zoteroVersion: 1,
    zoteroAttachKey: null,
    bibkey: opts?.bibkey ?? "mat2024",
    rawBibtex: null,
    title: "Materialize me",
    authors: "[]",
    year: 2024,
    abstract: null,
    doi: opts?.doi === undefined ? "10.1000/mat" : opts.doi,
    arxivId: null,
    venue: null,
    type: "article",
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("Zotero auto-materialize", () => {
  let root: string;

  beforeEach(() => {
    root = tempProject();
  });

  it("attachPdfBufferToPaper promotes to local but keeps zotero_mirror for sync", () => {
    const paper = seedZoteroPaper(root);
    expect(getZoteroMirrorByPaperId(root, paper.id)).not.toBeNull();

    attachPdfBufferToPaper(root, paper.id, Buffer.from("%PDF-1.4 test"));

    expect(getZoteroMirrorByPaperId(root, paper.id)).not.toBeNull();
    const after = getPaper(root, paper.id)!;
    expect(after.origin).toBe("manual");
    expect(after.pdf_path).toBeTruthy();
  });

  it("does not duplicate on Zotero re-sync after PDF materialize (no DOI)", () => {
    const paper = seedZoteroPaper(root, { doi: null, zoteroKey: "ZKND", bibkey: "neurips2022" });
    attachPdfBufferToPaper(root, paper.id, Buffer.from("%PDF-1.4 neurips"));

    upsertZoteroPaperRow(root, {
      zoteroKey: "ZKND",
      zoteroVersion: 2,
      zoteroAttachKey: null,
      bibkey: "neurips2022",
      rawBibtex: null,
      title: "Materialize me",
      authors: "[]",
      year: 2024,
      abstract: null,
      doi: null,
      arxivId: null,
      venue: "NeurIPS",
      type: "inproceedings",
    });

    expect(listPapers(root)).toHaveLength(1);
    expect(listPapers(root)[0].id).toBe(paper.id);
  });

  it("materialized via PDF survives disconnect without explicit Keep in project", () => {
    const paper = seedZoteroPaper(root);
    attachPdfBufferToPaper(root, paper.id, Buffer.from("%PDF-1.4 cached"));

    const result = detachAllZoteroMirrors(root);
    expect(result.papers).toBe(0);

    const papers = listPapers(root);
    expect(papers).toHaveLength(1);
    expect(papers[0].id).toBe(paper.id);
    expect(papers[0].pdf_path).toBeTruthy();
    expect(getZoteroMirrorByPaperId(root, paper.id)).toBeNull();
  });

  it("non-materialized Zotero entries are still removed on disconnect", () => {
    seedZoteroPaper(root);
    expect(listPapers(root)).toHaveLength(1);

    const result = detachAllZoteroMirrors(root);
    expect(result.papers).toBe(1);
    expect(listPapers(root)).toHaveLength(0);
  });

  it("ready extract materializes and survives disconnect", () => {
    const paper = seedZoteroPaper(root);
    upsertPaperExtractState(root, {
      paperId: paper.id,
      source: "html",
      status: "ready",
      mdPath: `${paper.id}/html.md`,
      finishedAt: Date.now(),
    });
    materializeZoteroPaperIfLinked(root, paper.id);

    expect(getPaper(root, paper.id)!.origin).toBe("manual");
    expect(getZoteroMirrorByPaperId(root, paper.id)).not.toBeNull();

    detachAllZoteroMirrors(root);
    expect(listPapers(root)).toHaveLength(1);
    expect(getZoteroMirrorByPaperId(root, paper.id)).toBeNull();
  });

  it("re-sync merges back to the same row and keeps pdf_path", () => {
    const paper = seedZoteroPaper(root, { doi: "10.1000/resync" });
    attachPdfBufferToPaper(root, paper.id, Buffer.from("%PDF-1.4 resync"));
    const pdfPath = getPaper(root, paper.id)!.pdf_path;

    detachAllZoteroMirrors(root);
    expect(listPapers(root)).toHaveLength(1);

    const reSynced = upsertZoteroPaperRow(root, {
      zoteroKey: "ZKMAT",
      zoteroVersion: 2,
      zoteroAttachKey: null,
      bibkey: "mat2024",
      rawBibtex: null,
      title: "Materialize me",
      authors: "[]",
      year: 2024,
      abstract: null,
      doi: "10.1000/resync",
      arxivId: null,
      venue: null,
      type: "article",
    });

    expect(reSynced.id).toBe(paper.id);
    expect(reSynced.pdf_path).toBe(pdfPath);
    expect(getZoteroMirrorByPaperId(root, paper.id)?.zotero_key).toBe("ZKMAT");
  });

  it("deletePaper removes extract directory on disk", () => {
    const paper = seedZoteroPaper(root);
    const paths = getLibraryPaths(root);
    const extractDir = path.join(paths.extractDir, paper.id);
    fs.mkdirSync(extractDir, { recursive: true });
    fs.writeFileSync(path.join(extractDir, "pdfjs.md"), "# text");

    deletePaper(root, paper.id);

    expect(fs.existsSync(extractDir)).toBe(false);
  });

  it("reconciles existing duplicate: orphan with MD + empty Zotero shell", () => {
    const orphan = seedZoteroPaper(root, {
      doi: null,
      zoteroKey: "ZDUP",
      bibkey: "manning2022",
    });
    attachPdfBufferToPaper(root, orphan.id, Buffer.from("%PDF-1.4 dup"));
    upsertPaperExtractState(root, {
      paperId: orphan.id,
      source: "pdfjs",
      status: "ready",
      mdPath: `${orphan.id}/pdfjs.md`,
      finishedAt: Date.now(),
    });
    detachZoteroMirror(root, orphan.id);
    expect(getZoteroMirrorByPaperId(root, orphan.id)).toBeNull();

    const db = openLibraryDb(root);
    const now = Date.now();
    const shellId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO papers (
        id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type,
        pdf_path, pdf_sha, origin, raw_bibtex, csl_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, 'zotero', NULL, NULL, ?, ?)`,
    ).run(
      shellId,
      "manning2022z",
      "Materialize me",
      "[]",
      2024,
      null,
      null,
      null,
      "NeurIPS",
      "inproceedings",
      now,
      now,
    );
    db.prepare(
      "INSERT INTO zotero_mirror (paper_id, zotero_key, zotero_version, zotero_attach_key) VALUES (?, ?, ?, NULL)",
    ).run(shellId, "ZDUP", 2);

    expect(listPapers(root)).toHaveLength(2);

    const merged = upsertZoteroPaperRow(root, {
      zoteroKey: "ZDUP",
      zoteroVersion: 3,
      zoteroAttachKey: null,
      bibkey: "manning2022",
      rawBibtex: null,
      title: "Materialize me",
      authors: "[]",
      year: 2024,
      abstract: null,
      doi: null,
      arxivId: null,
      venue: "NeurIPS",
      type: "inproceedings",
    });

    expect(listPapers(root)).toHaveLength(1);
    expect(merged.id).toBe(orphan.id);
    expect(merged.pdf_path).toBeTruthy();
    expect(getZoteroMirrorByPaperId(root, orphan.id)?.zotero_key).toBe("ZDUP");
    expect(getPaperExtractState(root, orphan.id, "pdfjs")?.status).toBe("ready");
  });

  it("does not merge when two materialized orphans share title+year but differ in bibkey", () => {
    const db = openLibraryDb(root);
    const now = Date.now();
    const sharedTitle = "Attention Is All You Need";
    const sharedYear = 2017;

    for (const [id, bibkey] of [
      ["orphan-a", "vaswani2017a"],
      ["orphan-b", "vaswani2017b"],
    ] as const) {
      db.prepare(
        `INSERT INTO papers (
          id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type,
          pdf_path, pdf_sha, origin, raw_bibtex, csl_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'article', ?, ?, 'manual', NULL, NULL, ?, ?)`,
      ).run(
        id,
        bibkey,
        sharedTitle,
        '["Vaswani, A"]',
        sharedYear,
        `attachments/${bibkey}.pdf`,
        `sha-${bibkey}`,
        now,
        now,
      );
    }

    upsertZoteroPaperRow(root, {
      zoteroKey: "ZKAMBIG",
      zoteroVersion: 1,
      zoteroAttachKey: null,
      bibkey: "unrelated2017",
      rawBibtex: null,
      title: sharedTitle,
      authors: '["Smith, J"]',
      year: sharedYear,
      abstract: null,
      doi: null,
      arxivId: null,
      venue: null,
      type: "article",
    });

    expect(listPapers(root)).toHaveLength(3);
  });

  it("merges via loose bibkey when shell bibkey differs slightly", () => {
    const orphan = seedZoteroPaper(root, {
      doi: null,
      zoteroKey: "ZKLOOSE",
      bibkey: "manning2022",
    });
    attachPdfBufferToPaper(root, orphan.id, Buffer.from("%PDF-1.4 loose"));
    detachZoteroMirror(root, orphan.id);

    const db = openLibraryDb(root);
    const now = Date.now();
    const shellId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO papers (
        id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type,
        pdf_path, pdf_sha, origin, raw_bibtex, csl_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, 'zotero', NULL, NULL, ?, ?)`,
    ).run(
      shellId,
      "manning2022z",
      "Materialize me",
      "[]",
      2024,
      "NeurIPS",
      "inproceedings",
      now,
      now,
    );
    db.prepare(
      "INSERT INTO zotero_mirror (paper_id, zotero_key, zotero_version, zotero_attach_key) VALUES (?, ?, ?, NULL)",
    ).run(shellId, "ZKLOOSE", 2);

    const merged = upsertZoteroPaperRow(root, {
      zoteroKey: "ZKLOOSE",
      zoteroVersion: 3,
      zoteroAttachKey: null,
      bibkey: "manning2022",
      rawBibtex: null,
      title: "Materialize me",
      authors: "[]",
      year: 2024,
      abstract: null,
      doi: null,
      arxivId: null,
      venue: "NeurIPS",
      type: "inproceedings",
    });

    expect(listPapers(root)).toHaveLength(1);
    expect(merged.id).toBe(orphan.id);
  });

  it("scoreOrphanMergeConfidence prefers exact bibkey over venue-only overlap", () => {
    const candidate = {
      id: "c1",
      bibkey: "alpha2024",
      title: "Same title",
      authors: '["Alpha, A"]',
      year: 2024,
      venue: "ICML",
    } as ReturnType<typeof seedZoteroPaper>;

    const exact = scoreOrphanMergeConfidence(
      {
        zoteroKey: "Z1",
        zoteroVersion: 1,
        zoteroAttachKey: null,
        bibkey: "alpha2024",
        title: "Same title",
        authors: '["Beta, B"]',
        year: 2024,
        venue: "NeurIPS",
        abstract: null,
        doi: null,
        arxivId: null,
        type: "article",
      },
      candidate,
    );
    const venueOnly = scoreOrphanMergeConfidence(
      {
        zoteroKey: "Z1",
        zoteroVersion: 1,
        zoteroAttachKey: null,
        bibkey: "other2024",
        title: "Same title",
        authors: '["Beta, B"]',
        year: 2024,
        venue: "ICML",
        abstract: null,
        doi: null,
        arxivId: null,
        type: "article",
      },
      candidate,
    );

    expect(exact).toBeGreaterThanOrEqual(100);
    expect(venueOnly).toBe(30);
    expect(venueOnly).toBeLessThan(40);
  });
});

describe("Zotero orphan prune", () => {
  let root: string;

  beforeEach(() => {
    root = tempProject();
  });

  it("deletes pure mirror papers removed from sync", () => {
    const paper = seedZoteroPaper(root);
    expect(resolveOrphanZoteroPaper(root, paper.id)).toBe("deleted");
    expect(listPapers(root)).toHaveLength(0);
  });

  it("detaches materialized papers with PDF instead of deleting", () => {
    const paper = seedZoteroPaper(root);
    attachPdfBufferToPaper(root, paper.id, Buffer.from("%PDF-1.4 prune"));

    expect(resolveOrphanZoteroPaper(root, paper.id)).toBe("detached");
    expect(listPapers(root)).toHaveLength(1);
    expect(getPaper(root, paper.id)!.origin).toBe("manual");
    expect(getZoteroMirrorByPaperId(root, paper.id)).toBeNull();
  });

  it("detaches when only local tags were added", () => {
    const paper = seedZoteroPaper(root);
    updatePaper(root, paper.id, { tags: ["diffusion"] });
    expect(isPaperLocallyMaterialized(root, paper.id)).toBe(true);

    expect(resolveOrphanZoteroPaper(root, paper.id)).toBe("detached");
    expect(listPapers(root)).toHaveLength(1);
    expect(getZoteroMirrorByPaperId(root, paper.id)).toBeNull();
  });

  it("detaches when only AI summary exists", () => {
    const paper = seedZoteroPaper(root);
    updatePaper(root, paper.id, { ai_summary: "Short model summary." });
    expect(isPaperLocallyMaterialized(root, paper.id)).toBe(true);

    expect(resolveOrphanZoteroPaper(root, paper.id)).toBe("detached");
    expect(listPapers(root)).toHaveLength(1);
    expect(getZoteroMirrorByPaperId(root, paper.id)).toBeNull();
  });
});
