import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ALL_MODULES, resolveStableSystemModules } from "../../src/main/prompts";
import type { PromptModule } from "../../src/main/prompts";
import { ALL_TOOL_NAMES } from "../../src/shared/agent/tool-names";

const MODULES_DIR = join(__dirname, "../../src/main/prompts/modules");
const STABLE_CATALOG_KEYS = new Set(["workspace-folders", "research-reasoning", "reply-depth"]);

function walkCapabilityModuleSources(): Array<{ rel: string; src: string }> {
  const out: Array<{ rel: string; src: string }> = [];
  for (const entry of readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sub = join(MODULES_DIR, entry.name);
    for (const name of readdirSync(sub).filter((f) => f.endsWith(".ts"))) {
      out.push({ rel: `${entry.name}/${name}`, src: readFileSync(join(sub, name), "utf8") });
    }
  }
  return out;
}

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

  it("does not hardcode registered tool names in double-quoted module catalog lines", () => {
    const customTools = ALL_TOOL_NAMES.filter((n) => n.includes("-"));
    for (const { rel, src } of walkCapabilityModuleSources()) {
      if (!rel.endsWith("/index.ts")) continue;
      if (!src.includes("TOOL_NAMES")) continue;
      const doubleQuoted = src.match(/"[^"]*"/g) ?? [];
      for (const quoted of doubleQuoted) {
        for (const toolName of customTools) {
          expect(quoted, `${rel}: ${quoted}`).not.toContain(toolName);
        }
      }
    }
  });

  it("keeps capability modules as folders with an index facade", () => {
    const loose = readdirSync(MODULES_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts");
    expect(loose).toEqual([]);

    for (const mod of ALL_MODULES) {
      if (STABLE_CATALOG_KEYS.has(mod.key)) continue;
      expect(existsSync(join(MODULES_DIR, mod.key, "index.ts")), mod.key).toBe(true);
    }
  });

  it("module folders import internals only via their own index", () => {
    for (const { rel, src } of walkCapabilityModuleSources()) {
      expect(src, rel).not.toMatch(/from\s+["']\.\.\/[a-z0-9-]+\/(?:prompt|build)["']/);
    }
  });
});
