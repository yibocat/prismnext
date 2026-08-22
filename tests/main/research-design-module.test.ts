import { describe, expect, it } from "vitest";
import { RESEARCH_DESIGN_PROMPT } from "../../src/main/prompts/modules/research-design";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("RESEARCH_DESIGN_PROMPT", () => {
  it("covers research design activity — not experiment design or brief file semantics", () => {
    expect(RESEARCH_DESIGN_PROMPT).toContain("Research design");
    expect(RESEARCH_DESIGN_PROMPT).toContain("Project brief");
    expect(RESEARCH_DESIGN_PROMPT).toContain("Scope boundary");
    expect(RESEARCH_DESIGN_PROMPT).toContain("Route the request");
    expect(RESEARCH_DESIGN_PROMPT).toContain("Intellectual roadmap");
    expect(RESEARCH_DESIGN_PROMPT).toContain(TOOL_NAMES.suggestPlan);
    expect(RESEARCH_DESIGN_PROMPT).toContain("research-design-coach");
    expect(RESEARCH_DESIGN_PROMPT).toContain("Experiments");

    expect(RESEARCH_DESIGN_PROMPT).not.toContain("Frozen");
    expect(RESEARCH_DESIGN_PROMPT).not.toContain("grounds experiments");
    expect(RESEARCH_DESIGN_PROMPT).not.toContain(TOOL_NAMES.experimentRun);
    expect(RESEARCH_DESIGN_PROMPT).toContain("discuss thoroughly in chat");
    expect(RESEARCH_DESIGN_PROMPT).not.toContain("BINDING");
  });
});
