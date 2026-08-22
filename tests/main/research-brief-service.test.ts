import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureResearchBrief,
  parseResearchBriefSections,
  readResearchBrief,
  updateResearchBriefSection,
} from "../../src/main/research/research-brief-service";
import { RESEARCH_BRIEF_TEMPLATE } from "../../src/shared/research/brief";

describe("research-brief-service", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("ensureResearchBrief creates template once", () => {
    root = mkdtempSync(join(tmpdir(), "prism-brief-"));
    const first = ensureResearchBrief(root);
    expect(first.created).toBe(true);
    expect(first.path).toBe(".brief.md");
    const second = ensureResearchBrief(root);
    expect(second.created).toBe(false);
    const raw = readFileSync(join(root, ".brief.md"), "utf-8");
    expect(raw).toBe(RESEARCH_BRIEF_TEMPLATE);
  });

  it("ensureResearchBrief migrates legacy .prismnext/research/brief.md", () => {
    root = mkdtempSync(join(tmpdir(), "prism-brief-legacy-"));
    const legacyDir = join(root, ".prismnext", "research");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, "brief.md"), "# Legacy\n\n## Research question\nOld RQ\n", "utf-8");

    const result = ensureResearchBrief(root);
    expect(result.created).toBe(false);
    expect(result.path).toBe(".brief.md");
    expect(existsSync(join(root, ".brief.md"))).toBe(true);
    expect(existsSync(join(legacyDir, "brief.md"))).toBe(false);
    expect(readFileSync(join(root, ".brief.md"), "utf-8")).toContain("Old RQ");
  });

  it("parseResearchBriefSections extracts ## sections", () => {
    const md = `# Title

## Research question
What is X?

## Assumptions
We assume Y.
`;
    const sections = parseResearchBriefSections(md);
    expect(sections["Research question"]).toBe("What is X?");
    expect(sections["Assumptions"]).toBe("We assume Y.");
  });

  it("updateResearchBriefSection replaces one section", () => {
    root = mkdtempSync(join(tmpdir(), "prism-brief-"));
    ensureResearchBrief(root);
    const result = updateResearchBriefSection(root, "Research question", "How does Z scale?");
    expect(result.ok).toBe(true);
    expect(result.section).toBe("Research question");

    const read = readResearchBrief(root);
    expect(read.sections["Research question"]).toBe("How does Z scale?");
    expect(read.sections["Assumptions"]).toContain("research-design-coach");
  });

  it("updateResearchBriefSection rejects unknown section", () => {
    root = mkdtempSync(join(tmpdir(), "prism-brief-"));
    ensureResearchBrief(root);
    const result = updateResearchBriefSection(root, "Not a section", "nope");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown section");
  });

  it("updateResearchBriefSection can append", () => {
    root = mkdtempSync(join(tmpdir(), "prism-brief-"));
    ensureResearchBrief(root);
    updateResearchBriefSection(root, "Open questions", "First?");
    updateResearchBriefSection(root, "Open questions", "Second?", { append: true });
    const read = readResearchBrief(root);
    expect(read.sections["Open questions"]).toContain("First?");
    expect(read.sections["Open questions"]).toContain("Second?");
  });
});
