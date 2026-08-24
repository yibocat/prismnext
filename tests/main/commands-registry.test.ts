/**
 * CommandRegistry — resolver facade for slash commands.
 *
 * App-level commands live in `resources/commands/` (FQID `app:<name>`).
 * Team commands stay under team dirs. Tests seal PRISM_APP_COMMANDS_DIR.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  getCommandRegistry,
  __resetCommandRegistriesForTests,
} from "../../src/main/commands/registry";
import {
  registerExternalTeamRoot,
  listExternalTeamRoots,
  unregisterExternalTeamRoot,
} from "../../src/main/teams/catalog";
import { setTeamEnabled } from "../../src/main/teams/lifecycle";
import {
  addInstalledTeam,
  setTeamsInstalledDataDir,
} from "../../src/main/teams/teams-installed";
import { setAppTeamsStateDataDir } from "../../src/main/teams/state-app";
import {
  __resetTeamsResolverForTests,
  listEffectiveSlashCommands,
  resolveCommandsRoster,
} from "../../src/main/teams/resolver";
import { setAppTeamsDirForTests } from "../../src/main/teams/scope";
import {
  APP_COMMANDS_OWNER_ID,
  CORE_TEAM_ID,
  isProjectLocalTeamId,
  PROJECT_DEFAULT_TEAM_ID,
  PROJECT_TEAMS_REL,
} from "../../src/shared/teams/types";
import { rewriteCoreAppCommandFqid } from "../../src/shared/teams/state";
import { baseManifest, makePack, makeProjectRoot, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function temp(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

function project(): string {
  const root = makeProjectRoot();
  tempDirs.push(root);
  return root;
}

function sealAppCommands(): void {
  const dir = temp();
  process.env.PRISM_APP_COMMANDS_DIR = dir;
  writeFileSync(
    join(dir, "setup.md"),
    "---\ndescription: Setup\norder: 0\n---\nSetup body\n",
  );
  writeFileSync(
    join(dir, "shared.md"),
    "---\ndescription: Shared\norder: 1\n---\nShared body\n",
  );
}

beforeEach(() => {
  const dir = makeTempDir("packs-app-");
  tempDirs.push(dir);
  setTeamsInstalledDataDir(dir);
  setAppTeamsStateDataDir(dir);
  setAppTeamsDirForTests(join(dir, "teams"));
  sealAppCommands();
});

afterEach(() => {
  __resetCommandRegistriesForTests();
  __resetTeamsResolverForTests();
  for (const dir of listExternalTeamRoots()) unregisterExternalTeamRoot(dir);
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setTeamsInstalledDataDir(null);
  setAppTeamsStateDataDir(null);
  setAppTeamsDirForTests(null);
  delete process.env.PRISM_APP_COMMANDS_DIR;
});

function sealAppStore(): string {
  const dir = makeTempDir("packs-app-");
  setTeamsInstalledDataDir(dir);
  setAppTeamsStateDataDir(dir);
  setAppTeamsDirForTests(join(dir, "teams"));
  tempDirs.push(dir);
  return dir;
}

/** Core team without slash commands + free pack (notes-cmd). */
function setupPacks(): void {
  const coreRoot = temp();
  makePack(coreRoot, "prismnext.core", baseManifest(CORE_TEAM_ID, { publisher: "prismnext" }), {
    commands: [],
  });
  registerExternalTeamRoot(coreRoot, "bundled");

  const notesRoot = temp();
  makePack(notesRoot, "test.notes", baseManifest("test.notes", { name: "Notes" }), {
    commands: [{ name: "notes-cmd", md: "---\ndescription: NC\norder: 2\n---\nNC body\n" }],
  });
  registerExternalTeamRoot(notesRoot);
}

describe("commands registry: app layer + identity", () => {
  it("项目默认团队身份只接受 project.local，旧 user.local 只可用于迁移", () => {
    expect(isProjectLocalTeamId(PROJECT_DEFAULT_TEAM_ID)).toBe(true);
    expect(isProjectLocalTeamId("user.local")).toBe(false);
  });

  it("app 命令以 FQID app:<name> 出现（source=builtin）；与 Core team 无关", () => {
    setupPacks();
    const root = project();
    sealAppStore();
    const reg = getCommandRegistry(root);

    const list = reg.list();
    const setup = list.find((c) => c.id === `${APP_COMMANDS_OWNER_ID}:setup`);
    expect(setup).toBeDefined();
    expect(setup!.source).toBe("builtin");
    expect(setup!.teamId).toBe(APP_COMMANDS_OWNER_ID);
    expect(setup!.removable).toBe(false);
    expect(setup!.enabled).toBe(true);
    expect(setup!.template).toBe("Setup body");

    expect(list.some((c) => c.id === `${CORE_TEAM_ID}:setup`)).toBe(false);
    expect(list.some((c) => c.name === "notes-cmd")).toBe(false);
  });

  it("legacy prismnext.core:<cmd> FQID 重写为 app:<cmd>", () => {
    expect(rewriteCoreAppCommandFqid(`${CORE_TEAM_ID}:compact`)).toBe(
      `${APP_COMMANDS_OWNER_ID}:compact`,
    );
    expect(rewriteCoreAppCommandFqid(`${CORE_TEAM_ID}:research-prism`)).toBe(
      `${CORE_TEAM_ID}:research-prism`,
    );
  });

  it("installPackRecord 后 plugin 命令出现（source=plugin）；禁用 pack 后消失", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    sealAppStore();
    addInstalledTeam("test.notes");
    const cmd = reg.list().find((c) => c.id === "test.notes:notes-cmd");
    expect(cmd).toBeDefined();
    expect(cmd!.source).toBe("plugin");
    expect(cmd!.teamName).toBe("Notes");
    expect(cmd!.removable).toBe(false);

    setTeamEnabled("test.notes", false, "project", root);
    expect(reg.list().find((c) => c.id === "test.notes:notes-cmd")!.enabled).toBe(false);
    expect(reg.lookup("notes-cmd")).toBeUndefined();
  });

  it("lookup 遮蔽：local 同名命令优先于 app；禁用 local 后 app 浮现", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    expect(reg.lookup("setup")!.id).toBe(`${APP_COMMANDS_OWNER_ID}:setup`);

    reg.create({ name: "setup", description: "Mine", template: "My body" });
    const hit = reg.lookup("setup")!;
    expect(hit.id).toBe(`${PROJECT_DEFAULT_TEAM_ID}:setup`);
    expect(hit.source).toBe("user");
    expect(hit.template).toBe("My body");

    reg.setEnabled(`${PROJECT_DEFAULT_TEAM_ID}:setup`, false);
    expect(reg.lookup("setup")!.id).toBe(`${APP_COMMANDS_OWNER_ID}:setup`);
  });

  it("lookup 跳过禁用命令：唯一实例禁用 → undefined", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.setEnabled(`${APP_COMMANDS_OWNER_ID}:shared`, false);
    expect(reg.lookup("shared")).toBeUndefined();
    reg.setEnabled(`${APP_COMMANDS_OWNER_ID}:shared`, true);
    expect(reg.lookup("shared")!.id).toBe(`${APP_COMMANDS_OWNER_ID}:shared`);
  });

  it("setEnabled 支持裸 id（按 resolver bare-id 规则解析）", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.setEnabled("shared", false);
    expect(
      reg.list().find((c) => c.id === `${APP_COMMANDS_OWNER_ID}:shared`)!.enabled,
    ).toBe(false);
    expect(() => reg.setEnabled("no-such-cmd", false)).toThrow(/not found/i);
  });

  it("effective slash set = app ∪ active team roster；roster 不含 app", () => {
    setupPacks();
    const root = project();
    sealAppStore();
    addInstalledTeam("test.notes");
    setTeamEnabled("test.notes", true, "app", root);
    const hangar = join(root, PROJECT_TEAMS_REL, PROJECT_DEFAULT_TEAM_ID);
    mkdirSync(hangar, { recursive: true });
    writeFileSync(
      join(hangar, "team.json"),
      JSON.stringify({
        id: PROJECT_DEFAULT_TEAM_ID,
        name: "This project",
        description: "hangar",
        version: "0.0.0",
        packFormatVersion: 1,
        tier: "free",
        publisher: "user",
      }),
    );

    const effective = listEffectiveSlashCommands(root, PROJECT_DEFAULT_TEAM_ID);
    expect(effective.some((c) => c.fqid === `${APP_COMMANDS_OWNER_ID}:setup`)).toBe(true);
    expect(effective.some((c) => c.fqid === "test.notes:notes-cmd")).toBe(false);

    const roster = resolveCommandsRoster(root, PROJECT_DEFAULT_TEAM_ID);
    expect(roster?.entries.every((e) => !e.fqid.startsWith(`${APP_COMMANDS_OWNER_ID}:`))).toBe(
      true,
    );
  });
});

describe("commands registry: CRUD 可写团队", () => {
  it("create 写入 project.local/commands/<name>.md，无 pluginId/enabled 行", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    const def = reg.create({
      name: "my-cmd",
      description: "Mine",
      template: "Do $ARGUMENTS",
      action: "compile",
    });
    expect(def.id).toBe(`${PROJECT_DEFAULT_TEAM_ID}:my-cmd`);
    expect(def.removable).toBe(true);

    const file = join(root, PROJECT_TEAMS_REL, PROJECT_DEFAULT_TEAM_ID, "commands", "my-cmd.md");
    expect(existsSync(file)).toBe(true);
    const raw = readFileSync(file, "utf-8");
    expect(raw).not.toContain("pluginId");
    expect(raw).not.toMatch(/^enabled:/m);
    expect(raw).toContain("action: compile");
    expect(raw).toContain("Do $ARGUMENTS");

    expect(reg.list().some((c) => c.id === `${PROJECT_DEFAULT_TEAM_ID}:my-cmd`)).toBe(true);
  });

  it("update 改名：旧文件删除、新 FQID 生效", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.create({ name: "before", description: "d", template: "t" });
    const updated = reg.update(`${PROJECT_DEFAULT_TEAM_ID}:before`, { name: "after", template: "t2" });
    expect(updated.id).toBe(`${PROJECT_DEFAULT_TEAM_ID}:after`);
    expect(updated.template).toBe("t2");
    expect(existsSync(join(root, PROJECT_TEAMS_REL, PROJECT_DEFAULT_TEAM_ID, "commands", "before.md"))).toBe(false);
    expect(existsSync(join(root, PROJECT_TEAMS_REL, PROJECT_DEFAULT_TEAM_ID, "commands", "after.md"))).toBe(true);
  });

  it("remove：local 命令删除成功；app/plugin 命令抛错（只能禁用）", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.create({ name: "doomed", description: "d", template: "t" });
    reg.remove(`${PROJECT_DEFAULT_TEAM_ID}:doomed`);
    expect(existsSync(join(root, PROJECT_TEAMS_REL, PROJECT_DEFAULT_TEAM_ID, "commands", "doomed.md"))).toBe(false);
    expect(reg.list().some((c) => c.name === "doomed")).toBe(false);

    expect(() => reg.remove(`${APP_COMMANDS_OWNER_ID}:setup`)).toThrow(/cannot delete/i);
  });
});

describe("commands registry: export/import 作用域 = 可写命令", () => {
  it("exportPack 只含 removable 命令；importPack rename 冲突策略生效", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.create({ name: "keep", description: "K", template: "kt" });
    const pack = reg.exportPack();
    expect(pack.commands.map((c) => c.name)).toEqual(["keep"]);

    const result = reg.importPack(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        commands: [
          { name: "keep", description: "K2", template: "k2" },
          { name: "fresh", description: "F", template: "ft", enabled: false },
        ],
      },
      "rename",
    );
    expect(result.imported).toBe(2);
    expect(result.renamed).toEqual([{ from: "keep", to: "keep-2" }]);

    const names = reg
      .list()
      .filter((c) => c.teamId === PROJECT_DEFAULT_TEAM_ID)
      .map((c) => c.name)
      .sort();
    expect(names).toEqual(["fresh", "keep", "keep-2"]);
    expect(reg.list().find((c) => c.id === `${PROJECT_DEFAULT_TEAM_ID}:fresh`)!.enabled).toBe(false);
  });
});
