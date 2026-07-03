import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach, vi } from "vitest";
import { installProjectRule } from "../../src/main/services/rules-sync";
import { buildPromptContext } from "../../src/main/prompts/context";

vi.mock("../../src/main/services/settings", () => ({
  getSettings: () => ({}),
}));

describe("buildPromptContext project rules", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("loads enabled always rules from RULE.md files", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-ctx-rules-"));
    installProjectRule(
      root,
      "tests",
      `---
name: tests
description: Test policy
apply: always
enabled: true
---
Run pnpm test before finishing.
`,
    );

    const ctx = await buildPromptContext(root);
    expect(ctx.customRules).toEqual([
      { name: "tests", content: "Run pnpm test before finishing." },
    ]);
  });

  it("scopes rules to orchestrator allowlist when provided", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-ctx-rules-"));
    installProjectRule(
      root,
      "rule-a",
      `---
name: Rule A
description: A
apply: always
enabled: true
---
Content A
`,
    );
    installProjectRule(
      root,
      "rule-b",
      `---
name: Rule B
description: B
apply: always
enabled: true
---
Content B
`,
    );

    const scoped = await buildPromptContext(root, { ruleAllowlist: ["Rule A"] });
    expect(scoped.customRules).toEqual([{ name: "Rule A", content: "Content A" }]);

    const all = await buildPromptContext(root);
    expect(all.customRules?.map((r) => r.name).sort()).toEqual(["Rule A", "Rule B"]);
  });
});
