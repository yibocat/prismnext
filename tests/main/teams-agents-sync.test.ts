/**
 * agents-sync golden-equivalence tests (design §7.1, plan T3).
 *
 * The new buildAgentsPlan (driven by teams/resolver.ts) must produce output
 * byte-identical to the legacy buildProjectSubagentsAgentPlan for the same
 * project, when the file-name rules coincide (core team = bare ids). This is
 * the regression guard for switching chat over to the new resolver.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProjectSubagentsAgentPlan } from "../../src/main/services/subagents-sync";
import { buildAgentsPlan, __resetAgentsSyncForTests } from "../../src/main/teams/agents-sync";
import { __resetTeamsResolverForTests } from "../../src/main/teams/resolver";
import { setAppTeamsStateDataDir } from "../../src/main/teams/state-app";

describe("agents-sync: new plan == legacy plan (golden equivalence)", () => {
  let projectRoot: string;
  let appDataDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "agents-sync-project-"));
    appDataDir = mkdtempSync(join(tmpdir(), "agents-sync-appdata-"));
    setAppTeamsStateDataDir(appDataDir);
    __resetTeamsResolverForTests();
    __resetAgentsSyncForTests();
  });

  afterEach(() => {
    setAppTeamsStateDataDir(null);
    __resetTeamsResolverForTests();
    __resetAgentsSyncForTests();
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(appDataDir, { recursive: true, force: true });
  });

  it("empty project (real core pack) produces byte-identical agent files", () => {
    const legacy = buildProjectSubagentsAgentPlan(projectRoot, { defaultSubagentModel: null });
    const next = buildAgentsPlan(projectRoot, { defaultSubagentModel: null });

    // Same file set (core team uses bare ids on both paths).
    expect([...next.agentFiles].sort()).toEqual([...legacy.agentFiles].sort());

    // Byte-identical content per file.
    const legacyByName = new Map(legacy.agentEntries.map((e) => [e.filename, e.content]));
    for (const entry of next.agentEntries) {
      const legacyContent = legacyByName.get(entry.filename);
      expect(legacyContent, `${entry.filename} missing from legacy plan`).toBeDefined();
      expect(entry.content, `${entry.filename} content drift`).toBe(legacyContent);
    }

    // Same active lead agent.
    expect(next.activeOrchestratorId).toBe(legacy.orchestratorId);
  });

  it("content hashes match the legacy plan", () => {
    const legacy = buildProjectSubagentsAgentPlan(projectRoot, { defaultSubagentModel: null });
    const next = buildAgentsPlan(projectRoot, { defaultSubagentModel: null });
    expect(next.orchestratorContentHash).toBe(legacy.orchestratorContentHash);
    expect(next.syncContentHash).toBe(legacy.syncContentHash);
  });
});
