import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  getLocalTeamDir,
  registerExternalTeamRoot,
  listExternalTeamRoots,
  unregisterExternalTeamRoot,
} from "../../src/main/services/team-catalog";
import {
  getAsset,
  isAssetActive,
  listCommands,
  listAssets,
  listProjectMcps,
  listProjectTeams,
  readInstructions,
  resolveRosterRefs,
  resolveOrigin,
  resolveOrchestratorId,
} from "../../src/main/services/team-resolver";
import {
  addInstalledTeam,
  setTeamsInstalledDataDir,
} from "../../src/main/services/teams-installed";
import {
  saveAssetOverride,
  setAssetDisabled,
  setDefaultOrchestratorFqid,
  setTeamEnabled,
} from "../../src/main/services/teams-state";
import { CORE_TEAM_ID, DEFAULT_ORCHESTRATOR_FQID, LOCAL_TEAM_ID } from "../../src/shared/teams/types";
import { baseManifest, makePack, makeProjectRoot, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function temp(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

/** Seal the app-level store to a fresh temp dir (never read real userData). */
function sealStore(): void {
  setTeamsInstalledDataDir(temp());
}

function makeRoot(): string {
  const root = makeProjectRoot();
  tempDirs.push(root);
  sealStore();
  return root;
}

/** Record an install into the (already sealed) app-level store. */
function installAppPack(teamId: string): void {
  addInstalledTeam(teamId);
}

afterEach(() => {
  for (const dir of listExternalTeamRoots()) unregisterExternalTeamRoot(dir);
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setTeamsInstalledDataDir(null);
});

/** 一个 core pack（orchestrator + 2 experts）+ 一个 free pack + 一个 pro pack 的标配环境 */
function setupStandardPacks(): { coreRoot: string; freeRoot: string; proRoot: string } {
  const coreRoot = temp();
  makePack(coreRoot, "prismnext.core", baseManifest(CORE_TEAM_ID, { publisher: "prismnext" }), {
    orchestrators: [{ id: "research-prism", def: { thoughtLevel: "medium" } }],
    experts: [{ id: "peer-reviewer" }, { id: "methodology-auditor", def: { model: "core-model" } }],
    skills: [{ id: "critical-review" }],
    commands: [{ name: "setup", md: "---\ndescription: Setup\norder: 0\n---\nSetup body\n" }],
  });
  registerExternalTeamRoot(coreRoot);

  const freeRoot = temp();
  makePack(freeRoot, "test.notes", baseManifest("test.notes", { name: "Notes" }), {
    orchestrators: [
      { id: "notes-lead", def: { allowedExperts: ["$pack", "prismnext.core:peer-reviewer"] } },
    ],
    experts: [{ id: "reading-coach" }],
    skills: [{ id: "reading-notes" }],
    commands: [{ name: "reading-notes", md: "---\ndescription: RN\n---\nRN body\n" }],
  });
  registerExternalTeamRoot(freeRoot);

  const proRoot = temp();
  makePack(proRoot, "test.pro", baseManifest("test.pro", { tier: "pro", publisher: "prismnext.pro" }), {
    experts: [{ id: "pro-expert" }],
  });
  registerExternalTeamRoot(proRoot);

  return { coreRoot, freeRoot, proRoot };
}

describe("pack-resolver: 项目视图与启停判定（§5.3）", () => {
  it("core pack 隐式已装且启用；local 恒在", () => {
    setupStandardPacks();
    const root = makeRoot();
    sealStore();

    const packs = listProjectTeams(root);
    const core = packs.find((p) => p.manifest.id === CORE_TEAM_ID)!;
    expect(core.installed).toBe(true);
    expect(core.enabled).toBe(true);
    const local = packs.find((p) => p.manifest.id === LOCAL_TEAM_ID)!;
    expect(local.installed).toBe(true);
    expect(local.enabled).toBe(true);

    // 未安装的 free pack：有 catalog 记录但 installed=false
    const free = packs.find((p) => p.manifest.id === "test.notes")!;
    expect(free.installed).toBe(false);
    expect(free.enabled).toBe(false);

    // core 内容默认激活
    expect(isAssetActive(root, "prismnext.core:peer-reviewer")).toBe(true);
    // 未安装 pack 的内容不激活
    expect(isAssetActive(root, "test.notes:reading-coach")).toBe(false);
  });

  it("install → 内容激活；disable pack → 全部内容失活；enable → 恢复", () => {
    setupStandardPacks();
    const root = makeRoot();
    installAppPack("test.notes");
    expect(isAssetActive(root, "test.notes:reading-coach")).toBe(true);
    expect(isAssetActive(root, "test.notes:notes-lead")).toBe(true);

    setTeamEnabled(root, "test.notes", false);
    expect(isAssetActive(root, "test.notes:reading-coach")).toBe(false);
    expect(isAssetActive(root, "test.notes:notes-lead")).toBe(false);

    setTeamEnabled(root, "test.notes", true);
    expect(isAssetActive(root, "test.notes:reading-coach")).toBe(true);
  });

  it("disabledContent 逐项禁用立即可见（写入计数器失效缓存）", () => {
    setupStandardPacks();
    const root = makeRoot();
    sealStore();

    expect(isAssetActive(root, "prismnext.core:peer-reviewer")).toBe(true);
    setAssetDisabled(root, "prismnext.core:peer-reviewer", true);
    expect(isAssetActive(root, "prismnext.core:peer-reviewer")).toBe(false);
    expect(isAssetActive(root, "prismnext.core:methodology-auditor")).toBe(true);
    setAssetDisabled(root, "prismnext.core:peer-reviewer", false);
    expect(isAssetActive(root, "prismnext.core:peer-reviewer")).toBe(true);
  });

  it("pro pack 已装但无 license → pack 层 enabled=false + 内容不激活（bug 修复回归）", () => {
    setupStandardPacks();
    const root = makeRoot();
    installAppPack("test.pro");
    const pack = listProjectTeams(root).find((p) => p.manifest.id === "test.pro")!;
    expect(pack.installed).toBe(true);
    // Layering spec §4.3: license gate is merged into pack-layer `enabled`
    // (bug fix) — a pro pack without license is NOT shown as enabled.
    expect(pack.enabled).toBe(false);
    expect(pack.locked).toBe(true);
    expect(isAssetActive(root, "test.pro:pro-expert")).toBe(false);
    const expert = getAsset(root, "test.pro:pro-expert")!;
    expect(expert.enabled).toBe(false);
  });

  it("不存在的 fqid → false", () => {
    setupStandardPacks();
    const root = makeRoot();
    sealStore();
    expect(isAssetActive(root, "ghost.pack:nothing")).toBe(false);
  });
});

describe("pack-resolver: overrides", () => {
  it("非 local 内容应用 contentOverrides；local 内容不应用", () => {
    setupStandardPacks();
    const root = makeRoot();
    sealStore();

    saveAssetOverride(root, "prismnext.core:methodology-auditor", { model: "user-model" });
    const expert = getAsset(root, "prismnext.core:methodology-auditor")!;
    expect((expert.definition as { model?: string }).model).toBe("user-model");

    // local 内容：写入 local pack 后即使有 override 也不生效
    mkdirSync(join(getLocalTeamDir(root), "experts", "mine"), { recursive: true });
    writeFileSync(
      join(getLocalTeamDir(root), "experts", "mine", "expert.json"),
      JSON.stringify({ id: "mine", name: "Mine", description: "d", model: "orig" }),
      "utf-8",
    );
    writeFileSync(join(getLocalTeamDir(root), "experts", "mine", "instructions.md"), "body", "utf-8");
    saveAssetOverride(root, `${LOCAL_TEAM_ID}:mine`, { model: "hacked" });
    const mine = getAsset(root, `${LOCAL_TEAM_ID}:mine`)!;
    expect((mine.definition as { model?: string }).model).toBe("orig");
    expect(mine.removable).toBe(true);
  });
});

describe("pack-resolver: roster 解析（§5.4）", () => {
  it('"$pack" 展开 + FQID 引用 + 禁用修剪', () => {
    setupStandardPacks();
    const root = makeRoot();
    installAppPack("test.notes");

    // notes-lead.roster = ["$pack", "prismnext.core:peer-reviewer"]
    let allowed = resolveRosterRefs(root, "test.notes:notes-lead");
    expect(allowed).toContain("test.notes:reading-coach");
    expect(allowed).toContain("prismnext.core:peer-reviewer");
    expect(allowed).not.toContain("prismnext.core:methodology-auditor");

    // 禁用 peer-reviewer → 从结果修剪
    setAssetDisabled(root, "prismnext.core:peer-reviewer", true);
    allowed = resolveRosterRefs(root, "test.notes:notes-lead");
    expect(allowed).not.toContain("prismnext.core:peer-reviewer");
    expect(allowed).toContain("test.notes:reading-coach");
  });

  it("roster 缺省 = 全部可用 experts（不含未安装/锁定 pack 的）", () => {
    setupStandardPacks();
    const root = makeRoot();
    installAppPack("test.notes");
    installAppPack("test.pro");

    const allowed = resolveRosterRefs(root, "prismnext.core:research-prism");
    expect(allowed).toContain("prismnext.core:peer-reviewer");
    expect(allowed).toContain("prismnext.core:methodology-auditor");
    expect(allowed).toContain("test.notes:reading-coach");
    expect(allowed).not.toContain("test.pro:pro-expert"); // 无 license
  });

  it("裸 id 解析：同 pack 优先", () => {
    const root = makeRoot();
    // pack A 与 core 都有 "reviewer"；orch 在 pack A 内用裸 id 应解析到同 pack
    const coreRoot = temp();
    makePack(coreRoot, "prismnext.core", baseManifest(CORE_TEAM_ID, { publisher: "prismnext" }), {
      experts: [{ id: "reviewer" }],
    });
    registerExternalTeamRoot(coreRoot);
    const packA = temp();
    makePack(packA, "test.a", baseManifest("test.a"), {
      orchestrators: [{ id: "o", def: { allowedExperts: ["reviewer"] } }],
      experts: [{ id: "reviewer" }],
    });
    registerExternalTeamRoot(packA);
    installAppPack("test.a");

    const allowed = resolveRosterRefs(root, "test.a:o");
    expect(allowed).toEqual(["test.a:reviewer"]);
  });
});

describe("pack-resolver: orchestrator 选择与 commands", () => {
  it("默认 / tab 指定 / fallback", () => {
    setupStandardPacks();
    const root = makeRoot();

    // 无状态 → core 默认
    expect(resolveOrchestratorId(root)).toBe(DEFAULT_ORCHESTRATOR_FQID);

    // 设置项目默认（pack 未装 → 不 active → fallback 回 core）
    setDefaultOrchestratorFqid(root, "test.notes:notes-lead");
    expect(resolveOrchestratorId(root)).toBe(DEFAULT_ORCHESTRATOR_FQID);

    // 装上后项目默认生效
    installAppPack("test.notes");
    expect(resolveOrchestratorId(root)).toBe("test.notes:notes-lead");

    // tab 显式指定优先
    expect(resolveOrchestratorId(root, "prismnext.core:research-prism")).toBe(
      "prismnext.core:research-prism",
    );
    // tab 指定禁用项 → 落回项目默认
    setAssetDisabled(root, "prismnext.core:research-prism", true);
    expect(resolveOrchestratorId(root, "prismnext.core:research-prism")).toBe("test.notes:notes-lead");
  });

  it("commands：跨 pack 汇总、排序、启停", () => {
    setupStandardPacks();
    const root = makeRoot();

    let commands = listCommands(root);
    expect(commands.map((c) => c.fqid)).toEqual(["prismnext.core:setup"]);

    installAppPack("test.notes");
    commands = listCommands(root);
    expect(commands.map((c) => c.fqid).sort()).toEqual([
      "prismnext.core:setup",
      "test.notes:reading-notes",
    ]);
    expect(commands.find((c) => c.fqid === "prismnext.core:setup")!.order).toBe(0);

    setAssetDisabled(root, "prismnext.core:setup", true);
    commands = listCommands(root);
    expect(commands.find((c) => c.fqid === "prismnext.core:setup")!.enabled).toBe(false);
    expect(commands.find((c) => c.fqid === "test.notes:reading-notes")!.enabled).toBe(true);
  });

  it("MCP：pack 声明随包收集，enabled 跟随 pack 项目启停", () => {
    setupStandardPacks();
    const root = makeRoot();

    // core 未声明 MCP → 空
    expect(listProjectMcps(root)).toEqual([]);

    // 装一个带 MCP 的 pack
    const mcpRoot = temp();
    makePack(mcpRoot, "test.mcps", baseManifest("test.mcps", { name: "Mcp Pack" }), {
      mcps: [
        {
          id: "pg",
          name: "postgres-local",
          description: "Postgres via stdio",
          transport: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"] },
        },
        {
          id: "web",
          name: "remote-web",
          transport: { type: "http", url: "https://example.com/mcp" },
        },
      ],
    });
    registerExternalTeamRoot(mcpRoot);
    installAppPack("test.mcps");

    let mcps = listProjectMcps(root);
    expect(mcps).toHaveLength(2);
    expect(mcps[0]).toMatchObject({
      fqid: "test.mcps:pg",
      teamId: "test.mcps",
      enabled: true,
      name: "postgres-local",
    });
    expect(mcps[1]).toMatchObject({
      fqid: "test.mcps:web",
      enabled: true,
      transport: { type: "http", url: "https://example.com/mcp" },
    });

    // pack 项目停用 → MCP 保留在列表但 enabled=false（UI 灰显，不注入）
    setTeamEnabled(root, "test.mcps", false);
    mcps = listProjectMcps(root);
    expect(mcps).toHaveLength(2);
    expect(mcps.every((m) => m.enabled === false)).toBe(true);

    // 恢复 → enabled=true
    setTeamEnabled(root, "test.mcps", true);
    mcps = listProjectMcps(root);
    expect(mcps.every((m) => m.enabled === true)).toBe(true);
  });
});

describe("pack-resolver: badge / instructions / 杂项", () => {
  it("resolveOrigin：fqid 命中；裸 id 优先 core", () => {
    setupStandardPacks();
    const root = makeRoot();
    installAppPack("test.notes");

    expect(resolveOrigin(root, "test.notes:reading-coach")).toEqual({
      teamId: "test.notes",
      teamName: "Notes",
      teamTier: "free",
    });
    // 裸 id 唯一 → 命中所在 pack
    expect(resolveOrigin(root, "reading-coach")!.teamId).toBe("test.notes");
    // 裸 id 命中 core
    expect(resolveOrigin(root, "peer-reviewer")!.teamId).toBe(CORE_TEAM_ID);
    expect(resolveOrigin(root, "ghost")).toBeNull();
  });

  it("readInstructions 读取正文；listAssets 按 kind 过滤", () => {
    setupStandardPacks();
    const root = makeRoot();
    sealStore();

    expect(readInstructions(root, "prismnext.core:peer-reviewer")).toBe(
      "Instructions for peer-reviewer.",
    );
    expect(readInstructions(root, "prismnext.core:critical-review")).toBe(""); // skill 无 instructions

    const experts = listAssets(root, "subagent");
    expect(experts.map((e) => e.fqid).sort()).toEqual([
      "prismnext.core:methodology-auditor",
      "prismnext.core:peer-reviewer",
    ]);
    const skills = listAssets(root, "skill");
    expect(skills.map((s) => s.fqid)).toEqual(["prismnext.core:critical-review"]);
    // command 也进入 AssetView 视图（isAssetActive / badge 共享判定）
    const cmds = listAssets(root, "command");
    expect(cmds.map((c) => c.fqid)).toEqual(["prismnext.core:setup"]);
    expect(isAssetActive(root, "prismnext.core:setup")).toBe(true);
  });
});
