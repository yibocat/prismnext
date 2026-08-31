import { describe, expect, it } from "vitest";
import { PROJECT_RULES_MEMORY_PROMPT } from "../../src/main/prompts/modules/project-rules-memory";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("PROJECT_RULES_MEMORY_PROMPT", () => {
  it("guides explicit vs heuristic remember and project-rule-write", () => {
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain(TOOL_NAMES.projectRuleWrite);
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("Scope boundary");
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("Explicit remember");
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain(TOOL_NAMES.question);
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("append");
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("AGENTS.md");
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("Skills");
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("Project brief");
    expect(PROJECT_RULES_MEMORY_PROMPT).not.toContain("BINDING");
    expect(PROJECT_RULES_MEMORY_PROMPT).not.toContain("AskQuestion");
  });
});
