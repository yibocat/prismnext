import { describe, expect, it, beforeEach } from "vitest";
import { promptManager } from "../../src/main/prompts";
import type { PromptContext } from "../../src/main/prompts";

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

  it("fingerprint ignores AGENTS.md changes (loaded via OpenCode instructions)", () => {
    const fp1 = promptManager.computePromptFingerprint(ctx);
    const fp2 = promptManager.computePromptFingerprint({
      ...ctx,
      agentsMdContent: "# Changed\n\nNew instructions.",
    });
    expect(fp1).toBe(fp2);
  });

  it("fingerprint includes static module prompt content hash", () => {
    const fp = promptManager.computePromptFingerprint(ctx);
    expect(fp).toContain("chat-citation-staging=");
    expect(fp).toContain("literature-library=");
    expect(fp).toContain("web-research=");
    expect(fp).toContain("office-documents=");
  });

  it("composeStableSystem excludes AGENTS.md, project rules, and profile-only modules", () => {
    const stable = promptManager.composeStableSystem(ctx);
    expect(stable).not.toContain("Run pnpm test");
    expect(stable).not.toContain("Use pnpm only.");
    expect(stable).not.toContain("Active Agent Profile");
    expect(stable).not.toContain("Chat paper citations");
    expect(stable).not.toContain("Citations & Bibliography");
    expect(stable).toContain("## Research AI assistant");
  });
});
