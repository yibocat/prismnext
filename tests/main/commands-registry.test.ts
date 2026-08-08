/**
 * CommandRegistry（§5.6.3）测试 —— resolver 之上的命令门面。
 *
 * 测试密封（packs-test-utils）：真实 core pack 不可见，fake core / free
 * pack 走 registerExternalPackRoot。覆盖：FQID 身份、source 分层、pack
 * 安装/启停联动、local 遮蔽 core、逐项启停、CRUD 仅 local（P9）、
 * export/import 作用域。
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  getCommandRegistry,
  __resetCommandRegistriesForTests,
} from "../../src/main/commands/registry";
import {
  registerExternalPackRoot,
  listExternalPackRoots,
  unregisterExternalPackRoot,
} from "../../src/main/services/pack-catalog";
import { installPackRecord, setPackEnabled } from "../../src/main/services/packs-state";
import { CORE_PACK_ID, LOCAL_PACK_ID, LOCAL_PACK_REL } from "../../src/shared/packs/types";
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

afterEach(() => {
  __resetCommandRegistriesForTests();
  for (const dir of listExternalPackRoots()) unregisterExternalPackRoot(dir);
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

/** fake core（setup/shared 两条命令）+ free pack（notes-cmd） */
function setupPacks(): void {
  const coreRoot = temp();
  makePack(coreRoot, "prismnext.core", baseManifest(CORE_PACK_ID, { publisher: "prismnext" }), {
    commands: [
      { name: "setup", md: "---\ndescription: Setup\norder: 0\n---\nSetup body\n" },
      { name: "shared", md: "---\ndescription: Shared\norder: 1\n---\nShared body\n" },
    ],
  });
  registerExternalPackRoot(coreRoot);

  const notesRoot = temp();
  makePack(notesRoot, "test.notes", baseManifest("test.notes", { name: "Notes" }), {
    commands: [{ name: "notes-cmd", md: "---\ndescription: NC\norder: 2\n---\nNC body\n" }],
  });
  registerExternalPackRoot(notesRoot);
}

describe("commands registry: resolver 视图与身份（§5.6.3）", () => {
  it("core 命令以 FQID 身份出现（source=builtin）；未安装 pack 的命令不出现", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    const list = reg.list();
    const setup = list.find((c) => c.id === `${CORE_PACK_ID}:setup`);
    expect(setup).toBeDefined();
    expect(setup!.source).toBe("builtin");
    expect(setup!.packId).toBe(CORE_PACK_ID);
    expect(setup!.removable).toBe(false);
    expect(setup!.enabled).toBe(true);
    expect(setup!.template).toBe("Setup body");

    expect(list.some((c) => c.name === "notes-cmd")).toBe(false);
  });

  it("installPackRecord 后 plugin 命令出现（source=plugin）；禁用 pack 后消失", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    installPackRecord(root, { packId: "test.notes", version: "0.1.0" });
    const cmd = reg.list().find((c) => c.id === "test.notes:notes-cmd");
    expect(cmd).toBeDefined();
    expect(cmd!.source).toBe("plugin");
    expect(cmd!.packName).toBe("Notes");
    expect(cmd!.removable).toBe(false);

    // pack 禁用不摘除内容，而是整条判定链落到 enabled=false（§5.3：license → pack 启停 → 逐项禁用）
    setPackEnabled(root, "test.notes", false);
    expect(reg.list().find((c) => c.id === "test.notes:notes-cmd")!.enabled).toBe(false);
    // 禁用后不可被斜杠命中
    expect(reg.lookup("notes-cmd")).toBeUndefined();
  });

  it("lookup 遮蔽：local 同名命令优先于 core；禁用 local 后 core 浮现", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    // 无 local 副本时命中 core
    expect(reg.lookup("setup")!.id).toBe(`${CORE_PACK_ID}:setup`);

    // local 创建同名命令 → 遮蔽 core
    reg.create({ name: "setup", description: "Mine", template: "My body" });
    const hit = reg.lookup("setup")!;
    expect(hit.id).toBe(`${LOCAL_PACK_ID}:setup`);
    expect(hit.source).toBe("user");
    expect(hit.template).toBe("My body");

    // 禁用 local 遮蔽副本 → core 原件重新可见
    reg.setEnabled(`${LOCAL_PACK_ID}:setup`, false);
    expect(reg.lookup("setup")!.id).toBe(`${CORE_PACK_ID}:setup`);
  });

  it("lookup 跳过禁用命令：唯一实例禁用 → undefined", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.setEnabled(`${CORE_PACK_ID}:shared`, false);
    expect(reg.lookup("shared")).toBeUndefined();
    // 重新启用（FQID 原样）
    reg.setEnabled(`${CORE_PACK_ID}:shared`, true);
    expect(reg.lookup("shared")!.id).toBe(`${CORE_PACK_ID}:shared`);
  });

  it("setEnabled 支持裸 id（按 resolver bare-id 规则解析）", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.setEnabled("shared", false);
    expect(
      reg.list().find((c) => c.id === `${CORE_PACK_ID}:shared`)!.enabled,
    ).toBe(false);
    expect(() => reg.setEnabled("no-such-cmd", false)).toThrow(/not found/i);
  });
});

describe("commands registry: CRUD 仅 Local Pack（P9）", () => {
  it("create 写入 local/commands/<name>.md，无 pluginId/enabled 行", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    const def = reg.create({
      name: "my-cmd",
      description: "Mine",
      template: "Do $ARGUMENTS",
      action: "compile",
    });
    expect(def.id).toBe(`${LOCAL_PACK_ID}:my-cmd`);
    expect(def.removable).toBe(true);

    const file = join(root, LOCAL_PACK_REL, "commands", "my-cmd.md");
    expect(existsSync(file)).toBe(true);
    const raw = readFileSync(file, "utf-8");
    expect(raw).not.toContain("pluginId");
    expect(raw).not.toMatch(/^enabled:/m);
    expect(raw).toContain("action: compile");
    expect(raw).toContain("Do $ARGUMENTS");

    // 立即可被 resolver 视图看到
    expect(reg.list().some((c) => c.id === `${LOCAL_PACK_ID}:my-cmd`)).toBe(true);
  });

  it("update 改名：旧文件删除、新 FQID 生效", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.create({ name: "before", description: "d", template: "t" });
    const updated = reg.update(`${LOCAL_PACK_ID}:before`, { name: "after", template: "t2" });
    expect(updated.id).toBe(`${LOCAL_PACK_ID}:after`);
    expect(updated.template).toBe("t2");
    expect(existsSync(join(root, LOCAL_PACK_REL, "commands", "before.md"))).toBe(false);
    expect(existsSync(join(root, LOCAL_PACK_REL, "commands", "after.md"))).toBe(true);
  });

  it("remove：local 命令删除成功；core/plugin 命令抛错（只能禁用）", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.create({ name: "doomed", description: "d", template: "t" });
    reg.remove(`${LOCAL_PACK_ID}:doomed`);
    expect(existsSync(join(root, LOCAL_PACK_REL, "commands", "doomed.md"))).toBe(false);
    expect(reg.list().some((c) => c.name === "doomed")).toBe(false);

    expect(() => reg.remove(`${CORE_PACK_ID}:setup`)).toThrow(/cannot delete/i);
  });
});

describe("commands registry: export/import 作用域 = Local Pack", () => {
  it("exportPack 只含 local 命令；importPack rename 冲突策略生效", () => {
    setupPacks();
    const root = project();
    const reg = getCommandRegistry(root);

    reg.create({ name: "keep", description: "K", template: "kt" });
    const pack = reg.exportPack();
    expect(pack.commands.map((c) => c.name)).toEqual(["keep"]);

    // 导入含同名 + 新命令的 pack，rename 策略
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
      .filter((c) => c.packId === LOCAL_PACK_ID)
      .map((c) => c.name)
      .sort();
    expect(names).toEqual(["fresh", "keep", "keep-2"]);
    // enabled:false 的导入项落为 disabledContent
    expect(reg.list().find((c) => c.id === `${LOCAL_PACK_ID}:fresh`)!.enabled).toBe(false);
  });
});
