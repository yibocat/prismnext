import { describe, expect, it, beforeEach } from "vitest";
import { promptManager } from "../../src/main/prompts";
import type { PromptContext } from "../../src/main/prompts/types";

describe("promptManager project rules injection split", () => {
  beforeEach(() => {
    promptManager.invalidate();
    promptManager.initialize();
  });

  const ctx: PromptContext = {
    customRules: [{ name: "Tests", content: "Run pnpm test before finishing." }],
    agentsMdContent: "# Project\n\nUse pnpm only.",
  };

  it("composeBase excludes project rules", () => {
    const full = promptManager.compose(ctx);
    const base = promptManager.composeBase(ctx);
    const rules = promptManager.composeProjectRules(ctx);

    expect(full).toContain("Run pnpm test");
    expect(full).toContain("Use pnpm only.");
    expect(base).toContain("Use pnpm only.");
    expect(base).not.toContain("Run pnpm test");
    expect(rules).toContain("## Tests");
    expect(rules).toContain("Run pnpm test");
  });

  it("fingerprint ignores project rules changes", () => {
    const fp1 = promptManager.computePromptFingerprint(ctx);
    const fp2 = promptManager.computePromptFingerprint({
      ...ctx,
      customRules: [{ name: "Other", content: "Different rule body." }],
    });
    expect(fp1).toBe(fp2);
  });

  it("fingerprint changes when base prompt content changes", () => {
    const fp1 = promptManager.computePromptFingerprint(ctx);
    const fp2 = promptManager.computePromptFingerprint({
      ...ctx,
      agentsMdContent: "# Changed\n\nNew instructions.",
    });
    expect(fp1).not.toBe(fp2);
  });
});
