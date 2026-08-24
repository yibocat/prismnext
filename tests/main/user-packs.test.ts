// User teams (app-level, like installed teams) — create → catalog → resolver → delete.
import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { setUserTeamsDataDir, createUserTeam, deleteUserTeam, listUserTeams, ensureUserTeamsRegistered } from "../../src/main/teams/user-teams";
import { listAssets, listTeams } from "../../src/main/teams/resolver";
import { saveCustomOrchestrator, saveCustomSubagent, deleteCustomOrchestrator, listOrchestrators } from "../../src/main/teams/subagents-sync";
import { USER_TEAM_PUBLISHER } from "../../src/shared/teams/types";
import { makeProjectRoot, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function sealUserPacks(): void {
  const dir = makeTempDir("user-packs-");
  setUserTeamsDataDir(dir);
  tempDirs.push(dir);
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setUserTeamsDataDir(null);
});

describe("user-packs (app-level teams)", () => {
  it("create team → appears in catalog + project view as installed & enabled", () => {
    sealUserPacks();
    ensureUserTeamsRegistered();

    const team = createUserTeam("Writing Squad", "Research writing helpers");
    expect(team.teamId).toMatch(/^user\.writing-squad-[0-9a-z]{4}$/);

    const listed = listUserTeams();
    expect(listed.map((t) => t.teamId)).toContain(team.teamId);

    const root = makeProjectRoot();
    tempDirs.push(root);

    // Catalog sees it as a normal v2 Team (user publisher → auto-installed).
    const pack = listTeams(root).find((p) => p.manifest.id === team.teamId);
    expect(pack).toBeDefined();
    expect(pack!.manifest.publisher).toBe(USER_TEAM_PUBLISHER);
    expect(pack!.source).toBe("user");
    expect(pack!.installed).toBe(true);

    // Project view: installed + enabled without any install step.
    const view = listTeams(root).find((p) => p.manifest.id === team.teamId);
    expect(view?.installed).toBe(true);
    expect(view?.enabled).toBe(true);
  });

  it("delete team removes it from catalog", () => {
    sealUserPacks();
    ensureUserTeamsRegistered();
    const team = createUserTeam("Temp Team");
    expect(listUserTeams().map((t) => t.teamId)).toContain(team.teamId);

    deleteUserTeam(team.teamId);
    expect(listUserTeams().map((t) => t.teamId)).not.toContain(team.teamId);
    const root = makeProjectRoot();
    tempDirs.push(root);
    expect(listTeams(root).find((p) => p.manifest.id === team.teamId)).toBeUndefined();
  });

  it("requires a name", () => {
    sealUserPacks();
    expect(() => createUserTeam("   ")).toThrow();
  });

  it("saving an orchestrator into a user team appears in the project view (FQID under the team)", () => {
    sealUserPacks();
    ensureUserTeamsRegistered();
    const team = createUserTeam("Writing Squad");
    const root = makeProjectRoot();
    tempDirs.push(root);

    // Sanity: the team must be in the catalog before saving into it.
    expect(listTeams(root).find((p) => p.manifest.id === team.teamId)).toBeDefined();

    const saved = saveCustomOrchestrator(
      root,
      {
        name: "Lead Writer",
        description: "Writes sections",
        instructions: "You are the lead writer.",
      },
      team.teamId,
    );

    // FQID lives under the user team pack (bare id; `saved.id` is the
    // agentFileBase form `<teamId>--<id>` for non-local packs).
    const bareOrchId = saved.id!.split("--").pop()!;
    expect(saved.fqid).toBe(`${team.teamId}:${bareOrchId}`);
    expect(saved.removable).toBe(false);
    expect(saved.builtin).toBe(false);

    // Resolver exposes it as enabled content of that team.
    const orch = listOrchestrators(root).find((o) => o.fqid === `${team.teamId}:${bareOrchId}`);
    expect(orch).toBeDefined();
    expect(orch!.enabled).toBe(true);

    // Content shows under the team pack in the project view.
    const content = listAssets(root, "orchestrator").find(
      (c) => c.fqid === `${team.teamId}:${bareOrchId}`,
    );
    expect(content?.teamId).toBe(team.teamId);

    // Editing writes back to the same team (target inferred from fqid).
    const edited = saveCustomOrchestrator(
      root,
      {
        id: saved.id,
        name: "Lead Writer 2",
        description: "Writes sections",
        instructions: "Updated.",
      },
      team.teamId,
    );
    expect(edited.fqid).toBe(`${team.teamId}:${bareOrchId}`);

    // Lead agents are never deleted alone — delete the team instead.
    expect(() => deleteCustomOrchestrator(root, saved.id)).toThrow(/cannot be deleted/i);
    expect(listOrchestrators(root).find((o) => o.fqid === `${team.teamId}:${bareOrchId}`)).toBeDefined();
  });

  it("saving an expert into a user team works too", () => {
    sealUserPacks();
    ensureUserTeamsRegistered();
    const team = createUserTeam("Research Helpers");
    const root = makeProjectRoot();
    tempDirs.push(root);

    const saved = saveCustomSubagent(
      root,
      {
        name: "Citation Helper",
        description: "Formats citations",
        instructions: "Fix citations.",
      },
      team.teamId,
    );
    const bareExpertId = saved.id!.split("--").pop()!;
    expect(saved.fqid).toBe(`${team.teamId}:${bareExpertId}`);
    const expert = listAssets(root, "subagent").find((c) => c.fqid === `${team.teamId}:${bareExpertId}`);
    expect(expert?.teamId).toBe(team.teamId);
  });
});
