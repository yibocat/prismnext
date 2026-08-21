import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import {
  deleteProjectRule,
  getPromptProjectRules,
  installProjectRule,
  listProjectRules,
  setProjectRuleEnabled,
} from "../../src/main/services/rules-sync";

describe("rules-sync", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("lists rules from subdirectories with RULE.md", () => {
    root = mkdtempSync(join(tmpdir(), "prism-rules-"));
    const ruleDir = join(root, ".workbench/agent/rules/latex-style");
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      join(ruleDir, "RULE.md"),
      `---
name: latex-style
description: LaTeX writing style
apply: always
enabled: true
---
# Style

Use \\cite{} for references.
`,
      "utf-8",
    );

    const rules = listProjectRules(root);
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("latex-style");
    expect(rules[0].name).toBe("latex-style");
    expect(rules[0].description).toBe("LaTeX writing style");
    expect(rules[0].apply).toBe("always");
    expect(rules[0].enabled).toBe(true);
  });

  it("installProjectRule writes RULE.md under rules/<id>/", () => {
    root = mkdtempSync(join(tmpdir(), "prism-rules-"));
    const content = `---
name: tests
description: Test policy
apply: always
enabled: true
---
Run pnpm test before finishing.
`;
    installProjectRule(root, "tests", content);

    const path = join(root, ".workbench/agent/rules/tests/RULE.md");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toContain("Run pnpm test");
  });

  it("setProjectRuleEnabled updates frontmatter enabled field", () => {
    root = mkdtempSync(join(tmpdir(), "prism-rules-"));
    installProjectRule(
      root,
      "tests",
      `---
name: tests
description: Test policy
apply: always
enabled: true
---
Body
`,
    );

    setProjectRuleEnabled(root, "tests", false);
    const updated = readFileSync(join(root, ".workbench/agent/rules/tests/RULE.md"), "utf-8");
    expect(updated).toMatch(/enabled:\s*false/);
    expect(listProjectRules(root)[0].enabled).toBe(false);
  });

  it("deleteProjectRule removes the rule directory", () => {
    root = mkdtempSync(join(tmpdir(), "prism-rules-"));
    installProjectRule(root, "gone", "---\nname: gone\ndescription: x\napply: always\nenabled: true\n---\n");
    deleteProjectRule(root, "gone");
    expect(existsSync(join(root, ".workbench/agent/rules/gone"))).toBe(false);
  });

  it("getPromptProjectRules returns only enabled always rules with body", () => {
    root = mkdtempSync(join(tmpdir(), "prism-rules-"));
    installProjectRule(
      root,
      "active",
      `---
name: active
description: Active rule
apply: always
enabled: true
---
Active body
`,
    );
    installProjectRule(
      root,
      "disabled",
      `---
name: disabled
description: Off
apply: always
enabled: false
---
Should not inject
`,
    );
    installProjectRule(
      root,
      "glob-rule",
      `---
name: glob-rule
description: Glob only
apply: glob
enabled: true
---
Glob body
`,
    );

    const promptRules = getPromptProjectRules(root);
    expect(promptRules).toHaveLength(1);
    expect(promptRules[0].name).toBe("active");
    expect(promptRules[0].content).toContain("Active body");
  });

  it("getPromptProjectRules filters by allowlist name or id", () => {
    root = mkdtempSync(join(tmpdir(), "prism-rules-"));
    installProjectRule(
      root,
      "style-a",
      `---
name: Style A
description: A
apply: always
enabled: true
---
Body A
`,
    );
    installProjectRule(
      root,
      "style-b",
      `---
name: Style B
description: B
apply: always
enabled: true
---
Body B
`,
    );

    const all = getPromptProjectRules(root);
    expect(all).toHaveLength(2);

    const scoped = getPromptProjectRules(root, { allowlist: ["Style A"] });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].name).toBe("Style A");

    const byId = getPromptProjectRules(root, { allowlist: ["style-b"] });
    expect(byId).toHaveLength(1);
    expect(byId[0].content).toContain("Body B");

    expect(getPromptProjectRules(root, { allowlist: [] })).toHaveLength(2);
    expect(getPromptProjectRules(root, { allowlist: ["missing"] })).toHaveLength(0);
  });
});
