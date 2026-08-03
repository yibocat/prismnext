import { describe, expect, it } from "vitest";
import { PROJECT_RULES_MEMORY_PROMPT } from "../../src/main/prompts/modules/project-rules-memory";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("PROJECT_RULES_MEMORY_PROMPT", () => {
  it("guides explicit vs heuristic remember and project-rule-write", () => {
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain(TOOL_NAMES.projectRuleWrite);
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("Explicit remember");
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("AskQuestion");
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("append");
    expect(PROJECT_RULES_MEMORY_PROMPT).toContain("AGENTS.md");
    expect(PROJECT_RULES_MEMORY_PROMPT).not.toContain("BINDING");
  });
});
