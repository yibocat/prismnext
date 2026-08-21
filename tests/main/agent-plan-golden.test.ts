/**
 * Phase 2 golden assertion — the resolver-based experts-sync must reproduce
 * the pre-refactor agent plan byte-for-byte.
 *
 * Baselines in `tests/main/golden/agent-plan-*.json` were captured from HEAD
 * (legacy manifest-based experts-sync + old resources layout). Accepted
 * non-differences:
 * - `agentFiles` / list ordering may change (directory-scan order replaces
 *   aggregate-manifest order) — OpenCode reads the agents dir order-free;
 *   `syncContentHash` itself is order-independent by construction.
 * Everything else (file bytes, hashes, enabled/override/view semantics) must
 * match exactly.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildProjectSubagentsAgentPlan,
  listSubagents,
  listOrchestrators,
} from "../../src/main/services/subagents-sync";
import { setAppTeamsDirForTests } from "../../src/main/teams/scope";
import { __resetTeamsResolverForTests } from "../../src/main/teams/resolver";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import { writeProjectTeamsState } from "../../src/main/teams/state-project";
import { emptyProjectTeamsState } from "../../src/shared/teams/state";
import {
  CORE_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
  PROJECT_TEAMS_REL,
} from "../../src/shared/teams/types";

const GOLDEN_DIR = join(__dirname, "golden");

interface GoldenDump {
  fixture: string;
  orchestratorId: string;
  agentFiles: string[];
  orchestratorContentHash: string;
  syncContentHash: string;
  views: {
    experts: Array<Record<string, unknown> & { id: string }>;
    orchestrators: Array<Record<string, unknown> & { id: string }>;
  };
  entries: Array<{ filename: string; content: string }>;
}

function loadGolden(fixture: string): GoldenDump {
  return JSON.parse(
    readFileSync(join(GOLDEN_DIR, `agent-plan-${fixture}.json`), "utf-8"),
  ) as GoldenDump;
}

function normalize(root: string, text: string): string {
  return text.split(root).join("<PROJECT_ROOT>");
}

function expertView(e: ReturnType<typeof listSubagents>[number]) {
  return {
    id: e.id,
    builtin: e.builtin,
    removable: e.removable,
    enabled: e.enabled,
    modules: e.modules,
    model: e.model,
    thoughtLevel: e.thoughtLevel,
    temperature: e.temperature,
    permission: e.permission,
    effectiveModules: e.effectiveModules,
  };
}

function orchestratorView(o: ReturnType<typeof listOrchestrators>[number]) {
  return {
    id: o.id,
    builtin: o.builtin,
    removable: o.removable,
    enabled: o.enabled,
    roster: o.roster,
    model: o.model,
    thoughtLevel: o.thoughtLevel,
    temperature: o.temperature,
    permission: o.permission,
    effectiveModules: o.effectiveModules,
  };
}

function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function writeGolden(root: string, fixture: string): void {
  const golden = loadGolden(fixture);
  const plan = buildProjectSubagentsAgentPlan(root, { defaultSubagentModel: null });
  const next: GoldenDump = {
    ...golden,
    orchestratorId: plan.orchestratorId,
    agentFiles: plan.agentFiles,
    orchestratorContentHash: plan.orchestratorContentHash,
    syncContentHash: plan.syncContentHash,
    entries: plan.agentEntries.map((entry) => ({
      filename: entry.filename,
      content: normalize(root, entry.content),
    })),
    views: {
      experts: byId(listSubagents(root).map(expertView)),
      orchestrators: byId(listOrchestrators(root).map(orchestratorView)),
    },
  };
  writeFileSync(
    join(GOLDEN_DIR, `agent-plan-${fixture}.json`),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf-8",
  );
}

function assertPlanMatchesGolden(root: string, fixture: string): void {
  if (process.env.UPDATE_AGENT_PLAN_GOLDEN === "1") {
    writeGolden(root, fixture);
    return;
  }
  const golden = loadGolden(fixture);
  const plan = buildProjectSubagentsAgentPlan(root, { defaultSubagentModel: null });

  // Empty projects have no hangar lead. A Project Team appears only after
  // explicit CRUD (or leftover on-disk migration).
  expect(plan.orchestratorId).toBe(golden.orchestratorId);
  expect([...plan.agentFiles].sort()).toEqual([...golden.agentFiles].sort());
  expect(plan.orchestratorContentHash).toBe(golden.orchestratorContentHash);
  expect(plan.syncContentHash).toBe(golden.syncContentHash);

  const actualByName = new Map(plan.agentEntries.map((e) => [e.filename, e.content]));
  for (const expected of golden.entries) {
    const actual = actualByName.get(expected.filename);
    expect(actual, `${fixture}/${expected.filename} missing`).toBeDefined();
    expect(
      normalize(root, actual!),
      `${fixture}/${expected.filename} content drift`,
    ).toBe(expected.content);
  }
  expect(actualByName.size).toBe(golden.entries.length);

  expect(byId(listSubagents(root).map(expertView))).toEqual(byId(golden.views.experts));
  expect(byId(listOrchestrators(root).map(orchestratorView))).toEqual(
    byId(golden.views.orchestrators),
  );
}

describe("agent plan golden parity (Phase 2)", () => {
  const temps: string[] = [];

  beforeEach(() => {
    const home = mkdtempSync(join(tmpdir(), "prism-golden-home-"));
    temps.push(home);
    setWorkbenchUserHomeOverride(home);
    setAppTeamsDirForTests(join(home, "teams"));
    mkdirSync(join(home, "teams"), { recursive: true });
    __resetTeamsResolverForTests();
  });

  afterEach(() => {
    setAppTeamsDirForTests(null);
    setWorkbenchUserHomeOverride(null);
    __resetTeamsResolverForTests();
    while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
  });
  it("default fixture (empty project)", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-golden-default-"));
    try {
      assertPlanMatchesGolden(root, "default");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("customized fixture (disabled + overrides + custom content)", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-golden-custom-"));
    try {
      const hangar = join(root, PROJECT_TEAMS_REL, PROJECT_DEFAULT_TEAM_ID);
      const notes = join(root, PROJECT_TEAMS_REL, "notes-local");
      mkdirSync(join(hangar, "subagents", "latex-polisher"), { recursive: true });
      mkdirSync(join(notes, "orchestrators", "notes-local"), { recursive: true });
      writeFileSync(
        join(hangar, "team.json"),
        JSON.stringify(
          {
            id: PROJECT_DEFAULT_TEAM_ID,
            name: "Project Team",
            description: "This project's hangar",
            version: "0.1.0",
            packFormatVersion: 1,
            tier: "free",
            publisher: "user",
          },
          null,
          2,
        ),
        "utf-8",
      );
      writeFileSync(
        join(hangar, "subagents", "latex-polisher", "subagent.json"),
        JSON.stringify(
          {
            id: "latex-polisher",
            name: "LaTeX Polisher",
            description: "Polishes LaTeX manuscripts for clarity and consistency.",
            model: "anthropic/claude-sonnet-4-20250514",
            modules: ["latex-workspace", "project-brief"],
            permission: { edit: "deny" },
          },
          null,
          2,
        ),
        "utf-8",
      );
      writeFileSync(
        join(hangar, "subagents", "latex-polisher", "instructions.md"),
        "You polish LaTeX prose. Fix inconsistent notation; never rewrite results.\n",
        "utf-8",
      );
      writeFileSync(
        join(notes, "team.json"),
        JSON.stringify(
          {
            id: "notes-local",
            name: "Notes Local",
            description: "Coordinates local note-taking workflows.",
            version: "0.1.0",
            packFormatVersion: 1,
            tier: "free",
            publisher: "user",
          },
          null,
          2,
        ),
        "utf-8",
      );
      writeFileSync(
        join(notes, "orchestrators", "notes-local", "orchestrator.json"),
        JSON.stringify(
          {
            id: "notes-local",
            name: "Notes Local",
            description: "Coordinates local note-taking workflows.",
            thoughtLevel: "low",
            allowedExperts: ["latex-polisher", "literature-synthesizer"],
          },
          null,
          2,
        ),
        "utf-8",
      );
      writeFileSync(
        join(notes, "orchestrators", "notes-local", "instructions.md"),
        "You coordinate local notes. Delegate polishing to latex-polisher.\n",
        "utf-8",
      );
      writeProjectTeamsState(root, {
        ...emptyProjectTeamsState(),
        assetEnabled: { [`${CORE_TEAM_ID}:peer-reviewer`]: false },
        assetOverrides: {
          [`${CORE_TEAM_ID}:methodology-auditor`]: { temperature: 0.4, model: "openai/gpt-4o" },
          [`${CORE_TEAM_ID}:research-prism`]: {
            allowedExperts: ["literature-synthesizer", "methodology-auditor"],
          },
        },
      });

      assertPlanMatchesGolden(root, "customized");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
