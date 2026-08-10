/**
 * T4 environment-class takeover tests (design §7, plan T4).
 *
 * Covers the B1 fix (team MCP servers reach the unified list that feeds the
 * slash catalog), the corrected skills.paths precedence order (D-9), and
 * command invocation via the single precedence table.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyAppTeamsState } from "../../src/shared/teams/state";
import {
  registerExternalTeamRoot,
  unregisterExternalTeamRoot,
} from "../../src/main/teams/catalog";
import {
  readAppTeamsState,
  setAppTeamsStateDataDir,
  writeAppTeamsState,
} from "../../src/main/teams/state-app";
import { __resetTeamsResolverForTests, listMcpServers } from "../../src/main/teams/resolver";
import { syncProjectSkillsIntegration } from "../../src/main/services/skills-sync";
import { getCommandRegistry, __resetCommandRegistriesForTests } from "../../src/main/commands/registry";

let tmp: string;
let appDataDir: string;
let projectRoot: string;
const externalRoots: string[] = [];

function writeTeam(
  root: string,
  teamId: string,
  opts: {
    source?: string;
    skills?: string[];
    commands?: string[];
    mcps?: Array<{ id: string; name: string; autoStart?: boolean }>;
  } = {},
): void {
  const dir = join(root, teamId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "team.json"),
    JSON.stringify({
      id: teamId,
      name: teamId,
      description: `${teamId} desc`,
      version: "0.1.0",
      tier: "free",
      publisher: "test",
    }),
  );
  for (const sk of opts.skills ?? []) {
    const skdir = join(dir, "skills", sk);
    mkdirSync(skdir, { recursive: true });
    writeFileSync(join(skdir, "SKILL.md"), `---\nname: ${sk}\ndescription: ${sk}\n---\n\nbody\n`);
  }
  for (const c of opts.commands ?? []) {
    mkdirSync(join(dir, "commands"), { recursive: true });
    writeFileSync(join(dir, "commands", `${c}.md`), `---\ndescription: ${c}\n---\n\nbody ${c}\n`);
  }
  if (opts.mcps) {
    writeFileSync(
      join(dir, "mcp.json"),
      JSON.stringify(
        opts.mcps.map((m) => ({
          id: m.id,
          name: m.name,
          ...(m.autoStart ? { autoStart: true } : {}),
          transport: { type: "stdio", command: "x" },
        })),
      ),
    );
  }
}

function useExternalRoot(source: "bundled" | "pro" | "user" = "bundled"): string {
  const root = mkdtempSync(join(tmpdir(), "t4-ext-"));
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

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "t4-"));
  appDataDir = mkdtempSync(join(tmpdir(), "t4-appdata-"));
  projectRoot = mkdtempSync(join(tmpdir(), "t4-project-"));
  setAppTeamsStateDataDir(appDataDir);
  writeAppTeamsState(emptyAppTeamsState());
  process.env.PRISM_FIRST_PARTY_TEAMS_DIR = mkdtempSync(join(tmpdir(), "t4-bundled-empty-"));
  __resetTeamsResolverForTests();
  __resetCommandRegistriesForTests();
});

afterEach(() => {
  for (const r of externalRoots.splice(0)) unregisterExternalTeamRoot(r);
  setAppTeamsStateDataDir(null);
  delete process.env.PRISM_FIRST_PARTY_TEAMS_DIR;
  __resetTeamsResolverForTests();
  __resetCommandRegistriesForTests();
  rmSync(tmp, { recursive: true, force: true });
  rmSync(appDataDir, { recursive: true, force: true });
  rmSync(projectRoot, { recursive: true, force: true });
});

describe("B1: team MCP servers are resolvable (slash-catalog source)", () => {
  it("listMcpServers returns enabled team MCPs with autoStart flag", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.tools", {
      mcps: [
        { id: "mem", name: "memory", autoStart: true },
        { id: "web", name: "webfetch" },
      ],
    });
    markInstalled("acme.tools");

    const mcps = listMcpServers(projectRoot);
    expect(mcps.map((m) => m.fqid).sort()).toEqual(["acme.tools:mem", "acme.tools:web"]);
    const mem = mcps.find((m) => m.fqid === "acme.tools:mem")!;
    expect(mem.enabled).toBe(true);
    expect((mem.definition as { autoStart?: boolean }).autoStart).toBe(true);
  });

  it("MCP of an uninstalled team does not appear", () => {
    const root = useExternalRoot();
    writeTeam(root, "acme.tools", { mcps: [{ id: "mem", name: "memory" }] });
    // Not installed.
    expect(listMcpServers(projectRoot)).toEqual([]);
  });
});

describe("skills.paths precedence order (D-9)", () => {
  it("core (weakest) comes before bundled/user teams; project scan entry last", () => {
    const root = useExternalRoot("bundled");
    writeTeam(root, "prismnext.core", { skills: ["core-skill"] });
    writeTeam(root, "acme.pack", { skills: ["pack-skill"] });
    markInstalled("acme.pack");

    const result = syncProjectSkillsIntegration(projectRoot);
    const paths = result.skillsPaths;
    // core (rank 5) before acme.pack (rank 4); the project scan entry is last.
    const coreIdx = paths.findIndex((p) => p.includes("prismnext.core"));
    const packIdx = paths.findIndex((p) => p.includes("acme.pack"));
    expect(coreIdx).toBeGreaterThanOrEqual(0);
    expect(packIdx).toBeGreaterThanOrEqual(0);
    expect(coreIdx).toBeLessThan(packIdx);
    expect(paths[paths.length - 1]).toBe(".prismnext/agent");
  });
});

describe("command invocation via the single precedence table", () => {
  it("a user-team command shadows a bundled team's same-named command", () => {
    const bundled = useExternalRoot("bundled");
    writeTeam(bundled, "prismnext.core", { commands: ["review"] });
    const user = useExternalRoot("user");
    writeTeam(user, "acme.mine", { commands: ["review"] });
    markInstalled("acme.mine");

    const reg = getCommandRegistry(projectRoot);
    const winner = reg.lookup("review")!;
    expect(winner.teamId).toBe("acme.mine");
  });
});
