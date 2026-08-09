// User teams (app-level, like installed teams) — create → catalog → resolver → delete.
import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { setUserPacksDataDir, createUserTeam, deleteUserTeam, listUserTeams, ensureUserPacksRegistered } from "../../src/main/services/user-packs";
import { listPacks } from "../../src/main/services/pack-catalog";
import { listProjectPacks, listContent } from "../../src/main/services/pack-resolver";
import { saveCustomOrchestrator, saveCustomExpert, deleteCustomOrchestrator, listOrchestrators } from "../../src/main/services/experts-sync";
import { USER_TEAM_PUBLISHER } from "../../src/shared/packs/types";
import { makeProjectRoot, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function sealUserPacks(): void {
  const dir = makeTempDir("user-packs-");
  setUserPacksDataDir(dir);
  tempDirs.push(dir);
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setUserPacksDataDir(null);
});

describe("user-packs (app-level teams)", () => {
  it("create team → appears in catalog + project view as installed & enabled", () => {
    sealUserPacks();
    ensureUserPacksRegistered();

    const team = createUserTeam("Writing Squad", "Research writing helpers");
    expect(team.packId).toMatch(/^user\.writing-squad-[0-9a-z]{4}$/);

    const listed = listUserTeams();
    expect(listed.map((t) => t.packId)).toContain(team.packId);

    // Catalog sees it as a normal pack (user publisher → auto-installed).
    const pack = listPacks().find((p) => p.manifest.id === team.packId);
    expect(pack).toBeDefined();
    expect(pack!.manifest.publisher).toBe(USER_TEAM_PUBLISHER);
    expect(pack!.installedByDefault).toBe(true);

    // Project view: installed + enabled without any install step.
    const root = makeProjectRoot();
    tempDirs.push(root);
    const view = listProjectPacks(root).find((p) => p.manifest.id === team.packId);
    expect(view?.installed).toBe(true);
    expect(view?.enabled).toBe(true);
  });

  it("delete team removes it from catalog", () => {
    sealUserPacks();
    ensureUserPacksRegistered();
    const team = createUserTeam("Temp Team");
    expect(listUserTeams().map((t) => t.packId)).toContain(team.packId);

    deleteUserTeam(team.packId);
    expect(listUserTeams().map((t) => t.packId)).not.toContain(team.packId);
    expect(listPacks().find((p) => p.manifest.id === team.packId)).toBeUndefined();
  });

  it("requires a name", () => {
    sealUserPacks();
    expect(() => createUserTeam("   ")).toThrow();
  });

  it("saving an orchestrator into a user team appears in the project view (FQID under the team)", () => {
    sealUserPacks();
    ensureUserPacksRegistered();
    const team = createUserTeam("Writing Squad");
    const root = makeProjectRoot();
    tempDirs.push(root);

    // Sanity: the team must be in the catalog before saving into it.
    expect(listPacks().find((p) => p.manifest.id === team.packId)).toBeDefined();

    const saved = saveCustomOrchestrator(
      root,
      {
        name: "Lead Writer",
        description: "Writes sections",
        instructions: "You are the lead writer.",
      },
      team.packId,
    );

    // FQID lives under the user team pack (bare id; `saved.id` is the
    // agentFileBase form `<packId>--<id>` for non-local packs).
    const bareOrchId = saved.id!.split("--").pop()!;
    expect(saved.fqid).toBe(`${team.packId}:${bareOrchId}`);
    expect(saved.removable).toBe(true);
    expect(saved.builtin).toBe(false);

    // Resolver exposes it as enabled content of that team.
    const orch = listOrchestrators(root).find((o) => o.fqid === `${team.packId}:${bareOrchId}`);
    expect(orch).toBeDefined();
    expect(orch!.enabled).toBe(true);

    // Content shows under the team pack in the project view.
    const content = listContent(root, "orchestrator").find(
      (c) => c.fqid === `${team.packId}:${bareOrchId}`,
    );
    expect(content?.packId).toBe(team.packId);

    // Editing writes back to the same team (target inferred from fqid).
    const edited = saveCustomOrchestrator(
      root,
      {
        id: saved.id,
        name: "Lead Writer 2",
        description: "Writes sections",
        instructions: "Updated.",
      },
      team.packId,
    );
    expect(edited.fqid).toBe(`${team.packId}:${bareOrchId}`);

    // Delete removes it from the team.
    deleteCustomOrchestrator(root, saved.id);
    expect(listOrchestrators(root).find((o) => o.fqid === `${team.packId}:${bareOrchId}`)).toBeUndefined();
  });

  it("saving an expert into a user team works too", () => {
    sealUserPacks();
    ensureUserPacksRegistered();
    const team = createUserTeam("Research Helpers");
    const root = makeProjectRoot();
    tempDirs.push(root);

    const saved = saveCustomExpert(
      root,
      {
        name: "Citation Helper",
        description: "Formats citations",
        instructions: "Fix citations.",
      },
      team.packId,
    );
    const bareExpertId = saved.id!.split("--").pop()!;
    expect(saved.fqid).toBe(`${team.packId}:${bareExpertId}`);
    const expert = listContent(root, "expert").find((c) => c.fqid === `${team.packId}:${bareExpertId}`);
    expect(expert?.packId).toBe(team.packId);
  });
});
