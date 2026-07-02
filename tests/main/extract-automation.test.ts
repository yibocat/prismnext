import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  attachPdfBufferToPaper,
  createPaper,
  replacePdfFromFile,
} from "../../src/main/services/literature-service";
import {
  getPaperExtractState,
  invalidatePaperExtracts,
  upsertPaperExtractState,
} from "../../src/main/services/paper-extract-db";

function tempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "prism-extract-auto-"));
}

describe("invalidatePaperExtracts", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("resets ready extract state to idle", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "Paper" });

    upsertPaperExtractState(projectRoot, {
      paperId: paper.id,
      source: "pdfjs",
      status: "ready",
      mdPath: `${paper.id}/pdfjs.md`,
      pages: 1,
    });

    invalidatePaperExtracts(projectRoot, paper.id, ["pdfjs"]);
    const state = getPaperExtractState(projectRoot, paper.id, "pdfjs");
    expect(state?.status).toBe("idle");
  });
});

describe("replacePdfFromFile", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("updates sha when PDF bytes change", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "Replace" });

    const pdfA = path.join(projectRoot, "a.pdf");
    const pdfB = path.join(projectRoot, "b.pdf");
    fs.writeFileSync(pdfA, Buffer.from("%PDF-a"));
    fs.writeFileSync(pdfB, Buffer.from("%PDF-b"));

    attachPdfBufferToPaper(projectRoot, paper.id, fs.readFileSync(pdfA));
    const first = replacePdfFromFile(projectRoot, paper.id, pdfB);
    expect(first.replaced).toBe(true);
    expect(first.paper.pdf_sha).toBeTruthy();

    const same = replacePdfFromFile(projectRoot, paper.id, pdfB);
    expect(same.replaced).toBe(false);
  });
});
