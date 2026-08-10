import { afterEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createTeam } from "../../src/main/teams/lifecycle";
import { saveCustomSubagent } from "../../src/main/services/subagents-sync";
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

describe("writable Team agent ownership", () => {
  it("rejects legacy user.local as a writable target after M8", () => {
    const appRoot = makeTempDir("teams-writable-app-");
    const projectRoot = makeProjectRoot();
    tempDirs.push(appRoot, projectRoot);
    setAppTeamsDirForTests(join(appRoot, "teams"));
    setAppTeamsStateDataDir(appRoot);

    expect(() =>
      saveCustomSubagent(
        projectRoot,
        {
          name: "Methods critic",
          description: "Reviews methods",
          instructions: "Review the research method.",
        },
        "user.local",
      ),
    ).toThrow(/target team not found/i);
  });

  it("writes a custom subagent into a v2 app Team rather than legacy user-packs", () => {
    const appRoot = makeTempDir("teams-writable-app-");
    const projectRoot = makeProjectRoot();
    tempDirs.push(appRoot, projectRoot);
    setAppTeamsDirForTests(join(appRoot, "teams"));
    setAppTeamsStateDataDir(appRoot);

    const team = createTeam({ name: "Global research", scope: "app" });
    const saved = saveCustomSubagent(
      projectRoot,
      {
        name: "Methods critic",
        description: "Reviews methods",
        instructions: "Review the research method.",
      },
      team.teamId,
    );

    expect(saved.fqid).toMatch(new RegExp(`^${team.teamId}:`));
    const bareId = saved.fqid!.split(":")[1]!;
    expect(existsSync(join(team.dir, "subagents", bareId, "subagent.json"))).toBe(true);
  });
});
