import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import {
  getLocalPackDir,
  getLocalPackView,
  getPack,
  getPackContents,
  getPackMcpDefs,
  listExternalPackRoots,
  listPacks,
  registerExternalPackRoot,
  scanLocalPackContents,
  unregisterExternalPackRoot,
} from "../../src/main/services/pack-catalog";
import { CORE_PACK_ID, LOCAL_PACK_ID } from "../../src/shared/packs/types";
import { baseManifest, makePack, makeProjectRoot, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function temp(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of listExternalPackRoots()) unregisterExternalPackRoot(dir);
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("pack-catalog: pack 根与发现", () => {
  it("注册 external root → listPacks 发现 pack；注销 → 消失", () => {
    const root = temp();
    makePack(root, "test.alpha", baseManifest("test.alpha", { name: "Alpha" }));
    registerExternalPackRoot(root);

    const packs = listPacks();
    const alpha = packs.find((p) => p.manifest.id === "test.alpha");
    expect(alpha).toBeDefined();
    expect(alpha!.kind).toBe("external");
    expect(alpha!.installedByDefault).toBe(false);

    unregisterExternalPackRoot(root);
    expect(listPacks().find((p) => p.manifest.id === "test.alpha")).toBeUndefined();
  });

  it("不合 packFormatVersion 1 的 manifest 被跳过", () => {
    const root = temp();
    makePack(root, "old.pack", {
      id: "old.pack",
      name: "Old",
      description: "legacy plugin.json（缺 packFormatVersion/publisher）",
      version: "0.1.0",
      tier: "free",
      source: "builtin",
    });
    registerExternalPackRoot(root);
    expect(getPack("old.pack")).toBeNull();
  });

  it("id = prismnext.core → kind=core 且 installedByDefault", () => {
    const root = temp();
    makePack(root, "prismnext.core", baseManifest(CORE_PACK_ID, { publisher: "prismnext" }));
    registerExternalPackRoot(root);
    const core = getPack(CORE_PACK_ID);
    expect(core!.kind).toBe("core");
    expect(core!.installedByDefault).toBe(true);
  });

  it("tier=pro 在无 license 环境 → locked=true；free → false", () => {
    const root = temp();
    makePack(root, "pro.pack", baseManifest("pro.pack", { tier: "pro", publisher: "prismnext.pro" }));
    makePack(root, "free.pack", baseManifest("free.pack"));
    registerExternalPackRoot(root);
    expect(getPack("pro.pack")!.locked).toBe(true);
    expect(getPack("free.pack")!.locked).toBe(false);
  });

  it("pack id 冲突：先到者保留", () => {
    const rootA = temp();
    const rootB = temp();
    makePack(rootA, "dup.pack", baseManifest("dup.pack", { name: "First" }));
    makePack(rootB, "dup.pack", baseManifest("dup.pack", { name: "Second" }));
    registerExternalPackRoot(rootA);
    registerExternalPackRoot(rootB);
    const dup = getPack("dup.pack");
    expect(dup!.manifest.name).toBe("First");
  });
});

describe("pack-catalog: 内容扫描", () => {
  it("四类内容 + mcp.json 全量扫描", () => {
    const root = temp();
    makePack(root, "test.full", baseManifest("test.full"), {
      orchestrators: [{ id: "lead", def: { thoughtLevel: "high" } }],
      experts: [{ id: "coach", def: { modules: ["m1"], permission: { task: { "*": "deny" } } } }],
      skills: [{ id: "sk", skillMd: "---\nname: Skill Name\ndescription: Skill desc\n---\n\nBody\n" }],
      commands: [
        { name: "kick", md: "---\ndescription: Kick it\naction: kick-action\norder: 5\n---\nDo $ARGUMENTS\n" },
        { name: "plain", md: "No frontmatter body\n" },
      ],
      mcps: [{ id: "srv", name: "Server", transport: { type: "stdio", command: "x" } }, { bad: true }],
    });
    registerExternalPackRoot(root);

    const items = getPackContents("test.full");
    expect(items.map((i) => `${i.kind}:${i.id}`).sort()).toEqual([
      "command:kick",
      "command:plain",
      "expert:coach",
      "orchestrator:lead",
      "skill:sk",
    ]);

    const orch = items.find((i) => i.kind === "orchestrator")!;
    expect(orch.definition).toMatchObject({ id: "lead", thoughtLevel: "high" });
    // 身份字段不出现在 definition 里（白名单）
    expect(orch.definition).not.toHaveProperty("builtin");
    expect(orch.definition).not.toHaveProperty("pluginId");

    const skill = items.find((i) => i.kind === "skill")!;
    expect(skill.name).toBe("Skill Name");
    expect(skill.description).toBe("Skill desc");

    const kick = items.find((i) => i.id === "kick")!;
    expect(kick.command).toMatchObject({ template: "Do $ARGUMENTS", action: "kick-action", order: 5 });
    const plain = items.find((i) => i.id === "plain")!;
    expect(plain.command!.template).toBe("No frontmatter body");
    expect(plain.command!.order).toBe(1000);

    const mcps = getPackMcpDefs("test.full");
    expect(mcps).toHaveLength(1);
    expect(mcps[0].id).toBe("srv");
  });

  it("orchestrator.json 的 id 与目录名不一致 → 以目录名为准", () => {
    const root = temp();
    makePack(root, "test.mismatch", baseManifest("test.mismatch"), {
      orchestrators: [{ id: "dir-name", def: { id: "json-name" } }],
    });
    registerExternalPackRoot(root);
    const items = getPackContents("test.mismatch");
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("dir-name");
    expect(items[0].definition!.id).toBe("dir-name");
  });

  it("contents 声明与扫描不一致 → 以扫描为准", () => {
    const root = temp();
    makePack(
      root,
      "test.decl",
      baseManifest("test.decl", {
        contents: {
          orchestrators: [{ id: "ghost", name: "Ghost" }],
          experts: [{ id: "real", name: "Real" }],
        },
      }),
      { experts: [{ id: "real" }] },
    );
    registerExternalPackRoot(root);
    const items = getPackContents("test.decl");
    expect(items.map((i) => i.id)).toEqual(["real"]);
  });
});

describe("pack-catalog: Local Pack", () => {
  it("虚拟 manifest：kind=local / 恒已装 / 不锁定", () => {
    const root = makeProjectRoot();
    tempDirs.push(root);
    const view = getLocalPackView(root);
    expect(view.manifest.id).toBe(LOCAL_PACK_ID);
    expect(view.kind).toBe("local");
    expect(view.installedByDefault).toBe(true);
    expect(view.locked).toBe(false);
    expect(view.dir).toBe(getLocalPackDir(root));
  });

  it("local 目录不存在 → 空内容；存在 → 正常扫描", () => {
    const root = makeProjectRoot();
    tempDirs.push(root);
    expect(scanLocalPackContents(root)).toEqual([]);

    makePack(getLocalPackDir(root), ".", baseManifest("ignored"), {
      experts: [{ id: "mine" }],
    });
    const items = scanLocalPackContents(root);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("mine");
  });
});
