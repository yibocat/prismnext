import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ALL_MODULES } from "../../src/main/prompts/modules";
import { resolveStableSystemModules } from "../../src/main/prompts/resolve-active-modules";
import type { PromptModule } from "../../src/main/prompts/types";
import { ALL_TOOL_NAMES } from "../../src/shared/tool-names";

function approxTokens(s: string): number {
  return Math.round(s.length / 4);
}

function modulePromptText(mod: PromptModule): string {
  if (mod.build) return mod.build({});
  return mod.prompt ?? "";
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
    // research-reasoning + reply-depth dominate; Interaction is profile-only.
    const staticGlobals = resolveStableSystemModules().filter((m) => m.prompt);
    const sum = staticGlobals.reduce((a, m) => a + approxTokens(m.prompt!), 0);
    expect(sum).toBeLessThanOrEqual(1400);
  });

  it("resolves TOOL_NAMES in module prompts (no literal ${TOOL_NAMES...} leaks)", () => {
    for (const mod of ALL_MODULES) {
      const text = modulePromptText(mod);
      if (!text) continue;
      expect(text, mod.key).not.toMatch(/\$\{TOOL_NAMES/);
    }
  });

  it("does not hardcode registered tool names in double-quoted module prompt lines", () => {
    const customTools = ALL_TOOL_NAMES.filter((n) => n.includes("-"));
    const dir = join(__dirname, "../../src/main/prompts/modules");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
      const src = readFileSync(join(dir, file), "utf8");
      if (!src.includes("TOOL_NAMES")) continue;
      const doubleQuoted = src.match(/"[^"]*"/g) ?? [];
      for (const quoted of doubleQuoted) {
        for (const toolName of customTools) {
          expect(quoted, `${file}: ${quoted}`).not.toContain(toolName);
        }
      }
    }
  });
});
