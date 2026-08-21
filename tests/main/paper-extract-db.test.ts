import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPaper } from "../../src/main/services/literature-service";
import {
  getPaperExtractAbsPath,
  getPaperExtractState,
  listPaperExtractStates,
  readExtractBlocks,
  upsertPaperExtractState,
  writeExtractArtifacts,
} from "../../src/main/services/paper-extract-db";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

function tempProject(): string {
  return tempLiteratureProject();
}

describe("paper-extract-db", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("persists extract state and markdown artifacts", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "Extract Test" });

    upsertPaperExtractState(projectRoot, {
      paperId: paper.id,
      source: "pdfjs",
      status: "queued",
      queuedAt: Date.now(),
    });

    const written = writeExtractArtifacts(
      projectRoot,
      paper.id,
      "pdfjs",
      "<!-- page:1 -->\n\nHello",
      { engine: "pdfjs", pageCount: 1 },
      1,
    );

    upsertPaperExtractState(projectRoot, {
      paperId: paper.id,
      source: "pdfjs",
      status: "ready",
      mdPath: written.mdPath,
      pages: written.pages,
      finishedAt: Date.now(),
    });

    const state = getPaperExtractState(projectRoot, paper.id, "pdfjs");
    expect(state?.status).toBe("ready");
    expect(state?.pages).toBe(1);

    const batch = listPaperExtractStates(projectRoot, [paper.id]);
    expect(batch[paper.id]?.pdfjs?.status).toBe("ready");

    const absMd = getPaperExtractAbsPath(projectRoot, written.mdPath);
    expect(fs.readFileSync(absMd, "utf-8")).toContain("Hello");
  });

  it("writes MinerU image assets beside markdown", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "MinerU Images" });

    const written = writeExtractArtifacts(
      projectRoot,
      paper.id,
      "mineru",
      "![fig](images/a.png)",
      { engine: "mineru" },
      1,
      { images: [{ relPath: "images/a.png", data: Buffer.from("png-bytes") }] },
    );

    const imgAbs = getPaperExtractAbsPath(projectRoot, `${paper.id}/images/a.png`);
    expect(fs.existsSync(imgAbs)).toBe(true);
    expect(fs.readFileSync(imgAbs).toString()).toBe("png-bytes");
    expect(written.mdPath).toContain(`${paper.id}/mineru.md`);
  });

  it("writes mineru.blocks.json when blocks are provided", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "MinerU Blocks" });
    const blocks = [
      {
        id: "b0",
        index: 0,
        type: "text" as const,
        pageIdx: 0,
        bbox: [0.1, 0.2, 0.9, 0.3] as [number, number, number, number],
        markdown: "Sample paragraph.",
        textPreview: "Sample",
      },
    ];

    const written = writeExtractArtifacts(
      projectRoot,
      paper.id,
      "mineru",
      "Sample paragraph.",
      { engine: "mineru" },
      1,
      { blocks },
    );

    expect(written.blocksPath).toContain("mineru.blocks.json");
    const loaded = readExtractBlocks(projectRoot, paper.id, "mineru");
    expect(loaded).toHaveLength(1);
    expect(loaded![0]!.markdown).toBe("Sample paragraph.");
  });
});
