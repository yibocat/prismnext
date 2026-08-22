import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteProjectSkill,
  installProjectSkill,
  listProjectSkills,
  syncProjectSkillsIntegration,
} from "../../src/main/skills/skills-sync";
import { setAppTeamEnabled, setAppTeamsStateDataDir } from "../../src/main/teams/state-app";
import { __resetTeamsResolverForTests, listTeams } from "../../src/main/teams/resolver";
import {
  listExternalTeamRoots,
  registerExternalTeamRoot,
  unregisterExternalTeamRoot,
} from "../../src/main/teams/catalog";
import { MY_CONTENT_TEAM_ID } from "../../src/shared/teams/types";
import {
  homeSkillDir,
  setWorkbenchUserHomeOverride,
} from "../../src/main/workbench/home";
import { makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function temp(prefix = "wb-home-skills-"): string {
  const dir = makeTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  const home = temp("wb-home-");
  setWorkbenchUserHomeOverride(home);
  setAppTeamsStateDataDir(join(home, ".prismnext"));
});

afterEach(() => {
  setWorkbenchUserHomeOverride(null);
  setAppTeamsStateDataDir(null);
  __resetTeamsResolverForTests();
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("workbench home skills + global team enable", () => {
  it("writes a user skill to ~/.prismnext/skills and leaves the paper clean", () => {
    const paper = temp("paper-");
    const result = installProjectSkill(
      paper,
      "my-flow",
      "---\nname: my-flow\ndescription: Use when distilling a flow.\n---\n# Flow\n",
    );

    expect(result.teamId).toBe(MY_CONTENT_TEAM_ID);
    expect(result.dir).toBe(homeSkillDir("my-flow"));
    expect(existsSync(join(homeSkillDir("my-flow"), "SKILL.md"))).toBe(true);
    expect(existsSync(join(paper, ".prismnext"))).toBe(false);
    expect(existsSync(join(paper, ".workbench"))).toBe(false);

    const listed = listProjectSkills(paper);
    expect(listed.some((s) => s.fqid === `${MY_CONTENT_TEAM_ID}:my-flow`)).toBe(true);

    syncProjectSkillsIntegration(paper);
    expect(existsSync(join(paper, ".prismnext"))).toBe(false);

    deleteProjectSkill(paper, `${MY_CONTENT_TEAM_ID}:my-flow`);
    expect(existsSync(homeSkillDir("my-flow"))).toBe(false);
  });

  it("does not list leftover project.local skills", () => {
    const paper = temp("paper-");
    const leftover = join(
      paper,
      ".prismnext/agent/teams/project.local/skills/old-one",
    );
    mkdirSync(leftover, { recursive: true });
    writeFileSync(
      join(leftover, "SKILL.md"),
      "---\nname: old-one\ndescription: leftover\n---\n",
      "utf-8",
    );

    expect(listProjectSkills(paper).some((s) => s.id === "old-one")).toBe(false);
    expect(readFileSync(join(leftover, "SKILL.md"), "utf-8")).toContain("leftover");
  });

  it("disabling a team in workbench state hides it from every project", () => {
    const paperA = temp("paper-a-");
    const paperB = temp("paper-b-");
    const teamsRoot = temp("teams-");
    mkdirSync(join(teamsRoot, "acme.shared"), { recursive: true });
    writeFileSync(
      join(teamsRoot, "acme.shared", "team.json"),
      JSON.stringify({
        id: "acme.shared",
        name: "Shared",
        description: "d",
        version: "1.0.0",
        packFormatVersion: 1,
        tier: "free",
        publisher: "acme",
      }),
      "utf-8",
    );

    registerExternalTeamRoot(teamsRoot, "user");
    try {
      expect(listTeams(paperA).find((t) => t.manifest.id === "acme.shared")?.enabled).toBe(true);
      setAppTeamEnabled("acme.shared", false);
      expect(listTeams(paperA).find((t) => t.manifest.id === "acme.shared")?.enabled).toBe(false);
      expect(listTeams(paperB).find((t) => t.manifest.id === "acme.shared")?.enabled).toBe(false);
    } finally {
      for (const dir of listExternalTeamRoots()) unregisterExternalTeamRoot(dir);
    }
  });
});
