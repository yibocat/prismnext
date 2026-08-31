import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promptManager } from "../../src/main/prompts";
import {
  buildPromptStackPreview,
  formatPromptStackPreviewMarkdown,
} from "../../src/main/prompts/stack-preview";
import { installProjectRule } from "../../src/main/prompts/rules-sync";

vi.mock("../../src/main/app/settings", () => ({
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
    const agents = preview.sections.find((s) => s.id === "agents-md");
    expect(agents?.fileHint).toBe(".workbench/agent/AGENTS.md");
  });

  it("separates user-editable Team lead from silent built-in modules", async () => {
    const preview = await buildPromptStackPreview({ projectRoot: root });
    const lead = preview.sections.find((s) => s.id === "orchestrator-agent");
    const modules = preview.sections.find((s) => s.id === "profile-modules");
    expect(lead?.content).toContain("Active Team Lead:");
    expect(lead?.content).not.toContain("mode: primary");
    expect(lead?.content).not.toContain("## Chat paper citations");
    expect(modules?.content).toContain("## Chat paper citations");
    expect(modules?.content).toContain("## Orchestrator judgment");
    expect(modules?.content).toContain("### Task delegation");
    expect(preview.orchestratorId).toBe("research-prism");
  });

  it("liveSystemPrompt equals the joined system sections (not project rules)", async () => {
    const preview = await buildPromptStackPreview({ projectRoot: root });
    const systemIds = [
      "host-identity",
      "prism-system",
      "agents-md",
      "orchestrator-agent",
      "profile-modules",
      "task-roster",
    ];
    const joined = preview.sections
      .filter((s) => systemIds.includes(s.id) && s.content.trim())
      .map((s) => s.content.trim())
      .join("\n\n");
    expect(preview.liveSystemPrompt).toBe(joined);
    expect(preview.liveSystemPrompt).toContain("Chat paper citations");
    expect(preview.liveSystemPrompt).not.toContain("mode: primary");
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
    expect(rules?.injectPath).toContain("Each chat turn");
    expect(preview.liveSystemPrompt).not.toContain("Body A");
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
