import { describe, it, expect, beforeEach } from "vitest";
import { promptManager } from "../../src/main/prompts";
import { CORE_PERSONA_PROMPT } from "../../src/main/prompts/layers/core-persona";
import type { PromptContext } from "../../src/main/prompts/types";

describe("promptManager.compose", () => {
  beforeEach(() => {
    promptManager.invalidate();
    promptManager.initialize();
  });

  it("includes default core persona when no custom prompt", () => {
    const composed = promptManager.compose({});
    expect(composed).toContain("# Prism Next Assistant");
    expect(composed).toContain("## Role");
    expect(composed).toContain(CORE_PERSONA_PROMPT.slice(0, 40));
    expect(composed.length).toBeGreaterThan(200);
  });

  it("includes custom system prompt instead of default persona", () => {
    const custom = "Always reply in Chinese and use British spelling.";
    const composed = promptManager.compose({ userCustomPrompt: custom });
    expect(composed).toContain(custom);
    expect(composed).not.toContain("integrated into Prism Next");
  });

  it("includes AGENTS.md and project rules when provided", () => {
    const ctx: PromptContext = {
      agentsMdContent: "# Project\n\nUse pnpm only.",
      customRules: [{ name: "Tests", content: "Run pnpm test before finishing." }],
    };
    const composed = promptManager.compose(ctx);
    expect(composed).toContain("# Project");
    expect(composed).toContain("Use pnpm only.");
    expect(composed).toContain("## Tests");
    expect(composed).toContain("Run pnpm test before finishing.");
  });
});
