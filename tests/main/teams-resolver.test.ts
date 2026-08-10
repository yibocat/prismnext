/**
 * TeamResolver tests (design 2026-08-10 §12.1).
 *
 * Table-driven: tri-state matrix, scope visibility, roster resolution, and a
 * single precedence expectation table driving four consumption points.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TeamSource } from "../../src/shared/teams/types";
import {
  __resetTeamsResolverForTests,
  __setHostVersionForTests,
  getAsset,
  isAssetActive,
  listAssets,
  listTeams,
  resolveActiveTeam,
  resolveChatOrchestrator,
  resolveInvocation,
  resolveRef,
  resolveRoster,
} from "../../src/main/teams/resolver";
import {
  registerExternalTeamRoot,
  unregisterExternalTeamRoot,
} from "../../src/main/teams/catalog";
import { emptyAppTeamsState } from "../../src/shared/teams/state";
import {
  readAppTeamsState,
  setAppAssetEnabled,
  setAppTeamEnabled,
  setAppTeamsStateDataDir,
  writeAppTeamsState,
} from "../../src/main/teams/state-app";
import {
  setProjectAssetEnabled,
  setProjectDefaultTeam,
  setProjectTeamEnabled,
} from "../../src/main/teams/state-project";

// ── Fixture helpers ───────────────────────────────────────

let tmp: string;
let appDataDir: string;
let projectRoot: string;
const externalRoots: string[] = [];

function writeTeam(
  root: string,
  teamId: string,
  opts: {
    tier?: "free" | "pro";
    minHostVersion?: string;
    orchestrator?: { id: string; roster?: unknown };
    subagents?: string[];
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
      name: teamId,
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
        name: opts.orchestrator.id,
        description: "lead",
        ...(opts.orchestrator.roster !== undefined ? { roster: opts.orchestrator.roster } : {}),
      }),
    );
    writeFileSync(join(odir, "instructions.md"), "lead instructions");
  }
  for (const s of opts.subagents ?? []) {
    const sdir = join(dir, "subagents", s);
    mkdirSync(sdir, { recursive: true });
    writeFileSync(
      join(sdir, "subagent.json"),
      JSON.stringify({ id: s, name: s, description: `${s} desc` }),
    );
    writeFileSync(join(sdir, "instructions.md"), `${s} instructions`);
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
          transport: { type: "stdio", command: "x" },
        })),
      ),
    );
  }
  // External teams need an app-level install record; project/core teams are
  // implicitly installed, so this is a harmless no-op for them.
  markInstalled(teamId);
  return dir;
}

/** Register an external root and track it for cleanup. */
function useExternalRoot(source: TeamSource = "bundled"): string {
  const root = mkdtempSync(join(tmpdir(), "teams-ext-"));
  registerExternalTeamRoot(root, source);
  externalRoots.push(root);
  return root;
}

/** Mark teams as installed at app level (external teams need an install record). */
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

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "teams-resolver-"));
  appDataDir = mkdtempSync(join(tmpdir(), "teams-appdata-"));
  projectRoot = mkdtempSync(join(tmpdir(), "teams-project-"));
  setAppTeamsStateDataDir(appDataDir);
  __setHostVersionForTests("0.7.0");
  writeAppTeamsState(emptyAppTeamsState());
  // Seal the bundled root to an empty dir so only fixture teams appear.
  process.env.PRISM_FIRST_PARTY_TEAMS_DIR = mkdtempSync(join(tmpdir(), "teams-bundled-empty-"));
  __resetTeamsResolverForTests();
});

afterEach(() => {
  for (const r of externalRoots.splice(0)) unregisterExternalTeamRoot(r);
  setAppTeamsStateDataDir(null);
  __setHostVersionForTests(undefined);
  delete process.env.PRISM_FIRST_PARTY_TEAMS_DIR;
  __resetTeamsResolverForTests();
  rmSync(tmp, { recursive: true, force: true });
  rmSync(appDataDir, { recursive: true, force: true });
  rmSync(projectRoot, { recursive: true, force: true });
});

// ── Tri-state matrix (design §5.3) ────────────────────────

describe("tri-state matrix (team + asset)", () => {
  it("team: installed default-enabled; project=false blocks; project=true overrides app=false", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.tools", { subagents: ["helper"] });

    // Default: installed (external root) + enabled.
    expect(listTeams(projectRoot).find((t) => t.manifest.id === "acme.tools")?.enabled).toBe(true);

    // Project-level disable.
    setProjectTeamEnabled(projectRoot, "acme.tools", false);
    let t = listTeams(projectRoot).find((x) => x.manifest.id === "acme.tools")!;
    expect(t.enabled).toBe(false);
    expect(t.blockedBy).toBe("team-disabled-project");

    // App-level disable + project re-enable (C7: project overrides app).
    setAppTeamEnabled("acme.tools", false);
    setProjectTeamEnabled(projectRoot, "acme.tools", true);
    t = listTeams(projectRoot).find((x) => x.manifest.id === "acme.tools")!;
    expect(t.enabled).toBe(true);
    expect(t.blockedBy).toBeUndefined();

    // App-level disable alone.
    setProjectTeamEnabled(projectRoot, "acme.tools", null);
    t = listTeams(projectRoot).find((x) => x.manifest.id === "acme.tools")!;
    expect(t.enabled).toBe(false);
    expect(t.blockedBy).toBe("team-disabled-app");
  });

  it("asset: blocked by team, then by app, then by project; project overrides app", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.tools", { subagents: ["helper"] });
    const fqid = "acme.tools:helper";

    expect(isAssetActive(projectRoot, fqid)).toBe(true);

    // Asset disabled at app level.
    setAppAssetEnabled(fqid, false);
    expect(isAssetActive(projectRoot, fqid)).toBe(false);
    expect(getAsset(projectRoot, fqid)?.blockedBy).toBe("asset-disabled-app");

    // Project re-enables over app disable.
    setProjectAssetEnabled(projectRoot, fqid, true);
    expect(isAssetActive(projectRoot, fqid)).toBe(true);

    // Team disabled → asset blocked by team regardless of asset flags.
    setProjectAssetEnabled(projectRoot, fqid, null);
    setAppAssetEnabled(fqid, null);
    setProjectTeamEnabled(projectRoot, "acme.tools", false);
    const a = getAsset(projectRoot, fqid)!;
    expect(a.enabled).toBe(false);
    expect(a.blockedBy).toBe("team-disabled-project");
  });

  it("incompatible team (minHostVersion too high) is blocked at runtime", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.future", { minHostVersion: "999.0.0", subagents: ["x"] });
    const t = listTeams(projectRoot).find((x) => x.manifest.id === "acme.future")!;
    expect(t.enabled).toBe(false);
    expect(t.blockedBy).toBe("incompatible");
  });
});

// ── Scope visibility ──────────────────────────────────────

describe("scope", () => {
  it("project teams are only visible in their own project", () => {
    const projectTeams = join(projectRoot, ".prismnext", "agent", "teams");
    writeTeam(projectTeams, "project.local", { subagents: ["mine"] });

    const inProject = listTeams(projectRoot).find((t) => t.manifest.id === "project.local");
    expect(inProject).toBeDefined();
    expect(inProject?.scope).toBe("project");

    const otherProject = mkdtempSync(join(tmpdir(), "teams-other-"));
    try {
      const elsewhere = listTeams(otherProject).find((t) => t.manifest.id === "project.local");
      expect(elsewhere).toBeUndefined();
    } finally {
      rmSync(otherProject, { recursive: true, force: true });
    }
  });
});

// ── Roster resolution (design §6.3) ───────────────────────

describe("resolveRoster", () => {
  it("mode all → every enabled subagent, via 'all'", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.a", { orchestrator: { id: "lead" }, subagents: ["s1", "s2"] });
    const view = resolveRoster(projectRoot, "acme.a")!;
    expect(view.spec.mode).toBe("all");
    expect(view.entries.map((e) => e.fqid).sort()).toEqual(["acme.a:s1", "acme.a:s2"]);
    expect(view.entries.every((e) => e.via === "all")).toBe(true);
  });

  it("@team expands to the team's own subagents", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.a", {
      orchestrator: { id: "lead", roster: { mode: "list", members: ["@team"] } },
      subagents: ["s1"],
    });
    writeTeam(root, "acme.b", { subagents: ["other"] });
    const view = resolveRoster(projectRoot, "acme.a")!;
    expect(view.entries.map((e) => e.fqid)).toEqual(["acme.a:s1"]);
    expect(view.entries[0].via).toBe("team");
  });

  it("explicit FQID cross-team reference resolves; disabled member is marked, not dropped", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.a", {
      orchestrator: { id: "lead", roster: { mode: "list", members: ["acme.b:critic"] } },
    });
    writeTeam(root, "acme.b", { subagents: ["critic"] });
    setAppAssetEnabled("acme.b:critic", false);
    const view = resolveRoster(projectRoot, "acme.a")!;
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].fqid).toBe("acme.b:critic");
    expect(view.entries[0].unavailable).toBe("asset-disabled-app");
  });

  it("dangling reference is kept and marked, not silently dropped", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.a", {
      orchestrator: { id: "lead", roster: { mode: "list", members: ["acme.ghost:missing"] } },
    });
    const view = resolveRoster(projectRoot, "acme.a")!;
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].unavailable).toBe("not-installed");
  });

  it("cross-scope: a global team referencing a project subagent is out-of-scope", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.global", {
      orchestrator: { id: "lead", roster: { mode: "list", members: ["project.local:mine"] } },
    });
    const projectTeams = join(projectRoot, ".prismnext", "agent", "teams");
    writeTeam(projectTeams, "project.local", { subagents: ["mine"] });
    const view = resolveRoster(projectRoot, "acme.global")!;
    expect(view.entries[0].unavailable).toBe("out-of-scope");
  });
});

// ── Precedence: one table drives four consumption points ──

describe("precedence (design §7.5)", () => {
  it("resolveRef: exact FQID > same team > precedence table", () => {
    const bundled = useExternalRoot("bundled");
    const user = useExternalRoot("user");
    writeTeam(bundled, "acme.bundled", { subagents: ["critic"] });
    writeTeam(user, "acme.user", { subagents: ["critic"] });

    // Bare id, no context → user (rank 1) beats bundled (rank 4).
    expect(resolveRef(projectRoot, "critic")).toBe("acme.user:critic");
    // Same-team context wins.
    expect(resolveRef(projectRoot, "critic", "acme.bundled")).toBe("acme.bundled:critic");
    // Exact FQID wins outright.
    expect(resolveRef(projectRoot, "acme.bundled:critic", "acme.user")).toBe("acme.bundled:critic");
  });

  it("resolveInvocation picks the most specific enabled asset by runtimeName", () => {
    const bundled = useExternalRoot("bundled");
    const user = useExternalRoot("user");
    writeTeam(bundled, "acme.bundled", { commands: ["review"] });
    writeTeam(user, "acme.user", { commands: ["review"] });

    const winner = resolveInvocation(projectRoot, "command", "review")!;
    expect(winner.teamId).toBe("acme.user");
  });

  it("runtimeName: unique id stays bare; collision prefixes all parties and shadows losers", () => {
    const bundled = useExternalRoot("bundled");
    const user = useExternalRoot("user");
    writeTeam(bundled, "acme.bundled", { subagents: ["unique", "clash"] });
    writeTeam(user, "acme.user", { subagents: ["clash"] });

    const unique = getAsset(projectRoot, "acme.bundled:unique")!;
    expect(unique.runtimeName).toBe("unique");

    const bundledClash = getAsset(projectRoot, "acme.bundled:clash")!;
    const userClash = getAsset(projectRoot, "acme.user:clash")!;
    // Both colliding parties get prefixed runtime names.
    expect(bundledClash.runtimeName).toBe("acme.bundled--clash");
    expect(userClash.runtimeName).toBe("acme.user--clash");
    // The more specific (user) wins the bare-name invocation; bundled is shadowed.
    expect(userClash.blockedBy).toBeUndefined();
    expect(bundledClash.blockedBy).toBe("shadowed");
  });
});

// ── Active team (design §7.1) ─────────────────────────────

describe("resolveActiveTeam", () => {
  it("falls back session → project → app → core; skips teams without a lead", () => {
    const root = useExternalRoot("bundled");
    writeTeam(root, "prismnext.core", { orchestrator: { id: "research-prism" } });
    writeTeam(root, "acme.capable", { orchestrator: { id: "lead" } });
    writeTeam(root, "acme.capability-only", { skills: ["sk"] }); // no orchestrator

    // Default → core.
    expect(resolveActiveTeam(projectRoot).manifest.id).toBe("prismnext.core");

    // Project default → capable team.
    setProjectDefaultTeam(projectRoot, "acme.capable");
    expect(resolveActiveTeam(projectRoot).manifest.id).toBe("acme.capable");

    // Session override to a capability-only team → falls back to project default.
    expect(resolveActiveTeam(projectRoot, "acme.capability-only").manifest.id).toBe("acme.capable");

    // Disabled project default → falls back to core.
    setProjectTeamEnabled(projectRoot, "acme.capable", false);
    expect(resolveActiveTeam(projectRoot).manifest.id).toBe("prismnext.core");
  });
});

describe("resolveChatOrchestrator", () => {
  it("reads project defaultTeam from teams.json (not packs.json)", () => {
    const root = useExternalRoot("bundled");
    writeTeam(root, "prismnext.core", { orchestrator: { id: "research-prism" } });
    writeTeam(root, "acme.capable", { orchestrator: { id: "lead" } });

    expect(resolveChatOrchestrator(projectRoot).teamId).toBe("prismnext.core");
    setProjectDefaultTeam(projectRoot, "acme.capable");
    const active = resolveChatOrchestrator(projectRoot);
    expect(active.teamId).toBe("acme.capable");
    expect(active.fqid.startsWith("acme.capable:")).toBe(true);
    expect(active.runtimeName.length).toBeGreaterThan(0);

    const session = resolveChatOrchestrator(projectRoot, {
      sessionTeamId: "prismnext.core",
    });
    expect(session.teamId).toBe("prismnext.core");
  });
});

// ── MCP as first-class asset (design §7.4) ────────────────

describe("MCP as asset", () => {
  it("listAssets('mcp') returns pack MCP servers with tri-state enablement", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.tools", { mcps: [{ id: "mem", name: "memory" }] });
    const mcps = listAssets(projectRoot, "mcp");
    expect(mcps.map((m) => m.fqid)).toEqual(["acme.tools:mem"]);
    expect(isAssetActive(projectRoot, "acme.tools:mem")).toBe(true);

    setAppAssetEnabled("acme.tools:mem", false);
    expect(isAssetActive(projectRoot, "acme.tools:mem")).toBe(false);
  });

  it("shadows MCPs by runtime name rather than asset id", () => {
    const bundled = useExternalRoot("bundled");
    const user = useExternalRoot("user");
    writeTeam(bundled, "acme.bundled", { mcps: [{ id: "bundled-id", name: "shared-server" }] });
    writeTeam(user, "user.override", { mcps: [{ id: "user-id", name: "shared-server" }] });

    const mcps = listAssets(projectRoot, "mcp");
    expect(mcps.find((m) => m.fqid === "user.override:user-id")?.blockedBy).toBeUndefined();
    expect(mcps.find((m) => m.fqid === "acme.bundled:bundled-id")?.blockedBy).toBe("shadowed");
  });
});

// ── Invariants ────────────────────────────────────────────

describe("invariants", () => {
  it("teamId must equal dir name; mismatch is skipped", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.real", { subagents: ["x"] });
    // Corrupt the manifest id.
    writeFileSync(
      join(root, "acme.real", "team.json"),
      JSON.stringify({ id: "acme.other", name: "x", description: "d", version: "1", tier: "free", publisher: "t" }),
    );
    expect(listTeams(projectRoot).find((t) => t.manifest.id === "acme.other")).toBeUndefined();
  });

  it("external root declaring a reserved id (prismnext.core) is rejected", () => {
    const root = useExternalRoot("pro");
    writeTeam(root, "prismnext.core", { subagents: ["fake"] });
    expect(listTeams(projectRoot).find((t) => t.manifest.id === "prismnext.core")).toBeUndefined();
  });

  it("dual layout: legacy orchestrators/ + experts/ + plugin.json still scans", () => {
    const root = useExternalRoot();
    const dir = join(root, "acme.legacy");
    mkdirSync(join(dir, "orchestrators", "lead"), { recursive: true });
    mkdirSync(join(dir, "experts", "helper"), { recursive: true });
    writeFileSync(
      join(dir, "plugin.json"),
      JSON.stringify({ id: "acme.legacy", name: "x", description: "d", version: "1", tier: "free", publisher: "t" }),
    );
    writeFileSync(
      join(dir, "orchestrators", "lead", "orchestrator.json"),
      JSON.stringify({ id: "lead", name: "lead", description: "d" }),
    );
    writeFileSync(
      join(dir, "experts", "helper", "expert.json"),
      JSON.stringify({ id: "helper", name: "helper", description: "d" }),
    );
    markInstalled("acme.legacy");
    const t = listTeams(projectRoot).find((x) => x.manifest.id === "acme.legacy");
    expect(t).toBeDefined();
    expect(t?.hasOrchestrator).toBe(true);
    expect(isAssetActive(projectRoot, "acme.legacy:helper")).toBe(true);
  });
});
