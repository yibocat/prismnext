import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  renderExpertAgentMarkdown,
  renderOrchestratorAgentMarkdown,
  buildProjectExpertsAgentPlan,
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
  saveBuiltinOrchestratorOverride,
  appendAllowedExpertsSection,
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
        id: "literature-synthesizer",
        name: "Literature Synthesizer",
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
        name: "prismnext",
        description: "Orchestrator",
        allowedExperts: ["peer-reviewer", "research-design-coach"],
      },
      "You orchestrate.",
      [
        {
          id: "peer-reviewer",
          name: "Peer Reviewer",
          description: "Audit citations",
        },
        {
          id: "research-design-coach",
          name: "Research Design Coach",
          description: "Search literature",
        },
      ],
    );
    expect(md).toContain("mode: primary");
    expect(md).toContain("peer-reviewer: allow");
    expect(md).toContain('*: deny');
    expect(md).toContain("## Available experts (via Task)");
    expect(md).toContain("`peer-reviewer` — Peer Reviewer:");
  });

  it("buildTaskPermissionBlock denies by default", () => {
    const rules = buildTaskPermissionBlock(["research-design-coach"]);
    expect(rules["*"]).toBe("deny");
    expect(rules.general).toBe("deny");
    expect(rules["research-design-coach"]).toBe("allow");
    expect(rules["peer-reviewer"]).toBeUndefined();
  });

  it("empty allowedExperts override yields no task allows and explicit prompt", () => {
    saveBuiltinOrchestratorOverride(root, {
      orchestratorId: "research-prism",
      allowedExperts: [],
    });
    const sync = syncProjectExpertsToOpencode(root, { agentsDir, syncStatePath });
    const orchestratorMd = readFileSync(join(agentsDir, "research-prism.md"), "utf-8");
    expect(orchestratorMd).toContain("No experts are currently allowed");
    expect(orchestratorMd).not.toContain("peer-reviewer: allow");
    expect(sync.agentFiles).toContain("research-prism.md");
    const section = appendAllowedExpertsSection("body", []);
    expect(section).toContain("No experts are currently allowed");
  });

  it("lists bundled experts and orchestrators", () => {
    const experts = listExperts(root);
    expect(experts.some((e) => e.id === "peer-reviewer")).toBe(true);
    expect(experts.some((e) => e.id === "research-design-coach")).toBe(true);
    const orchestrators = listOrchestrators(root);
    expect(orchestrators.some((o) => o.id === "research-prism")).toBe(true);
  });

  it("keeps disabled built-in experts in list with enabled false", () => {
    setBuiltinExpertEnabled(root, "peer-reviewer", false);
    const experts = listExperts(root);
    const disabled = experts.find((e) => e.id === "peer-reviewer");
    expect(disabled).toBeTruthy();
    expect(disabled?.enabled).toBe(false);
    expect(experts.some((e) => e.id === "research-design-coach" && e.enabled)).toBe(true);

    const sync = syncProjectExpertsToOpencode(root, { agentsDir, syncStatePath });
    expect(sync.agentFiles).not.toContain("peer-reviewer.md");
    expect(sync.agentFiles).toContain("research-design-coach.md");
  });

  it("resetAllBuiltinExpertsToDefaults re-enables disabled built-ins", () => {
    setBuiltinExpertEnabled(root, "peer-reviewer", false);
    resetAllBuiltinExpertsToDefaults(root);
    const expert = listExperts(root).find((e) => e.id === "peer-reviewer");
    expect(expert?.enabled).toBe(true);
  });

  it("resolves default orchestrator", () => {
    expect(resolveOrchestratorId(root, null)).toBe("research-prism");
  });

  it("buildProjectExpertsAgentPlan produces stable syncContentHash", () => {
    const first = buildProjectExpertsAgentPlan(root);
    const second = buildProjectExpertsAgentPlan(root);
    expect(first.syncContentHash).toBe(second.syncContentHash);
    expect(first.agentFiles.length).toBeGreaterThan(0);
  });

  it("syncs project experts to agents directory", () => {
    const result = syncProjectExpertsToOpencode(root, { agentsDir, syncStatePath });
    expect(result.orchestratorId).toBe("research-prism");
    expect(result.agentFiles).toContain("peer-reviewer.md");
    expect(result.agentFiles).toContain("research-design-coach.md");
    expect(result.agentFiles).toContain("literature-synthesizer.md");
    expect(result.agentFiles).toContain("research-prism.md");
    expect(existsSync(join(agentsDir, "peer-reviewer.md"))).toBe(true);
    const orchestratorMd = readFileSync(join(agentsDir, "research-prism.md"), "utf-8");
    expect(orchestratorMd).toContain("mode: primary");
    expect(orchestratorMd).toContain("## Available experts (via Task)");
    expect(orchestratorMd).toContain("peer-reviewer");
    expect(orchestratorMd).toContain("## Task delegation (orchestrator)");
    expect(orchestratorMd).toContain("## Chat paper citations");
    const bundledInstructions = readBundledOrchestratorInstructions("research-prism") ?? "";
    expect(orchestratorMd).toContain(bundledInstructions.trim());
    expect(bundledInstructions).not.toContain("## Chat paper citations");
    const synthesizerMd = readFileSync(join(agentsDir, "literature-synthesizer.md"), "utf-8");
    expect(synthesizerMd).toContain("## Project literature library");
    expect(synthesizerMd).toContain("Task expert handoff (library papers)");
    const state = JSON.parse(readFileSync(syncStatePath, "utf-8"));
    expect(state.projectRoot).toBe(root);
    expect(state.agentFiles).toEqual(result.agentFiles);
    expect(state.syncContentHash).toBe(result.syncContentHash);
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
      expect(existsSync(join(agentsDir, "peer-reviewer.md"))).toBe(true);
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
