import { describe, expect, it } from "vitest";
import { RESEARCH_REASONING_PROMPT } from "../../src/main/prompts";

describe("RESEARCH_REASONING_PROMPT", () => {
  it("is judgment-only scholarly discipline with clear boundaries", () => {
    expect(RESEARCH_REASONING_PROMPT).toContain("Scholarly reasoning");
    expect(RESEARCH_REASONING_PROMPT).toContain("Claims and evidence");
    expect(RESEARCH_REASONING_PROMPT).toContain("Ground strong claims");
    expect(RESEARCH_REASONING_PROMPT).toContain("hypothesis");
    expect(RESEARCH_REASONING_PROMPT).toContain("Steelman");
    expect(RESEARCH_REASONING_PROMPT).not.toContain("Research design");
    expect(RESEARCH_REASONING_PROMPT).not.toContain("Project brief");
    expect(RESEARCH_REASONING_PROMPT).not.toContain("chat memory");
    expect(RESEARCH_REASONING_PROMPT).not.toContain("BINDING");
    expect(RESEARCH_REASONING_PROMPT).not.toMatch(/literature-search|experiment-run/);
  });
});
