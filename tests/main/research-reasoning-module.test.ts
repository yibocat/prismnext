import { describe, expect, it } from "vitest";
import { RESEARCH_REASONING_PROMPT } from "../../src/main/prompts/modules/research-reasoning";

describe("RESEARCH_REASONING_PROMPT", () => {
  it("is judgment-only scholarly discipline with clear boundaries", () => {
    expect(RESEARCH_REASONING_PROMPT).toContain("Scholarly reasoning");
    expect(RESEARCH_REASONING_PROMPT).toContain("Scope boundary");
    expect(RESEARCH_REASONING_PROMPT).toContain("Research design");
    expect(RESEARCH_REASONING_PROMPT).toContain("Empirical claims");
    expect(RESEARCH_REASONING_PROMPT).toContain("Never fabricate");
    expect(RESEARCH_REASONING_PROMPT).not.toContain("BINDING");
    expect(RESEARCH_REASONING_PROMPT).not.toMatch(/literature-search|experiment-run/);
  });
});
