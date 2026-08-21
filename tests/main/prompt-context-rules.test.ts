import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach, vi } from "vitest";
import { installProjectRule } from "../../src/main/services/rules-sync";
import { buildPromptContext } from "../../src/main/prompts/context";
import { projectAgentsMdRel } from "../../src/shared/workbench-paths";

vi.mock("../../src/main/services/settings", () => ({
  getSettings: () => ({}),
}));

describe("buildPromptContext project rules", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("loads all enabled always rules from RULE.md files", async () => {
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
    installProjectRule(
      root,
      "citations",
      `---
name: citations
description: Cite policy
apply: always
enabled: true
---
Always use \\cite{}.
`,
    );

    const ctx = await buildPromptContext(root);
    expect(ctx.customRules?.map((r) => r.name).sort()).toEqual(["citations", "tests"]);
  });

  it("reads AGENTS.md from .workbench, not .prismnext", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-ctx-agents-"));
    mkdirSync(join(root, ".prismnext", "agent"), { recursive: true });
    writeFileSync(join(root, ".prismnext", "agent", "AGENTS.md"), "# leftover\n");
    mkdirSync(join(root, ".workbench", "agent"), { recursive: true });
    writeFileSync(join(root, projectAgentsMdRel()), "# workbench agents\n");

    const ctx = await buildPromptContext(root);
    expect(ctx.agentsMdContent).toContain("workbench agents");
    expect(ctx.agentsMdContent).not.toContain("leftover");
  });
});
