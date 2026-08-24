import { describe, expect, it } from "vitest";
import { PROJECT_BRIEF_PROMPT } from "../../src/main/prompts/modules/project-brief";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("PROJECT_BRIEF_PROMPT", () => {
  it("defines .brief.md as intellectual spine — not memory, rules, or experiment plan", () => {
    expect(PROJECT_BRIEF_PROMPT).toContain(".brief.md");
    expect(PROJECT_BRIEF_PROMPT).toContain("intellectual spine");
    expect(PROJECT_BRIEF_PROMPT).toContain("What this is not");
    expect(PROJECT_BRIEF_PROMPT).toContain("starting scaffold only");
    expect(PROJECT_BRIEF_PROMPT).toContain(TOOL_NAMES.researchBriefRead);
    expect(PROJECT_BRIEF_PROMPT).toContain(TOOL_NAMES.researchBriefUpdate);
    expect(PROJECT_BRIEF_PROMPT).toContain("Experiments");

    expect(PROJECT_BRIEF_PROMPT).not.toContain("Frozen");
    expect(PROJECT_BRIEF_PROMPT).not.toContain("research-design-coach");
    expect(PROJECT_BRIEF_PROMPT).not.toContain("BINDING");
    expect(PROJECT_BRIEF_PROMPT).not.toContain("Before major work");
    expect(PROJECT_BRIEF_PROMPT).toContain("Driven by dialogue and thinking");
    expect(PROJECT_BRIEF_PROMPT).toContain("first person");
  });
});
