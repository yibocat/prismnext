import { describe, expect, it } from "vitest";
import { ALL_MODULES } from "../../src/main/prompts/modules";
import { resolveStableSystemModules } from "../../src/main/prompts/resolve-active-modules";

function approxTokens(s: string): number {
  return Math.round(s.length / 4);
}

describe("prompt modules registry", () => {
  it("does not register plan-consent (soft Plan entry is tool-owned)", () => {
    expect(ALL_MODULES.some((m) => m.key === "plan-consent")).toBe(false);
  });

  it("global baseline keys stay judgment-only", () => {
    const keys = resolveStableSystemModules().map((m) => m.key).sort();
    expect(keys).toEqual(
      expect.arrayContaining(["workspace-folders", "research-reasoning", "reply-depth"]),
    );
    expect(keys).not.toContain("plan-consent");
  });

  it("global static modules stay under interim budget (P2 target ≤800)", () => {
    // research-reasoning + reply-depth still dominate; plan-consent removed (~230 tok),
    // interaction trimmed to a judgment table (~1300 -> ~300 tok, how-to moved to
    // interaction-write tool description). Remaining gap is research-reasoning + reply-depth.
    // Spec target ≤800 after P2 judgment-module trim.
    const staticGlobals = resolveStableSystemModules().filter((m) => m.prompt);
    const sum = staticGlobals.reduce((a, m) => a + approxTokens(m.prompt!), 0);
    expect(sum).toBeLessThanOrEqual(1100);
    expect(sum).toBeLessThan(1200);
  });
});
