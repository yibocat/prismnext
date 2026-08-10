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
import { listAssets, __resetTeamsResolverForTests } from "../../src/main/teams/resolver";
import { setAppTeamsStateDataDir } from "../../src/main/teams/state-app";
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

describe("M8 local/ → teams/project.local/", () => {
  it("moves local content, writes team.json, renames experts → subagents", () => {
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

    const changed = ensureProjectContentMigrated(root);
    expect(changed).toBe(true);
    expect(existsSync(local)).toBe(false);

    const dest = projectDefaultTeamDir(root);
    expect(existsSync(join(dest, "team.json"))).toBe(true);
    expect(existsSync(join(dest, "subagents", "note-taker", "expert.json"))).toBe(true);
    expect(existsSync(join(dest, "experts"))).toBe(false);

    const again = ensureProjectContentMigrated(root);
    expect(again).toBe(false);

    const assets = listAssets(root, "subagent");
    expect(assets.some((a) => a.fqid === "project.local:note-taker")).toBe(true);
  });

  it("splits extra orchestrators into sibling project teams", () => {
    const root = project();
    const local = join(root, ".prismnext", "agent", "local");
    for (const id of ["alpha-lead", "beta-lead"]) {
      const dir = join(local, "orchestrators", id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "orchestrator.json"),
        JSON.stringify({ id, name: id, description: id }),
      );
      writeFileSync(join(dir, "instructions.md"), `${id}\n`);
    }

    ensureProjectContentMigrated(root);
    const dest = projectDefaultTeamDir(root);
    expect(existsSync(join(dest, "orchestrators", "alpha-lead", "orchestrator.json"))).toBe(true);
    expect(
      existsSync(
        join(
          root,
          ".prismnext",
          "agent",
          "teams",
          "project.local-beta-lead",
          "orchestrators",
          "beta-lead",
          "orchestrator.json",
        ),
      ),
    ).toBe(true);
  });

  it("merges a leftover local directory into an existing project.local team", () => {
    const root = project();
    const local = join(root, ".prismnext", "agent", "local");
    const dest = projectDefaultTeamDir(root);
    mkdirSync(join(local, "skills", "legacy-skill"), { recursive: true });
    writeFileSync(join(local, "skills", "legacy-skill", "SKILL.md"), "# Legacy\n");
    mkdirSync(join(dest, "commands"), { recursive: true });
    writeFileSync(
      join(dest, "team.json"),
      JSON.stringify({ id: "project.local", name: "This project", version: "0.1.0", tier: "free", publisher: "user" }),
    );
    writeFileSync(join(dest, "commands", "existing.md"), "---\ndescription: Existing\n---\nExisting\n");

    expect(ensureProjectContentMigrated(root)).toBe(true);
    expect(existsSync(local)).toBe(false);
    expect(existsSync(join(dest, "skills", "legacy-skill", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, "commands", "existing.md"))).toBe(true);
  });
});

describe("M11 agent/mcp.json → project.local/mcp.json", () => {
  it("converts object map to array and parks legacy file", () => {
    const root = project();
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          "demo-stdio": {
            command: "npx",
            args: ["-y", "demo"],
            enabled: true,
          },
          "off-server": {
            command: "echo",
            enabled: false,
          },
        },
      }),
    );

    const appDir = makeTempDir("m8-app-");
    tempDirs.push(appDir);
    setAppTeamsStateDataDir(appDir);

    expect(ensureProjectContentMigrated(root)).toBe(true);
    const newPath = join(projectDefaultTeamDir(root), "mcp.json");
    expect(existsSync(newPath)).toBe(true);
    expect(existsSync(join(agentDir, "mcp.json"))).toBe(false);

    const servers = JSON.parse(readFileSync(newPath, "utf-8")) as Array<{ id: string }>;
    expect(servers.map((s) => s.id).sort()).toEqual(["demo-stdio", "off-server"]);

    const mcps = listAssets(root, "mcp");
    expect(mcps.some((m) => m.id === "demo-stdio" && m.enabled)).toBe(true);
    expect(mcps.some((m) => m.id === "off-server" && !m.enabled)).toBe(true);

    expect(ensureProjectContentMigrated(root)).toBe(false);
  });

  it("merges legacy servers into an existing project.local array without replacing its entries", () => {
    const root = project();
    const agentDir = join(root, ".prismnext", "agent");
    const dest = projectDefaultTeamDir(root);
    mkdirSync(dest, { recursive: true });
    writeFileSync(
      join(dest, "mcp.json"),
      JSON.stringify([
        {
          id: "new-server",
          name: "new-server",
          transport: { type: "stdio", command: "new" },
        },
      ]),
    );
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          "legacy-server": { command: "legacy", enabled: true },
        },
      }),
    );

    expect(ensureProjectContentMigrated(root)).toBe(true);
    const servers = JSON.parse(readFileSync(join(dest, "mcp.json"), "utf-8")) as Array<{ id: string }>;
    expect(servers.map((server) => server.id).sort()).toEqual(["legacy-server", "new-server"]);
    expect(existsSync(join(agentDir, "mcp.json"))).toBe(false);
  });

  it("does not retain the retired paper-search-mcp while migrating other servers", () => {
    const root = project();
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          "paper-search-mcp": { command: "paper-search", enabled: true },
          retained: { command: "retained", enabled: true },
        },
      }),
    );

    expect(ensureProjectContentMigrated(root)).toBe(true);
    const servers = JSON.parse(
      readFileSync(join(projectDefaultTeamDir(root), "mcp.json"), "utf-8"),
    ) as Array<{ id: string }>;
    expect(servers.map((server) => server.id)).toEqual(["retained"]);
  });
});
