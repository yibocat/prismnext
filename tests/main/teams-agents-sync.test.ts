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

  it("namespaces OpenCode agent files per project while retaining the same logical agents", () => {
    const legacy = buildProjectSubagentsAgentPlan(projectRoot, { defaultSubagentModel: null });
    const next = buildAgentsPlan(projectRoot, { defaultSubagentModel: null });

    expect(next.agentFiles).toHaveLength(legacy.agentFiles.length);
    expect(next.agentFiles.every((file) => file.startsWith(`${next.namespace}--`))).toBe(true);
    expect(next.agentFiles.map((file) => file.replace(`${next.namespace}--`, "")).sort())
      .toEqual([...legacy.agentFiles].sort());
    expect(next.activeOrchestratorId).toBe(`${next.namespace}--${legacy.orchestratorId}`);
  });

  it("uses a stable namespace per project and a distinct namespace for another project", () => {
    const first = buildAgentsPlan(projectRoot, { defaultSubagentModel: null });
    const again = buildAgentsPlan(projectRoot, { defaultSubagentModel: null });
    const otherRoot = mkdtempSync(join(tmpdir(), "agents-sync-project-"));
    try {
      const other = buildAgentsPlan(otherRoot, { defaultSubagentModel: null });
      expect(again.namespace).toBe(first.namespace);
      expect(other.namespace).not.toBe(first.namespace);
      expect(other.agentFiles).not.toEqual(first.agentFiles);
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });
});
