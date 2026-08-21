import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  attachLocalPdfToPaper,
  closeLibraryDb,
  createPaper,
  findExistingByIdentifier,
  getPaper,
} from "../../src/main/services/literature-service";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

function tempProject(): string {
  return tempLiteratureProject();
}

function writeMinimalPdf(filePath: string, label: string): void {
  fs.writeFileSync(filePath, Buffer.from(`%PDF-1.4\n% ${label}\n`));
}

describe("attachLocalPdfToPaper", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      closeLibraryDb(root);
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("attaches a PDF to an entry without one", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "Attach me" });
    const pdfPath = path.join(projectRoot, "local.pdf");
    writeMinimalPdf(pdfPath, "attach-test");

    const result = attachLocalPdfToPaper(projectRoot, paper.id, pdfPath);
    expect(result.attached).toBe(true);
    expect(getPaper(projectRoot, paper.id)?.pdf_path).toBeTruthy();
  });

  it("returns sha_duplicate when the same file is already on another entry", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const pdfPath = path.join(projectRoot, "dup.pdf");
    writeMinimalPdf(pdfPath, "dup-test");

    const first = createPaper(projectRoot, { title: "First" });
    attachLocalPdfToPaper(projectRoot, first.paper.id, pdfPath);

    const second = createPaper(projectRoot, { title: "Second" });
    const result = attachLocalPdfToPaper(projectRoot, second.paper.id, pdfPath);
    expect(result.attached).toBe(false);
    expect(result.conflict?.kind).toBe("sha_duplicate");
    expect(result.conflict?.otherPaper.id).toBe(first.paper.id);
  });

  it("rejects non-PDF files", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "Bad file" });
    const txtPath = path.join(projectRoot, "not.pdf");
    fs.writeFileSync(txtPath, "hello");

    const result = attachLocalPdfToPaper(projectRoot, paper.id, txtPath);
    expect(result.attached).toBe(false);
    expect(result.attachError).toContain("not a PDF");
  });

  it("returns target_mismatch when PDF DOI conflicts with entry", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Entry A",
      doi: "10.1038/nature12345",
    });
    const pdfPath = path.join(projectRoot, "wrong.pdf");
    fs.writeFileSync(
      pdfPath,
      Buffer.from("%PDF-1.4\n% doi:10.1145/1234567.1234567\n"),
    );

    const result = attachLocalPdfToPaper(projectRoot, paper.id, pdfPath);
    expect(result.attached).toBe(false);
    expect(result.conflict?.kind).toBe("target_mismatch");
  });

  it("returns target_unverified when entry has DOI but PDF has none", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Entry B",
      doi: "10.1038/nature99999",
    });
    const pdfPath = path.join(projectRoot, "blank.pdf");
    writeMinimalPdf(pdfPath, "no-ids");

    const result = attachLocalPdfToPaper(projectRoot, paper.id, pdfPath);
    expect(result.attached).toBe(false);
    expect(result.conflict?.kind).toBe("target_unverified");
  });

  it("returns target_mismatch before sha_duplicate when the file is on another entry", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const pdfPath = path.join(projectRoot, "shared.pdf");
    fs.writeFileSync(
      pdfPath,
      Buffer.from("%PDF-1.4\n% doi:10.1145/1234567.1234567\n"),
    );

    const correct = createPaper(projectRoot, {
      title: "Correct paper",
      doi: "10.1145/1234567.1234567",
    });
    attachLocalPdfToPaper(projectRoot, correct.paper.id, pdfPath);

    const wrong = createPaper(projectRoot, {
      title: "Wrong entry",
      doi: "10.1038/nature12345",
    });
    const result = attachLocalPdfToPaper(projectRoot, wrong.paper.id, pdfPath);
    expect(result.attached).toBe(false);
    expect(result.conflict?.kind).toBe("target_mismatch");
  });

  it("allows mismatch attach when ignoreIdentifierConflict is set", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Force attach",
      doi: "10.1038/nature12345",
    });
    const pdfPath = path.join(projectRoot, "force.pdf");
    fs.writeFileSync(
      pdfPath,
      Buffer.from("%PDF-1.4\n% doi:10.1145/9999999.9999999\n"),
    );

    const result = attachLocalPdfToPaper(projectRoot, paper.id, pdfPath, {
      ignoreIdentifierConflict: true,
    });
    expect(result.attached).toBe(true);
    expect(getPaper(projectRoot, paper.id)?.pdf_path).toBeTruthy();
  });

  it("findExistingByIdentifier cross-matches arXiv DOI to arxiv_id column", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Arxiv stored",
      arxiv_id: "2301.00099",
    });
    const hit = findExistingByIdentifier(projectRoot, {
      doi: "10.48550/arXiv.2301.00099",
    });
    expect(hit?.paperId).toBe(paper.id);
    expect(hit?.bibkey).toBe(paper.bibkey);
  });
});
