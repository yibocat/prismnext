import { describe, it, expect } from "vitest";
import { CITATIONS_PROMPT } from "../../src/main/prompts/modules/citations";

describe("CITATIONS_PROMPT", () => {
  it("contains only LaTeX/BibTeX knowledge — no literature tool names", () => {
    expect(CITATIONS_PROMPT).toContain("Citations & Bibliography");
    expect(CITATIONS_PROMPT).toContain("\\cite{key}");
    expect(CITATIONS_PROMPT).not.toMatch(/literature-/);
  });
});
