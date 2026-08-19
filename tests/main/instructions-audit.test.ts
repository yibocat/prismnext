import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAT_CITATION_STAGING_PROMPT } from "../../src/main/prompts/modules/chat-citation-staging";
import { CITATION_AUDIT_PROMPT } from "../../src/main/prompts/modules/citation-audit";
import { RESEARCH_DESIGN_PROMPT } from "../../src/main/prompts/modules/research-design";
import { EXPERIMENTS_PROMPT } from "../../src/main/prompts/modules/experiments";
import { LITERATURE_LIBRARY_PROMPT } from "../../src/main/prompts/modules/literature-library";
import { ORCHESTRATOR_JUDGMENT_PROMPT } from "../../src/main/prompts/modules/orchestrator-judgment";
import { buildLatexWorkspacePrompt } from "../../src/main/prompts/modules/latex-workspace";
import type { PromptContext } from "../../src/main/prompts/types";

/** Core-pack 内容目录（Phase 2 起内置 agents 位于 core pack 内）。 */
const CORE_PACK_DIR = join(process.cwd(), "resources", "teams", "prismnext.core");

function getCoreAgentsDir(kind: "subagents" | "orchestrators"): string {
  return join(CORE_PACK_DIR, kind);
}

function readCoreAgentInstructions(
  kind: "subagents" | "orchestrators",
  id: string,
): string | null {
  const path = join(CORE_PACK_DIR, kind, id, "instructions.md");
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

/** Binding tables and module headings must live in Knowledge Modules, not Instructions. */
const MODULE_BINDING_MARKERS = [
  "| bibkey | Title | Year |",
  "| refId | Title | Year |",
  "### Workflow (binding)",
  "### Citing in chat (binding)",
  "### Citing library papers in chat (binding)",
  "### Task expert handoff (library papers)",
  "### Task expert handoff (external papers)",
  "### Task expert handoff (experiments)",
  "### Orchestrator after library Tasks",
  "### Orchestrator after external literature Tasks",
  "### Orchestrator judgment",
];

function listBuiltinInstructionPaths(baseDir: string, kind: "subagents" | "orchestrators"): string[] {
  const entries = readdirSync(baseDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => join(baseDir, e.name, "instructions.md"))
    .filter((path) => {
      try {
        readFileSync(path, "utf-8");
        return true;
      } catch {
        return false;
      }
    });
}

describe("builtin instructions audit (Phase 1.3)", () => {
  it("orchestrator instructions omit module binding text", () => {
    const body = readCoreAgentInstructions("orchestrators", "research-prism");
    expect(body).toBeTruthy();
    for (const marker of MODULE_BINDING_MARKERS) {
      expect(body!).not.toContain(marker);
    }
    expect(body).toContain("capability modules");
  });

  it("all five built-in subagent instructions omit module binding text", () => {
    for (const id of ["literature-synthesizer", "research-design-coach", "methodology-auditor", "structure-diagnostician", "peer-reviewer"]) {
      const body = readCoreAgentInstructions("subagents", id);
      expect(body, id).toBeTruthy();
      for (const marker of MODULE_BINDING_MARKERS) {
        expect(body!, `${id} should not contain ${marker}`).not.toContain(marker);
      }
    }
  });

  it("knowledge modules cover citation and Task handoff workflows", () => {
    expect(LITERATURE_LIBRARY_PROMPT).toContain("[@bibkey]");
    expect(LITERATURE_LIBRARY_PROMPT).toContain("Task handoff");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("[n]");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("Task handoff");
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("see that tool");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Available subagents (via Task)");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Do not search the project");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).not.toContain("@peer-reviewer");
    expect(CITATION_AUDIT_PROMPT).toContain("When this applies");
    expect(CITATION_AUDIT_PROMPT).toContain("citation-health");
    expect(CITATION_AUDIT_PROMPT).toContain("peer-reviewer");
    expect(RESEARCH_DESIGN_PROMPT).toContain("research-brief-read");
    expect(RESEARCH_DESIGN_PROMPT).toContain("research-design-coach");
    expect(RESEARCH_DESIGN_PROMPT).toContain("Project brief");
    expect(EXPERIMENTS_PROMPT).toContain("Soft workflow");
    expect(EXPERIMENTS_PROMPT).toContain("experiment-log");
    expect(EXPERIMENTS_PROMPT).toContain("experiment-run");
    expect(EXPERIMENTS_PROMPT).toContain("results-snapshot");
    expect(EXPERIMENTS_PROMPT).toContain("methodology-auditor");
    expect(EXPERIMENTS_PROMPT).not.toContain("uv pip --system");
    expect(EXPERIMENTS_PROMPT).not.toContain("### Workflow (binding)");
    const latex = buildLatexWorkspacePrompt({} as PromptContext);
    expect(latex).toContain("Soft workflow");
    expect(latex).toContain("latex-compile");
    expect(latex).toContain(".prismnext/compile/");
    expect(latex).not.toContain("pdflatex");
    expect(latex).not.toContain("forbidden");
  });

  it("no instructions.md under bundled resources duplicates removed academic modules", () => {
    const expertPaths = listBuiltinInstructionPaths(getCoreAgentsDir("subagents"), "subagents");
    const orchestratorPaths = listBuiltinInstructionPaths(getCoreAgentsDir("orchestrators"), "orchestrators");
    const staleModulePhrases = [
      "## Academic Writing",
      "## Citations & Bibliography",
      "## Figures & Tables",
      "## Math & Equations",
    ];
    for (const path of [...expertPaths, ...orchestratorPaths]) {
      const text = readFileSync(path, "utf-8");
      for (const phrase of staleModulePhrases) {
        expect(text, path).not.toContain(phrase);
      }
    }
  });
});
