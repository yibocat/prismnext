import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createTeam, promoteTeam } from "../../src/main/teams/lifecycle";
import { saveProjectAssetOverride, readProjectTeamsState } from "../../src/main/teams/state-project";
import { setAppTeamsDirForTests } from "../../src/main/teams/scope";
import { setAppTeamsStateDataDir } from "../../src/main/teams/state-app";
import { __resetTeamsResolverForTests } from "../../src/main/teams/resolver";
import { makeProjectRoot, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

afterEach(() => {
  setAppTeamsDirForTests(null);
  setAppTeamsStateDataDir(null);
  __resetTeamsResolverForTests();
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("Team lifecycle reference rewrites", () => {
  it("rewrites FQIDs inside project override allowedExperts when promoting a Team", () => {
    const appRoot = makeTempDir("teams-lifecycle-app-");
    const projectRoot = makeProjectRoot();
    tempDirs.push(appRoot, projectRoot);
    setAppTeamsDirForTests(join(appRoot, "teams"));
    setAppTeamsStateDataDir(appRoot);

    const team = createTeam({ name: "Project reviewers", scope: "project", projectRoot });
    saveProjectAssetOverride(projectRoot, `${team.teamId}:lead`, {
      allowedExperts: [`${team.teamId}:critic`],
    });

    const { newTeamId } = promoteTeam(team.teamId, projectRoot);
    const state = readProjectTeamsState(projectRoot);
    expect(state.assetOverrides[`${newTeamId}:lead`]?.allowedExperts).toEqual([
      `${newTeamId}:critic`,
    ]);
  });

  it("rewrites a command frontmatter agent FQID when promoting a Team", () => {
    const appRoot = makeTempDir("teams-lifecycle-app-");
    const projectRoot = makeProjectRoot();
    tempDirs.push(appRoot, projectRoot);
    setAppTeamsDirForTests(join(appRoot, "teams"));
    setAppTeamsStateDataDir(appRoot);

    const team = createTeam({ name: "Project commands", scope: "project", projectRoot });
    const commandsDir = join(team.dir, "commands");
    mkdirSync(commandsDir, { recursive: true });
    writeFileSync(
      join(commandsDir, "review.md"),
      `---\ndescription: Review\nagent: ${team.teamId}:lead\n---\nReview\n`,
    );

    const { newTeamId } = promoteTeam(team.teamId, projectRoot);
    const command = readFileSync(
      join(appRoot, "teams", newTeamId, "commands", "review.md"),
      "utf-8",
    );
    expect(command).toContain(`agent: ${newTeamId}:lead`);
  });
});
