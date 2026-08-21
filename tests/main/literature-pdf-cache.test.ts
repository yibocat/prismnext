import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPaper,
  upsertZoteroPaperRow,
  openLibraryDb,
  getLibraryPaths,
} from "../../src/main/services/literature-service";
import { getPdfCacheStatesForPapers, getLiteratureStorageStats, pruneOrphanPdfAttachments } from "../../src/main/services/literature-pdf-cache";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

function tempProject(): string {
  return tempLiteratureProject();
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

describe("literature-pdf-cache (unified attachments model)", () => {
  it("reports cached=true when pdf_path exists on disk", () => {
    const root = tempProject();
    const { paper } = createPaper(root, { title: "Cached Paper" });

    // Set a pdf_path and create the file
    const paths = getLibraryPaths(root);
    const rel = "attachments/test.pdf";
    fs.writeFileSync(path.join(paths.libraryDir, rel), "%PDF-1.4 fake");

    const db = openLibraryDb(root);
    db.prepare("UPDATE papers SET pdf_path = ? WHERE id = ?").run(rel, paper.id);

    const states = getPdfCacheStatesForPapers(root, [{ id: paper.id, pdf_path: rel }]);
    expect(states[paper.id].cached).toBe(true);
  });

  it("reports cached=false when no pdf_path", () => {
    const root = tempProject();
    const { paper } = createPaper(root, { title: "No PDF" });

    const states = getPdfCacheStatesForPapers(root, [{ id: paper.id, pdf_path: null }]);
    expect(states[paper.id].cached).toBe(false);
  });

  it("reports cached=false for zotero-mirrored paper without local PDF", () => {
    const root = tempProject();
    const paper = upsertZoteroPaperRow(root, {
      zoteroKey: "ZK1",
      zoteroVersion: 1,
      zoteroAttachKey: null,
      bibkey: "zot2024",
      rawBibtex: null,
      title: "Zotero Paper",
      authors: null,
      year: 2024,
      abstract: null,
      doi: null,
      arxivId: null,
      venue: null,
      type: "article",
    });

    const states = getPdfCacheStatesForPapers(root, [{ id: paper.id, pdf_path: null }]);
    expect(states[paper.id].cached).toBe(false);
  });

  it("reports cached=true when zotero-mirrored paper has local pdf_path", () => {
    const root = tempProject();
    const paper = upsertZoteroPaperRow(root, {
      zoteroKey: "ZK2",
      zoteroVersion: 1,
      zoteroAttachKey: null,
      bibkey: "zot2024b",
      rawBibtex: null,
      title: "Zotero with PDF",
      authors: null,
      year: 2024,
      abstract: null,
      doi: null,
      arxivId: null,
      venue: null,
      type: "article",
    });

    // Simulate PDF downloaded to attachments
    const paths = getLibraryPaths(root);
    const rel = "attachments/downloaded.pdf";
    fs.writeFileSync(path.join(paths.libraryDir, rel), "%PDF-1.4 downloaded");

    const db = openLibraryDb(root);
    db.prepare("UPDATE papers SET pdf_path = ? WHERE id = ?").run(rel, paper.id);

    const states = getPdfCacheStatesForPapers(root, [{ id: paper.id, pdf_path: rel }]);
    expect(states[paper.id].cached).toBe(true);
  });

  it("reports orphan attachments and prunes unreferenced PDF files", () => {
    const root = tempProject();
    roots.push(root);
    const { paper } = createPaper(root, { title: "Referenced" });
    const paths = getLibraryPaths(root);

    const referenced = "attachments/referenced.pdf";
    const orphan = "attachments/orphan.pdf";
    fs.writeFileSync(path.join(paths.libraryDir, referenced), "%PDF referenced");
    fs.writeFileSync(path.join(paths.libraryDir, orphan), "%PDF orphan longer");

    const db = openLibraryDb(root);
    db.prepare("UPDATE papers SET pdf_path = ?, pdf_sha = ? WHERE id = ?").run(
      referenced,
      "sha-ref",
      paper.id,
    );

    const before = getLiteratureStorageStats(root);
    expect(before.attachmentCount).toBe(2);
    expect(before.referencedCount).toBe(1);
    expect(before.orphanCount).toBe(1);
    expect(before.orphanBytes).toBeGreaterThan(0);

    const result = pruneOrphanPdfAttachments(root);
    expect(result.deletedFiles).toBe(1);
    expect(result.freedBytes).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(paths.libraryDir, orphan))).toBe(false);
    expect(fs.existsSync(path.join(paths.libraryDir, referenced))).toBe(true);

    const after = getLiteratureStorageStats(root);
    expect(after.orphanCount).toBe(0);
    expect(after.attachmentCount).toBe(1);
  });
});
