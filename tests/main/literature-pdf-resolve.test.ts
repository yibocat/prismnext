import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/main/literature/zotero/zotero-client", () => ({
  getItemPdfAttachmentKey: vi.fn(),
  fetchItemPdfBytes: vi.fn(),
}));

import {
  derivePaperPdfSource,
  resolvePaperPdfBytes,
} from "../../src/main/literature/pdf/literature-pdf-resolve";
import { tempLiteratureProject } from "./helpers/temp-literature-project";
import {
  createPaper,
  upsertZoteroPaperRow,
  getLibraryPaths,
  openLibraryDb,
  type PaperRow,
} from "../../src/main/literature/facade";
import {
  fetchItemPdfBytes,
  getItemPdfAttachmentKey,
} from "../../src/main/literature/zotero/zotero-client";

const SAMPLE_PDF = Buffer.from("%PDF-1.4 cached");

function tempProject(): string {
  return tempLiteratureProject();
}

describe("literature-pdf-resolve", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.clearAllMocks();
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("derivePaperPdfSource distinguishes zotero vs local vs none", () => {
    expect(derivePaperPdfSource({ pdf_path: "attachments/a.pdf", origin: "zotero" } as PaperRow)).toBe("zotero");
    expect(derivePaperPdfSource({ pdf_path: "attachments/a.pdf", origin: "manual" } as PaperRow)).toBe("local");
    expect(derivePaperPdfSource({ pdf_path: null, origin: "manual" } as PaperRow)).toBe("none");
  });

  it("returns cached local pdf_path without fetching from Zotero", async () => {
    const root = tempProject();
    roots.push(root);

    const { paper } = createPaper(root, { title: "Local PDF Paper" });
    const paths = getLibraryPaths(root);
    const rel = "attachments/local.pdf";
    const localPdf = Buffer.from("%PDF-1.4 local");
    fs.writeFileSync(path.join(paths.libraryDir, rel), localPdf);

    const db = openLibraryDb(root);
    db.prepare("UPDATE papers SET pdf_path = ? WHERE id = ?").run(rel, paper.id);

    vi.mocked(fetchItemPdfBytes).mockResolvedValue(new Uint8Array());
    vi.mocked(getItemPdfAttachmentKey).mockResolvedValue(null);

    const bytes = await resolvePaperPdfBytes(root, paper.id);
    expect(bytes?.equals(localPdf)).toBe(true);
    expect(fetchItemPdfBytes).not.toHaveBeenCalled();
  });

  it("fetches from Zotero and stores in attachments when no local pdf_path", async () => {
    const root = tempProject();
    roots.push(root);
    const paths = getLibraryPaths(root);

    const paper = upsertZoteroPaperRow(root, {
      zoteroKey: "ITEM2",
      zoteroVersion: 1,
      zoteroAttachKey: "ATTACH2",
      bibkey: "remote2024",
      rawBibtex: null,
      title: "Remote PDF",
      authors: "[]",
      year: 2024,
      abstract: null,
      doi: null,
      arxivId: null,
      venue: null,
      type: "article",
    });

    const remotePdf = Buffer.from("%PDF-1.4 remote");
    vi.mocked(fetchItemPdfBytes).mockResolvedValue(new Uint8Array(remotePdf));
    vi.mocked(getItemPdfAttachmentKey).mockResolvedValue("ATTACH2");

    const bytes = await resolvePaperPdfBytes(root, paper.id);
    expect(bytes?.equals(remotePdf)).toBe(true);

    // PDF should now be stored in attachments/ with pdf_path set
    const updated = openLibraryDb(root).prepare("SELECT pdf_path FROM papers WHERE id = ?").get(paper.id) as { pdf_path: string };
    expect(updated.pdf_path).toBeTruthy();
    expect(updated.pdf_path).toMatch(/^attachments\//);
    expect(fs.existsSync(path.join(paths.libraryDir, updated.pdf_path))).toBe(true);
  });

  it("falls back to local pdf_path for non-zotero papers", async () => {
    const root = tempProject();
    roots.push(root);

    const { paper } = createPaper(root, { title: "Local PDF" });
    const paths = getLibraryPaths(root);
    const rel = "attachments/local2.pdf";
    const localPdf = Buffer.from("%PDF-1.4 local2");
    fs.writeFileSync(path.join(paths.libraryDir, rel), localPdf);

    const db = openLibraryDb(root);
    db.prepare("UPDATE papers SET pdf_path = ? WHERE id = ?").run(rel, paper.id);

    const bytes = await resolvePaperPdfBytes(root, paper.id);
    expect(bytes?.equals(localPdf)).toBe(true);
  });
});
