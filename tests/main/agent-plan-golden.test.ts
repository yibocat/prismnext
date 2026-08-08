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
import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildProjectExpertsAgentPlan,
  listExperts,
  listOrchestrators,
} from "../../src/main/services/experts-sync";

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

function expertView(e: ReturnType<typeof listExperts>[number]) {
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
    allowedExperts: o.allowedExperts,
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

function assertPlanMatchesGolden(root: string, fixture: string): void {
  const golden = loadGolden(fixture);
  const plan = buildProjectExpertsAgentPlan(root, { defaultSubagentModel: null });

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

  expect(byId(listExperts(root).map(expertView))).toEqual(byId(golden.views.experts));
  expect(byId(listOrchestrators(root).map(orchestratorView))).toEqual(
    byId(golden.views.orchestrators),
  );
}

describe("agent plan golden parity (Phase 2)", () => {
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
      const agentDir = join(root, ".prismnext", "agent");
      mkdirSync(agentDir, { recursive: true });

      writeFileSync(
        join(agentDir, "experts-manifest.json"),
        JSON.stringify(
          {
            disabledBuiltinIds: ["peer-reviewer"],
            builtinOverrides: {
              "methodology-auditor": { temperature: 0.4, model: "openai/gpt-4o" },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );
      writeFileSync(
        join(agentDir, "orchestrators-manifest.json"),
        JSON.stringify(
          {
            defaultOrchestratorId: "research-prism",
            disabledBuiltinIds: [],
            builtinOverrides: {
              "research-prism": {
                allowedExperts: ["literature-synthesizer", "methodology-auditor"],
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const expertDir = join(agentDir, "experts", "custom", "latex-polisher");
      mkdirSync(expertDir, { recursive: true });
      writeFileSync(
        join(expertDir, "expert.json"),
        JSON.stringify(
          {
            id: "latex-polisher",
            name: "LaTeX Polisher",
            description: "Polishes LaTeX manuscripts for clarity and consistency.",
            builtin: false,
            removable: true,
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
        join(expertDir, "instructions.md"),
        "You polish LaTeX prose. Fix inconsistent notation; never rewrite results.\n",
        "utf-8",
      );

      const orchDir = join(agentDir, "orchestrators", "custom", "notes-local");
      mkdirSync(orchDir, { recursive: true });
      writeFileSync(
        join(orchDir, "orchestrator.json"),
        JSON.stringify(
          {
            id: "notes-local",
            name: "Notes Local",
            description: "Coordinates local note-taking workflows.",
            builtin: false,
            removable: true,
            thoughtLevel: "low",
            allowedExperts: ["latex-polisher", "literature-synthesizer"],
          },
          null,
          2,
        ),
        "utf-8",
      );
      writeFileSync(
        join(orchDir, "instructions.md"),
        "You coordinate local notes. Delegate polishing to latex-polisher.\n",
        "utf-8",
      );

      assertPlanMatchesGolden(root, "customized");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
