import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bundledResourceDirCandidates,
  firstExistingDir,
  invalidateCatalog,
} from "../../src/main/teams/catalog";
import {
  __resetTeamsResolverForTests,
  resolveChatOrchestrator,
} from "../../src/main/teams/resolver";
import { setAppTeamsDirForTests } from "../../src/main/teams/scope";
import { emptyAppTeamsState } from "../../src/shared/teams/state";
import { setAppTeamsStateDataDir, writeAppTeamsState } from "../../src/main/teams/state-app";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import { buildHostServeStdioCommand } from "../../src/main/remote/session-broker";

const REAL_CORE_TEAMS = join(process.cwd(), "resources", "teams");

describe("Host bundled Core team", () => {
  const prevTeams = process.env.PRISM_FIRST_PARTY_TEAMS_DIR;
  const prevPacks = process.env.PRISM_FIRST_PARTY_PACKS_DIR;
  const prevCommands = process.env.PRISM_APP_COMMANDS_DIR;

  afterEach(() => {
    if (prevTeams === undefined) delete process.env.PRISM_FIRST_PARTY_TEAMS_DIR;
    else process.env.PRISM_FIRST_PARTY_TEAMS_DIR = prevTeams;
    if (prevPacks === undefined) delete process.env.PRISM_FIRST_PARTY_PACKS_DIR;
    else process.env.PRISM_FIRST_PARTY_PACKS_DIR = prevPacks;
    if (prevCommands === undefined) delete process.env.PRISM_APP_COMMANDS_DIR;
    else process.env.PRISM_APP_COMMANDS_DIR = prevCommands;
    setWorkbenchUserHomeOverride(null);
    setAppTeamsDirForTests(null);
    setAppTeamsStateDataDir(null);
    __resetTeamsResolverForTests();
  });

  it("finds ~/.prismnext-host/current/resources/teams when Electron resourcesPath is empty", () => {
    const hostCurrent = mkdtempSync(join(tmpdir(), "prism-host-current-"));
    const teamsDir = join(hostCurrent, "resources", "teams");
    mkdirSync(teamsDir, { recursive: true });
    const candidates = bundledResourceDirCandidates("teams", {
      appPath: hostCurrent,
      resourcesPath: "",
      cwd: join(hostCurrent, "not-the-repo"),
    });
    expect(candidates[0]).toBe(teamsDir);
    expect(firstExistingDir(candidates, "missing")).toBe(teamsDir);
  });

  it("starts Host with PRISM_FIRST_PARTY_TEAMS_DIR pointing at the payload", () => {
    const command = buildHostServeStdioCommand({
      currentDir: "/home/me/.prismnext-host/current",
      nodeBin: "/home/me/.prismnext-host/current/bin/node",
      hostBin: "/home/me/.prismnext-host/current/bin/prismnext-host",
    });
    expect(command).toContain(
      'PRISM_FIRST_PARTY_TEAMS_DIR="/home/me/.prismnext-host/current/resources/teams"',
    );
    expect(command).toContain(
      'PRISM_APP_COMMANDS_DIR="/home/me/.prismnext-host/current/resources/commands"',
    );
    expect(command).toContain("serve --stdio");
  });

  it("resolves the Core lead from a Host-shaped teams dir (no user teams)", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-teams-home-"));
    const paper = join(home, "paper");
    mkdirSync(join(paper, ".workbench", "agent", "teams"), { recursive: true });
    writeFileSync(join(paper, ".workbench", "workbench.json"), '{"id":"p_test"}\n');

    process.env.PRISM_FIRST_PARTY_TEAMS_DIR = REAL_CORE_TEAMS;
    delete process.env.PRISM_FIRST_PARTY_PACKS_DIR;
    setWorkbenchUserHomeOverride(home);
    setAppTeamsDirForTests(join(home, ".prismnext", "teams"));
    setAppTeamsStateDataDir(join(home, ".prismnext"));
    writeAppTeamsState(emptyAppTeamsState());
    invalidateCatalog();
    __resetTeamsResolverForTests();

    const lead = resolveChatOrchestrator(paper);
    expect(lead.teamId).toBe("prismnext.core");
    expect(lead.runtimeName.length).toBeGreaterThan(0);
  });
});
