/**
 * packs-state R1–R5 legacy 迁移测试（§10.2）。
 *
 * 覆盖：experts/orchestrators manifest 的 FQID 化、defaultOrchestrator 映射、
 * custom 目录移动 + 身份字段剥离、legacy-backup 收尾、幂等性、
 * fresh 项目零写副作用、损坏 packs.json 自愈。
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  hasLegacyAgentState,
  migratePacksStateIfNeeded,
  readPacksState,
} from "../../src/main/services/packs-state";

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function makeRoot(): string {
  root = mkdtempSync(join(tmpdir(), "packs-migration-"));
  return root;
}

function agentDir(): string {
  return join(root!, ".prismnext", "agent");
}

function writeLegacy(rel: string, content: string): void {
  const path = join(agentDir(), rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

function backupDir(): string | null {
  const dir = agentDir();
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((e) => e.startsWith("legacy-backup-"));
  return hit ? join(dir, hit) : null;
}

describe("packs-state legacy migration (R1–R5)", () => {
  it("fresh 项目：无 packs.json 无 legacy → 空状态且不落盘", () => {
    makeRoot();
    const { state, migrated } = migratePacksStateIfNeeded(root!);
    expect(migrated).toBe(false);
    expect(state.packs).toEqual([]);
    expect(state.disabledContent).toEqual([]);
    expect(existsSync(join(agentDir(), "packs.json"))).toBe(false);
  });

  it("R1/R2：experts-manifest 的 disabled/overrides 迁移为 FQID 并备份旧文件", () => {
    makeRoot();
    writeLegacy(
      "experts-manifest.json",
      JSON.stringify({
        disabledBuiltinIds: ["peer-reviewer"],
        builtinOverrides: {
          "methodology-auditor": { temperature: 0.4, model: "openai/gpt-4o" },
        },
      }),
    );
    expect(hasLegacyAgentState(root!)).toBe(true);

    const { state, migrated } = migratePacksStateIfNeeded(root!);
    expect(migrated).toBe(true);
    expect(state.disabledContent).toEqual(["prismnext.core:peer-reviewer"]);
    expect(state.contentOverrides["prismnext.core:methodology-auditor"]).toEqual({
      temperature: 0.4,
      model: "openai/gpt-4o",
    });

    // packs.json 已落盘；旧 manifest 进 legacy-backup
    expect(existsSync(join(agentDir(), "packs.json"))).toBe(true);
    expect(existsSync(join(agentDir(), "experts-manifest.json"))).toBe(false);
    const backup = backupDir();
    expect(backup).toBeTruthy();
    expect(existsSync(join(backup!, "experts-manifest.json"))).toBe(true);

    // 幂等：第二次无操作
    const again = migratePacksStateIfNeeded(root!);
    expect(again.migrated).toBe(false);
    expect(again.state).toEqual(state);
  });

  it("R3：orchestrators-manifest defaultOrchestratorId 映射 core / local", () => {
    makeRoot();
    writeLegacy(
      "orchestrators-manifest.json",
      JSON.stringify({
        defaultOrchestratorId: "research-prism",
        disabledBuiltinIds: ["research-prism"],
      }),
    );
    writeLegacy(
      join("orchestrators", "custom", "notes-local", "orchestrator.json"),
      JSON.stringify({ id: "notes-local", name: "Notes", description: "d", builtin: false, removable: true }),
    );
    writeLegacy(join("orchestrators", "custom", "notes-local", "instructions.md"), "Body.\n");

    // 案例 1：core 默认
    let result = migratePacksStateIfNeeded(root!);
    expect(result.state.defaultOrchestrator).toBe("prismnext.core:research-prism");
    expect(result.state.disabledContent).toEqual(["prismnext.core:research-prism"]);
    // R5：custom orchestrator 已移动到 local
    expect(existsSync(join(agentDir(), "local", "orchestrators", "notes-local", "orchestrator.json"))).toBe(true);
  });

  it("R3：legacy default 指向 custom orchestrator → user.local", () => {
    makeRoot();
    writeLegacy(
      join("orchestrators", "custom", "notes-local", "orchestrator.json"),
      JSON.stringify({ id: "notes-local", name: "Notes", description: "d" }),
    );
    writeLegacy(join("orchestrators", "custom", "notes-local", "instructions.md"), "Body.\n");
    writeLegacy(
      "orchestrators-manifest.json",
      JSON.stringify({ defaultOrchestratorId: "notes-local" }),
    );

    const { state } = migratePacksStateIfNeeded(root!);
    expect(state.defaultOrchestrator).toBe("user.local:notes-local");
  });

  it("R4：custom expert 移动到 local 并剥掉身份字段", () => {
    makeRoot();
    writeLegacy(
      join("experts", "custom", "latex-polisher", "expert.json"),
      JSON.stringify({
        id: "latex-polisher",
        name: "LaTeX Polisher",
        description: "d",
        builtin: false,
        removable: true,
        pluginId: "suite.old",
        model: "openai/gpt-4o",
        modules: ["latex-workspace"],
        permission: { edit: "deny" },
      }),
    );
    writeLegacy(join("experts", "custom", "latex-polisher", "instructions.md"), "Polish.\n");

    const { migrated } = migratePacksStateIfNeeded(root!);
    expect(migrated).toBe(true);

    const movedJson = join(agentDir(), "local", "experts", "latex-polisher", "expert.json");
    expect(existsSync(movedJson)).toBe(true);
    const def = JSON.parse(readFileSync(movedJson, "utf-8"));
    expect(def).toEqual({
      id: "latex-polisher",
      name: "LaTeX Polisher",
      description: "d",
      model: "openai/gpt-4o",
      modules: ["latex-workspace"],
      permission: { edit: "deny" },
    });
    expect(readFileSync(join(agentDir(), "local", "experts", "latex-polisher", "instructions.md"), "utf-8")).toBe(
      "Polish.\n",
    );
    // legacy 壳已清理/备份
    expect(existsSync(join(agentDir(), "experts"))).toBe(false);
    expect(hasLegacyAgentState(root!)).toBe(false);
  });

  it("packs.json 已是 v2 但 legacy 残留 → 仍执行文件迁移", () => {
    makeRoot();
    writeLegacy(
      "packs.json",
      JSON.stringify({ stateVersion: 2, packs: [], disabledContent: [], contentOverrides: {} }),
    );
    writeLegacy("experts-manifest.json", JSON.stringify({ disabledBuiltinIds: ["peer-reviewer"] }));

    const { state, migrated } = migratePacksStateIfNeeded(root!);
    expect(migrated).toBe(true);
    expect(state.disabledContent).toEqual(["prismnext.core:peer-reviewer"]);
    expect(hasLegacyAgentState(root!)).toBe(false);
  });

  it("损坏的 packs.json → 回退空状态并自愈重写", () => {
    makeRoot();
    writeLegacy("packs.json", "{ not json !!");
    const { state, migrated } = migratePacksStateIfNeeded(root!);
    expect(migrated).toBe(true);
    expect(state.stateVersion).toBe(2);
    expect(state.packs).toEqual([]);
    // 重写后可正常读取
    const reread = readPacksState(root!);
    expect(reread.stateVersion).toBe(2);
  });

  it("R1 迁移结果与直接读 readPacksState 一致", () => {
    makeRoot();
    writeLegacy("experts-manifest.json", JSON.stringify({ disabledBuiltinIds: ["peer-reviewer"] }));
    const viaRead = readPacksState(root!);
    expect(viaRead.disabledContent).toEqual(["prismnext.core:peer-reviewer"]);
    expect(existsSync(join(agentDir(), "packs.json"))).toBe(true);
  });
});


// ────────────────────────────────────────────────────────────
// R6–R11：skills / commands 接管后的 legacy 迁移（§10.2 Phase 3）
// ────────────────────────────────────────────────────────────
import { vi } from "vitest";
import {
  registerLegacyBuiltinCommandStatesHooks,
  __resetLegacyBuiltinCommandStatesHooksForTests,
} from "../../src/main/services/packs-state";
import { getPack } from "../../src/main/services/pack-catalog";
import { CORE_PACK_ID } from "../../src/shared/packs/types";

function coreSkillMd(id: string): string {
  const dir = getPack(CORE_PACK_ID)!.dir;
  return readFileSync(join(dir, "skills", id, "SKILL.md"), "utf-8");
}

describe("packs-state legacy migration (R6–R11)", () => {
  afterEach(() => {
    __resetLegacyBuiltinCommandStatesHooksForTests();
  });

  it("R6：custom skill（不命中 core）移动到 local/skills", () => {
    makeRoot();
    writeLegacy(
      join("skills", "my-skill", "SKILL.md"),
      "---\nname: my-skill\ndescription: d\n---\n\nbody\n",
    );
    expect(hasLegacyAgentState(root!)).toBe(true);

    const { migrated } = migratePacksStateIfNeeded(root!);
    expect(migrated).toBe(true);
    expect(
      readFileSync(join(agentDir(), "local", "skills", "my-skill", "SKILL.md"), "utf-8"),
    ).toContain("name: my-skill");
    expect(existsSync(join(agentDir(), "skills"))).toBe(false);
    expect(hasLegacyAgentState(root!)).toBe(false);
  });

  it("R6 去重：与 core 逐字节相同且无 install 记录的副本进 legacy-backup", () => {
    makeRoot();
    const md = coreSkillMd("critical-review");
    writeLegacy(join("skills", "critical-review", "SKILL.md"), md);

    migratePacksStateIfNeeded(root!);
    // 冗余副本不进入 local（core 原件直接可用）
    expect(existsSync(join(agentDir(), "local", "skills", "critical-review"))).toBe(false);
    // 进 legacy-backup
    const backup = backupDir();
    expect(backup).toBeTruthy();
    expect(readFileSync(join(backup!, "skills", "critical-review", "SKILL.md"), "utf-8")).toBe(md);
    expect(hasLegacyAgentState(root!)).toBe(false);
  });

  it("R6：与 core 有差异的同名副本保留为 local（遮蔽语义）", () => {
    makeRoot();
    const diverged = `${coreSkillMd("critical-review")}\n\nuser tweak\n`;
    writeLegacy(join("skills", "critical-review", "SKILL.md"), diverged);

    migratePacksStateIfNeeded(root!);
    expect(
      readFileSync(join(agentDir(), "local", "skills", "critical-review", "SKILL.md"), "utf-8"),
    ).toBe(diverged);
  });

  it("R6：有 registry install 记录的副本即使与 core 相同也保留为 local", () => {
    makeRoot();
    const md = coreSkillMd("critical-review");
    writeLegacy(join("skills", "critical-review", "SKILL.md"), md);
    writeLegacy(
      "skills-manifest.json",
      JSON.stringify({
        installs: [{ skillId: "critical-review", origin: { kind: "github", repo: "a/b" } }],
      }),
    );

    migratePacksStateIfNeeded(root!);
    expect(existsSync(join(agentDir(), "local", "skills", "critical-review", "SKILL.md"))).toBe(
      true,
    );
  });

  it("R7：legacy command 剥 pluginId/enabled 行，enabled:false → disabledContent", () => {
    makeRoot();
    writeLegacy(
      join("commands", "notes.md"),
      "---\ndescription: Notes\npluginId: suite.old\nenabled: false\norder: 5\n---\n\nBody $ARGUMENTS\n",
    );

    const { state } = migratePacksStateIfNeeded(root!);
    const moved = readFileSync(join(agentDir(), "local", "commands", "notes.md"), "utf-8");
    expect(moved).not.toContain("pluginId");
    expect(moved).not.toMatch(/^enabled:/m);
    expect(moved).toContain("description: Notes");
    expect(moved).toContain("order: 5");
    expect(moved).toContain("Body $ARGUMENTS");
    expect(state.disabledContent).toEqual(["user.local:notes"]);
  });

  it("R8：.md.disabled 还原文件名 + disabledContent", () => {
    makeRoot();
    writeLegacy(join("commands", "archive.md.disabled"), "---\ndescription: A\n---\n\nBody\n");

    const { state } = migratePacksStateIfNeeded(root!);
    expect(existsSync(join(agentDir(), "local", "commands", "archive.md"))).toBe(true);
    expect(existsSync(join(agentDir(), "local", "commands", "archive.md.disabled"))).toBe(false);
    expect(state.disabledContent).toEqual(["user.local:archive"]);
  });

  it("R7/R8：同名 .md 与 .md.disabled 冲突时 .md 优先，.disabled 进 backup", () => {
    makeRoot();
    writeLegacy(join("commands", "dup.md"), "---\ndescription: winner\n---\n\nW\n");
    writeLegacy(join("commands", "dup.md.disabled"), "---\ndescription: loser\n---\n\nL\n");

    const { state } = migratePacksStateIfNeeded(root!);
    expect(readFileSync(join(agentDir(), "local", "commands", "dup.md"), "utf-8")).toContain(
      "winner",
    );
    expect(state.disabledContent).toEqual([]);
    const backup = backupDir();
    expect(backup).toBeTruthy();
    expect(existsSync(join(backup!, "commands", "dup.md.disabled"))).toBe(true);
  });

  it("R10：skills-manifest.disabled → disabledContent；命中 core 的 id 映 core FQID", () => {
    makeRoot();
    writeLegacy(
      "skills-manifest.json",
      JSON.stringify({
        disabled: ["critical-review", "my-skill"],
        registryUrls: ["https://example.com/reg"],
      }),
    );

    const { state } = migratePacksStateIfNeeded(root!);
    expect(state.disabledContent).toEqual([
      `${CORE_PACK_ID}:critical-review`,
      "user.local:my-skill",
    ]);

    // 文件瘦身：disabled/registryUrls 消失，只留 sources + installs
    const slimmed = JSON.parse(
      readFileSync(join(agentDir(), "skills-manifest.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect("disabled" in slimmed).toBe(false);
    expect("registryUrls" in slimmed).toBe(false);
    expect(slimmed.installs).toEqual([]);
    const sourceIds = (slimmed.sources as { id: string }[]).map((s) => s.id);
    expect(sourceIds).toContain("remote:https://example.com/reg");
    expect(sourceIds).toContain("prism-curated");
    expect(hasLegacyAgentState(root!)).toBe(false);
  });

  it("R10 双写：core id 且项目有 local 副本 → core + local FQID 都禁用", () => {
    makeRoot();
    // 与 core 有差异 → 保留为 local 遮蔽副本
    writeLegacy(
      join("skills", "critical-review", "SKILL.md"),
      `${coreSkillMd("critical-review")}\n\ntweaked\n`,
    );
    writeLegacy("skills-manifest.json", JSON.stringify({ disabled: ["critical-review"] }));

    const { state } = migratePacksStateIfNeeded(root!);
    expect(state.disabledContent).toEqual([
      `${CORE_PACK_ID}:critical-review`,
      "user.local:critical-review",
    ]);
  });

  it("R11：全局 builtin command 启停继承一次（false → 禁用）并清空", () => {
    const clear = vi.fn();
    registerLegacyBuiltinCommandStatesHooks({
      read: () => ({ compact: false, setup: true }),
      clear,
    });
    makeRoot();
    expect(hasLegacyAgentState(root!)).toBe(true);

    const { state } = migratePacksStateIfNeeded(root!);
    expect(state.disabledContent).toEqual([`${CORE_PACK_ID}:compact`]);
    expect(clear).toHaveBeenCalledTimes(1);
    // 消费后不再继承（全局时代结束）
    expect(hasLegacyAgentState(root!)).toBe(false);
  });

  it("R11：第二个项目不再继承已消费的全局状态", () => {
    registerLegacyBuiltinCommandStatesHooks({
      read: () => ({ compact: false }),
      clear: () => {},
    });
    makeRoot();
    migratePacksStateIfNeeded(root!);

    // 消费标记已置位：同一进程内另一个项目读不到全局状态
    const second = mkdtempSync(join(tmpdir(), "packs-migration-r11b-"));
    try {
      expect(hasLegacyAgentState(second)).toBe(false);
      const { migrated, state } = migratePacksStateIfNeeded(second);
      expect(migrated).toBe(false);
      expect(state.disabledContent).toEqual([]);
    } finally {
      rmSync(second, { recursive: true, force: true });
    }
  });
});
