import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  BUILTIN_DEFAULT_PROJECT_DIRNAME,
  HOME_SETTINGS_FILENAME,
  PROJECT_META_DIR,
  projectAgentsMdRel,
  projectProvenanceRel,
  projectResearchPlansRel,
  projectRulesRel,
  projectSessionsContextRel,
  projectSessionsDisplayRel,
  projectSlotMetaRel,
  projectTerminalDirRel,
} from "../../src/shared/workbench/paths";
import { resolveWorkbenchHome, setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import {
  ensureDefaultProject,
  getWorkbenchState,
  openWorkbenchFolder,
  resolveBuiltinDefaultProjectPath,
  setDefaultFromFolder,
  setDefaultProjectId,
} from "../../src/main/workbench/default-project";
import { ensureProjectContentMigrated } from "../../src/main/teams/migrate-project-content";
import { ensureDefaultMcpServers } from "../../src/main/services/project-mcp-defaults";
import { readWritableTeamMcpJson } from "../../src/main/services/team-mcp-files";
import { buildProjectSubagentsAgentPlan } from "../../src/main/services/subagents-sync";
import { readWorkbenchJson } from "../../src/main/workbench/identity";
import { installProjectRule } from "../../src/main/services/rules-sync";
import { appendProvenanceEvent } from "../../src/main/experiment/provenance-service";
import { saveConfig as saveTerminalConfig } from "../../src/main/terminal/terminal-config";
import { ensureResearchPlansDir } from "../../src/main/research/research-plan-service";
import { appendUserDisplay } from "../../src/main/session/session-display-store";
import { persistSessionContext } from "../../src/main/session/session-context-store";
import { writeInteractionSpec } from "../../src/main/interaction/interaction-store";
import {
  buildExperimentStorageContext,
  createExperiment,
} from "../../src/main/experiment/facade";
import { INTERACTION_SPEC_DIR_REL } from "../../src/shared/interaction/spec";
import { EXPERIMENT_REGISTRY_REL } from "../../src/shared/experiments/log";

const temps: string[] = [];

afterEach(() => {
  setWorkbenchUserHomeOverride(null);
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-default-"));
  temps.push(dir);
  return dir;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

describe("resolveBuiltinDefaultProjectPath", () => {
  it("joins the platform Documents directory with PrismNext", () => {
    const documentsDir = path.join(tmpRoot(), "Docs");
    const resolved = resolveBuiltinDefaultProjectPath({ documentsDir });
    expect(resolved.endsWith(`/${BUILTIN_DEFAULT_PROJECT_DIRNAME}`)).toBe(true);
    expect(resolved).toBe(
      path.resolve(documentsDir, BUILTIN_DEFAULT_PROJECT_DIRNAME).replace(/\\/g, "/").replace(/\/+$/, ""),
    );
  });
});

describe("ensureDefaultProject", () => {
  it("creates the builtin folder, workbench.json, slot meta, and home settings", () => {
    const userHome = path.join(tmpRoot(), "Users", "me");
    const documentsDir = path.join(userHome, "Documents");
    const first = ensureDefaultProject({ homeDir: userHome, documentsDir });

    const projectRoot = path.join(documentsDir, BUILTIN_DEFAULT_PROJECT_DIRNAME);
    expect(first.lastPath).toBe(path.resolve(projectRoot).replace(/\\/g, "/").replace(/\/+$/, ""));
    expect(first.projectId.startsWith("p_")).toBe(true);

    const json = readWorkbenchJson(first.lastPath);
    expect(json?.id).toBe(first.projectId);
    expect(json && "lastPath" in json).toBe(false);

    const gitignore = fs.readFileSync(
      path.join(first.lastPath, PROJECT_META_DIR, ".gitignore"),
      "utf-8",
    );
    expect(gitignore).toMatch(/compile\//);
    expect(gitignore).toMatch(/\.venv\//);
    expect(gitignore).toMatch(/interactions\//);
    expect(fs.existsSync(path.join(first.lastPath, PROJECT_META_DIR, "compile"))).toBe(true);
    expect(fs.readFileSync(path.join(first.lastPath, PROJECT_META_DIR, "agent", "AGENTS.md"), "utf-8")).toBe("");

    const home = resolveWorkbenchHome({ homeDir: userHome });
    const settings = readJson(path.join(home, HOME_SETTINGS_FILENAME)) as {
      defaultProjectId: string;
      workbenchProjectIds: string[];
    };
    expect(settings.defaultProjectId).toBe(first.projectId);
    expect(settings.workbenchProjectIds).toEqual([first.projectId]);

    const meta = readJson(path.join(home, projectSlotMetaRel(first.projectId))) as {
      lastPath: string;
    };
    expect(meta.lastPath).toBe(first.lastPath);

    const second = ensureDefaultProject({ homeDir: userHome, documentsDir });
    expect(second).toEqual(first);
  });

  it("does not adopt a leftover paper folder as the default", () => {
    const userHome = path.join(tmpRoot(), "Users", "me");
    const documentsDir = path.join(userHome, "Documents");
    const leftover = path.join(userHome, "old-paper");
    fs.mkdirSync(leftover, { recursive: true });

    const created = ensureDefaultProject({ homeDir: userHome, documentsDir });
    expect(created.lastPath).not.toBe(path.resolve(leftover).replace(/\\/g, "/").replace(/\/+$/, ""));
    expect(created.lastPath.endsWith(`/${BUILTIN_DEFAULT_PROJECT_DIRNAME}`)).toBe(true);
  });
});

describe("change default role (D-19)", () => {
  it("marks another folder as default without rebinding the old id", () => {
    const userHome = path.join(tmpRoot(), "Users", "me");
    const documentsDir = path.join(userHome, "Documents");
    const first = ensureDefaultProject({ homeDir: userHome, documentsDir });
    const other = path.join(tmpRoot(), "other-paper");
    fs.mkdirSync(other, { recursive: true });

    const next = setDefaultFromFolder(other, { homeDir: userHome, documentsDir });
    expect(next.projectId).not.toBe(first.projectId);
    expect(next.lastPath).toBe(path.resolve(other).replace(/\\/g, "/").replace(/\/+$/, ""));

    expect(readWorkbenchJson(first.lastPath)?.id).toBe(first.projectId);
    expect(readWorkbenchJson(next.lastPath)?.id).toBe(next.projectId);

    const state = getWorkbenchState({ homeDir: userHome, documentsDir });
    expect(state.defaultProjectId).toBe(next.projectId);
    expect(state.defaultLastPath).toBe(next.lastPath);
    expect(state.workbenchProjectIds).toEqual(expect.arrayContaining([first.projectId, next.projectId]));
    expect(state.workbenchProjectIds).toHaveLength(2);

    setDefaultProjectId(first.projectId, { homeDir: userHome, documentsDir });
    const back = getWorkbenchState({ homeDir: userHome, documentsDir });
    expect(back.defaultProjectId).toBe(first.projectId);
    expect(back.defaultLastPath).toBe(first.lastPath);
    expect(readWorkbenchJson(next.lastPath)?.id).toBe(next.projectId);
  });
});

describe("open folder does not seed paper .prismnext", () => {
  it("stays free of .prismnext after open + catalog/MCP/agent-plan (no experiments)", () => {
    const userHome = path.join(tmpRoot(), "Users", "me");
    const documentsDir = path.join(userHome, "Documents");
    const folder = path.join(tmpRoot(), "opened-paper");
    fs.mkdirSync(folder, { recursive: true });

    const opened = openWorkbenchFolder(folder, { homeDir: userHome, documentsDir });
    expect(fs.existsSync(path.join(opened.lastPath, projectAgentsMdRel()))).toBe(true);

    expect(ensureProjectContentMigrated(opened.lastPath)).toBe(false);
    const mcp = ensureDefaultMcpServers(path.join(opened.lastPath, PROJECT_META_DIR, "agent"));
    expect(mcp.added).toBe(false);
    expect(readWritableTeamMcpJson(opened.lastPath, "project.local")).toBe("[]\n");
    buildProjectSubagentsAgentPlan(opened.lastPath, { defaultSubagentModel: null });

    expect(fs.existsSync(path.join(opened.lastPath, ".prismnext"))).toBe(false);
  });

  it("live experiment/rule/interaction/session writes stay under .workbench", () => {
    const userHome = path.join(tmpRoot(), "Users", "me");
    const documentsDir = path.join(userHome, "Documents");
    const folder = path.join(tmpRoot(), "live-paper");
    fs.mkdirSync(folder, { recursive: true });
    const opened = openWorkbenchFolder(folder, { homeDir: userHome, documentsDir });
    const root = opened.lastPath;

    installProjectRule(root, "cite-style", "---\nname: Cite\ndescription: Cite\napply: always\nenabled: true\n---\nUse Nature.\n");
    appendProvenanceEvent(root, {
      id: "prov_test",
      schemaVersion: 1,
      type: "run_recorded",
      at: "2026-08-21T00:00:00.000Z",
      workspaceRel: ".",
      chatSessionId: null,
      gitBranch: null,
      gitCommit: null,
      experimentId: null,
      runId: "run_1",
      command: "echo hi",
      cwd: ".",
      exitCode: 0,
      startedAt: "2026-08-21T00:00:00.000Z",
      finishedAt: "2026-08-21T00:00:01.000Z",
      env: { python: null, pythonVersion: null, platform: "darwin", gitCommit: null },
      artifacts: [],
      stdoutTailBytes: 0,
      stderrTailBytes: 0,
    });
    saveTerminalConfig(root, { quickCommands: [] });
    ensureResearchPlansDir(root);
    appendUserDisplay(root, "ses_1", [{ type: "text", text: "hi" }]);
    persistSessionContext(root, "ses_1", { tokens: 12, updatedAt: Date.now() });

    const ix = writeInteractionSpec(root, {
      id: "fig.live",
      title: "Live",
      kind: "figure.static",
      compute: "local",
      revision: 1,
    });
    expect(ix.ok).toBe(true);

    fs.mkdirSync(path.join(root, "experiment"), { recursive: true });
    const created = createExperiment(
      buildExperimentStorageContext(root, "experiment"),
      { title: "Live write" },
      { ensureVenv: false },
    );
    expect(created.ok).toBe(true);

    expect(fs.existsSync(path.join(root, projectRulesRel(), "cite-style", "RULE.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, projectProvenanceRel()))).toBe(true);
    expect(fs.existsSync(path.join(root, projectTerminalDirRel(), "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, projectResearchPlansRel()))).toBe(true);
    expect(fs.existsSync(path.join(root, projectSessionsDisplayRel()))).toBe(true);
    expect(fs.existsSync(path.join(root, projectSessionsContextRel()))).toBe(true);
    expect(fs.existsSync(path.join(root, INTERACTION_SPEC_DIR_REL, "fig.live", "spec.json"))).toBe(true);
    if (created.ok) {
      expect(fs.existsSync(path.join(root, EXPERIMENT_REGISTRY_REL, created.id, "meta.json"))).toBe(true);
    }
    expect(fs.existsSync(path.join(root, ".prismnext"))).toBe(false);
  });
});
