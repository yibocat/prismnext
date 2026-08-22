import { vi, describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  closeLibraryDb,
  createPaper,
  getPaper,
  mapPaperForRenderer,
  updatePaper,
} from "../../src/main/literature/facade";

vi.mock("../../src/main/services/provider-chat", () => ({
  completeChatJson: vi.fn().mockResolvedValue(
    JSON.stringify({
      summary: "World models enable sample-efficient planning.",
      keywords: ["to-read", "LLM"],
    }),
  ),
}));

vi.mock("../../src/main/services/settings", () => ({
  getSettings: vi.fn(() => ({
    aiProvider: "openai",
    aiModel: "gpt-4o-mini",
    aiApiKeys: { openai: "test-key" },
  })),
}));

vi.mock("../../src/main/literature/ai-metadata/literature-ai-metadata-heuristics", () => ({
  heuristicAbstractAndKeywords: vi.fn(() => ({
    abstract: "This paper studies world models for control.",
    keywordHints: ["world models"],
  })),
}));

import { runAiMetadataForPaper } from "../../src/main/literature/ai-metadata/literature-ai-metadata";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

function tempProject(): string {
  return tempLiteratureProject();
}

describe("literature-ai-metadata", () => {
  const roots: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const root of roots) {
      closeLibraryDb(root);
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("merges AI keywords without removing manual tags", async () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const created = createPaper(projectRoot, { title: "Test Paper" });
    updatePaper(projectRoot, created.paper.id, {
      tags: ["To Read"],
      abstract: "Existing abstract about world models for robotics.",
    });

    const result = await runAiMetadataForPaper(projectRoot, created.paper.id, { force: true });
    expect(result.status).toBe("ready");

    const mapped = mapPaperForRenderer(getPaper(projectRoot, created.paper.id)!);
    expect(mapped.ai_summary).toContain("World models");
    expect(mapped.tags).toEqual(expect.arrayContaining(["To Read", "LLM"]));
    expect(mapped.abstract).toBe("Existing abstract about world models for robotics.");
  });
});
