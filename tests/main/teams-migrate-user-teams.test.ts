import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrateUserTeams } from "../../src/main/teams/migrate-user-teams";
import { makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("M2 user-packs → app teams", () => {
  it("uses the manifest id as the canonical directory and upgrades the manifest", () => {
    const root = makeTempDir("m2-user-");
    tempDirs.push(root);
    const legacyRoot = join(root, "user-packs");
    const teamsRoot = join(root, "teams");
    const legacyDir = join(legacyRoot, "my-content");
    mkdirSync(join(legacyDir, "commands"), { recursive: true });
    writeFileSync(
      join(legacyDir, "plugin.json"),
      JSON.stringify({
        id: "user.my-content",
        name: "My Content",
        version: "0.1.0",
        tier: "free",
        publisher: "user",
        contents: { commands: [{ id: "old-command" }] },
      }),
    );
    writeFileSync(join(legacyDir, "commands", "old-command.md"), "---\ndescription: Old\n---\nOld\n");

    expect(migrateUserTeams({ legacyRoot, teamsRoot })).toEqual({
      moved: ["user.my-content"],
      conflicts: [],
    });

    const target = join(teamsRoot, "user.my-content");
    expect(existsSync(legacyDir)).toBe(false);
    expect(existsSync(join(target, "commands", "old-command.md"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(target, "team.json"), "utf-8"));
    expect(manifest.id).toBe("user.my-content");
    expect(manifest.formatVersion).toBe(2);
    expect(manifest.contents).toBeUndefined();
    expect(migrateUserTeams({ legacyRoot, teamsRoot })).toEqual({ moved: [], conflicts: [] });
  });
});
