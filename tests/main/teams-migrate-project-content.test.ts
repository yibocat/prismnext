/**
 * M8 / M11 project content migration.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ensureProjectContentMigrated,
  projectDefaultTeamDir,
} from "../../src/main/teams/migrate-project-content";
import {
  listAssets,
  resolveChatOrchestrator,
  resolveRoster,
  __resetTeamsResolverForTests,
} from "../../src/main/teams/resolver";
import { setAppTeamsStateDataDir } from "../../src/main/teams/state-app";
import { setProjectDefaultTeam } from "../../src/main/teams/state-project";
import { makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setAppTeamsStateDataDir(null);
  __resetTeamsResolverForTests();
});

function project(): string {
  const root = makeTempDir("m8-proj-");
  tempDirs.push(root);
  return root;
}

describe("leftover paper .prismnext is not migrated (D-30)", () => {
  it("does not move leftover local/ into the workbench hangar", () => {
    const root = project();
    const local = join(root, ".prismnext", "agent", "local");
    const expertDir = join(local, "experts", "note-taker");
    mkdirSync(expertDir, { recursive: true });
    writeFileSync(
      join(expertDir, "expert.json"),
      JSON.stringify({
        id: "note-taker",
        name: "Note Taker",
        description: "Takes notes",
      }),
    );
    writeFileSync(join(expertDir, "instructions.md"), "Take notes.\n");

    expect(ensureProjectContentMigrated(root)).toBe(false);
    expect(existsSync(local)).toBe(true);
    expect(existsSync(projectDefaultTeamDir(root))).toBe(false);
    expect(listAssets(root, "subagent").some((a) => a.fqid === "project.local:note-taker")).toBe(
      false,
    );
  });
});

describe("existing workbench hangar", () => {
  it("preserves an existing project.local custom lead, active default, and roster", () => {
    const root = project();
    const dest = projectDefaultTeamDir(root);
    const leadDir = join(dest, "orchestrators", "custom-lead");
    const reviewerDir = join(dest, "subagents", "reviewer");
    mkdirSync(leadDir, { recursive: true });
    mkdirSync(reviewerDir, { recursive: true });
    writeFileSync(
      join(dest, "team.json"),
      JSON.stringify({
        id: "project.local",
        name: "Project Team",
        description: "local",
        version: "0.1.0",
        tier: "free",
        publisher: "user",
      }),
    );
    writeFileSync(
      join(leadDir, "orchestrator.json"),
      JSON.stringify({
        id: "custom-lead",
        name: "Custom lead",
        description: "active local lead",
        roster: { mode: "list", members: ["project.local:reviewer"] },
      }),
    );
    writeFileSync(join(leadDir, "instructions.md"), "custom lead\n");
    writeFileSync(
      join(reviewerDir, "subagent.json"),
      JSON.stringify({ id: "reviewer", name: "Reviewer", description: "reviews" }),
    );
    writeFileSync(join(reviewerDir, "instructions.md"), "review\n");
    setProjectDefaultTeam(root, "project.local");

    ensureProjectContentMigrated(root);

    expect(resolveChatOrchestrator(root).fqid).toBe("project.local:custom-lead");
    const roster = resolveRoster(root, "project.local")!;
    expect(roster.orchestratorFqid).toBe("project.local:custom-lead");
    expect(roster.entries.map((entry) => entry.fqid)).toEqual(["project.local:reviewer"]);
  });

  it("does not merge leftover local/ into an existing workbench hangar", () => {
    const root = project();
    const local = join(root, ".prismnext", "agent", "local");
    const dest = projectDefaultTeamDir(root);
    mkdirSync(join(local, "skills", "legacy-skill"), { recursive: true });
    writeFileSync(join(local, "skills", "legacy-skill", "SKILL.md"), "# Legacy\n");
    mkdirSync(join(dest, "commands"), { recursive: true });
    writeFileSync(
      join(dest, "team.json"),
      JSON.stringify({ id: "project.local", name: "Project Team", version: "0.1.0", tier: "free", publisher: "user" }),
    );
    writeFileSync(join(dest, "commands", "existing.md"), "---\ndescription: Existing\n---\nExisting\n");

    ensureProjectContentMigrated(root);
    expect(existsSync(local)).toBe(true);
    expect(existsSync(join(dest, "skills", "legacy-skill", "SKILL.md"))).toBe(false);
    expect(existsSync(join(dest, "commands", "existing.md"))).toBe(true);
  });
});

describe("leftover agent/mcp.json is not migrated (D-30)", () => {
  it("leaves leftover mcp.json in place and does not plant a hangar", () => {
    const root = project();
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          "demo-stdio": { command: "npx", args: ["-y", "demo"], enabled: true },
        },
      }),
    );

    expect(ensureProjectContentMigrated(root)).toBe(false);
    expect(existsSync(join(agentDir, "mcp.json"))).toBe(true);
    expect(existsSync(projectDefaultTeamDir(root))).toBe(false);
  });
});

describe("no empty hangar seed", () => {
  it("leaves a paper folder without .prismnext when there is nothing to migrate", () => {
    const root = project();
    expect(ensureProjectContentMigrated(root)).toBe(false);
    expect(existsSync(join(root, ".prismnext"))).toBe(false);
  });
});
