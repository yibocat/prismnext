/**
 * teams/lifecycle tests (v2 write exit — replaces services/teams-lifecycle).
 */
import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import {
  installTeam,
  setTeamEnabled,
  uninstallTeam,
} from "../../src/main/teams/lifecycle";
import {
  listExternalTeamRoots,
  registerExternalTeamRoot,
  unregisterExternalTeamRoot,
} from "../../src/main/teams/catalog";
import { isAssetActive, __resetTeamsResolverForTests } from "../../src/main/teams/resolver";
import {
  readAppTeamsState,
  setAppTeamsStateDataDir,
} from "../../src/main/teams/state-app";
import {
  readProjectTeamsState,
  setProjectDefaultTeam,
} from "../../src/main/teams/state-project";
import {
  CORE_TEAM_ID,
  LOCAL_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
} from "../../src/shared/teams/types";
import { baseManifest, makePack, makeProjectRoot, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function temp(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

function project(): string {
  const root = makeProjectRoot();
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of listExternalTeamRoots()) unregisterExternalTeamRoot(dir);
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setAppTeamsStateDataDir(null);
  __resetTeamsResolverForTests();
});

function sealAppStore(): string {
  const dir = makeTempDir("packs-app-");
  setAppTeamsStateDataDir(dir);
  tempDirs.push(dir);
  return dir;
}

function isInstalled(teamId: string): boolean {
  return readAppTeamsState().installed.some((r) => r.teamId === teamId);
}

function setupPacks(): void {
  const coreRoot = temp();
  makePack(coreRoot, "prismnext.core", baseManifest(CORE_TEAM_ID, { publisher: "prismnext" }), {
    orchestrators: [{ id: "research-prism" }],
  });
  registerExternalTeamRoot(coreRoot, "bundled");

  const notesRoot = temp();
  makePack(
    notesRoot,
    "test.notes",
    baseManifest("test.notes", { name: "Notes", preferredOrchestrator: "notes-lead" }),
    {
      orchestrators: [{ id: "notes-lead" }],
      experts: [{ id: "reading-coach" }],
    },
  );
  registerExternalTeamRoot(notesRoot);

  const proRoot = temp();
  makePack(
    proRoot,
    "test.pro",
    baseManifest("test.pro", { tier: "pro", publisher: "prismnext.pro" }),
    { experts: [{ id: "pro-expert" }] },
  );
  registerExternalTeamRoot(proRoot);
}

describe("teams/lifecycle: install", () => {
  it("install writes app installed[] and suggests active team when default is core", () => {
    setupPacks();
    sealAppStore();
    const root = project();
    // Warm project view so assets resolve.
    void root;

    const { applied, suggestedActiveTeam } = installTeam("test.notes");
    expect(applied).toBe(true);
    expect(isInstalled("test.notes")).toBe(true);
    expect(suggestedActiveTeam).toBe("test.notes");
    expect(isAssetActive(root, "test.notes:notes-lead")).toBe(true);

    const again = installTeam("test.notes");
    expect(again.applied).toBe(false);
    expect(again.suggestedActiveTeam).toBe("test.notes");
  });

  it("customized project defaultTeam → no active-team suggestion", () => {
    setupPacks();
    sealAppStore();
    const root = project();
    setProjectDefaultTeam(root, "user.local");

    // Suggestion is app-level (no projectRoot on install); with project default
    // already non-core, activeTeamSuggestion(teamId) still only sees app default.
    // Install with project context via setTeamEnabled enable path instead:
    installTeam("test.notes");
    setProjectDefaultTeam(root, LOCAL_TEAM_ID);
    const { suggestedActiveTeam } = setTeamEnabled("test.notes", true, "project", root);
    expect(suggestedActiveTeam).toBeUndefined();
  });

  it("missing catalog / pro without license → throw, no install record", () => {
    setupPacks();
    sealAppStore();
    expect(() => installTeam("ghost.pack")).toThrow(/not found/i);
    expect(() => installTeam("test.pro")).toThrow(/Pro license/i);
    expect(isInstalled("test.notes")).toBe(false);
  });
});

describe("teams/lifecycle: setTeamEnabled / uninstall", () => {
  it("core team disable writes teams.json; re-enable restores", () => {
    setupPacks();
    sealAppStore();
    const root = project();

    setTeamEnabled(CORE_TEAM_ID, false, "project", root);
    expect(isAssetActive(root, `${CORE_TEAM_ID}:research-prism`)).toBe(false);

    setTeamEnabled(CORE_TEAM_ID, true, "project", root);
    expect(isAssetActive(root, `${CORE_TEAM_ID}:research-prism`)).toBe(true);
  });

  it("project.local / user.local cannot be disabled", () => {
    setupPacks();
    sealAppStore();
    const root = project();
    expect(() => setTeamEnabled(PROJECT_DEFAULT_TEAM_ID, false, "project", root)).toThrow(
      /cannot be disabled/i,
    );
  });

  it("disabling the active team's pack moves defaultTeam back to core", () => {
    setupPacks();
    sealAppStore();
    const root = project();
    installTeam("test.notes");
    setProjectDefaultTeam(root, "test.notes");

    const result = setTeamEnabled("test.notes", false, "project", root);
    expect(result.defaultMovedTo).toBe(CORE_TEAM_ID);
    expect(readProjectTeamsState(root).defaultTeam).toBe(CORE_TEAM_ID);

    const re = setTeamEnabled("test.notes", true, "project", root);
    expect(re.defaultMovedTo).toBeUndefined();
  });

  it("uninstall: core rejected; removes app install record", () => {
    setupPacks();
    sealAppStore();
    expect(() => uninstallTeam(CORE_TEAM_ID)).toThrow(/cannot be uninstalled/i);
    expect(() => uninstallTeam("test.notes")).not.toThrow();

    installTeam("test.notes");
    expect(isInstalled("test.notes")).toBe(true);

    uninstallTeam("test.notes");
    expect(isInstalled("test.notes")).toBe(false);
  });
});
