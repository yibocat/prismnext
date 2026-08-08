/**
 * experts-sync.ts —— orchestrators / experts 的 legacy facade（Phase 2 重写）。
 *
 * 内容来源与启停判定已全部交给 Agent Pack 体系：
 *   - core 内容 = `resources/plugins/prismnext.core/`（PackCatalog 扫描）
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
  type ExpertsManifest,
  type OrchestratorDefinition,
  type OrchestratorInfo,
  type OrchestratorsManifest,
  type PrismExpertsSyncState,
  type SaveBuiltinExpertOverridePayload,
  type SaveBuiltinOrchestratorOverridePayload,
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
import { getLocalPackDir } from "./pack-catalog";

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

// ── legacy manifest 适配器（IPC 契约不变；存储 = packs.json）──

function coreKindOf(projectRoot: string, fqid: Fqid): "expert" | "orchestrator" | null {
  const content = getContent(projectRoot, fqid);
  if (!content || content.packId !== CORE_PACK_ID) return null;
  if (content.kind === "expert" || content.kind === "orchestrator") return content.kind;
  return null;
}

function bareOverridesOfKind(
  projectRoot: string,
  kind: "expert" | "orchestrator",
): Record<string, Partial<ExpertDefinition> & Partial<OrchestratorDefinition>> | undefined {
  const state = readPacksState(projectRoot);
  const out: Record<string, Partial<ExpertDefinition> & Partial<OrchestratorDefinition>> = {};
  for (const [fqid, override] of Object.entries(state.contentOverrides)) {
    if (coreKindOf(projectRoot, fqid) !== kind) continue;
    const parsed = parseFqid(fqid);
    if (!parsed) continue;
    out[parsed.contentId] = { ...override };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function disabledCoreBareOfKind(projectRoot: string, kind: "expert" | "orchestrator"): string[] {
  const state = readPacksState(projectRoot);
  const out: string[] = [];
  for (const fqid of state.disabledContent) {
    if (coreKindOf(projectRoot, fqid) !== kind) continue;
    const parsed = parseFqid(fqid);
    if (parsed) out.push(parsed.contentId);
  }
  return out;
}

/** legacy `ExpertsManifest` 视图（适配 packs.json；写操作见下方各 setter）。 */
export function readExpertsManifest(projectRoot: string): ExpertsManifest {
  return {
    disabledBuiltinIds: disabledCoreBareOfKind(projectRoot, "expert"),
    builtinOverrides: bareOverridesOfKind(projectRoot, "expert"),
  };
}

/** legacy `OrchestratorsManifest` 视图（适配 packs.json）。 */
export function readOrchestratorsManifest(projectRoot: string): OrchestratorsManifest {
  const state = readPacksState(projectRoot);
  const parsed = state.defaultOrchestrator ? parseFqid(state.defaultOrchestrator) : null;
  return {
    defaultOrchestratorId: parsed?.contentId ?? DEFAULT_ORCHESTRATOR_ID,
    disabledBuiltinIds: disabledCoreBareOfKind(projectRoot, "orchestrator"),
    builtinOverrides: bareOverridesOfKind(projectRoot, "orchestrator"),
  };
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
  if (/[:#\n"'&*]|^\s/.test(value)) return JSON.stringify(value);
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

export function saveCustomExpert(
  projectRoot: string,
  payload: SaveCustomExpertPayload,
): ExpertInfo {
  const baseId = payload.id?.trim() || slugifyId(payload.name);
  const id = payload.id ? baseId : uniqueLocalExpertId(projectRoot, baseId);
  const dir = join(getLocalPackDir(projectRoot), "experts", id);
  mkdirSync(dir, { recursive: true });

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

  writeFileSync(join(dir, "expert.json"), `${JSON.stringify(def, null, 2)}\n`, "utf-8");
  writeFileSync(join(dir, "instructions.md"), payload.instructions.trim(), "utf-8");
  invalidateLocalViews(projectRoot);

  const saved = getExpert(projectRoot, id);
  if (!saved) throw new Error(`Failed to save custom expert "${id}"`);
  return saved;
}

export function deleteCustomExpert(projectRoot: string, expertId: string): void {
  const expert = getExpert(projectRoot, expertId);
  if (!expert) throw new Error(`Expert not found: ${expertId}`);
  if (expert.builtin || !expert.removable) {
    throw new Error(`Cannot delete built-in expert: ${expertId}`);
  }
  const dir = join(getLocalPackDir(projectRoot), "experts", expert.id);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  invalidateLocalViews(projectRoot);
}

export function saveCustomOrchestrator(
  projectRoot: string,
  payload: SaveCustomOrchestratorPayload,
): OrchestratorInfo {
  const baseId = payload.id?.trim() || slugifyId(payload.name);
  const id = payload.id ? baseId : uniqueLocalOrchestratorId(projectRoot, baseId);
  const dir = join(getLocalPackDir(projectRoot), "orchestrators", id);
  mkdirSync(dir, { recursive: true });

  const enabledExpertIds = listExperts(projectRoot).filter((e) => e.enabled).map((e) => e.id);
  const knownExpertIds = listExperts(projectRoot).map((e) => e.id);
  // 新格式 orchestrator.json：无身份字段；allowedExperts 存裸 id（§4.3.1 可解析）
  const def: OrchestratorDef = {
    id,
    name: payload.name.trim(),
    description: payload.description.trim(),
    allowedExperts:
      payload.allowedExperts !== undefined
        ? pruneAllowedExpertIds(payload.allowedExperts, knownExpertIds) ?? []
        : enabledExpertIds,
    model: payload.model?.trim() || undefined,
    thoughtLevel: payload.thoughtLevel?.trim() || undefined,
    temperature: payload.temperature,
    permission: payload.permission,
  };

  writeFileSync(join(dir, "orchestrator.json"), `${JSON.stringify(def, null, 2)}\n`, "utf-8");
  writeFileSync(join(dir, "instructions.md"), payload.instructions.trim(), "utf-8");
  invalidateLocalViews(projectRoot);

  const saved = getOrchestrator(projectRoot, id);
  if (!saved) throw new Error(`Failed to save custom orchestrator "${id}"`);
  return saved;
}

export function deleteCustomOrchestrator(projectRoot: string, orchestratorId: string): void {
  const orchestrator = getOrchestrator(projectRoot, orchestratorId);
  if (!orchestrator) throw new Error(`Orchestrator not found: ${orchestratorId}`);
  if (orchestrator.builtin || !orchestrator.removable) {
    throw new Error(`Cannot delete built-in orchestrator: ${orchestratorId}`);
  }
  const dir = join(getLocalPackDir(projectRoot), "orchestrators", orchestrator.id);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  invalidateLocalViews(projectRoot);
  const state = readPacksState(projectRoot);
  if (state.defaultOrchestrator === toFqid(LOCAL_PACK_ID, orchestrator.id)) {
    setDefaultOrchestratorFqid(projectRoot, DEFAULT_ORCHESTRATOR_FQID);
  }
}

// ── core 内容的状态操作（旧 builtin 契约 → packs.json）────────

function requireCoreContent(
  projectRoot: string,
  kind: "expert" | "orchestrator",
  bareId: string,
  label: string,
): ResolvedContent {
  const content = getContent(projectRoot, toFqid(CORE_PACK_ID, bareId));
  if (!content || content.kind !== kind) {
    throw new Error(`Built-in ${label} not found: ${bareId}`);
  }
  return content;
}

export function setBuiltinExpertEnabled(
  projectRoot: string,
  expertId: string,
  enabled: boolean,
): void {
  const content = requireCoreContent(projectRoot, "expert", expertId, "expert");
  setContentDisabled(projectRoot, content.fqid, !enabled);
}

export function saveBuiltinExpertOverride(
  projectRoot: string,
  payload: SaveBuiltinExpertOverridePayload,
): ExpertInfo {
  const content = requireCoreContent(projectRoot, "expert", payload.expertId, "expert");
  const patch: Record<string, unknown> = {};
  if (payload.model !== undefined) patch.model = payload.model;
  if (payload.thoughtLevel !== undefined) patch.thoughtLevel = payload.thoughtLevel;
  if (payload.temperature !== undefined) patch.temperature = payload.temperature;
  if (payload.permission !== undefined) patch.permission = payload.permission;
  saveContentOverride(projectRoot, content.fqid, patch);

  const saved = getExpert(projectRoot, payload.expertId);
  if (!saved) throw new Error(`Failed to save built-in expert override "${payload.expertId}"`);
  return saved;
}

export function resetBuiltinExpertOverride(
  projectRoot: string,
  expertId: string,
): ExpertInfo {
  const content = requireCoreContent(projectRoot, "expert", expertId, "expert");
  saveContentOverride(projectRoot, content.fqid, {
    model: undefined,
    thoughtLevel: undefined,
    temperature: undefined,
    modules: undefined,
    allowedExperts: undefined,
    permission: undefined,
  });

  const saved = getExpert(projectRoot, expertId);
  if (!saved) throw new Error(`Built-in expert not found: ${expertId}`);
  return saved;
}

export function resetAllBuiltinExpertsToDefaults(projectRoot: string): ExpertsManifest {
  const state = readPacksState(projectRoot);
  const isCoreExpert = (fqid: string) => coreKindOf(projectRoot, fqid) === "expert";
  const next = {
    ...state,
    disabledContent: state.disabledContent.filter((fqid) => !isCoreExpert(fqid)),
    contentOverrides: Object.fromEntries(
      Object.entries(state.contentOverrides).filter(([fqid]) => !isCoreExpert(fqid)),
    ),
  };
  writePacksState(projectRoot, next);
  return { disabledBuiltinIds: [], builtinOverrides: undefined };
}

export function setDefaultOrchestrator(projectRoot: string, orchestratorId: string): void {
  const found = getOrchestrator(projectRoot, orchestratorId);
  if (!found?.enabled) throw new Error(`Orchestrator not found or disabled: ${orchestratorId}`);
  setDefaultOrchestratorFqid(projectRoot, found.fqid!);
}

export function saveBuiltinOrchestratorOverride(
  projectRoot: string,
  payload: SaveBuiltinOrchestratorOverridePayload,
): OrchestratorInfo {
  const content = requireCoreContent(projectRoot, "orchestrator", payload.orchestratorId, "orchestrator");
  const knownExpertIds = listExperts(projectRoot).map((e) => e.id);
  const patch: Record<string, unknown> = {};
  if (payload.allowedExperts !== undefined) {
    patch.allowedExperts = pruneAllowedExpertIds(payload.allowedExperts, knownExpertIds) ?? [];
  }
  if (payload.model !== undefined) patch.model = payload.model;
  if (payload.thoughtLevel !== undefined) patch.thoughtLevel = payload.thoughtLevel;
  if (payload.temperature !== undefined) patch.temperature = payload.temperature;
  if (payload.permission !== undefined) patch.permission = payload.permission;
  saveContentOverride(projectRoot, content.fqid, patch);

  const saved = getOrchestrator(projectRoot, payload.orchestratorId);
  if (!saved) {
    throw new Error(`Failed to save built-in orchestrator override "${payload.orchestratorId}"`);
  }
  return saved;
}

export function resetBuiltinOrchestratorOverride(
  projectRoot: string,
  orchestratorId: string,
): OrchestratorInfo {
  const content = requireCoreContent(projectRoot, "orchestrator", orchestratorId, "orchestrator");
  saveContentOverride(projectRoot, content.fqid, {
    model: undefined,
    thoughtLevel: undefined,
    temperature: undefined,
    modules: undefined,
    allowedExperts: undefined,
    permission: undefined,
  });

  const saved = getOrchestrator(projectRoot, orchestratorId);
  if (!saved) throw new Error(`Built-in orchestrator not found: ${orchestratorId}`);
  return saved;
}

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
