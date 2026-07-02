import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPaper,
  detachZoteroMirror,
  getAnnotations,
  getPaper,
  getZoteroMirrorByPaperId,
  listPapers,
  saveAnnotation,
  upsertZoteroPaperRow,
  openLibraryDb,
  type PaperRow,
} from "../../src/main/services/literature-service";

function tempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-identity-"));
  fs.mkdirSync(path.join(dir, ".prismnext", "library"), { recursive: true });
  return dir;
}

const SAMPLE_PDF = Buffer.from("%PDF-1.4 sample content");

describe("literature identity + detach invariants", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("A1: upsertZoteroPaperRow merges a manual row with the same DOI instead of duplicating", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const manualResult = createPaper(projectRoot, {
      title: "Local entry",
      doi: "10.1000/test",
      year: 2024,
    });
    const manual = manualResult.paper;
    expect(listPapers(projectRoot)).toHaveLength(1);
    expect(manual.doi).toBe("10.1000/test");

    const merged = upsertZoteroPaperRow(projectRoot, {
      zoteroKey: "ZKEY1",
      zoteroVersion: 1,
      zoteroAttachKey: null,
      bibkey: "zotero2024",
      rawBibtex: null,
      title: "Local entry",
      authors: null,
      year: 2024,
      abstract: null,
      doi: "10.1000/test",
      arxivId: null,
      venue: null,
      type: "article",
    });

    // Should merge, not duplicate
    expect(listPapers(projectRoot)).toHaveLength(1);
    expect(merged.id).toBe(manual.id);
    expect(merged.origin).toBe("manual");

    // zotero_mirror should have the association
    const mirror = getZoteroMirrorByPaperId(projectRoot, manual.id);
    expect(mirror).not.toBeNull();
    expect(mirror!.zotero_key).toBe("ZKEY1");
  });

  it("A2: detachZoteroMirror preserves the row, annotations, and local origin", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const zoteroPaper = upsertZoteroPaperRow(projectRoot, {
      zoteroKey: "ZKEY2",
      zoteroVersion: 1,
      zoteroAttachKey: null,
      bibkey: "detach2024",
      rawBibtex: null,
      title: "To detach",
      authors: null,
      year: 2024,
      abstract: null,
      doi: "10.1/detach",
      arxivId: null,
      venue: null,
      type: "article",
    });

    // Add an annotation
    saveAnnotation(projectRoot, {
      id: "ann1",
      paper_id: zoteroPaper.id,
      kind: "highlight",
      page: 1,
      rects: "[]",
      quoted_text: "text",
      color: "#ff0",
      note: null,
    });

    detachZoteroMirror(projectRoot, zoteroPaper.id);

    const after = getPaper(projectRoot, zoteroPaper.id)!;
    expect(after).not.toBeNull();
    expect(after.origin).toBe("manual");

    // zotero_mirror should be gone
    const mirror = getZoteroMirrorByPaperId(projectRoot, zoteroPaper.id);
    expect(mirror).toBeNull();

    // Annotation survives
    const anns = getAnnotations(projectRoot, zoteroPaper.id);
    expect(anns).toHaveLength(1);
  });

  it("A1: re-attaching after detach via identity merge restores zotero_key on the same row", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const zoteroPaper = upsertZoteroPaperRow(projectRoot, {
      zoteroKey: "ZKEY3",
      zoteroVersion: 1,
      zoteroAttachKey: null,
      bibkey: "reattach2024",
      rawBibtex: null,
      title: "Re-attach me",
      authors: null,
      year: 2024,
      abstract: null,
      doi: "10.1000/reattach",
      arxivId: null,
      venue: null,
      type: "article",
    });

    detachZoteroMirror(projectRoot, zoteroPaper.id);

    // Re-sync with the same DOI → should re-attach via identity merge
    const reMerged = upsertZoteroPaperRow(projectRoot, {
      zoteroKey: "ZKEY3",
      zoteroVersion: 2,
      zoteroAttachKey: null,
      bibkey: "reattach2024",
      rawBibtex: null,
      title: "Re-attach me",
      authors: null,
      year: 2024,
      abstract: null,
      doi: "10.1000/reattach",
      arxivId: null,
      venue: null,
      type: "article",
    });

    expect(listPapers(projectRoot)).toHaveLength(1);
    expect(reMerged.id).toBe(zoteroPaper.id);
    expect(reMerged.origin).toBe("manual");

    const mirror = getZoteroMirrorByPaperId(projectRoot, zoteroPaper.id);
    expect(mirror).not.toBeNull();
    expect(mirror!.zotero_key).toBe("ZKEY3");
    expect(mirror!.zotero_version).toBe(2);
  });
});
