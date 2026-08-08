/**
 * packs.json —— 项目级唯一 Agent Pack 状态文件（stateVersion 2）。
 *
 * 设计：docs-private/specs/2026-08-08-agent-pack-architecture-refactor.md §4.4 / §6 / §10。
 *
 * 职责：
 * - 读写 `.prismnext/agent/packs.json`（原子写：tmp + rename）
 * - 迁移框架（Phase 2 落地 R1–R5、Phase 3 落地 R6/R7/R8/R10/R11）
 * - §6.2 的纯状态操作（install / setEnabled / uninstall / 逐项禁用 / override / 默认 orchestrator）
 *
 * 本模块只做状态，不做解析；内容视图请走 pack-resolver.ts。
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  CORE_PACK_ID,
  DEFAULT_ORCHESTRATOR_FQID,
  LOCAL_PACK_ID,
  LOCAL_PACK_REL,
  PACKS_STATE_VERSION,
  type ContentOverride,
  type Fqid,
  type PackRecord,
  type PacksState,
} from "../../shared/packs/types";
import { emptyPacksState, fqidBelongsToPack, normalizePacksState } from "../../shared/packs/state";
import { getPack } from "./pack-catalog";
import { createLogger } from "./logger";

const log = createLogger("packs-state");

export const PACKS_STATE_REL = ".prismnext/agent/packs.json";

function statePath(projectRoot: string): string {
  return join(projectRoot, PACKS_STATE_REL);
}

// ── legacy 布局常量（R1–R8/R10 迁移的输入；新代码不再使用这些路径）──

const LEGACY_EXPERTS_MANIFEST_REL = ".prismnext/agent/experts-manifest.json";
const LEGACY_ORCHESTRATORS_MANIFEST_REL = ".prismnext/agent/orchestrators-manifest.json";
const LEGACY_CUSTOM_EXPERTS_REL = ".prismnext/agent/experts/custom";
const LEGACY_CUSTOM_ORCHESTRATORS_REL = ".prismnext/agent/orchestrators/custom";
const LEGACY_SKILLS_REL = ".prismnext/agent/skills";
const LEGACY_COMMANDS_REL = ".prismnext/agent/commands";
const LEGACY_SKILLS_MANIFEST_REL = ".prismnext/agent/skills-manifest.json";

// ── 迁移框架 ───────────────────────────────────────────────

export interface PacksMigration {
  /** 迁移 id，如 "R4-move-custom-experts"（执行顺序 = 数组顺序） */
  id: string;
  apply(projectRoot: string, state: PacksState): PacksState;
}

/** 未来 stateVersion 3+ 在此追加版本迁移；R1–R12 是文件级迁移，见下方。 */
const MIGRATIONS: PacksMigration[] = [];

interface LegacySkillsManifest {
  disabled?: string[];
  registryUrls?: string[];
  sources?: unknown[];
  installs?: { skillId?: string }[];
}

function readLegacySkillsManifest(projectRoot: string): LegacySkillsManifest | null {
  return readLegacyJson<LegacySkillsManifest>(join(projectRoot, LEGACY_SKILLS_MANIFEST_REL));
}

/** legacy skills 目录里的内容目录名（无 → 空数组） */
function legacySkillDirNames(projectRoot: string): string[] {
  const dir = join(projectRoot, LEGACY_SKILLS_REL);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** legacy commands 目录里的 .md / .md.disabled 文件名（无 → 空数组） */
function legacyCommandFileNames(projectRoot: string): string[] {
  const dir = join(projectRoot, LEGACY_COMMANDS_REL);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".md.disabled")))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

// ── R11：app 级 settings 的 builtin command 启停（全局 → 项目态）──────────
//
// settings.json 是 app 级、packs.json 是项目级；packs-state 不反向依赖
// settings 服务（测试隔离），由应用启动时注入 read/clear 钩子。
// 语义：第一个执行迁移的项目继承全局状态，随后 settings 键清空（全局时代结束）。

export interface LegacyBuiltinCommandStatesHooks {
  /** 返回 settings.builtinCommands（无 → null） */
  read: () => Record<string, boolean> | null;
  /** 状态被某个项目成功继承后调用一次（清空 settings 键） */
  clear: () => void;
}

let legacyBuiltinHooks: LegacyBuiltinCommandStatesHooks | null = null;
let legacyBuiltinStatesConsumed = false;

export function registerLegacyBuiltinCommandStatesHooks(hooks: LegacyBuiltinCommandStatesHooks): void {
  legacyBuiltinHooks = hooks;
}

/** 测试专用：清空 R11 钩子与消费标记 */
export function __resetLegacyBuiltinCommandStatesHooksForTests(): void {
  legacyBuiltinHooks = null;
  legacyBuiltinStatesConsumed = false;
}

function readLegacyBuiltinCommandStates(): Record<string, boolean> | null {
  if (!legacyBuiltinHooks || legacyBuiltinStatesConsumed) return null;
  try {
    const states = legacyBuiltinHooks.read();
    return states && Object.keys(states).length > 0 ? states : null;
  } catch {
    return null;
  }
}

/** 项目里是否还存在任何 legacy agent 状态（manifest 文件、非空 custom/skills/commands 目录、skills disabled、R11 全局态）。 */
export function hasLegacyAgentState(projectRoot: string): boolean {
  if (existsSync(join(projectRoot, LEGACY_EXPERTS_MANIFEST_REL))) return true;
  if (existsSync(join(projectRoot, LEGACY_ORCHESTRATORS_MANIFEST_REL))) return true;
  for (const rel of [LEGACY_CUSTOM_EXPERTS_REL, LEGACY_CUSTOM_ORCHESTRATORS_REL]) {
    const dir = join(projectRoot, rel);
    if (!existsSync(dir)) continue;
    try {
      if (readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory())) return true;
    } catch {
      // 读不了按无 legacy 处理
    }
  }
  if (legacySkillDirNames(projectRoot).length > 0) return true;
  if (legacyCommandFileNames(projectRoot).length > 0) return true;
  const skillsManifest = readLegacySkillsManifest(projectRoot);
  if ((skillsManifest?.disabled ?? []).length > 0) return true;
  if (readLegacyBuiltinCommandStates() !== null) return true;
  return false;
}

interface LegacyExpertsManifest {
  disabledBuiltinIds?: string[];
  builtinOverrides?: Record<string, Record<string, unknown>>;
}

interface LegacyOrchestratorsManifest extends LegacyExpertsManifest {
  defaultOrchestratorId?: string;
}

function readLegacyJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** legacy builtinOverrides → ContentOverride（白名单字段，剔 junk） */
function sanitizeOverride(raw: Record<string, unknown>): ContentOverride {
  const out: ContentOverride = {};
  if (typeof raw.model === "string") out.model = raw.model;
  if (typeof raw.thoughtLevel === "string") out.thoughtLevel = raw.thoughtLevel;
  if (typeof raw.temperature === "number") out.temperature = raw.temperature;
  if (Array.isArray(raw.modules)) out.modules = raw.modules.filter((m): m is string => typeof m === "string");
  if (Array.isArray(raw.allowedExperts)) {
    out.allowedExperts = raw.allowedExperts.filter((m): m is string => typeof m === "string");
  }
  if (raw.permission && typeof raw.permission === "object" && !Array.isArray(raw.permission)) {
    out.permission = raw.permission as Record<string, unknown>;
  }
  return out;
}

/** local 内容定义里的身份字段一律剥掉（身份由 pack 归属推导，§4.3） */
function stripIdentityFields(def: Record<string, unknown>): Record<string, unknown> {
  const { builtin: _b, removable: _r, pluginId: _p, ...rest } = def;
  return rest;
}

/** R4 / R5：`.prismnext/agent/<kind>/custom/<id>/` → `local/<kind>/<id>/` */
function moveCustomAgentDirs(projectRoot: string, kind: "experts" | "orchestrators"): void {
  const jsonName = kind === "experts" ? "expert.json" : "orchestrator.json";
  const legacyRoot = join(projectRoot, ".prismnext", "agent", kind, "custom");
  if (!existsSync(legacyRoot)) return;
  const localRoot = join(projectRoot, LOCAL_PACK_REL, kind);
  for (const entry of readdirSync(legacyRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = join(legacyRoot, entry.name);
    if (!existsSync(join(src, jsonName))) continue; // 非内容目录留给 backup
    const dest = join(localRoot, entry.name);
    try {
      if (existsSync(dest)) {
        log.warn(`local ${kind} 已存在，丢弃 legacy 副本`, { id: entry.name });
        rmSync(src, { recursive: true, force: true });
        continue;
      }
      mkdirSync(localRoot, { recursive: true });
      renameSync(src, dest);
      const jsonPath = join(dest, jsonName);
      const def = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
      writeFileSync(jsonPath, `${JSON.stringify(stripIdentityFields(def), null, 2)}\n`, "utf-8");
    } catch (err) {
      log.error(`迁移 custom ${kind} 失败: ${entry.name}`, { projectRoot, error: String(err) });
    }
  }
}

/**
 * R6：`.prismnext/agent/skills/<id>/` → `local/skills/<id>/`。
 * 去重规则（引用模型，治 P2）：无 registry install 记录、id 命中 core pack
 * 且 SKILL.md 与 core 逐字节相同的项目副本 = 冗余拷贝 → 移入 legacy-backup
 * （core 原件直接可用，无需副本）；内容与 core 有差异的副本保留为 local
 * （用户改过 → 遮蔽语义）。registry 安装（github/discovery 记录）一律保留。
 * 返回 { moved, deduped } 供 R10 的 disabled 映射参考。
 */
function migrateLegacySkillDirs(
  projectRoot: string,
  coreSkillIds: Set<string>,
  readCoreSkillMd: (id: string) => string | null,
): { moved: Set<string>; deduped: Set<string> } {
  const moved = new Set<string>();
  const deduped = new Set<string>();
  const legacyRoot = join(projectRoot, LEGACY_SKILLS_REL);
  if (!existsSync(legacyRoot)) return { moved, deduped };

  const manifest = readLegacySkillsManifest(projectRoot);
  const installIds = new Set(
    (manifest?.installs ?? []).map((r) => r.skillId).filter((x): x is string => Boolean(x)),
  );
  const localRoot = join(projectRoot, LOCAL_PACK_REL, "skills");
  const backupRoot = legacyBackupDir(projectRoot);

  for (const id of legacySkillDirNames(projectRoot)) {
    const src = join(legacyRoot, id);
    try {
      // 冗余判定：无 install 记录 + 命中 core + 内容一致 → 丢弃副本（进 backup）
      if (!installIds.has(id) && coreSkillIds.has(id)) {
        const projectMd = readFileSync(join(src, "SKILL.md"), "utf-8");
        const coreMd = readCoreSkillMd(id);
        if (coreMd !== null && projectMd === coreMd) {
          const dest = join(backupRoot, "skills", id);
          mkdirSync(dirname(dest), { recursive: true });
          if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
          renameSync(src, dest);
          deduped.add(id);
          continue;
        }
      }
      const dest = join(localRoot, id);
      if (existsSync(dest)) {
        log.warn("local skills 已存在，legacy 副本进 backup", { id });
        const backupDest = join(backupRoot, "skills", id);
        mkdirSync(dirname(backupDest), { recursive: true });
        if (existsSync(backupDest)) rmSync(backupDest, { recursive: true, force: true });
        renameSync(src, backupDest);
        continue;
      }
      mkdirSync(localRoot, { recursive: true });
      renameSync(src, dest);
      moved.add(id);
    } catch (err) {
      log.error(`迁移 legacy skill 失败: ${id}`, { projectRoot, error: String(err) });
    }
  }
  // 空壳顺手清掉（残余文件留给 backupLegacyAgentFiles 处理）
  try {
    if (existsSync(legacyRoot) && readdirSync(legacyRoot).length === 0) {
      rmSync(legacyRoot, { recursive: true });
    }
  } catch {
    // 非致命
  }
  return { moved, deduped };
}

/** 剥离 legacy command 文件 frontmatter 里的身份/状态行（pluginId / enabled） */
function stripLegacyCommandFrontmatter(raw: string): { content: string; enabled: boolean } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { content: raw, enabled: true };
  const lines = match[1].split(/\r?\n/);
  let enabled = true;
  const kept = lines.filter((line) => {
    const key = line.slice(0, Math.max(line.indexOf(":"), 0)).trim();
    if (key === "pluginId") return false;
    if (key === "enabled") {
      enabled = line.slice(line.indexOf(":") + 1).trim() !== "false";
      return false;
    }
    return true;
  });
  const content = `---\n${kept.join("\n")}\n---${raw.slice(match[0].length)}`;
  return { content, enabled };
}

/**
 * R7/R8：`.prismnext/agent/commands/*.md` → `local/commands/*.md`
 * （剥 pluginId/enabled 行；enabled:false → disabledContent）；
 * `*.md.disabled` 文件名还原 + disabledContent 追加 user.local:<name>。
 * 同名 .md 与 .md.disabled 同时存在时以 .md 为准（.disabled 进 backup）。
 */
function migrateLegacyCommands(projectRoot: string, disabled: Set<string>): void {
  const legacyRoot = join(projectRoot, LEGACY_COMMANDS_REL);
  if (!existsSync(legacyRoot)) return;
  const localRoot = join(projectRoot, LOCAL_PACK_REL, "commands");
  const backupRoot = legacyBackupDir(projectRoot);
  const seen = new Set<string>();

  const moveOne = (fileName: string, forceDisabled: boolean): void => {
    const name = fileName.replace(/\.md(\.disabled)?$/, "");
    const src = join(legacyRoot, fileName);
    try {
      const raw = readFileSync(src, "utf-8");
      const { content, enabled } = stripLegacyCommandFrontmatter(raw);
      if (seen.has(name)) {
        // 同名冲突：后到者（.disabled 副本）进 backup
        const backupDest = join(backupRoot, "commands", fileName);
        mkdirSync(dirname(backupDest), { recursive: true });
        renameSync(src, backupDest);
        return;
      }
      seen.add(name);
      const dest = join(localRoot, `${name}.md`);
      if (existsSync(dest)) {
        log.warn("local commands 已存在，legacy 副本进 backup", { name });
        const backupDest = join(backupRoot, "commands", fileName);
        mkdirSync(dirname(backupDest), { recursive: true });
        renameSync(src, backupDest);
        return;
      }
      mkdirSync(localRoot, { recursive: true });
      writeFileSync(dest, content, "utf-8");
      rmSync(src, { force: true });
      if (forceDisabled || !enabled) disabled.add(`${LOCAL_PACK_ID}:${name}`);
    } catch (err) {
      log.error(`迁移 legacy command 失败: ${fileName}`, { projectRoot, error: String(err) });
    }
  };

  // 先处理 .md（enabled 版本优先），再处理 .md.disabled
  for (const fileName of legacyCommandFileNames(projectRoot).filter((f) => f.endsWith(".md"))) {
    moveOne(fileName, false);
  }
  for (const fileName of legacyCommandFileNames(projectRoot).filter((f) => f.endsWith(".md.disabled"))) {
    moveOne(fileName, true);
  }
  try {
    if (existsSync(legacyRoot) && readdirSync(legacyRoot).length === 0) {
      rmSync(legacyRoot, { recursive: true });
    }
  } catch {
    // 非致命
  }
}

/**
 * R10：skills-manifest 的 disabled → disabledContent。
 * 映射：命中 core pack 的 id（bundled）→ core FQID（若项目同时有该 skill
 * 目录则连 local FQID 一起禁用——OpenCode 启停本来就是名字粒度，双写最
 * 贴近旧行为）；其余 → local FQID。
 * 随后文件瘦身：只留 sources + installs（registryUrls 按读时规则归一化）。
 */
function migrateLegacySkillsManifestDisabled(
  projectRoot: string,
  disabled: Set<string>,
  coreSkillIds: Set<string>,
  legacySkillIds: Set<string>,
): void {
  const manifest = readLegacySkillsManifest(projectRoot);
  const legacyDisabled = (manifest?.disabled ?? []).filter(Boolean);
  if (legacyDisabled.length === 0) return;

  for (const id of legacyDisabled) {
    if (coreSkillIds.has(id)) {
      disabled.add(`${CORE_PACK_ID}:${id}`);
      if (legacySkillIds.has(id)) disabled.add(`${LOCAL_PACK_ID}:${id}`);
    } else {
      disabled.add(`${LOCAL_PACK_ID}:${id}`);
    }
  }

  // 瘦身重写（只留 sources + installs；sources 缺省时保留 curated 默认源）
  try {
    const slimmed = {
      sources: Array.isArray(manifest!.sources) && manifest!.sources.length > 0
        ? manifest!.sources
        : [
            ...(Array.isArray(manifest!.registryUrls)
              ? manifest!.registryUrls
                  .filter((u): u is string => typeof u === "string" && Boolean(u.trim()))
                  .map((url) => ({ id: `remote:${url.trim()}`, kind: "remote", url: url.trim(), connected: true }))
              : []),
            { id: "prism-curated", kind: "bundled", connected: true },
          ],
      installs: Array.isArray(manifest!.installs) ? manifest!.installs : [],
    };
    writeFileSync(
      join(projectRoot, LEGACY_SKILLS_MANIFEST_REL),
      `${JSON.stringify(slimmed, null, 2)}\n`,
      "utf-8",
    );
  } catch (err) {
    log.error("skills-manifest 瘦身失败", { projectRoot, error: String(err) });
  }
}

/** legacy-backup-<date>/ 的绝对路径（不在此处创建，由调用方按需 mkdir） */
function legacyBackupDir(projectRoot: string): string {
  return join(
    projectRoot,
    ".prismnext",
    "agent",
    `legacy-backup-${new Date().toISOString().slice(0, 10)}`,
  );
}

/** R12（agent 部分）：legacy 文件/残余目录移入 legacy-backup-<date>/ */
function backupLegacyAgentFiles(projectRoot: string): void {
  const agentDir = join(projectRoot, ".prismnext", "agent");
  const backupDir = legacyBackupDir(projectRoot);
  const move = (rel: string) => {
    const src = join(agentDir, rel);
    if (!existsSync(src)) return;
    try {
      mkdirSync(dirname(join(backupDir, rel)), { recursive: true });
      renameSync(src, join(backupDir, rel));
    } catch (err) {
      log.warn("legacy backup 失败，原文件保留", { rel, error: String(err) });
    }
  };
  move("experts-manifest.json");
  move("orchestrators-manifest.json");
  move(join("experts", "custom"));
  move(join("orchestrators", "custom"));
  // skills/ 与 commands/ 在 R6/R7/R8 后应为空；有残余（junk 文件）则进 backup
  move("skills");
  move("commands");
  // 空壳顺手清掉（experts/ orchestrators/ 在 custom 移走后应为空）
  for (const dir of ["experts", "orchestrators"]) {
    const abs = join(agentDir, dir);
    try {
      if (existsSync(abs) && readdirSync(abs).length === 0) rmSync(abs, { recursive: true });
    } catch {
      // 非致命
    }
  }
}

/**
 * R1–R8/R10/R11 文件级迁移（幂等）：
 * - R1/R2 experts-manifest 的 disabledBuiltinIds / builtinOverrides → FQID 化
 * - R3 orchestrators-manifest：defaultOrchestratorId → FQID（custom 目录存在
 *   → user.local，否则 → prismnext.core）；disabled/overrides 同 R1/R2
 * - R4/R5 custom 目录移动到 local/ 并剥身份字段
 * - R6 legacy skills → local/skills（与 core 逐字节相同的冗余副本进 backup）
 * - R7/R8 legacy commands → local/commands（剥 pluginId/enabled；.md.disabled
 *   还原文件名 + disabledContent）
 * - R10 skills-manifest.disabled → disabledContent；文件瘦身只留 sources+installs
 * - R11 settings 的 builtin command 全局启停 → disabledContent（消费后清空键）
 * - 收尾 legacy 文件进 legacy-backup
 */
export function migrateLegacyAgentState(projectRoot: string, state: PacksState): PacksState {
  const disabled = new Set(state.disabledContent);
  const overrides: PacksState["contentOverrides"] = { ...state.contentOverrides };
  let defaultOrchestrator = state.defaultOrchestrator;

  const expertsManifest = readLegacyJson<LegacyExpertsManifest>(
    join(projectRoot, LEGACY_EXPERTS_MANIFEST_REL),
  );
  if (expertsManifest) {
    for (const id of expertsManifest.disabledBuiltinIds ?? []) {
      if (id) disabled.add(`${CORE_PACK_ID}:${id}`);
    }
    for (const [id, override] of Object.entries(expertsManifest.builtinOverrides ?? {})) {
      if (id) overrides[`${CORE_PACK_ID}:${id}`] = sanitizeOverride(override);
    }
  }

  const orchManifest = readLegacyJson<LegacyOrchestratorsManifest>(
    join(projectRoot, LEGACY_ORCHESTRATORS_MANIFEST_REL),
  );
  if (orchManifest) {
    for (const id of orchManifest.disabledBuiltinIds ?? []) {
      if (id) disabled.add(`${CORE_PACK_ID}:${id}`);
    }
    for (const [id, override] of Object.entries(orchManifest.builtinOverrides ?? {})) {
      if (id) overrides[`${CORE_PACK_ID}:${id}`] = sanitizeOverride(override);
    }
    // 注意：必须在 R5 移动 custom 目录【之前】判定 custom 归属
    const legacyDefault = orchManifest.defaultOrchestratorId?.trim();
    if (legacyDefault) {
      const isCustom = existsSync(join(projectRoot, LEGACY_CUSTOM_ORCHESTRATORS_REL, legacyDefault));
      defaultOrchestrator = `${isCustom ? LOCAL_PACK_ID : CORE_PACK_ID}:${legacyDefault}`;
    }
  }

  moveCustomAgentDirs(projectRoot, "experts");
  moveCustomAgentDirs(projectRoot, "orchestrators");

  // R6/R10 需要 core pack 的技能清单（dedup + disabled 映射）；
  // catalog 查不到 core（如测试密封）时退化为「全部移 local、disabled 全映 local」。
  const coreSkills = listCorePackSkills();
  const legacySkillIds = new Set(legacySkillDirNames(projectRoot));
  migrateLegacySkillDirs(projectRoot, new Set(coreSkills.keys()), (id) => coreSkills.get(id) ?? null);
  migrateLegacyCommands(projectRoot, disabled);
  migrateLegacySkillsManifestDisabled(projectRoot, disabled, new Set(coreSkills.keys()), legacySkillIds);

  // R11：全局 builtin command 启停 → 项目 disabledContent（只消费一次）
  const builtinStates = readLegacyBuiltinCommandStates();
  if (builtinStates) {
    for (const [name, enabled] of Object.entries(builtinStates)) {
      if (name && enabled === false) disabled.add(`${CORE_PACK_ID}:${name}`);
    }
    legacyBuiltinStatesConsumed = true;
    try {
      legacyBuiltinHooks?.clear();
    } catch {
      // 清空 settings 键失败不阻断迁移
    }
  }

  backupLegacyAgentFiles(projectRoot);

  return {
    ...state,
    defaultOrchestrator,
    disabledContent: [...disabled].sort(),
    contentOverrides: overrides,
  };
}

/** core pack 的 skill id → SKILL.md 原文（读不到 → 空 Map）。 */
function listCorePackSkills(): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const core = getPack(CORE_PACK_ID);
    if (!core) return out;
    const skillsRoot = join(core.dir, "skills");
    if (!existsSync(skillsRoot)) return out;
    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(skillsRoot, entry.name, "SKILL.md");
      if (!existsSync(skillMd)) continue;
      try {
        out.set(entry.name, readFileSync(skillMd, "utf-8"));
      } catch {
        // 单个读失败跳过
      }
    }
  } catch {
    // catalog 不可用（测试密封/损坏）→ 空
  }
  return out;
}

/**
 * 检测并按序执行迁移（幂等）：
 * - packs.json 不存在且无 legacy → 返回空状态，【不落盘】（纯读不应产生写副作用）
 * - packs.json 存在且 stateVersion 当前、无 legacy → 无操作
 * - packs.json 不存在但有 legacy → R1–R8/R10/R11 迁移后落盘
 * - stateVersion 旧 → 版本迁移（MIGRATIONS，当前为空）+ 落盘
 * - packs.json 损坏 → 回退空状态（可自愈重写）；仍有 legacy 时照常迁移
 */
export function migratePacksStateIfNeeded(projectRoot: string): {
  state: PacksState;
  migrated: boolean;
} {
  const path = statePath(projectRoot);
  const exists = existsSync(path);
  const hasLegacy = hasLegacyAgentState(projectRoot);
  if (!exists && !hasLegacy) {
    return { state: emptyPacksState(), migrated: false };
  }

  let state = emptyPacksState();
  let version = 0;
  if (exists) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      version =
        raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).stateVersion === "number"
          ? ((raw as Record<string, unknown>).stateVersion as number)
          : 0;
      state = normalizePacksState(raw);
    } catch (err) {
      log.error("packs.json 损坏，回退空状态", { projectRoot, error: String(err) });
      version = 0;
      state = emptyPacksState();
    }
  }

  const needsVersionMigration = version !== PACKS_STATE_VERSION;
  if (!needsVersionMigration && !hasLegacy) {
    return { state, migrated: false };
  }

  if (needsVersionMigration && exists && MIGRATIONS.length > 0) {
    for (const migration of MIGRATIONS) {
      try {
        state = migration.apply(projectRoot, state);
        log.info(`packs 迁移已执行: ${migration.id}`, { projectRoot });
      } catch (err) {
        // 单条迁移失败不阻断后续——状态操作可重入，下版本再试
        log.error(`packs 迁移失败: ${migration.id}`, { projectRoot, error: String(err) });
      }
    }
  }

  if (hasLegacy) {
    state = migrateLegacyAgentState(projectRoot, state);
    log.info("legacy agent 状态已迁移（R1–R8/R10/R11）", { projectRoot });
  }

  writePacksState(projectRoot, state);
  return { state, migrated: true };
}

// ── 读写 ──────────────────────────────────────────────────

export function readPacksState(projectRoot: string): PacksState {
  return migratePacksStateIfNeeded(projectRoot).state;
}

/** 原子写：先写 tmp 再 rename，避免半截文件。 */
export function writePacksState(projectRoot: string, state: PacksState): void {
  const path = statePath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
  writeCounter += 1;
  for (const listener of writeListeners) {
    try {
      listener(projectRoot);
    } catch {
      // 监听器异常不阻断状态写
    }
  }
}

/** packs.json 的 mtime（resolver 缓存键的一部分）；不存在返回 0 */
export function packsStateMtime(projectRoot: string): number {
  try {
    const path = statePath(projectRoot);
    if (!existsSync(path)) return 0;
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

// ── 写入通知（§5.5：pack-resolver 订阅以使视图失效）──────────

type PacksStateWriteListener = (projectRoot: string) => void;
const writeListeners = new Set<PacksStateWriteListener>();

export function onPacksStateWritten(listener: PacksStateWriteListener): {
  dispose: () => void;
} {
  writeListeners.add(listener);
  return { dispose: () => writeListeners.delete(listener) };
}

/**
 * 进程内单调写入计数（resolver 缓存键的一部分）：
 * 同一毫秒内连续写入时 mtime 可能不变，计数器保证进程内写立即失效缓存。
 * 跨进程写仍由 mtime 兜底（v1 单写者，见设计文档 O-2）。
 */
let writeCounter = 0;

export function packsStateWriteCounter(): number {
  return writeCounter;
}

// ── §6.2 状态操作 ─────────────────────────────────────────

/** install：追加记录（enabled=true）。已存在 → 返回原记录（幂等 no-op）。 */
export function installPackRecord(
  projectRoot: string,
  input: { packId: string; version: string },
): PackRecord {
  const state = readPacksState(projectRoot);
  const existing = state.packs.find((p) => p.packId === input.packId);
  if (existing) return existing;
  const record: PackRecord = {
    packId: input.packId,
    version: input.version,
    enabled: true,
    installedAt: new Date().toISOString(),
  };
  writePacksState(projectRoot, { ...state, packs: [...state.packs, record] });
  return record;
}

/** setEnabled：改写记录 enabled。记录不存在 → null（core/local 之外未装即无记录）。 */
export function setPackEnabled(
  projectRoot: string,
  packId: string,
  enabled: boolean,
): PackRecord | null {
  const state = readPacksState(projectRoot);
  const existing = state.packs.find((p) => p.packId === packId);
  if (!existing) return null;
  const record = { ...existing, enabled };
  writePacksState(projectRoot, {
    ...state,
    packs: state.packs.map((p) => (p.packId === packId ? record : p)),
  });
  return record;
}

/**
 * uninstall：移除记录 + 惰性修剪该 pack 的 disabledContent / contentOverrides；
 * defaultOrchestrator 指向该 pack 时回退 core 默认。零文件删除（引用模型）。
 */
export function removePackRecord(projectRoot: string, packId: string): PacksState {
  const state = readPacksState(projectRoot);
  const next: PacksState = {
    ...state,
    packs: state.packs.filter((p) => p.packId !== packId),
    disabledContent: state.disabledContent.filter((f) => !fqidBelongsToPack(f, packId)),
    contentOverrides: Object.fromEntries(
      Object.entries(state.contentOverrides).filter(([f]) => !fqidBelongsToPack(f, packId)),
    ),
    defaultOrchestrator:
      state.defaultOrchestrator && fqidBelongsToPack(state.defaultOrchestrator, packId)
        ? DEFAULT_ORCHESTRATOR_FQID
        : state.defaultOrchestrator,
  };
  writePacksState(projectRoot, next);
  return next;
}

/** 逐项禁用/启用（disabledContent 增删，幂等）。 */
export function setContentDisabled(
  projectRoot: string,
  fqid: Fqid,
  disabled: boolean,
): PacksState {
  const state = readPacksState(projectRoot);
  const set = new Set(state.disabledContent);
  if (disabled) set.add(fqid);
  else set.delete(fqid);
  const next = { ...state, disabledContent: [...set].sort() };
  writePacksState(projectRoot, next);
  return next;
}

/** 写 override（增量合并）；patch 为空对象 → 删除该键。 */
export function saveContentOverride(
  projectRoot: string,
  fqid: Fqid,
  patch: ContentOverride,
): PacksState {
  const state = readPacksState(projectRoot);
  const overrides = { ...state.contentOverrides };
  const merged: ContentOverride = { ...(overrides[fqid] ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete (merged as Record<string, unknown>)[key];
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(merged).length > 0) overrides[fqid] = merged;
  else delete overrides[fqid];
  const next = { ...state, contentOverrides: overrides };
  writePacksState(projectRoot, next);
  return next;
}

/** 设置默认 orchestrator（FQID）。 */
export function setDefaultOrchestratorFqid(projectRoot: string, fqid: Fqid): PacksState {
  const state = readPacksState(projectRoot);
  const next = { ...state, defaultOrchestrator: fqid };
  writePacksState(projectRoot, next);
  return next;
}
