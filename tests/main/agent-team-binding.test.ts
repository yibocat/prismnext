import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TeamSource } from "../../src/shared/teams/types";
import {
  __resetTeamsResolverForTests,
  __setHostVersionForTests,
} from "../../src/main/teams/resolver";
import {
  registerExternalTeamRoot,
  unregisterExternalTeamRoot,
} from "../../src/main/teams/catalog";
import { setAppTeamsDirForTests } from "../../src/main/teams/scope";
import { emptyAppTeamsState } from "../../src/shared/teams/state";
import {
  readAppTeamsState,
  setAppAssetEnabled,
  setAppTeamsStateDataDir,
  writeAppTeamsState,
} from "../../src/main/teams/state-app";
import {
  setProjectDefaultTeam,
  setProjectTeamEnabled,
} from "../../src/main/teams/state-project";
import {
  deriveExpertAllowedTools,
  parseModelRef,
  resolveTeamPiBinding,
} from "../../src/main/agent/team-binding";

describe("agent-team-binding (TeamResolver → Pi Adapter)", () => {
  let tmp: string;
  let appDataDir: string;
  let projectRoot: string;
  let emptyBundledDir: string;
  const externalRoots: string[] = [];

  function useExternalRoot(source: TeamSource = "bundled"): string {
    const root = mkdtempSync(join(tmpdir(), "teams-ext-"));
    registerExternalTeamRoot(root, source);
    externalRoots.push(root);
    return root;
  }

  function markInstalled(...teamIds: string[]): void {
    const state = readAppTeamsState();
    const installed = [...state.installed];
    for (const teamId of teamIds) {
      if (!installed.some((r) => r.teamId === teamId)) {
        installed.push({ teamId, installedAt: new Date().toISOString() });
      }
    }
    writeAppTeamsState({ ...state, installed });
  }

  function writeTeam(
    root: string,
    teamId: string,
    opts: {
      tier?: "free" | "pro";
      minHostVersion?: string;
      orchestrator?: {
        id: string;
        model?: string;
        thoughtLevel?: string;
        temperature?: number;
        roster?: unknown;
        allowedSkills?: unknown;
      };
      subagents?: Array<{
        id: string;
        model?: string;
        thoughtLevel?: string;
        temperature?: number;
      }>;
      skills?: string[];
      commands?: string[];
      mcps?: Array<{ id: string; name: string }>;
    } = {},
  ): string {
    const dir = join(root, teamId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "team.json"),
      JSON.stringify({
        id: teamId,
        name: `${teamId} Name`,
        description: `${teamId} desc`,
        version: "0.1.0",
        tier: opts.tier ?? "free",
        publisher: "test",
        ...(opts.minHostVersion ? { minHostVersion: opts.minHostVersion } : {}),
      }),
    );
    if (opts.orchestrator) {
      const odir = join(dir, "orchestrator");
      mkdirSync(odir, { recursive: true });
      writeFileSync(
        join(odir, "orchestrator.json"),
        JSON.stringify({
          id: opts.orchestrator.id,
          name: `${opts.orchestrator.id} Lead`,
          description: "lead description",
          ...(opts.orchestrator.model ? { model: opts.orchestrator.model } : {}),
          ...(opts.orchestrator.thoughtLevel ? { thoughtLevel: opts.orchestrator.thoughtLevel } : {}),
          ...(opts.orchestrator.temperature !== undefined ? { temperature: opts.orchestrator.temperature } : {}),
          ...(opts.orchestrator.roster !== undefined ? { roster: opts.orchestrator.roster } : {}),
          ...(opts.orchestrator.allowedSkills !== undefined
            ? { allowedSkills: opts.orchestrator.allowedSkills }
            : {}),
        }),
      );
      writeFileSync(join(odir, "instructions.md"), `Lead instructions for ${teamId}`);
    }
    for (const s of opts.subagents ?? []) {
      const sdir = join(dir, "subagents", s.id);
      mkdirSync(sdir, { recursive: true });
      writeFileSync(
        join(sdir, "subagent.json"),
        JSON.stringify({
          id: s.id,
          name: `${s.id} Expert`,
          description: `${s.id} desc`,
          ...(s.model ? { model: s.model } : {}),
          ...(s.thoughtLevel ? { thoughtLevel: s.thoughtLevel } : {}),
          ...(s.temperature !== undefined ? { temperature: s.temperature } : {}),
        }),
      );
      writeFileSync(join(sdir, "instructions.md"), `${s.id} expert instructions`);
    }
    for (const sk of opts.skills ?? []) {
      const skdir = join(dir, "skills", sk);
      mkdirSync(skdir, { recursive: true });
      writeFileSync(join(skdir, "SKILL.md"), `---\nname: ${sk}\ndescription: ${sk}\n---\n\nbody\n`);
    }
    for (const c of opts.commands ?? []) {
      mkdirSync(join(dir, "commands"), { recursive: true });
      writeFileSync(join(dir, "commands", `${c}.md`), `---\ndescription: ${c}\n---\n\nbody\n`);
    }
    if (opts.mcps) {
      writeFileSync(
        join(dir, "mcp.json"),
        JSON.stringify(
          opts.mcps.map((m) => ({
            id: m.id,
            name: m.name,
            transport: { type: "stdio", command: "node", args: ["-v"] },
          })),
        ),
      );
    }
    markInstalled(teamId);
    return dir;
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "agent-team-binding-test-"));
    appDataDir = mkdtempSync(join(tmpdir(), "agent-appdata-"));
    projectRoot = mkdtempSync(join(tmpdir(), "agent-project-"));
    emptyBundledDir = mkdtempSync(join(tmpdir(), "agent-bundled-empty-"));
    process.env.PRISM_FIRST_PARTY_TEAMS_DIR = emptyBundledDir;

    setAppTeamsStateDataDir(appDataDir);
    writeAppTeamsState(emptyAppTeamsState());

    const appTeamsDir = join(tmp, "app-teams");
    mkdirSync(appTeamsDir, { recursive: true });
    setAppTeamsDirForTests(appTeamsDir);

    __setHostVersionForTests("0.7.2");
    __resetTeamsResolverForTests();
  });

  afterEach(() => {
    for (const r of externalRoots) {
      unregisterExternalTeamRoot(r);
    }
    externalRoots.length = 0;
    delete process.env.PRISM_FIRST_PARTY_TEAMS_DIR;
    __setHostVersionForTests(undefined);
    __resetTeamsResolverForTests();
    try {
      rmSync(tmp, { recursive: true, force: true });
      rmSync(appDataDir, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(emptyBundledDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in tests
    }
  });

  it("parses model references correctly", () => {
    expect(parseModelRef("anthropic/claude-3-7-sonnet")).toEqual({
      provider: "anthropic",
      modelId: "claude-3-7-sonnet",
    });
    expect(parseModelRef("openai/gpt-4.5-preview")).toEqual({
      provider: "openai",
      modelId: "gpt-4.5-preview",
    });
    expect(parseModelRef("bare-model-name")).toBeUndefined();
    expect(parseModelRef("")).toBeUndefined();
    expect(parseModelRef(undefined)).toBeUndefined();
  });

  it("resolves active team lead, instructions, and roster into immutable Pi config", () => {
    const root = useExternalRoot();
    writeTeam(root, "research-team", {
      orchestrator: {
        id: "chief-scientist",
        model: "anthropic/claude-3-7-sonnet",
        thoughtLevel: "high",
        temperature: 0.2,
        roster: { mode: "all" },
      },
      subagents: [
        { id: "citation-checker", model: "openai/gpt-4o-mini" },
        { id: "stats-analyst" },
      ],
      skills: ["search-arxiv"],
      commands: ["export-pdf"],
      mcps: [{ id: "mcp-academic", name: "Academic" }],
    });

    setProjectDefaultTeam(projectRoot, "research-team");

    const binding = resolveTeamPiBinding({ projectRoot });
    expect(binding.ok).toBe(true);
    expect(binding.lead).toBeDefined();
    expect(binding.lead?.teamId).toBe("research-team");
    expect(binding.lead?.fqid).toBe("research-team:orchestrator");
    expect(binding.lead?.name).toBe("chief-scientist Lead");
    expect(binding.lead?.instructions).toBe("Lead instructions for research-team");
    expect(binding.lead?.modelRef).toEqual({
      provider: "anthropic",
      modelId: "claude-3-7-sonnet",
    });
    expect(binding.lead?.thoughtLevel).toBe("high");
    expect(binding.lead?.temperature).toBe(0.2);

    // Roster resolution
    expect(binding.roster).toHaveLength(2);
    expect(binding.availableRoster).toHaveLength(2);

    const citationChecker = binding.roster?.find((r) => r.fqid === "research-team:citation-checker");
    expect(citationChecker).toBeDefined();
    expect(citationChecker?.available).toBe(true);
    expect(citationChecker?.instructions).toBe("citation-checker expert instructions");
    expect(citationChecker?.modelRef).toEqual({
      provider: "openai",
      modelId: "gpt-4o-mini",
    });

    // Skills, commands, MCPs
    expect(binding.skills).toHaveLength(1);
    expect(binding.skills?.[0].id).toBe("search-arxiv");
    expect(binding.commands?.some((c) => c.id === "export-pdf")).toBe(true);
    expect(binding.mcps).toHaveLength(1);
    expect(binding.mcps?.[0].id).toBe("mcp-academic");
  });

  it("respects sessionTeamId override over project default team", () => {
    const root = useExternalRoot();
    writeTeam(root, "default-team", {
      orchestrator: { id: "default-lead" },
      subagents: [{ id: "sub-1" }],
    });
    writeTeam(root, "custom-team", {
      orchestrator: { id: "custom-lead", model: "google/gemini-2.0-flash" },
      subagents: [{ id: "custom-sub" }],
    });

    setProjectDefaultTeam(projectRoot, "default-team");

    const defaultBinding = resolveTeamPiBinding({ projectRoot });
    expect(defaultBinding.lead?.teamId).toBe("default-team");

    const customBinding = resolveTeamPiBinding({
      projectRoot,
      sessionTeamId: "custom-team",
    });
    expect(customBinding.ok).toBe(true);
    expect(customBinding.lead?.teamId).toBe("custom-team");
    expect(customBinding.lead?.fqid).toBe("custom-team:orchestrator");
    expect(customBinding.lead?.modelRef).toEqual({
      provider: "google",
      modelId: "gemini-2.0-flash",
    });
    expect(customBinding.availableRoster?.some((r) => r.fqid === "custom-team:custom-sub")).toBe(true);
  });

  it("handles disabled teams and disabled leads with clean error diagnostics", () => {
    const root = useExternalRoot();
    writeTeam(root, "disabled-team", {
      orchestrator: { id: "lead-1" },
    });

    setProjectDefaultTeam(projectRoot, "disabled-team");
    setProjectTeamEnabled(projectRoot, "disabled-team", false);

    const binding = resolveTeamPiBinding({ projectRoot, sessionTeamId: "disabled-team" });
    expect(binding.ok).toBe(false);
    expect(binding.error).toMatch(/disabled|blocked|No installed team/i);
  });

  it("marks unavailable/disabled subagents in roster without dropping them", () => {
    const root = useExternalRoot();
    writeTeam(root, "team-with-disabled-sub", {
      orchestrator: {
        id: "lead-1",
        roster: {
          mode: "list",
          members: [
            "team-with-disabled-sub:enabled-sub",
            "team-with-disabled-sub:disabled-sub",
          ],
        },
      },
      subagents: [{ id: "enabled-sub" }, { id: "disabled-sub" }],
    });

    setProjectDefaultTeam(projectRoot, "team-with-disabled-sub");
    setAppAssetEnabled("team-with-disabled-sub:disabled-sub", false);

    const binding = resolveTeamPiBinding({ projectRoot });
    expect(binding.ok).toBe(true);
    expect(binding.roster).toHaveLength(2);
    expect(binding.availableRoster).toHaveLength(1);
    expect(binding.availableRoster?.[0].fqid).toBe("team-with-disabled-sub:enabled-sub");

    const disabled = binding.roster?.find((r) => r.fqid === "team-with-disabled-sub:disabled-sub");
    expect(disabled?.available).toBe(false);
    expect(disabled?.unavailableReason).toBe("asset-disabled-app");
  });

  it("filters selectedRoster when selectedExpertIds is provided", () => {
    const root = useExternalRoot();
    writeTeam(root, "multi-expert-team", {
      orchestrator: { id: "lead-1", roster: { mode: "all" } },
      subagents: [{ id: "exp-a" }, { id: "exp-b" }, { id: "exp-c" }],
    });

    setProjectDefaultTeam(projectRoot, "multi-expert-team");

    const binding = resolveTeamPiBinding({
      projectRoot,
      selectedExpertIds: ["exp-b"],
    });

    expect(binding.ok).toBe(true);
    expect(binding.roster).toHaveLength(3);
    expect(binding.availableRoster).toHaveLength(3);
    expect(binding.selectedRoster).toHaveLength(1);
    expect(binding.selectedRoster?.[0].fqid).toBe("multi-expert-team:exp-b");
  });

  describe("deriveExpertAllowedTools", () => {
    it("never allows task tool to prevent nested delegation", () => {
      const tools = deriveExpertAllowedTools({
        id: "exp-1",
        name: "Exp 1",
        description: "desc",
        permission: { tools: ["literature-search", "task", "bash"] },
      });
      expect(tools.allowedTools).toContain("literature-search");
      expect(tools.allowedTools).toContain("bash");
      expect(tools.allowedTools).not.toContain("task");
    });

    it("derives scoped tools from modules if no explicit permission is given", () => {
      const citationTools = deriveExpertAllowedTools({
        id: "citation-auditor",
        name: "Citation Auditor",
        description: "Checks citations",
        modules: ["citation-audit"],
      });
      expect(citationTools.allowedTools).toEqual(expect.arrayContaining([
        "literature-search",
        "literature-read",
        "citation-health",
        "latex-root",
      ]));
      expect(citationTools.allowedTools).not.toContain("bash");
      expect(citationTools.allowedTools).not.toContain("delete");

      const experimentTools = deriveExpertAllowedTools({
        id: "experiment-analyst",
        name: "Experiment Analyst",
        description: "Analyzes experiments",
        modules: ["experiments"],
      });
      expect(experimentTools.allowedTools).toEqual(expect.arrayContaining([
        "experiment-log",
        "experiment-run",
        "provenance-query",
      ]));
      expect(experimentTools.allowedTools).not.toContain("latex-compile");
    });

    it("respects deny rules in permission record", () => {
      const tools = deriveExpertAllowedTools({
        id: "exp-denied",
        name: "Exp Denied",
        description: "desc",
        permission: {
          bash: "deny",
          delete: "deny",
        },
      });
      expect(tools.allowedTools).toContain("literature-search");
      expect(tools.allowedTools).not.toContain("bash");
      expect(tools.allowedTools).not.toContain("delete");
    });

    it("handles wildcard deny with explicit allow list", () => {
      const tools = deriveExpertAllowedTools({
        id: "exp-restricted",
        name: "Exp Restricted",
        description: "desc",
        permission: {
          "*": "deny",
          "literature-search": "allow",
          "literature-read": "allow",
        },
      });
      expect(tools.allowedTools).toEqual(["literature-search", "literature-read"]);
    });
  });
});
