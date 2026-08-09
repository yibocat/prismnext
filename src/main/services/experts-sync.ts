/**
 * experts-sync.ts —— orchestrators / experts 的 legacy facade（Phase 2 重写）。
 *
 * 内容来源与启停判定已全部交给 Agent Pack 体系：
 *   - core 内容 = `resources/teams/prismnext.core/`（PackCatalog 扫描）
 *   - 用户自建内容 = Local Pack `.prismnext/agent/local/`
 *   - 启停 / override / 默认 orchestrator = packs.json（packs-state.ts）
 *   - 「有什么、是否可用」唯一答案 = pack-resolver.ts
 *
 * 本文件保留重构前的对外契约（IPC / chat / stack-preview / 渲染引擎），
 * 内部全部改为 resolver 驱动：
 *   - ExpertInfo/OrchestratorInfo 形状不变（id 仍为裸 id；新增 fqid 字段）
 *   - agent.md 渲染逻辑逐字节不变（golden 验收：tests/main/agent-plan-golden）
 *   - 文件名规则：core/local 用裸 id（opencode 侧稳定），其余 pack 用
 *     `<packId>--<id>`（§4.5.2）
 *   - 裸 id 命名空间冲突时按 local > external > firstparty > core 遮蔽
 *     （对齐旧 merge 语义：custom 覆盖 bundled）
 *
 * 已删除：experts/orchestrators manifest 文件读写（→ packs.json 适配器）、
 * bundled-experts/bundled-orchestrators loader、merge/applyOverride 拼贴、
 * listDisabledBuiltinExperts / expertsManifestModified（无消费方）。
 */

import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { PromptContext } from "../prompts/types";
import {
  type ExpertDefinition,
  type ExpertInfo,
  type OrchestratorDefinition,
  type OrchestratorInfo,
  type PrismExpertsSyncState,
  type SaveCustomExpertPayload,
  type SaveCustomOrchestratorPayload,
  DEFAULT_ORCHESTRATOR_ID,
} from "./agent-experts";
import {
  resolveOrchestratorActiveModuleKeys,
  resolveActiveModuleKeys,
  resolveExpertProfileModuleKeysFor,
  composeOrchestratorProfileModulePrompts,
  composeProfileModulePrompts,
} from "../prompts/resolve-active-modules";
import { buildSubagentRosterMarkdown } from "../../shared/subagent-roster";
import { buildTaskPermissionBlock } from "./task-orchestrator-gate";
import {
  CORE_PACK_ID,
  DEFAULT_ORCHESTRATOR_FQID,
  LOCAL_PACK_ID,
  type ExpertDef,
  type Fqid,
  type OrchestratorDef,
  type ResolvedContent,
} from "../../shared/packs/types";
import { parseFqid, toFqid } from "../../shared/packs/state";
import {
  getContent,
  listContent,
  readInstructions,
  resolveAllowedExperts,
  resolveBareContentId,
  resolveOrchestratorId as resolverResolveOrchestratorId,
  invalidateResolver,
} from "./pack-resolver";
import {
  readPacksState,
  setContentDisabled,
  saveContentOverride,
  setDefaultOrchestratorFqid,
  writePacksState,
} from "./packs-state";
import { getLocalPackDir, invalidateCatalog } from "./pack-catalog";
import { listUserTeams } from "./user-packs";

export { buildTaskPermissionBlock } from "./task-orchestrator-gate";

export const PRISM_EXPERTS_SYNC_REL = "prism-experts-sync.json";

// ── 裸 id / 文件名命名空间 ─────────────────────────────────

/** pack 遮蔽优先级：数字小者胜（local 最强，core 兜底）。 */
function packShadowRank(packId: string): number {
  if (packId === LOCAL_PACK_ID) return 0;
  if (packId === CORE_PACK_ID) return 3;
  return 1; // firstparty / external
}

/**
 * opencode agent 文件名基（§4.5.2）：core/local 用裸 id（与旧布局逐字节一致），
 * 其余 pack 用 `<packId>--<id>` 防冲突。
 */
function agentFileBase(content: ResolvedContent): string {
  return content.packId === CORE_PACK_ID || content.packId === LOCAL_PACK_ID
    ? content.id
    : `${content.packId}--${content.id}`;
}

/**
 * 按裸 id 分组取遮蔽胜者（旧 mergeExpertDefinitions 的 Map 覆盖语义：
 * custom 覆盖 bundled —— 现在推广为 local > external/firstparty > core）。
 */
function shadowWinners(items: ResolvedContent[]): ResolvedContent[] {
  const byBare = new Map<string, ResolvedContent>();
  for (const item of items) {
    const key = agentFileBase(item);
    const prev = byBare.get(key);
    if (!prev || packShadowRank(item.packId) < packShadowRank(prev.packId)) {
      byBare.set(key, item);
    }
  }
  return [...byBare.values()];
}

// ── ResolvedContent → legacy Info 视图 ─────────────────────

function instructionsPreview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

function toExpertInfo(projectRoot: string, content: ResolvedContent): ExpertInfo {
  const def = content.definition as ExpertDef;
  const instructions = readInstructions(projectRoot, content.fqid);
  const effectiveModules = resolveActiveModuleKeys({
    role: "expert",
    profileModules: resolveExpertProfileModuleKeysFor(def as ExpertDefinition),
  });
  return {
    id: agentFileBase(content),
    fqid: content.fqid,
    name: def.name,
    description: def.description,
    builtin: content.packId === CORE_PACK_ID,
    removable: content.removable,
    model: def.model,
    thoughtLevel: def.thoughtLevel,
    temperature: def.temperature,
    modules: def.modules,
    permission: def.permission,
    enabled: content.enabled,
    instructionsPreview: instructionsPreview(instructions),
    effectiveModules,
  };
}

/**
 * OrchestratorInfo.allowedExperts 语义对齐旧版：
 * - 定义了 allowedExperts 的 → 按启用 expert 过滤后的【文件名基】列表
 * - 未定义的 → undefined（UI 显示「标准编排」，plan 视为全部启用 experts）
 */
function toOrchestratorInfo(projectRoot: string, content: ResolvedContent): OrchestratorInfo {
  const def = content.definition as OrchestratorDef;
  const instructions = readInstructions(projectRoot, content.fqid);
  const effectiveModules = resolveOrchestratorActiveModuleKeys();
  const allowed =
    def.allowedExperts !== undefined
      ? resolveAllowedRefs(projectRoot, content.fqid).map((ref) => ref.id)
      : undefined;
  return {
    id: agentFileBase(content),
    fqid: content.fqid,
    name: def.name,
    description: def.description,
    builtin: content.packId === CORE_PACK_ID,
    // 旧版视图语义：core orchestrator 不带 removable 键；仅 local（可删除）为 true
    ...(content.removable ? { removable: true } : {}),
    model: def.model,
    thoughtLevel: def.thoughtLevel,
    temperature: def.temperature,
    allowedExperts: allowed,
    permission: def.permission,
    enabled: content.enabled,
    instructionsPreview: instructionsPreview(instructions),
    effectiveModules,
  };
}

export function listExperts(projectRoot: string): ExpertInfo[] {
  const winners = shadowWinners(listContent(projectRoot, "expert"));
  return winners.map((c) => toExpertInfo(projectRoot, c));
}

export function listOrchestrators(projectRoot: string): OrchestratorInfo[] {
  const winners = shadowWinners(listContent(projectRoot, "orchestrator"));
  return winners.map((c) => toOrchestratorInfo(projectRoot, c));
}

/** 裸 id 或 FQID → expert。 */
export function getExpert(projectRoot: string, expertId: string): ExpertInfo | null {
  const id = expertId.trim();
  if (!id) return null;
  return listExperts(projectRoot).find((e) => e.id === id || e.fqid === id) ?? null;
}

/** 裸 id 或 FQID → orchestrator。 */
export function getOrchestrator(
  projectRoot: string,
  orchestratorId: string,
): OrchestratorInfo | null {
  const id = orchestratorId.trim();
  if (!id) return null;
  return listOrchestrators(projectRoot).find((o) => o.id === id || o.fqid === id) ?? null;
}

/**
 * 解析当前应使用的 orchestrator，返回【文件名基】（core/local = 裸 id）。
 * 链路与旧版一致：tab 指定（须启用）→ 项目默认（须启用）→ core 默认兜底。
 */
export function resolveOrchestratorId(
  projectRoot: string,
  tabOrchestratorId?: string | null,
): string {
  const fqid = resolverResolveOrchestratorId(projectRoot, tabOrchestratorId);
  const content = getContent(projectRoot, fqid);
  return content ? agentFileBase(content) : DEFAULT_ORCHESTRATOR_ID;
}

// ── allowedExperts 解析（渲染 / UI 共用）────────────────────

/**
 * orchestrator 实际可用的 expert 引用（文件名基 + 名称 + 描述）：
 * resolver 解析 FQID → 遮蔽胜者 → 仅启用 → 按 spec 顺序去重。
 * spec 未定义时由调用方自行退化为「全部启用 experts」（本函数不处理）。
 */
function resolveAllowedRefs(
  projectRoot: string,
  orchestratorFqid: Fqid,
): Array<{ id: string; name: string; description: string }> {
  const winners = shadowWinners(listContent(projectRoot, "expert"));
  const byFqid = new Map(winners.map((c) => [c.fqid, c]));
  const byBare = new Map(winners.map((c) => [agentFileBase(c), c]));
  const refs: Array<{ id: string; name: string; description: string }> = [];
  const seen = new Set<string>();
  for (const fqid of resolveAllowedExperts(projectRoot, orchestratorFqid)) {
    // resolver 返回的 FQID 可能被遮蔽（同名 local 内容胜出）→ 映射到胜者
    const direct = byFqid.get(fqid);
    const parsed = parseFqid(fqid);
    const winner = direct ?? (parsed ? byBare.get(parsed.contentId) : undefined);
    if (!winner || !winner.enabled) continue;
    const base = agentFileBase(winner);
    if (seen.has(base)) continue;
    seen.add(base);
    refs.push({ id: base, name: winner.name, description: winner.description });
  }
  return refs;
}

// ── instructions 读取 ───────────────────────────────────────

export function readExpertInstructions(
  projectRoot: string,
  expert: ExpertDefinition,
): string {
  const fqid =
    (expert as ExpertInfo).fqid ?? resolveBareContentId(projectRoot, "expert", expert.id);
  return fqid ? readInstructions(projectRoot, fqid) : "";
}

export function readOrchestratorInstructions(
  projectRoot: string,
  orchestrator: OrchestratorDefinition,
): string {
  const fqid =
    (orchestrator as OrchestratorInfo).fqid
    ?? resolveBareContentId(projectRoot, "orchestrator", orchestrator.id);
  return fqid ? readInstructions(projectRoot, fqid) : "";
}

// ── 渲染引擎（与重构前逐字节一致；勿动逻辑）──────────────────

function appendCapabilityRefs(
  def: ExpertDefinition | OrchestratorDefinition,
  body: string,
  promptCtx: PromptContext = {},
  role: "orchestrator" | "expert",
): string {
  // Experts compose from their manifest `modules` subset — an expert Task
  // call pays the full system-side cost of every module we attach.
  const modulePrompts =
    role === "orchestrator"
      ? composeOrchestratorProfileModulePrompts(promptCtx)
      : composeProfileModulePrompts(
          // role === "expert" 时 def 必为 ExpertDefinition（调用方保证）
          resolveExpertProfileModuleKeysFor(def as ExpertDefinition),
          promptCtx,
        );
  const sections: string[] = [body.trim()];
  if (modulePrompts) {
    sections.push("", "---", "", modulePrompts);
  }
  return sections.join("\n");
}

function yamlScalar(value: string): string {
  // Quote strings that YAML would otherwise parse as a DIFFERENT type
  // (numbers, booleans, null) — e.g. description "123" must stay a string or
  // opencode rejects the agent config ("Expected string, got 123").
  if (
    /[:#\n"'&*]|^\s/.test(value) ||
    /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(value) ||
    /^(true|false|True|False|TRUE|FALSE|yes|no|Yes|No|on|off|null|Null|NULL|~)$/.test(value)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

/** Quote YAML mapping keys that are illegal unquoted (`*` is an alias indicator). */
function yamlKey(key: string): string {
  if (key === "*" || /[:#\n"'&*!|>%@`{}[\],?]/.test(key) || /^\s|\s$/.test(key)) {
    return JSON.stringify(key);
  }
  return key;
}

function serializeYamlLines(value: unknown, indent = 0): string[] {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) {
    return [`${pad}null`];
  }
  if (typeof value === "string") {
    return [`${pad}${yamlScalar(value)}`];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [`${pad}${String(value)}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "object" && item !== null) {
        return [`${pad}-`, ...serializeYamlLines(item, indent + 1)];
      }
      return [`${pad}- ${yamlScalar(String(item))}`];
    });
  }
  if (typeof value === "object") {
    const lines: string[] = [];
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const safeKey = yamlKey(key);
      if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
        lines.push(`${pad}${safeKey}:`);
        lines.push(...serializeYamlLines(nested, indent + 1));
      } else if (Array.isArray(nested)) {
        lines.push(`${pad}${safeKey}:`);
        lines.push(...serializeYamlLines(nested, indent + 1));
      } else {
        lines.push(`${pad}${safeKey}: ${serializeYamlLines(nested, 0)[0]?.trim() ?? "null"}`);
      }
    }
    return lines;
  }
  return [`${pad}${String(value)}`];
}

function serializeFrontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      lines.push(`${key}:`);
      lines.push(...serializeYamlLines(value, 1));
    } else {
      lines.push(`${key}: ${serializeYamlLines(value, 0)[0]?.trim() ?? "null"}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

export interface AllowedExpertRef {
  id: string;
  name: string;
  description: string;
}

/** Appended at sync time — open built-ins + orchestrator allowlist experts. */
export function appendSubagentRosterSection(
  body: string,
  allowedExperts: AllowedExpertRef[],
): string {
  const trimmed = body.trim();
  const roster = buildSubagentRosterMarkdown(allowedExperts);
  return [trimmed, "", "---", roster].join("\n");
}

/** Drop stale / disabled expert ids from a stored allowlist for UI + persistence. */
export function pruneAllowedExpertIds(
  allowedExperts: string[] | undefined,
  knownExpertIds: string[],
): string[] | undefined {
  if (allowedExperts === undefined) return undefined;
  const known = new Set(knownExpertIds);
  return allowedExperts.filter((id) => known.has(id));
}

function mergePermissions(
  base: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (
      key in merged
      && typeof merged[key] === "object"
      && merged[key] !== null
      && !Array.isArray(merged[key])
      && typeof value === "object"
      && value !== null
      && !Array.isArray(value)
    ) {
      merged[key] = { ...(merged[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function orchestratorContentHash(md: string): string {
  let hash = 5381;
  for (let i = 0; i < md.length; i++) {
    hash = ((hash << 5) + hash) + md.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export interface ProjectExpertsAgentEntry {
  filename: string;
  content: string;
}

export interface ProjectExpertsAgentPlan {
  agentEntries: ProjectExpertsAgentEntry[];
  agentFiles: string[];
  orchestratorId: string;
  orchestratorContentHash: string;
  syncContentHash: string;
}

function computeSyncContentHash(entries: ProjectExpertsAgentEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.filename.localeCompare(b.filename));
  const payload = sorted.map((e) => `${e.filename}\0${e.content}`).join("\x1e");
  return orchestratorContentHash(payload);
}

/** Build agent.md payloads without writing — used to skip redundant sync on chat send. */
export function buildProjectExpertsAgentPlan(
  projectRoot: string,
  options?: { promptCtx?: PromptContext; defaultSubagentModel?: string | null },
): ProjectExpertsAgentPlan {
  const promptCtx: PromptContext = { projectRoot, ...options?.promptCtx };
  let defaultSubagentModel = options?.defaultSubagentModel ?? null;
  if (options?.defaultSubagentModel === undefined) {
    // Lazy require — keep module importable in unit tests without electron-store.
    try {
      const { getSettings } = require("./settings") as typeof import("./settings");
      defaultSubagentModel =
        (getSettings() as { aiSubagentModel?: string | null }).aiSubagentModel ?? null;
    } catch {
      defaultSubagentModel = null;
    }
  }

  const orchestratorId = resolveOrchestratorId(projectRoot, null);
  const orchestrator = getOrchestrator(projectRoot, orchestratorId);
  if (!orchestrator?.enabled) {
    throw new Error(`Orchestrator not found or disabled: ${orchestratorId}`);
  }

  const enabledExperts = listExperts(projectRoot).filter((e) => e.enabled);
  const enabledRefs: AllowedExpertRef[] = enabledExperts.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
  }));
  const allowedRefsFor = (info: OrchestratorInfo): AllowedExpertRef[] =>
    // spec 未定义 = 全部启用 experts（旧语义）；定义了 → resolver 解析后过滤
    info.allowedExperts === undefined
      ? enabledRefs
      : resolveAllowedRefs(projectRoot, info.fqid!);

  const agentEntries: ProjectExpertsAgentEntry[] = [];

  for (const expert of enabledExperts) {
    const instructions = readExpertInstructions(projectRoot, expert);
    agentEntries.push({
      filename: `${expert.id}.md`,
      content: renderExpertAgentMarkdown(expert, instructions, promptCtx, {
        defaultModel: defaultSubagentModel,
      }),
    });
  }

  const orchestratorInstructions = readOrchestratorInstructions(projectRoot, orchestrator);
  const orchestratorMd = renderOrchestratorAgentMarkdown(
    orchestrator,
    orchestratorInstructions,
    allowedRefsFor(orchestrator),
    promptCtx,
  );
  agentEntries.push({
    filename: `${orchestrator.id}.md`,
    content: orchestratorMd,
  });

  for (const extra of listOrchestrators(projectRoot).filter(
    (o) => o.enabled && o.id !== orchestratorId,
  )) {
    const extraInstructions = readOrchestratorInstructions(projectRoot, extra);
    agentEntries.push({
      filename: `${extra.id}.md`,
      content: renderOrchestratorAgentMarkdown(extra, extraInstructions, allowedRefsFor(extra), promptCtx),
    });
  }

  return {
    agentEntries,
    agentFiles: agentEntries.map((e) => e.filename),
    orchestratorId,
    orchestratorContentHash: orchestratorContentHash(orchestratorMd),
    syncContentHash: computeSyncContentHash(agentEntries),
  };
}

export function renderExpertAgentMarkdown(
  def: ExpertDefinition,
  instructionsBody: string,
  promptCtx: PromptContext = {},
  options?: { defaultModel?: string | null },
): string {
  const frontmatter: Record<string, unknown> = {
    description: def.description,
    mode: "subagent",
  };
  const model =
    (typeof def.model === "string" && def.model.trim())
    || (typeof options?.defaultModel === "string" && options.defaultModel.trim())
    || "";
  if (model) frontmatter.model = model;
  if (def.temperature !== undefined) frontmatter.temperature = def.temperature;
  // Platform rule: subagents never nest Task — authors only write domain work.
  frontmatter.permission = mergePermissions(def.permission, {
    task: { "*": "deny" },
  });
  const body = appendCapabilityRefs(def, instructionsBody, promptCtx, "expert");
  return `${serializeFrontmatter(frontmatter)}\n\n${body}\n`;
}

export function renderOrchestratorAgentMarkdown(
  def: OrchestratorDefinition,
  instructionsBody: string,
  allowedExperts: AllowedExpertRef[],
  promptCtx: PromptContext = {},
): string {
  const taskRules = buildTaskPermissionBlock(allowedExperts.map((e) => e.id));
  const permission = mergePermissions(def.permission, { task: taskRules });
  const frontmatter: Record<string, unknown> = {
    description: def.description,
    mode: "primary",
    permission,
  };
  if (def.model) frontmatter.model = def.model;
  if (def.temperature !== undefined) frontmatter.temperature = def.temperature;
  const bodyWithExperts = appendSubagentRosterSection(instructionsBody, allowedExperts);
  const body = appendCapabilityRefs(def, bodyWithExperts, promptCtx, "orchestrator");
  return `${serializeFrontmatter(frontmatter)}\n\n${body}\n`;
}

// ── opencode 同步（与重构前一致）─────────────────────────────

export function getOpencodeAgentsDir(): string {
  return join(app.getPath("userData"), "opencode-server", "config", "opencode", "agents");
}

export function getPrismExpertsSyncStatePath(): string {
  return join(app.getPath("userData"), "opencode-server", PRISM_EXPERTS_SYNC_REL);
}

export function readPrismExpertsSyncState(): PrismExpertsSyncState | null {
  const path = getPrismExpertsSyncStatePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PrismExpertsSyncState;
  } catch {
    return null;
  }
}

export function writePrismExpertsSyncState(state: PrismExpertsSyncState): void {
  const path = getPrismExpertsSyncStatePath();
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
}

export function clearSyncedAgentFiles(agentsDir: string, agentFiles: string[]): void {
  for (const file of agentFiles) {
    const safe = file.replace(/[/\\]/g, "");
    if (!safe || safe !== file) continue;
    const target = join(agentsDir, safe);
    if (existsSync(target)) {
      try {
        unlinkSync(target);
      } catch {
        // non-fatal
      }
    }
  }
}

export function syncProjectExpertsToOpencode(
  projectRoot: string,
  options?: {
    agentsDir?: string;
    syncStatePath?: string;
    promptCtx?: PromptContext;
    defaultSubagentModel?: string | null;
  },
): { agentFiles: string[]; orchestratorId: string; orchestratorContentHash: string; syncContentHash: string } {
  const agentsDir = options?.agentsDir ?? getOpencodeAgentsDir();
  mkdirSync(agentsDir, { recursive: true });

  const plan = buildProjectExpertsAgentPlan(projectRoot, options);
  for (const entry of plan.agentEntries) {
    writeFileSync(join(agentsDir, entry.filename), entry.content, "utf-8");
  }

  const state: PrismExpertsSyncState = {
    projectRoot,
    syncedAt: Date.now(),
    agentFiles: plan.agentFiles,
    orchestratorId: plan.orchestratorId,
    orchestratorContentHash: plan.orchestratorContentHash,
    syncContentHash: plan.syncContentHash,
  };

  if (options?.syncStatePath) {
    mkdirSync(join(options.syncStatePath, ".."), { recursive: true });
    writeFileSync(options.syncStatePath, JSON.stringify(state, null, 2), "utf-8");
  } else {
    writePrismExpertsSyncState(state);
  }

  return {
    agentFiles: plan.agentFiles,
    orchestratorId: plan.orchestratorId,
    orchestratorContentHash: plan.orchestratorContentHash,
    syncContentHash: plan.syncContentHash,
  };
}

// ── local pack 内容读写（旧 custom experts/orchestrators 契约）──

function slugifyId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "custom-expert";
}

function uniqueLocalExpertId(projectRoot: string, base: string): string {
  const existing = new Set(listExperts(projectRoot).map((e) => e.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function uniqueLocalOrchestratorId(projectRoot: string, base: string): string {
  const existing = new Set(listOrchestrators(projectRoot).map((o) => o.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

/** local pack 目录写入后必须显式失效 resolver（fingerprint 有 mtime 精度边界）。 */
function invalidateLocalViews(projectRoot: string): void {
  invalidateResolver(projectRoot);
}

// ── 可写目标（Local Pack 或用户团队）───────────────────────

/** Derive a content item's owning pack id from its fqid (`packId:contentId`). */
function packIdOf(item: { fqid?: string }): string {
  const pid = item.fqid?.split(":")[0];
  return pid && pid.length > 0 ? pid : LOCAL_PACK_ID;
}

/**
 * Resolve the directory a custom agent should be written into.
 * - no target / LOCAL_PACK_ID → this project's Local Pack;
 * - a user-team packId → that team's app-level directory.
 */
function resolveWritableTarget(
  projectRoot: string,
  targetPackId?: string,
): { dir: string; packId: string } {
  const tid = targetPackId?.trim();
  if (!tid || tid === LOCAL_PACK_ID) {
    return { dir: getLocalPackDir(projectRoot), packId: LOCAL_PACK_ID };
  }
  const team = listUserTeams().find((t) => t.packId === tid);
  if (!team) throw new Error(`Target team not found: ${tid}`);
  return { dir: team.dir, packId: team.packId };
}

/** Invalidate views after a write: local → this project; user team → catalog. */
function invalidateWritableTarget(projectRoot: string, packId: string): void {
  if (packId === LOCAL_PACK_ID) invalidateLocalViews(projectRoot);
  else invalidateCatalog();
}

export function saveCustomExpert(
  projectRoot: string,
  payload: SaveCustomExpertPayload,
  targetPackId?: string,
): ExpertInfo {
  const { dir, packId } = resolveWritableTarget(projectRoot, targetPackId);
  const rawId = payload.id?.trim() || slugifyId(payload.name);
  // Editing passes an agentFileBase id (`<packId>--<id>` for non-local packs);
  // strip the pack prefix to get the bare id used as the directory name.
  const bareId = rawId.includes("--") ? rawId.slice(rawId.lastIndexOf("--") + 2) : rawId;
  const id = payload.id ? bareId : uniqueLocalExpertId(projectRoot, bareId);
  const agentDir = join(dir, "experts", id);
  mkdirSync(agentDir, { recursive: true });

  // 新格式 expert.json：无 builtin/removable/pluginId 身份字段（§4.3.2）
  const def: ExpertDef = {
    id,
    name: payload.name.trim(),
    description: payload.description.trim(),
    model: payload.model?.trim() || undefined,
    thoughtLevel: payload.thoughtLevel?.trim() || undefined,
    temperature: payload.temperature,
    modules: payload.modules?.length ? payload.modules : undefined,
    permission: payload.permission,
  };

  writeFileSync(join(agentDir, "expert.json"), `${JSON.stringify(def, null, 2)}\n`, "utf-8");
  writeFileSync(join(agentDir, "instructions.md"), payload.instructions.trim(), "utf-8");
  invalidateWritableTarget(projectRoot, packId);

  const saved = getExpert(projectRoot, toFqid(packId, id));
  if (!saved) throw new Error(`Failed to save custom expert "${id}"`);
  return saved;
}

export function deleteCustomExpert(projectRoot: string, expertId: string): void {
  const expert = getExpert(projectRoot, expertId);
  if (!expert) throw new Error(`Expert not found: ${expertId}`);
  if (!expert.removable) {
    // Pack-provided experts (incl. first-party packs) are read-only —
    // disable the pack instead of deleting its content.
    throw new Error(
      `Cannot delete a team-provided expert (disable the team or its expert instead): ${expertId}`,
    );
  }
  const packId = packIdOf(expert);
  const { dir } = resolveWritableTarget(projectRoot, packId);
  const bareId = expert.id.includes("--") ? expert.id.slice(expert.id.lastIndexOf("--") + 2) : expert.id;
  const agentDir = join(dir, "experts", bareId);
  if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true });
  invalidateWritableTarget(projectRoot, packId);
}

export function saveCustomOrchestrator(
  projectRoot: string,
  payload: SaveCustomOrchestratorPayload,
  targetPackId?: string,
): OrchestratorInfo {
  const { dir, packId } = resolveWritableTarget(projectRoot, targetPackId);
  const rawId = payload.id?.trim() || slugifyId(payload.name);
  // Editing passes an agentFileBase id (`<packId>--<id>` for non-local packs);
  // strip the pack prefix to get the bare id used as the directory name.
  const bareId = rawId.includes("--") ? rawId.slice(rawId.lastIndexOf("--") + 2) : rawId;
  const id = payload.id ? bareId : uniqueLocalOrchestratorId(projectRoot, bareId);
  const agentDir = join(dir, "orchestrators", id);
  mkdirSync(agentDir, { recursive: true });

  const knownExpertIds = listExperts(projectRoot).map((e) => e.id);
  // 新格式 orchestrator.json：无身份字段；allowedExperts 存裸 id（§4.3.1 可解析）。
  // undefined = 不限制（默认全部可用专家，含将来新增）；仅用户显式勾选才落列表。
  const def: OrchestratorDef = {
    id,
    name: payload.name.trim(),
    description: payload.description.trim(),
    allowedExperts:
      payload.allowedExperts !== undefined
        ? pruneAllowedExpertIds(payload.allowedExperts, knownExpertIds)
        : undefined,
    model: payload.model?.trim() || undefined,
    thoughtLevel: payload.thoughtLevel?.trim() || undefined,
    temperature: payload.temperature,
    permission: payload.permission,
  };

  writeFileSync(join(agentDir, "orchestrator.json"), `${JSON.stringify(def, null, 2)}\n`, "utf-8");
  writeFileSync(join(agentDir, "instructions.md"), payload.instructions.trim(), "utf-8");
  invalidateWritableTarget(projectRoot, packId);

  const saved = getOrchestrator(projectRoot, toFqid(packId, id));
  if (!saved) throw new Error(`Failed to save custom orchestrator "${id}"`);
  return saved;
}

export function deleteCustomOrchestrator(projectRoot: string, orchestratorId: string): void {
  const orchestrator = getOrchestrator(projectRoot, orchestratorId);
  if (!orchestrator) throw new Error(`Orchestrator not found: ${orchestratorId}`);
  if (!orchestrator.removable) {
    // Pack-provided orchestrators (incl. first-party packs) are read-only —
    // disable the pack instead of deleting its content.
    throw new Error(
      `Cannot delete a team-provided orchestrator (disable the team or its orchestrator instead): ${orchestratorId}`,
    );
  }
  const packId = packIdOf(orchestrator);
  const { dir } = resolveWritableTarget(projectRoot, packId);
  const bareId = orchestrator.id.includes("--")
    ? orchestrator.id.slice(orchestrator.id.lastIndexOf("--") + 2)
    : orchestrator.id;
  const agentDir = join(dir, "orchestrators", bareId);
  if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true });
  invalidateWritableTarget(projectRoot, packId);
  const state = readPacksState(projectRoot);
  if (state.defaultOrchestrator === toFqid(packId, bareId)) {
    setDefaultOrchestratorFqid(projectRoot, DEFAULT_ORCHESTRATOR_FQID);
  }
}

// Core content state operations (Phase 6): these moved to the packs IPC
// surface (`packs:saveOverride` / `packs:setContentEnabled` /
// `packs:resetCoreDefaults` / `packs:getCoreState`), implemented storage-only
// in packs-state.ts. The legacy builtin manifest contract is gone.

// ── 详情视图（IPC 契约）─────────────────────────────────────

export function getOrchestratorDetail(
  projectRoot: string,
  orchestratorId: string,
): (OrchestratorInfo & { instructions: string }) | null {
  const orchestrator = getOrchestrator(projectRoot, orchestratorId);
  if (!orchestrator) return null;
  return {
    ...orchestrator,
    instructions: readOrchestratorInstructions(projectRoot, orchestrator),
  };
}

export function getExpertDetail(
  projectRoot: string,
  expertId: string,
): (ExpertInfo & { instructions: string }) | null {
  const expert = getExpert(projectRoot, expertId);
  if (!expert) return null;
  return {
    ...expert,
    instructions: readExpertInstructions(projectRoot, expert),
  };
}
