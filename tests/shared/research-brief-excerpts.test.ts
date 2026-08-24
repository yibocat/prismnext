import { describe, expect, it } from "vitest";
import {
  cleanResearchBriefExcerpt,
  experimentExcerptsFromBriefSections,
  findResearchBriefHeadingLine,
} from "../../src/shared/research/brief";

describe("research-brief excerpts for experiments", () => {
  it("cleanResearchBriefExcerpt strips HTML comments", () => {
    const raw = `<!-- One clear question -->\nWhat is curvature?\n`;
    expect(cleanResearchBriefExcerpt(raw)).toBe("What is curvature?");
  });

  it("experimentExcerptsFromBriefSections maps RQ + hypotheses", () => {
    const out = experimentExcerptsFromBriefSections({
      "Research question": "<!-- note -->\nHow does X scale?",
      "Hypotheses / claims": "H1: X improves Y.",
      Assumptions: "Ignore me",
    });
    expect(out.researchQuestionExcerpt).toBe("How does X scale?");
    expect(out.hypothesisExcerpt).toBe("H1: X improves Y.");
  });

  it("findResearchBriefHeadingLine returns 1-based line", () => {
    const md = `# Title\n\n## Research question\nWhat?\n`;
    expect(findResearchBriefHeadingLine(md, "Research question")).toBe(3);
    expect(findResearchBriefHeadingLine(md, "Assumptions")).toBeNull();
  });
});
