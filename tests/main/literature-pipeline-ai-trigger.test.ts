import { vi, describe, expect, it, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  closeLibraryDb,
  createPaper,
  getPaper,
} from "../../src/main/services/literature-service";
import {
  upsertPaperExtractState,
  writeExtractArtifacts,
} from "../../src/main/services/paper-extract-db";
import { backfillPaperAbstractFromExtract } from "../../src/main/services/literature-ai-metadata-heuristics";

const runAiMetadataForPaper = vi.fn().mockResolvedValue({ status: "ready" });

vi.mock("../../src/main/services/literature-ai-metadata", () => ({
  runAiMetadataForPaper: (...args: unknown[]) => runAiMetadataForPaper(...args),
}));

vi.mock("../../src/main/services/settings", () => ({
  getSettings: vi.fn(() => ({
    literatureAutoAiMetadata: true,
    aiProvider: "openai",
    aiModel: "gpt-4o-mini",
    aiApiKeys: { openai: "test-key" },
  })),
}));

import { maybeEnqueueAiMetadataAfterMetadata } from "../../src/main/services/literature-ai-metadata-queue";

const EXTRACT_MD = `
# Paper

Abstract
This paper studies world models for control and planning in complex environments with long horizons.

Keywords: reinforcement learning, world models
Introduction
Lorem ipsum dolor sit amet.
`;

function tempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "prism-lit-pipeline-"));
}

function seedReadyExtract(projectRoot: string, paperId: string, markdown: string): void {
  const written = writeExtractArtifacts(
    projectRoot,
    paperId,
    "mineru",
    markdown,
    { engine: "mineru" },
    1,
  );
  upsertPaperExtractState(projectRoot, {
    paperId,
    source: "mineru",
    status: "ready",
    mdPath: written.mdPath,
    pages: written.pages,
    finishedAt: Date.now(),
  });
}

describe("literature pipeline — abstract backfill + catalog AI trigger", () => {
  const roots: string[] = [];

  afterEach(() => {
    runAiMetadataForPaper.mockClear();
    for (const root of roots) {
      closeLibraryDb(root);
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("backfills paper.abstract from ready extract when empty", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "Backfill test" });
    seedReadyExtract(projectRoot, paper.id, EXTRACT_MD);

    expect(backfillPaperAbstractFromExtract(projectRoot, paper.id)).toBe(true);
    expect(getPaper(projectRoot, paper.id)?.abstract).toContain("world models");
  });

  it("does not overwrite existing abstract on backfill", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Has abstract",
      abstract: "Existing catalog abstract.",
    });
    seedReadyExtract(projectRoot, paper.id, EXTRACT_MD);

    expect(backfillPaperAbstractFromExtract(projectRoot, paper.id)).toBe(false);
    expect(getPaper(projectRoot, paper.id)?.abstract).toBe("Existing catalog abstract.");
  });

  it("enqueues AI metadata when catalog abstract exists without waiting for extract", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Catalog row",
      abstract: "Catalog abstract about neural networks.",
    });

    maybeEnqueueAiMetadataAfterMetadata(projectRoot, paper.id);
    await vi.waitFor(() => expect(runAiMetadataForPaper).toHaveBeenCalled());

    expect(runAiMetadataForPaper).toHaveBeenCalledWith(projectRoot, paper.id, { force: false });
  });

  it("does not enqueue AI metadata when abstract is missing", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "No abstract" });

    maybeEnqueueAiMetadataAfterMetadata(projectRoot, paper.id);
    await new Promise((r) => setTimeout(r, 50));

    expect(runAiMetadataForPaper).not.toHaveBeenCalled();
  });
});
