/**
 * subagents-sync —— orchestrators / experts 的 legacy facade（IPC / 渲染契约）。
 *
 * 判定与内容列表一律走 Teams v2：`teams/resolver`（teams.json / teams-state.json）。
 * 本文件不再导入旧 `team-resolver`；聊天默认 lead 经 `resolveChatOrchestrator`。
 *
 * 对外契约保持：
 *   - SubagentInfo / OrchestratorInfo（id = runtimeName；含 fqid）
 *   - agent.md 渲染（golden：tests/main/agent-plan-golden）
 *   - CRUD 写 project.local / user teams 目录（M8 后 teams/project.local/）
 */

import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { PromptContext } from "../prompts/types";
import {
  type SubagentDefinition,
  type SubagentInfo,
  type OrchestratorDefinition,
  type OrchestratorInfo,
  type SaveCustomSubagentPayload,
  type SaveCustomOrchestratorPayload,
  DEFAULT_ORCHESTRATOR_ID,
} from "./agent-subagents";
import {
  resolveOrchestratorActiveModuleKeys,
  resolveActiveModuleKeys,
  resolveSubagentProfileModuleKeysFor,
  composeOrchestratorProfileModulePrompts,
  composeProfileModulePrompts,
} from "../prompts/resolve-active-modules";
import { buildSubagentRosterMarkdown } from "../../shared/subagent-roster";
import { buildTaskPermissionBlock } from "./task-orchestrator-gate";
import {
  CORE_TEAM_ID,
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
  isProjectLocalLeadFqid,
  type SubagentDef,
  type Fqid,
  type AssetKind,
} from "../../shared/teams/types";
import { ensureMyContentTeam, isMyContentLeadFqid, isMyContentTeamId } from "../teams/my-content";
import { parseFqid, toFqid } from "../../shared/teams/state";
import {
  getAsset,
  listAssets,
  readInstructions,
  resolveChatOrchestrator,
  resolveRef,
  resolveInvocation,
  resolveRoster,
  invalidateResolver,
} from "../teams/resolver";
import type { AssetViewV2, OrchestratorDefV2 } from "../../shared/teams/view";
import { getTeamRecord, invalidateCatalog as invalidateCatalogV2 } from "../teams/catalog";
import {
  ensureProjectContentMigrated,
  ensureProjectDefaultTeamDir,
} from "../teams/migrate-project-content";
import { purgeSubagentFromForeignRosters } from "../teams/lifecycle";
import { createLogger } from "./logger";

const log = createLogger("subagents-sync", "agent");

export { buildTaskPermissionBlock } from "./task-orchestrator-gate";

// ── 裸 id / 文件名命名空间 ─────────────────────────────────

/** OpenCode agent 文件名基 = v2 runtimeName。 */
function agentFileBase(content: AssetViewV2): string {
  return content.runtimeName;
}

// ── AssetViewV2 → legacy Info 视图 ─────────────────────

function instructionsPreview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

function toExpertInfo(projectRoot: string, content: AssetViewV2): SubagentInfo {
  const def = content.definition as SubagentDef;
  const instructions = readInstructions(projectRoot, content.fqid);
  const effectiveModules = resolveActiveModuleKeys({
    role: "subagent",
    profileModules: resolveSubagentProfileModuleKeysFor(def as SubagentDefinition),
  });
  return {
    id: agentFileBase(content),
    fqid: content.fqid,
    name: def.name ?? content.name,
    description: def.description ?? content.description,
    builtin: content.teamId === CORE_TEAM_ID,
    removable: content.editable,
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
 * OrchestratorInfo.roster / rosterMode:
 * - mode "all" (or missing) → rosterMode "all", roster undefined — do NOT expand
 *   into every enabled expert id (that made the editor look like "select all Core")
 * - mode "list" → rosterMode "list", roster = enabled runtime ids (may be [])
 */
function toOrchestratorInfo(projectRoot: string, content: AssetViewV2): OrchestratorInfo {
  const def = content.definition as OrchestratorDefV2;
  const instructions = readInstructions(projectRoot, content.fqid);
  const effectiveModules = resolveOrchestratorActiveModuleKeys();
  const spec = def.roster ?? { mode: "all" as const };
  const rosterMode: "all" | "list" = spec.mode === "list" ? "list" : "all";
  const allowed =
    rosterMode === "list"
      ? resolveAllowedRefs(projectRoot, content.fqid).map((ref) => ref.id)
      : undefined;
  return {
    id: agentFileBase(content),
    fqid: content.fqid,
    name: def.name ?? content.name,
    description: def.description ?? content.description,
    builtin: content.teamId === CORE_TEAM_ID,
    // Leads are never deletable — remove the team (or edit the lead) instead.
    // Otherwise a custom team can lose its only lead and break chat routing.
    removable: false,
    model: def.model,
    thoughtLevel: def.thoughtLevel,
    temperature: def.temperature,
    roster: allowed,
    rosterMode,
    permission: def.permission,
    enabled: content.enabled,
    instructionsPreview: instructionsPreview(instructions),
    effectiveModules,
  };
}

export function listSubagents(projectRoot: string): SubagentInfo[] {
  return listAssets(projectRoot, "subagent").map((c) => toExpertInfo(projectRoot, c));
}

export function listOrchestrators(projectRoot: string): OrchestratorInfo[] {
  return listAssets(projectRoot, "orchestrator").map((c) => toOrchestratorInfo(projectRoot, c));
}

/** Match legacy Info.id (runtimeName), fqid, bare content id. */
function matchAgentInfoId(
  id: string,
  info: { id: string; fqid?: string },
): boolean {
  if (info.id === id || info.fqid === id) return true;
  const parsed = info.fqid ? parseFqid(info.fqid) : null;
  if (parsed?.contentId === id) return true;
  if (info.id.endsWith(`--${id}`)) return true;
  return false;
}

function findAsset(
  projectRoot: string,
  kind: "orchestrator" | "subagent",
  ref: string,
): AssetViewV2 | null {
  const direct = getAsset(projectRoot, ref);
  if (direct?.kind === kind) return direct;
  const byRef = resolveRef(projectRoot, ref, undefined, kind);
  if (byRef) {
    const asset = getAsset(projectRoot, byRef);
    if (asset?.kind === kind) return asset;
  }
  const byInvocation = resolveInvocation(projectRoot, kind, ref);
  if (byInvocation) return byInvocation;
  return (
    listAssets(projectRoot, kind).find(
      (a) =>
        a.fqid === ref
        || a.id === ref
        || a.runtimeName === ref
        || `${a.teamId}--${a.id}` === ref,
    ) ?? null
  );
}

function resolveBareToFqid(
  projectRoot: string,
  kind: AssetKind,
  bareOrRuntime: string,
): Fqid | null {
  return (
    resolveRef(projectRoot, bareOrRuntime, undefined, kind)
    ?? resolveInvocation(projectRoot, kind, bareOrRuntime)?.fqid
    ?? null
  );
}

/** 裸 id / FQID / runtimeName → expert（v2 TeamResolver）。 */
export function getSubagent(projectRoot: string, expertId: string): SubagentInfo | null {
  const id = expertId.trim();
  if (!id) return null;
  const asset = findAsset(projectRoot, "subagent", id);
  if (asset) return toExpertInfo(projectRoot, asset);
  return listSubagents(projectRoot).find((e) => matchAgentInfoId(id, e)) ?? null;
}

/** 裸 id / FQID / runtimeName → orchestrator（v2 TeamResolver）。 */
export function getOrchestrator(
  projectRoot: string,
  orchestratorId: string,
): OrchestratorInfo | null {
  const id = orchestratorId.trim();
  if (!id) return null;
  const asset = findAsset(projectRoot, "orchestrator", id);
  if (asset) return toOrchestratorInfo(projectRoot, asset);
  return listOrchestrators(projectRoot).find((o) => matchAgentInfoId(id, o)) ?? null;
}

/**
 * 解析当前应使用的 orchestrator，返回【文件名基】（runtimeName）。
 * 真相：resolveChatOrchestrator（session/tab → project/app defaultTeam → core）。
 */
export function resolveOrchestratorId(
  projectRoot: string,
  tabOrchestratorId?: string | null,
): string {
  try {
    return resolveChatOrchestrator(projectRoot, {
      orchestratorId: tabOrchestratorId,
    }).runtimeName;
  } catch {
    return DEFAULT_ORCHESTRATOR_ID;
  }
}

// ── roster 解析（渲染 / UI 共用）────────────────────

/**
 * orchestrator 实际可用的 expert 引用（runtimeName + 名称 + 描述）。
 * 经 v2 resolveRoster；不可用条目跳过。
 */
function resolveAllowedRefs(
  projectRoot: string,
  orchestratorFqid: Fqid,
): Array<{ id: string; name: string; description: string }> {
  const orch = getAsset(projectRoot, orchestratorFqid);
  if (!orch) return [];
  const roster = resolveRoster(projectRoot, orch.teamId);
  if (!roster) return [];
  const refs: Array<{ id: string; name: string; description: string }> = [];
  const seen = new Set<string>();
  for (const entry of roster.entries) {
    if (entry.unavailable !== undefined) continue;
    const asset = getAsset(projectRoot, entry.fqid);
    if (!asset?.enabled) continue;
    const base = asset.runtimeName;
    if (seen.has(base)) continue;
    seen.add(base);
    refs.push({ id: base, name: asset.name, description: asset.description });
  }
  return refs;
}

// ── instructions 读取 ───────────────────────────────────────

export function readSubagentInstructions(
  projectRoot: string,
  expert: SubagentDefinition,
): string {
  const fqid =
    (expert as SubagentInfo).fqid ?? resolveBareToFqid(projectRoot, "subagent", expert.id);
  if (!fqid) return "";
  return readInstructions(projectRoot, fqid);
}

export function readOrchestratorInstructions(
  projectRoot: string,
  orchestrator: OrchestratorDefinition,
): string {
  const fqid =
    (orchestrator as OrchestratorInfo).fqid
    ?? resolveBareToFqid(projectRoot, "orchestrator", orchestrator.id);
  if (!fqid) return "";
  return readInstructions(projectRoot, fqid);
}

// ── 渲染引擎（与重构前逐字节一致；勿动逻辑）──────────────────

function appendCapabilityRefs(
  def: SubagentDefinition | OrchestratorDefinition,
  body: string,
  promptCtx: PromptContext = {},
  role: "orchestrator" | "subagent",
): string {
  // Experts compose from their manifest `modules` subset — an expert Task
  // call pays the full system-side cost of every module we attach.
  const modulePrompts =
    role === "orchestrator"
      ? composeOrchestratorProfileModulePrompts(promptCtx)
      : composeProfileModulePrompts(
          // role === "subagent" 时 def 必为 SubagentDefinition（调用方保证）
          resolveSubagentProfileModuleKeysFor(def as SubagentDefinition),
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
  subagents: AllowedExpertRef[],
): string {
  const trimmed = body.trim();
  const roster = buildSubagentRosterMarkdown(subagents);
  return [trimmed, "", "---", roster].join("\n");
}

/** Drop stale / disabled expert ids from a stored allowlist for UI + persistence. */
export function pruneRosterRefIds(
  roster: string[] | undefined,
  knownExpertIds: string[],
): string[] | undefined {
  if (roster === undefined) return undefined;
  const known = new Set(knownExpertIds);
  return roster.filter((id) => known.has(id));
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
export function buildProjectSubagentsAgentPlan(
  projectRoot: string,
  options?: { promptCtx?: PromptContext; defaultSubagentModel?: string | null },
): ProjectExpertsAgentPlan {
  // Leftover local/ or agent/mcp.json may still need M8/M11. This does not
  // mkdir an empty project.local hangar.
  if (ensureProjectContentMigrated(projectRoot)) {
    invalidateResolver(projectRoot);
  }
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

  const enabledExperts = listSubagents(projectRoot).filter((e) => e.enabled);
  const enabledRefs: AllowedExpertRef[] = enabledExperts.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
  }));
  const allowedRefsFor = (info: OrchestratorInfo): AllowedExpertRef[] =>
    // spec 未定义 = 全部启用 experts（旧语义）；定义了 → resolver 解析后过滤
    info.roster === undefined
      ? enabledRefs
      : resolveAllowedRefs(projectRoot, info.fqid!);

  const agentEntries: ProjectExpertsAgentEntry[] = [];

  for (const expert of enabledExperts) {
    const instructions = readSubagentInstructions(projectRoot, expert);
    agentEntries.push({
      filename: `${expert.id}.md`,
      content: renderSubagentAgentMarkdown(expert, instructions, promptCtx, {
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

export function renderSubagentAgentMarkdown(
  def: SubagentDefinition,
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
  const body = appendCapabilityRefs(def, instructionsBody, promptCtx, "subagent");
  return `${serializeFrontmatter(frontmatter)}\n\n${body}\n`;
}

export function renderOrchestratorAgentMarkdown(
  def: OrchestratorDefinition,
  instructionsBody: string,
  roster: AllowedExpertRef[],
  promptCtx: PromptContext = {},
): string {
  const taskRules = buildTaskPermissionBlock(roster.map((e) => e.id));
  const permission = mergePermissions(def.permission, { task: taskRules });
  const frontmatter: Record<string, unknown> = {
    description: def.description,
    mode: "primary",
    permission,
  };
  if (def.model) frontmatter.model = def.model;
  if (def.temperature !== undefined) frontmatter.temperature = def.temperature;
  const bodyWithExperts = appendSubagentRosterSection(instructionsBody, roster);
  const body = appendCapabilityRefs(def, bodyWithExperts, promptCtx, "orchestrator");
  return `${serializeFrontmatter(frontmatter)}\n\n${body}\n`;
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
  const existing = new Set(listSubagents(projectRoot).map((e) => e.id));
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
  // Catalog must drop too — getTeamContents / scan read TeamRecord.assets from it.
  invalidateCatalogV2();
  invalidateResolver(projectRoot);
}

// ── 可写目标（Local Pack 或用户团队）───────────────────────

/** Derive a content item's owning pack id from its fqid (`teamId:contentId`). */
function packIdOf(item: { fqid?: string }): string {
  const pid = item.fqid?.split(":")[0];
  return pid && pid.length > 0 ? pid : MY_CONTENT_TEAM_ID;
}

/**
 * Resolve the directory a custom agent should be written into.
 * - no target / My Content → app-level My Content hangar;
 * - project.local → this project's hangar (explicit only);
 * - any other writable v2 Team → that Team's directory.
 */
function resolveWritableTarget(
  projectRoot: string,
  targetTeamId?: string,
): { dir: string; teamId: string } {
  const tid = targetTeamId?.trim();
  if (!tid || tid === MY_CONTENT_TEAM_ID) {
    const { dir } = ensureMyContentTeam();
    return { dir, teamId: MY_CONTENT_TEAM_ID };
  }
  if (tid === PROJECT_DEFAULT_TEAM_ID) {
    return { dir: ensureProjectDefaultTeamDir(projectRoot), teamId: PROJECT_DEFAULT_TEAM_ID };
  }
  const team = getTeamRecord(tid, [projectRoot]);
  if (team) {
    if (!team.writable) throw new Error(`Target team is read-only: ${tid}`);
    return { dir: team.dir, teamId: team.manifest.id };
  }
  throw new Error(`Target team not found: ${tid}`);
}

/** Invalidate views after a write: project.local → this project; user team → catalog. */
function invalidateWritableTarget(projectRoot: string, teamId: string): void {
  if (teamId === PROJECT_DEFAULT_TEAM_ID) {
    invalidateLocalViews(projectRoot);
  } else {
    invalidateCatalogV2();
  }
}

export function saveCustomSubagent(
  projectRoot: string,
  payload: SaveCustomSubagentPayload,
  targetTeamId?: string,
): SubagentInfo {
  const { dir, teamId } = resolveWritableTarget(projectRoot, targetTeamId);
  const rawId = payload.id?.trim() || slugifyId(payload.name);
  // Editing passes an agentFileBase id (`<teamId>--<id>` for non-local packs);
  // strip the pack prefix to get the bare id used as the directory name.
  const bareId = rawId.includes("--") ? rawId.slice(rawId.lastIndexOf("--") + 2) : rawId;
  const id = payload.id ? bareId : uniqueLocalExpertId(projectRoot, bareId);
  // Prefer subagents/ (M8); if the team still only has experts/ (user-packs),
  // write there so dual-layout scanners that prefer an existing experts/ root
  // keep seeing new files.
  const subagentsRoot = join(dir, "subagents");
  const expertsRoot = join(dir, "experts");
  const kindRoot =
    existsSync(subagentsRoot) || !existsSync(expertsRoot) ? subagentsRoot : expertsRoot;
  const agentDir = join(kindRoot, id);
  mkdirSync(agentDir, { recursive: true });

  // New v2 directories use subagent.json; legacy experts/ keeps expert.json
  // only while M2 compatibility remains active.
  const def: SubagentDef = {
    id,
    name: payload.name.trim(),
    description: payload.description.trim(),
    model: payload.model?.trim() || undefined,
    thoughtLevel: payload.thoughtLevel?.trim() || undefined,
    temperature: payload.temperature,
    modules: payload.modules?.length ? payload.modules : undefined,
    permission: payload.permission,
  };

  const definitionFile = kindRoot === subagentsRoot ? "subagent.json" : "expert.json";
  writeFileSync(join(agentDir, definitionFile), `${JSON.stringify(def, null, 2)}\n`, "utf-8");
  writeFileSync(join(agentDir, "instructions.md"), payload.instructions.trim(), "utf-8");
  invalidateWritableTarget(projectRoot, teamId);

  const saved = getSubagent(projectRoot, toFqid(teamId, id));
  if (!saved) throw new Error(`Failed to save custom expert "${id}"`);
  return saved;
}

export function deleteCustomSubagent(projectRoot: string, expertId: string): void {
  const expert = getSubagent(projectRoot, expertId);
  if (!expert) throw new Error(`Expert not found: ${expertId}`);
  if (!expert.removable) {
    // Pack-provided experts (incl. first-party packs) are read-only —
    // disable the pack instead of deleting its content.
    throw new Error(
      `Cannot delete a team-provided expert (disable the team or its expert instead): ${expertId}`,
    );
  }
  // Drop explicit cross-team roster refs before removing the asset (UI confirms first).
  purgeSubagentFromForeignRosters(projectRoot, expert.fqid ?? expertId);

  const teamId = packIdOf(expert);
  const { dir } = resolveWritableTarget(projectRoot, teamId);
  const bareId = expert.id.includes("--") ? expert.id.slice(expert.id.lastIndexOf("--") + 2) : expert.id;
  for (const sub of ["subagents", "experts"] as const) {
    const agentDir = join(dir, sub, bareId);
    if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true });
  }
  invalidateWritableTarget(projectRoot, teamId);
}

export function saveCustomOrchestrator(
  projectRoot: string,
  payload: SaveCustomOrchestratorPayload,
  targetTeamId?: string,
): OrchestratorInfo {
  const { dir, teamId } = resolveWritableTarget(projectRoot, targetTeamId);
  if (isMyContentTeamId(teamId)) {
    throw new Error(
      "Cannot create or edit lead agents in Common Team. Create a custom team (one lead per team) instead.",
    );
  }
  const rawId = payload.id?.trim() || slugifyId(payload.name);
  // Editing passes an agentFileBase id (`<teamId>--<id>` for non-local packs);
  // strip the pack prefix to get the bare id used as the directory name.
  const bareId = rawId.includes("--") ? rawId.slice(rawId.lastIndexOf("--") + 2) : rawId;
  const id = payload.id ? bareId : uniqueLocalOrchestratorId(projectRoot, bareId);
  const agentDir = join(dir, "orchestrators", id);
  mkdirSync(agentDir, { recursive: true });

  const knownExpertIds = listSubagents(projectRoot).map((e) => e.id);
  // 磁盘 key 仍是 allowedExperts。语义：
  // - undefined / omitted = mode "all"（不限制，含将来新增）
  // - [] = mode "list" 空名册（明确不允许任何子 Agent）
  // - [...] = mode "list" 显式勾选
  const mode = payload.rosterMode ?? (payload.roster !== undefined ? "list" : "all");
  const roster =
    mode === "all"
      ? undefined
      : pruneRosterRefIds(payload.roster ?? [], knownExpertIds);
  const diskDef: Record<string, unknown> = {
    id,
    name: payload.name.trim(),
    description: payload.description.trim(),
    allowedExperts: roster,
    model: payload.model?.trim() || undefined,
    thoughtLevel: payload.thoughtLevel?.trim() || undefined,
    temperature: payload.temperature,
    permission: payload.permission,
  };

  writeFileSync(join(agentDir, "orchestrator.json"), `${JSON.stringify(diskDef, null, 2)}\n`, "utf-8");
  writeFileSync(join(agentDir, "instructions.md"), payload.instructions.trim(), "utf-8");
  invalidateWritableTarget(projectRoot, teamId);

  const saved = getOrchestrator(projectRoot, toFqid(teamId, id));
  if (!saved) throw new Error(`Failed to save custom orchestrator "${id}"`);
  return saved;
}

export function deleteCustomOrchestrator(projectRoot: string, orchestratorId: string): void {
  const orchestrator = getOrchestrator(projectRoot, orchestratorId);
  if (!orchestrator) throw new Error(`Orchestrator not found: ${orchestratorId}`);
  if (orchestrator.fqid && isMyContentLeadFqid(orchestrator.fqid)) {
    throw new Error("Common Team's chat lead cannot be deleted.");
  }
  if (orchestrator.fqid && isProjectLocalLeadFqid(orchestrator.fqid)) {
    throw new Error("This project's hangar lead cannot be deleted.");
  }
  // Custom / hangar / pack leads: never delete the lead alone (≤1 lead per team).
  throw new Error(
    `Lead agents cannot be deleted (delete the team or edit this lead instead): ${orchestratorId}`,
  );
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
  if (!orchestrator) {
    log.warn("orchestrators:getDetail miss", { projectRoot, orchestratorId });
    return null;
  }
  log.info("orchestrators:getDetail hit", {
    projectRoot,
    requested: orchestratorId,
    fqid: orchestrator.fqid,
    runtimeName: orchestrator.id,
    name: orchestrator.name,
  });
  return {
    ...orchestrator,
    instructions: readOrchestratorInstructions(projectRoot, orchestrator),
  };
}

export function getSubagentDetail(
  projectRoot: string,
  expertId: string,
): (SubagentInfo & { instructions: string }) | null {
  const expert = getSubagent(projectRoot, expertId);
  if (!expert) {
    log.warn("subagents:getDetail miss", { projectRoot, expertId });
    return null;
  }
  return {
    ...expert,
    instructions: readSubagentInstructions(projectRoot, expert),
  };
}
