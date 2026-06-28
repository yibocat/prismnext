import { describe, it, expect, beforeEach } from "vitest";
import { promptManager } from "../../src/main/prompts";
import { CORE_PERSONA_PROMPT } from "../../src/main/prompts/layers/core-persona";
import type { PromptContext } from "../../src/main/prompts/types";

function charsToTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

describe("estimateTokenBreakdown", () => {
  beforeEach(() => {
    promptManager.invalidate();
  });

  it("counts default persona under core-persona when no custom prompt", () => {
    const ctx: PromptContext = {};
    const breakdown = promptManager.estimateTokenBreakdown(ctx);

    expect(breakdown["core-persona"]).toBe(charsToTokens(CORE_PERSONA_PROMPT));
    expect(breakdown["user-instructions"]).toBeUndefined();
  });

  it("counts custom prompt under user-instructions, not core-persona", () => {
    const custom = "You are a helpful LaTeX assistant for my thesis.";
    const ctx: PromptContext = { userCustomPrompt: custom };
    const breakdown = promptManager.estimateTokenBreakdown(ctx);

    expect(breakdown["user-instructions"]).toBe(charsToTokens(custom));
    expect(breakdown["core-persona"]).toBeUndefined();
  });

  it("classifies custom rules under project-rules", () => {
    const ctx: PromptContext = {
      customRules: [{ name: "Citations", content: "Always use \\cite{} for references." }],
    };
    const breakdown = promptManager.estimateTokenBreakdown(ctx);

    expect(breakdown["project-rules"]).toBeGreaterThan(0);
    // active-modules layer is independent; rules must not replace it
    expect(breakdown["project-rules"]).not.toBe(breakdown["modules"]);
  });

  it("classifies AGENTS.md content under project-instructions", () => {
    const agentsMd = "# Rules\n\nUse British English spelling.";
    const ctx: PromptContext = { agentsMdContent: agentsMd };
    const breakdown = promptManager.estimateTokenBreakdown(ctx);

    expect(breakdown["project-instructions"]).toBeGreaterThan(0);
  });
});
