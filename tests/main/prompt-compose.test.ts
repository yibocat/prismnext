import { describe, it, expect, beforeEach } from "vitest";
import { promptManager, composeStableSystem, CORE_PERSONA_PROMPT } from "../../src/main/prompts";
import type { PromptContext } from "../../src/main/prompts/types";

describe("promptManager.compose", () => {
  beforeEach(() => {
    promptManager.invalidate();
    promptManager.initialize();
  });

  it("includes default core persona when no custom prompt", () => {
    const composed = promptManager.compose({});
    expect(composed).toContain("## Research AI assistant");
    expect(composed).toContain("### What you refuse");
    expect(composed).toContain(CORE_PERSONA_PROMPT.slice(0, 40));
    expect(composed).toContain("## Scholarly reasoning");
    expect(composed.length).toBeGreaterThan(200);
  });

  it("includes custom system prompt instead of default persona", () => {
    const custom = "Always reply in Chinese and use British spelling.";
    const composed = promptManager.compose({ userCustomPrompt: custom });
    expect(composed).toContain(custom);
    expect(composed).not.toContain("LaTeX-only");
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

  it("composeStableSystem joins persona then global modules (no AGENTS.md / rules)", () => {
    const ctx: PromptContext = {
      agentsMdContent: "# Project\n\nUse pnpm only.",
      customRules: [{ name: "Tests", content: "Run pnpm test before finishing." }],
    };
    const stable = composeStableSystem(ctx);
    expect(stable).toBe(promptManager.composeStableSystem(ctx));
    expect(stable).toContain("## Research AI assistant");
    expect(stable.indexOf("## Scholarly reasoning")).toBeLessThan(stable.indexOf("## Reply depth"));
    expect(stable).not.toContain("Use pnpm only.");
    expect(stable).not.toContain("Run pnpm test before finishing.");
  });
});
