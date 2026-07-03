import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  renderExpertAgentMarkdown,
  renderOrchestratorAgentMarkdown,
  syncProjectExpertsToOpencode,
  clearSyncedAgentFiles,
  listExperts,
  listOrchestrators,
  resolveOrchestratorId,
  buildTaskPermissionBlock,
  saveCustomExpert,
  deleteCustomExpert,
  setBuiltinExpertEnabled,
  resetAllBuiltinExpertsToDefaults,
} from "../../src/main/services/experts-sync";
import { readBundledOrchestratorInstructions } from "../../src/main/services/bundled-orchestrators";

describe("experts-sync", () => {
  let root: string;
  let agentsDir: string;
  let syncStatePath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-experts-"));
    agentsDir = mkdtempSync(join(tmpdir(), "prism-agents-"));
    syncStatePath = join(mkdtempSync(join(tmpdir(), "prism-sync-")), "prism-experts-sync.json");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(agentsDir, { recursive: true, force: true });
    rmSync(join(syncStatePath, ".."), { recursive: true, force: true });
  });

  it("renders subagent markdown with mode and description", () => {
    const md = renderExpertAgentMarkdown(
      {
        id: "library-scout",
        name: "Library Scout",
        description: "Search library",
        modules: ["literature-library"],
        permission: { edit: "deny", task: { "*": "deny" } },
      },
      "You search the library.",
    );
    expect(md).toContain("mode: subagent");
    expect(md).toContain("description: Search library");
    expect(md).toContain("You search the library.");
    expect(md).toContain("## Project literature library");
    expect(md).not.toMatch(/^tools:/m);
  });

  it("renders orchestrator task allowlist", () => {
    const md = renderOrchestratorAgentMarkdown(
      {
        id: "research-prism",
        name: "Research Prism",
        description: "Orchestrator",
        allowedExperts: ["citation-auditor", "literature-scout"],
      },
      "You orchestrate.",
      [
        {
          id: "citation-auditor",
          name: "Citation Auditor",
          description: "Audit citations",
        },
        {
          id: "literature-scout",
          name: "Literature Scout",
          description: "Search literature",
        },
      ],
    );
    expect(md).toContain("mode: primary");
    expect(md).toContain("citation-auditor: allow");
    expect(md).toContain('*: deny');
    expect(md).toContain("## Available experts (via Task)");
    expect(md).toContain("`citation-auditor` — Citation Auditor:");
  });

  it("buildTaskPermissionBlock denies by default", () => {
    const rules = buildTaskPermissionBlock(["literature-scout"]);
    expect(rules["*"]).toBe("deny");
    expect(rules["literature-scout"]).toBe("allow");
    expect(rules["citation-auditor"]).toBeUndefined();
  });

  it("lists bundled experts and orchestrators", () => {
    const experts = listExperts(root);
    expect(experts.some((e) => e.id === "citation-auditor")).toBe(true);
    expect(experts.some((e) => e.id === "literature-scout")).toBe(true);
    const orchestrators = listOrchestrators(root);
    expect(orchestrators.some((o) => o.id === "research-prism")).toBe(true);
  });

  it("keeps disabled built-in experts in list with enabled false", () => {
    setBuiltinExpertEnabled(root, "citation-auditor", false);
    const experts = listExperts(root);
    const disabled = experts.find((e) => e.id === "citation-auditor");
    expect(disabled).toBeTruthy();
    expect(disabled?.enabled).toBe(false);
    expect(experts.some((e) => e.id === "literature-scout" && e.enabled)).toBe(true);

    const sync = syncProjectExpertsToOpencode(root, { agentsDir, syncStatePath });
    expect(sync.agentFiles).not.toContain("citation-auditor.md");
    expect(sync.agentFiles).toContain("literature-scout.md");
  });

  it("resetAllBuiltinExpertsToDefaults re-enables disabled built-ins", () => {
    setBuiltinExpertEnabled(root, "citation-auditor", false);
    resetAllBuiltinExpertsToDefaults(root);
    const expert = listExperts(root).find((e) => e.id === "citation-auditor");
    expect(expert?.enabled).toBe(true);
  });

  it("resolves default orchestrator", () => {
    expect(resolveOrchestratorId(root, null)).toBe("research-prism");
  });

  it("syncs project experts to agents directory", () => {
    const result = syncProjectExpertsToOpencode(root, { agentsDir, syncStatePath });
    expect(result.orchestratorId).toBe("research-prism");
    expect(result.agentFiles).toContain("citation-auditor.md");
    expect(result.agentFiles).toContain("literature-scout.md");
    expect(result.agentFiles).toContain("library-scout.md");
    expect(result.agentFiles).toContain("research-prism.md");
    expect(existsSync(join(agentsDir, "citation-auditor.md"))).toBe(true);
    const orchestratorMd = readFileSync(join(agentsDir, "research-prism.md"), "utf-8");
    expect(orchestratorMd).toContain("mode: primary");
    expect(orchestratorMd).toContain("## Available experts (via Task)");
    expect(orchestratorMd).toContain("citation-auditor");
    expect(orchestratorMd).toContain("## Task delegation (orchestrator)");
    expect(orchestratorMd).toContain("## Chat paper citations");
    const bundledInstructions = readBundledOrchestratorInstructions("research-prism") ?? "";
    expect(orchestratorMd).toContain(bundledInstructions.trim());
    expect(bundledInstructions).not.toContain("## Chat paper citations");
    const libraryScoutMd = readFileSync(join(agentsDir, "library-scout.md"), "utf-8");
    expect(libraryScoutMd).toContain("## Project literature library");
    expect(libraryScoutMd).toContain("Task expert handoff (library papers)");
    const state = JSON.parse(readFileSync(syncStatePath, "utf-8"));
    expect(state.projectRoot).toBe(root);
    expect(state.agentFiles).toEqual(result.agentFiles);
  });

  it("clears previously synced agent files", () => {
    syncProjectExpertsToOpencode(root, { agentsDir, syncStatePath });
    const custom = saveCustomExpert(root, {
      name: "My Expert",
      description: "Custom",
      instructions: "Do custom things.",
    });
    syncProjectExpertsToOpencode(root, { agentsDir, syncStatePath });
    expect(existsSync(join(agentsDir, `${custom.id}.md`))).toBe(true);

    const state = JSON.parse(readFileSync(syncStatePath, "utf-8"));
    clearSyncedAgentFiles(agentsDir, state.agentFiles);
    for (const file of state.agentFiles) {
      expect(existsSync(join(agentsDir, file))).toBe(false);
    }
  });

  it("saves and deletes custom experts", () => {
    const saved = saveCustomExpert(root, {
      name: "Reviewer",
      description: "Reviews prose",
      instructions: "Review carefully.",
      modules: ["literature-library"],
    });
    expect(saved.id).toBeTruthy();
    expect(listExperts(root).some((e) => e.id === saved.id)).toBe(true);
    deleteCustomExpert(root, saved.id);
    expect(listExperts(root).some((e) => e.id === saved.id)).toBe(false);
  });

  it("replaces agent slice when switching projects", () => {
    const rootB = mkdtempSync(join(tmpdir(), "prism-experts-b-"));
    try {
      syncProjectExpertsToOpencode(root, { agentsDir, syncStatePath });
      const stateA = JSON.parse(readFileSync(syncStatePath, "utf-8"));
      clearSyncedAgentFiles(agentsDir, stateA.agentFiles);

      saveCustomExpert(rootB, {
        name: "Project B Expert",
        description: "B only",
        instructions: "B instructions.",
      });
      syncProjectExpertsToOpencode(rootB, { agentsDir, syncStatePath });
      expect(existsSync(join(agentsDir, "citation-auditor.md"))).toBe(true);
      expect(
        listExperts(rootB).some((e) => e.name === "Project B Expert"),
      ).toBe(true);
      const bFiles = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
      expect(bFiles.some((f) => f.startsWith("project-b-expert"))).toBe(true);
    } finally {
      rmSync(rootB, { recursive: true, force: true });
    }
  });
});
