import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promptManager } from "../../src/main/prompts";
import {
  buildPromptStackPreview,
  formatPromptStackPreviewMarkdown,
} from "../../src/main/prompts/stack-preview";
import { installProjectRule } from "../../src/main/services/rules-sync";

vi.mock("../../src/main/services/settings", () => ({
  getSettings: () => ({}),
}));

describe("prompt stack preview", () => {
  let root: string;

  beforeEach(() => {
    promptManager.invalidate();
    promptManager.initialize();
    root = mkdtempSync(join(tmpdir(), "prism-stack-preview-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("stable section excludes profile-only modules and AGENTS.md", async () => {
    const preview = await buildPromptStackPreview({
      projectRoot: root,
      userCustomPrompt: undefined,
    });
    const stable = preview.sections.find((s) => s.id === "prism-system");
    expect(stable?.content).toContain("# prismnext");
    expect(stable?.content).not.toContain("Chat paper citations");
    expect(stable?.content).not.toContain("User AGENTS");
  });

  it("includes orchestrator agent.md with profile modules", async () => {
    const preview = await buildPromptStackPreview({ projectRoot: root });
    const agent = preview.sections.find((s) => s.id === "orchestrator-agent");
    expect(agent?.content).toContain("mode: primary");
    expect(agent?.content).toContain("## Chat paper citations");
    expect(agent?.content).toContain("## Orchestrator judgment");
    expect(agent?.content).toContain("### Task delegation");
    expect(preview.orchestratorId).toBe("research-prism");
  });

  it("includes all enabled project rules in the preview", async () => {
    installProjectRule(
      root,
      "rule-a",
      `---
name: Rule A
description: A
apply: always
enabled: true
---
Body A
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
Body B
`,
    );

    const preview = await buildPromptStackPreview({ projectRoot: root });
    const rules = preview.sections.find((s) => s.id === "project-rules");
    expect(rules?.content).toContain("Rule A");
    expect(rules?.content).toContain("Body B");
    expect(rules?.injectPath).toContain("all enabled always rules");
  });

  it("formatPromptStackPreviewMarkdown lists injection paths", async () => {
    const preview = await buildPromptStackPreview({ projectRoot: root });
    const md = formatPromptStackPreviewMarkdown(preview);
    expect(md).toContain("# Prompt stack preview");
    expect(md).toContain("Pi system prompt");
    expect(md).toContain("**Inject via:**");
    expect(md).toContain("Generated preview");
  });
});
