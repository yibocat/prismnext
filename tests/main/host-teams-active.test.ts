import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import { invalidateCatalog } from "../../src/main/teams/catalog";
import { __resetTeamsResolverForTests } from "../../src/main/teams/resolver";
import { setAppTeamsDirForTests } from "../../src/main/teams/scope";
import { setAppTeamsStateDataDir, writeAppTeamsState } from "../../src/main/teams/state-app";
import { readProjectTeamsState } from "../../src/main/teams/state-project";
import { emptyAppTeamsState } from "../../src/shared/teams/state";
import { MY_CONTENT_LEAD_ID, MY_CONTENT_TEAM_ID } from "../../src/shared/teams/types";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("Host setActiveTeam", () => {
  const prevTeams = process.env.PRISM_FIRST_PARTY_TEAMS_DIR;

  afterEach(() => {
    __resetTeamsResolverForTests();
    setWorkbenchUserHomeOverride(null);
    setAppTeamsDirForTests(null);
    setAppTeamsStateDataDir(null);
    invalidateCatalog();
    if (prevTeams === undefined) delete process.env.PRISM_FIRST_PARTY_TEAMS_DIR;
    else process.env.PRISM_FIRST_PARTY_TEAMS_DIR = prevTeams;
  });

  it("records 通用团队 without requiring a pre-existing Host catalog lead", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-active-"));
    setWorkbenchUserHomeOverride(home);
    process.env.PRISM_FIRST_PARTY_TEAMS_DIR = join(process.cwd(), "resources", "teams");
    setAppTeamsDirForTests(join(home, ".prismnext", "teams"));
    setAppTeamsStateDataDir(join(home, ".prismnext"));
    writeAppTeamsState(emptyAppTeamsState());

    const paper = join(home, "paper");
    mkdirSync(join(paper, ".workbench", "agent"), { recursive: true });

    const ctx = createHostContext();
    ctx.remoteRoot = paper;
    await dispatchHostMethod("teams:setActiveTeam", {
      projectRoot: paper,
      teamId: MY_CONTENT_TEAM_ID,
      scope: "project",
    }, ctx);

    expect(readProjectTeamsState(paper).defaultTeam).toBe(MY_CONTENT_TEAM_ID);
    expect(
      existsSync(
        join(home, ".prismnext", "teams", MY_CONTENT_TEAM_ID, "orchestrators", MY_CONTENT_LEAD_ID, "orchestrator.json"),
      ),
    ).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(home, ".prismnext", "teams", MY_CONTENT_TEAM_ID, "team.json"), "utf-8"),
    ) as { id?: string };
    expect(manifest.id).toBe(MY_CONTENT_TEAM_ID);
  });
});
