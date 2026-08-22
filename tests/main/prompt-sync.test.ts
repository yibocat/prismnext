import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promptManager } from "../../src/main/prompts";
import { PRISM_AGENTS_REL, syncProjectPromptFile } from "../../src/main/services/prompt-sync";
import { projectAgentsMdRel } from "../../src/shared/workbench/paths";

describe("syncProjectPromptFile", () => {
  let projectRoot: string;

  beforeEach(() => {
    promptManager.invalidate();
    promptManager.initialize();
    projectRoot = mkdtempSync(join(tmpdir(), "prism-prompt-sync-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("does not write _prism-system.md into the paper folder", () => {
    syncProjectPromptFile(projectRoot, {
      agentsMdContent: "# User AGENTS\n\nCustom project note.",
      customRules: [{ name: "Tests", content: "Run pnpm test." }],
      workspaceDirs: [{ function: "manuscript", name: "manuscript", mainTex: "main.tex" }],
    });

    expect(existsSync(join(projectRoot, ".prismnext"))).toBe(false);
  });

  it("points AGENTS.md at the workbench file the agent reads", () => {
    expect(PRISM_AGENTS_REL).toBe(projectAgentsMdRel());
    expect(PRISM_AGENTS_REL).toBe(".workbench/agent/AGENTS.md");
  });
});
