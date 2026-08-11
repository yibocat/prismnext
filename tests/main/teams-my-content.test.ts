/**
 * Common (user.my-content) safety-net team — Chat roster is @team ($pack),
 * not Core's experts and not mode "all".
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureMyContentTeam } from "../../src/main/teams/my-content";
import { setAppTeamsDirForTests } from "../../src/main/teams/scope";
import {
  MY_CONTENT_LEAD_ID,
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
  PROJECT_LOCAL_LEAD_ID,
} from "../../src/shared/teams/types";
import { makeTempDir } from "./packs-test-utils";
import {
  deleteCustomOrchestrator,
  saveCustomOrchestrator,
  saveCustomSubagent,
} from "../../src/main/services/subagents-sync";
import { createTeam } from "../../src/main/teams/lifecycle";
import {
  ensureProjectContentMigrated,
  ensureProjectDefaultTeamDir,
} from "../../src/main/teams/migrate-project-content";
import { getTeamRecord, invalidateCatalog, scanAllTeams } from "../../src/main/teams/catalog";
import { resolveRoster } from "../../src/main/teams/resolver";
import { existsSync } from "node:fs";

const tempDirs: string[] = [];

afterEach(() => {
  setAppTeamsDirForTests(null);
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("ensureMyContentTeam", () => {
  it("seeds Chat with $pack allowlist (own-team @team, not mode all)", () => {
    const root = makeTempDir("my-content-");
    tempDirs.push(root);
    setAppTeamsDirForTests(root);

    const { createdOrRepaired } = ensureMyContentTeam();
    expect(createdOrRepaired).toBe(true);

    const jsonPath = join(root, MY_CONTENT_TEAM_ID, "orchestrators", MY_CONTENT_LEAD_ID, "orchestrator.json");
    const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
      allowedExperts?: unknown;
      roster?: unknown;
    };
    expect(raw.allowedExperts).toEqual(["$pack"]);
    expect(raw.roster).toBeUndefined();

    const manifest = JSON.parse(
      readFileSync(join(root, MY_CONTENT_TEAM_ID, "team.json"), "utf-8"),
    ) as { name?: string };
    expect(manifest.name).toBe("Common Team");
  });

  it("repairs mode-all and empty-list Chat rosters to $pack", () => {
    const root = makeTempDir("my-content-repair-");
    tempDirs.push(root);
    setAppTeamsDirForTests(root);
    const orchDir = join(root, MY_CONTENT_TEAM_ID, "orchestrators", MY_CONTENT_LEAD_ID);
    mkdirSync(orchDir, { recursive: true });
    writeFileSync(
      join(orchDir, "orchestrator.json"),
      JSON.stringify({
        id: MY_CONTENT_LEAD_ID,
        name: "Chat",
        description: "x",
        roster: { mode: "all" },
      }),
    );
    writeFileSync(
      join(root, MY_CONTENT_TEAM_ID, "team.json"),
      JSON.stringify({ id: MY_CONTENT_TEAM_ID, name: "My Content", publisher: "user", tier: "free", version: "1.0.0" }),
    );

    expect(ensureMyContentTeam().createdOrRepaired).toBe(true);
    const raw = JSON.parse(readFileSync(join(orchDir, "orchestrator.json"), "utf-8")) as {
      allowedExperts?: unknown;
      roster?: unknown;
    };
    expect(raw.allowedExperts).toEqual(["$pack"]);
    expect(raw.roster).toBeUndefined();
    const manifest = JSON.parse(
      readFileSync(join(root, MY_CONTENT_TEAM_ID, "team.json"), "utf-8"),
    ) as { name?: string };
    expect(manifest.name).toBe("Common Team");
  });

  it("repairs a previously seeded empty allowlist to $pack", () => {
    const root = makeTempDir("my-content-empty-");
    tempDirs.push(root);
    setAppTeamsDirForTests(root);
    const orchDir = join(root, MY_CONTENT_TEAM_ID, "orchestrators", MY_CONTENT_LEAD_ID);
    mkdirSync(orchDir, { recursive: true });
    writeFileSync(
      join(orchDir, "orchestrator.json"),
      JSON.stringify({
        id: MY_CONTENT_LEAD_ID,
        name: "Chat",
        allowedExperts: [],
      }),
    );
    writeFileSync(
      join(root, MY_CONTENT_TEAM_ID, "team.json"),
      JSON.stringify({ id: MY_CONTENT_TEAM_ID, name: "Common Team", publisher: "user", tier: "free", version: "1.0.0" }),
    );

    expect(ensureMyContentTeam().createdOrRepaired).toBe(true);
    const raw = JSON.parse(readFileSync(join(orchDir, "orchestrator.json"), "utf-8")) as {
      allowedExperts?: unknown;
    };
    expect(raw.allowedExperts).toEqual(["$pack"]);
  });
});

describe("Common Team lead guards", () => {
  it("refuses deleteCustomOrchestrator for Chat", () => {
    const root = makeTempDir("my-content-del-");
    tempDirs.push(root);
    setAppTeamsDirForTests(root);
    ensureMyContentTeam();
    const project = makeTempDir("my-content-proj-");
    tempDirs.push(project);

    expect(() =>
      deleteCustomOrchestrator(project, `${MY_CONTENT_TEAM_ID}:${MY_CONTENT_LEAD_ID}`),
    ).toThrow(/cannot be deleted/i);
  });

  it("refuses saveCustomOrchestrator into Common Team", () => {
    const root = makeTempDir("my-content-save-");
    tempDirs.push(root);
    setAppTeamsDirForTests(root);
    ensureMyContentTeam();
    const project = makeTempDir("my-content-proj2-");
    tempDirs.push(project);

    expect(() =>
      saveCustomOrchestrator(
        project,
        {
          name: "Another Lead",
          description: "nope",
          instructions: "Should not land in Common Team.",
        },
        MY_CONTENT_TEAM_ID,
      ),
    ).toThrow(/Cannot create or edit lead agents in Common Team/i);
  });
});

describe("createTeam seeds a lead", () => {
  it("writes orchestrators/lead with $pack roster for a new app team", () => {
    const root = makeTempDir("create-team-lead-");
    tempDirs.push(root);
    setAppTeamsDirForTests(root);

    const { dir } = createTeam({
      name: "Writers",
      scope: "app",
      description: "Writing helpers",
      longDescription: "A desk for drafting.",
      tags: ["writing", "draft"],
      leadName: "Chief Writer",
      leadInstructions: "Lead the writing desk.\n",
    });
    const leadPath = join(dir, "orchestrators", "lead", "orchestrator.json");
    expect(existsSync(leadPath)).toBe(true);
    expect(existsSync(join(dir, "orchestrators", "lead", "instructions.md"))).toBe(true);
    const raw = JSON.parse(readFileSync(leadPath, "utf-8")) as {
      allowedExperts?: unknown;
      name?: string;
    };
    expect(raw.allowedExperts).toEqual(["$pack"]);
    expect(raw.name).toBe("Chief Writer");
    expect(readFileSync(join(dir, "orchestrators", "lead", "instructions.md"), "utf-8")).toContain(
      "Lead the writing desk",
    );
    const manifest = JSON.parse(readFileSync(join(dir, "team.json"), "utf-8")) as {
      description?: string;
      longDescription?: string;
      tags?: string[];
      publisher?: string;
    };
    expect(manifest.description).toBe("Writing helpers");
    expect(manifest.longDescription).toBe("A desk for drafting.");
    expect(manifest.tags).toEqual(["writing", "draft"]);
    expect(manifest.publisher).toBe("user");
  });
});

describe("project.local hangar", () => {
  it("seeds empty project.local on migrate even with no user content yet", () => {
    const project = makeTempDir("project-local-empty-seed-");
    tempDirs.push(project);
    expect(ensureProjectContentMigrated(project)).toBe(true);
    const dest = join(project, ".prismnext", "agent", "teams", PROJECT_DEFAULT_TEAM_ID);
    expect(existsSync(join(dest, "team.json"))).toBe(true);
    expect(existsSync(join(dest, "orchestrators", PROJECT_LOCAL_LEAD_ID, "orchestrator.json"))).toBe(
      true,
    );
    const seeded = JSON.parse(readFileSync(join(dest, "team.json"), "utf-8")) as { name?: string };
    expect(seeded.name).toBe("Project Team");
    invalidateCatalog();
    const record = getTeamRecord(PROJECT_DEFAULT_TEAM_ID, [project]);
    expect(record?.hasOrchestrator).toBe(true);
    expect(scanAllTeams([project]).some((t) => t.manifest.id === PROJECT_DEFAULT_TEAM_ID)).toBe(
      true,
    );
  });

  it("rewrites legacy Chinese project.local display name to English canonical", () => {
    const project = makeTempDir("project-local-rename-");
    tempDirs.push(project);
    const dest = join(project, ".prismnext", "agent", "teams", PROJECT_DEFAULT_TEAM_ID);
    mkdirSync(dest, { recursive: true });
    writeFileSync(
      join(dest, "team.json"),
      `${JSON.stringify(
        {
          id: PROJECT_DEFAULT_TEAM_ID,
          name: "本项目团队",
          description: "legacy",
          version: "0.0.0",
          formatVersion: 2,
          tier: "free",
          publisher: "user",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    expect(ensureProjectContentMigrated(project)).toBe(true);
    const renamed = JSON.parse(readFileSync(join(dest, "team.json"), "utf-8")) as { name?: string };
    expect(renamed.name).toBe("Project Team");
  });

  it("seeds a Project lead and surfaces subagents in getTeamRecord", () => {
    const project = makeTempDir("project-local-hangar-");
    tempDirs.push(project);
    const dest = ensureProjectDefaultTeamDir(project);
    const leadPath = join(dest, "orchestrators", PROJECT_LOCAL_LEAD_ID, "orchestrator.json");
    expect(existsSync(leadPath)).toBe(true);
    const lead = JSON.parse(readFileSync(leadPath, "utf-8")) as { allowedExperts?: unknown };
    expect(lead.allowedExperts).toEqual(["$pack"]);

    saveCustomSubagent(
      project,
      {
        name: "Local Helper",
        description: "project scoped",
        instructions: "Help with this project.",
      },
      PROJECT_DEFAULT_TEAM_ID,
    );
    invalidateCatalog();
    const record = getTeamRecord(PROJECT_DEFAULT_TEAM_ID, [project]);
    expect(record?.assets.some((a) => a.kind === "subagent" && a.name === "Local Helper")).toBe(
      true,
    );
    expect(record?.hasOrchestrator).toBe(true);

    const roster = resolveRoster(project, PROJECT_DEFAULT_TEAM_ID);
    expect(roster?.entries.some((e) => e.name === "Local Helper")).toBe(true);
  });

  it("allows editing the project hangar lead (unlike Common Chat)", () => {
    const project = makeTempDir("project-local-lead-edit-");
    tempDirs.push(project);
    ensureProjectDefaultTeamDir(project);

    const saved = saveCustomOrchestrator(
      project,
      {
        id: PROJECT_LOCAL_LEAD_ID,
        name: "Project Lead Edited",
        description: "project hangar",
        instructions: "Coordinate this project's work.",
      },
      PROJECT_DEFAULT_TEAM_ID,
    );
    expect(saved.fqid).toBe(`${PROJECT_DEFAULT_TEAM_ID}:${PROJECT_LOCAL_LEAD_ID}`);
    expect(saved.name).toBe("Project Lead Edited");

    const onDisk = JSON.parse(
      readFileSync(
        join(
          project,
          ".prismnext",
          "agent",
          "teams",
          PROJECT_DEFAULT_TEAM_ID,
          "orchestrators",
          PROJECT_LOCAL_LEAD_ID,
          "orchestrator.json",
        ),
        "utf-8",
      ),
    ) as { name?: string };
    expect(onDisk.name).toBe("Project Lead Edited");
  });
});

describe("Common Chat roster expands own subagents", () => {
  it("new Common subagent appears on Chat resolveRoster", () => {
    const appRoot = makeTempDir("common-roster-app-");
    tempDirs.push(appRoot);
    setAppTeamsDirForTests(appRoot);
    ensureMyContentTeam();

    const project = makeTempDir("common-roster-proj-");
    tempDirs.push(project);
    saveCustomSubagent(
      project,
      {
        name: "Cross Helper",
        description: "app hangar subagent",
        instructions: "Help across projects.",
      },
      MY_CONTENT_TEAM_ID,
    );
    invalidateCatalog();

    const roster = resolveRoster(project, MY_CONTENT_TEAM_ID);
    expect(roster?.spec.mode).toBe("list");
    expect(roster?.spec.mode === "list" && roster.spec.members.includes("@team")).toBe(true);
    expect(roster?.entries.some((e) => e.name === "Cross Helper")).toBe(true);
  });
});
