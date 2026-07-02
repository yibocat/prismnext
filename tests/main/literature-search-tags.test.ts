import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeLibraryDb,
  createPaper,
  getPaper,
  mapPaperForAgent,
  mapPaperSearchHitForAgent,
  searchPapers,
  updatePaper,
} from "../../src/main/services/literature-service";

function tempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "prism-lit-search-"));
}

describe("searchPapers tags and ai_summary", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      closeLibraryDb(root);
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("filters by exact tag (case-insensitive)", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const a = createPaper(projectRoot, { title: "Paper A" });
    const b = createPaper(projectRoot, { title: "Paper B" });
    updatePaper(projectRoot, a.paper.id, { tags: ["World Model"] });
    updatePaper(projectRoot, b.paper.id, { tags: ["Other"] });

    const hits = searchPapers(projectRoot, "", 20, { tag: "world model" });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(a.paper.id);
  });

  it("finds papers when query matches tag text in FTS", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Obscure title",
      abstract: "Nothing special",
    });
    updatePaper(projectRoot, paper.id, { tags: ["QuantumFuzzyUniqueTag"] });

    const hits = searchPapers(projectRoot, "QuantumFuzzyUniqueTag", 10);
    expect(hits.some((p) => p.id === paper.id)).toBe(true);
  });

  it("finds papers when query matches ai_summary", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, {
      title: "Summary paper",
      abstract: "Short",
    });
    updatePaper(projectRoot, paper.id, {
      ai_summary: "This work introduces a UniqueAgentSummaryPhrase for testing.",
    });

    const hits = searchPapers(projectRoot, "UniqueAgentSummaryPhrase", 10);
    expect(hits.some((p) => p.id === paper.id)).toBe(true);
  });

  it("mapPaperForAgent returns parsed tags array", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "Tagged" });
    updatePaper(projectRoot, paper.id, { tags: ["Alpha Tag", "Beta Tag"] });
    const row = getPaper(projectRoot, paper.id)!;
    const agent = mapPaperForAgent(row);
    expect(agent.tags).toEqual(["Alpha Tag", "Beta Tag"]);
    expect(typeof agent.tags).not.toBe("string");
  });

  it("mapPaperSearchHitForAgent truncates long ai_summary", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);
    const { paper } = createPaper(projectRoot, { title: "Long summary" });
    const long = "x".repeat(400);
    updatePaper(projectRoot, paper.id, { ai_summary: long });
    const hit = mapPaperSearchHitForAgent(getPaper(projectRoot, paper.id)!);
    expect(hit.ai_summary!.length).toBeLessThan(long.length);
    expect(hit.ai_summary!.endsWith("…")).toBe(true);
  });
});
