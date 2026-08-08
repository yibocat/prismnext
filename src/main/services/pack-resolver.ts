/**
 * pack-resolver.ts —— Agent Pack 体系的唯一解析层（设计文档 §5）。
 *
 * 「有什么内容、内容是否可用、内容长什么样」——全 app 只在这里回答：
 *
 *   enumerate → gate(tier/license) → overrides → active
 *
 * 启停/可见性的唯一判定 = isContentActive()（原则 D3）。
 * 旧的三套分散机制（disabledBuiltinIds / skills.disabled / .md.disabled）
 * 在 Phase 2-4 被本层取代后删除。
 *
 * Phase 1 纯读：不接任何现有消费路径（experts-sync / skills-sync /
 * commandRegistry 的接管分别发生在 Phase 2 / 3）。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BadgeInfo,
  ContentKind,
  ContentOverride,
  ExpertDef,
  Fqid,
  McpDef,
  OrchestratorDef,
  PackView,
  ProjectPackView,
  ResolvedCommand,
  ResolvedContent,
} from "../../shared/packs/types";
import {
  CORE_PACK_ID,
  DEFAULT_ORCHESTRATOR_FQID,
  LOCAL_PACK_ID,
} from "../../shared/packs/types";
import { fqidBelongsToPack, parseFqid, toFqid } from "../../shared/packs/state";
import {
  contentDirFingerprint,
  currentCatalogFingerprint,
  getLocalPackDir,
  getLocalPackView,
  getPack,
  getPackContents,
  getPackMcpDefs,
  listPacks,
  readPackMcpDefs,
  scanLocalPackContents,
  type ScannedContentItem,
} from "./pack-catalog";
import { licenseGrants, licenseStateVersion } from "./packs-license";
import {
  onPacksStateWritten,
  packsStateMtime,
  packsStateWriteCounter,
  readPacksState,
} from "./packs-state";
import { createLogger } from "./logger";

const log = createLogger("pack-resolver");

// packs.json 写入 → resolver 视图失效（§5.5；viewKey 的 mtime/计数器兜底，
// 订阅保证进程内立即失效并广播 onDidChange 监听者）。
onPacksStateWritten((root) => {
  invalidateResolver(root);
});

// ── 项目视图缓存 ──────────────────────────────────────────

interface ProjectView {
  key: string;
  packs: ProjectPackView[];
  contents: ResolvedContent[];
  commands: ResolvedCommand[];
  mcps: McpDef[];
  byFqid: Map<Fqid, ResolvedContent>;
}

const projectViews = new Map<string, ProjectView>();

function viewKey(projectRoot: string): string {
  return [
    currentCatalogFingerprint(),
    String(packsStateMtime(projectRoot)),
    String(packsStateWriteCounter()),
    String(licenseStateVersion()),
    contentDirFingerprint(getLocalPackDir(projectRoot)),
  ].join("#");
}

// ── overrides 应用（语义对齐旧 applyExpertOverride / applyOrchestratorOverride）──

function applyOverrideToDef(
  kind: "orchestrator" | "expert",
  def: OrchestratorDef | ExpertDef,
  override: ContentOverride | undefined,
): OrchestratorDef | ExpertDef {
  if (!override) return def;
  const next: Record<string, unknown> = { ...def };
  if (kind === "expert" && override.modules !== undefined) {
    next.modules = override.modules.length ? override.modules : undefined;
  }
  if (kind === "orchestrator" && override.allowedExperts !== undefined) {
    next.allowedExperts = override.allowedExperts;
  }
  if (override.model !== undefined) next.model = override.model || undefined;
  if (override.thoughtLevel !== undefined) next.thoughtLevel = override.thoughtLevel || undefined;
  if (override.temperature !== undefined) next.temperature = override.temperature;
  if (override.permission !== undefined) next.permission = override.permission;
  return next as unknown as OrchestratorDef | ExpertDef;
}

// ── 视图构建 ──────────────────────────────────────────────

function buildProjectView(projectRoot: string): ProjectView {
  const state = readPacksState(projectRoot);
  const disabled = new Set(state.disabledContent);

  const appPacks = listPacks();
  const localView = getLocalPackView(projectRoot);
  const allPackViews: PackView[] = [...appPacks, localView];

  const packs: ProjectPackView[] = allPackViews.map((view) => {
    const record = state.packs.find((p) => p.packId === view.manifest.id);
    const installed = view.installedByDefault || Boolean(record);
    const enabled =
      view.kind === "local" ? true : (record?.enabled ?? view.installedByDefault);
    return { ...view, installed, enabled, record };
  });

  const contents: ResolvedContent[] = [];
  const commands: ResolvedCommand[] = [];
  const mcps: McpDef[] = [];
  const byFqid = new Map<Fqid, ResolvedContent>();

  for (const pack of packs) {
    if (!pack.installed) continue;
    const packId = pack.manifest.id;
    const origin = {
      packId,
      packName: pack.manifest.name,
      packTier: pack.manifest.tier,
      publisher: pack.manifest.publisher,
    };
    // §5.3 判定链：license 门 → pack 启停 → 逐项禁用
    const licenseOk = pack.manifest.tier === "pro" ? licenseGrants(pack.manifest.feature) : true;
    const packActive = licenseOk && pack.enabled;

    const items: ScannedContentItem[] =
      packId === LOCAL_PACK_ID ? scanLocalPackContents(projectRoot) : getPackContents(packId);

    for (const item of items) {
      const fqid = toFqid(packId, item.id);
      const enabled = packActive && !disabled.has(fqid);
      const removable = packId === LOCAL_PACK_ID;
      // overrides 只应用于非 local 内容（local 内容用户直接改文件）
      const override = removable ? undefined : state.contentOverrides[fqid];

      // command 同时进入两种视图：ResolvedContent（isContentActive/badge 用）
      // 与 ResolvedCommand（CommandRegistry 用），共享同一份 enabled 判定。
      if (item.kind === "command" && item.command) {
        commands.push({
          fqid,
          name: item.id,
          description: item.description,
          template: item.command.template,
          action: item.command.action,
          agent: item.command.agent,
          model: item.command.model,
          order: item.command.order,
          enabled,
          origin,
        });
      }

      const definition =
        item.kind === "orchestrator" || item.kind === "expert"
          ? applyOverrideToDef(item.kind, item.definition!, override)
          : item.kind === "command"
            ? item.command
            : item.definition;

      const resolved: ResolvedContent = {
        fqid,
        kind: item.kind,
        packId,
        id: item.id,
        name: item.name,
        description: item.description,
        definition,
        enabled,
        removable,
        origin,
        dir: item.path,
      };
      contents.push(resolved);
      byFqid.set(fqid, resolved);
    }

    const packMcps =
      packId === LOCAL_PACK_ID ? readPackMcpDefs(getLocalPackDir(projectRoot)) : getPackMcpDefs(packId);
    mcps.push(...packMcps);
  }

  return {
    key: viewKey(projectRoot),
    packs,
    contents,
    commands: commands.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    mcps,
    byFqid,
  };
}

function getProjectView(projectRoot: string): ProjectView {
  const key = viewKey(projectRoot);
  const cached = projectViews.get(projectRoot);
  if (cached && cached.key === key) return cached;
  const view = buildProjectView(projectRoot);
  projectViews.set(projectRoot, view);
  return view;
}

// ── 失效与变更汇聚（§5.5）─────────────────────────────────

type PacksChangeListener = (projectRoot?: string) => void;
const listeners = new Set<PacksChangeListener>();

export function onDidChange(listener: PacksChangeListener): { dispose: () => void } {
  listeners.add(listener);
  return { dispose: () => listeners.delete(listener) };
}

export function invalidateResolver(projectRoot?: string): void {
  if (projectRoot) projectViews.delete(projectRoot);
  else projectViews.clear();
  for (const listener of listeners) listener(projectRoot);
}

/**
 * 变更汇聚点（§5.5）：packs 状态/pack 根/license 变化后统一由此通知。
 * 除 resolver 自身失效外，串联 experts / skills 的 OpenCode 再同步
 * （debounced，动态导入避免循环依赖）；CommandRegistry 无自有缓存
 * （直接读 resolver 视图），无需单独失效。
 */
export function notifyPacksChanged(projectRoot?: string): void {
  invalidateResolver(projectRoot);
  if (projectRoot) {
    // 动态导入避免循环依赖：project-*-refresh → *-sync → pack-resolver
    void import("./project-experts-refresh")
      .then((m) => m.scheduleExpertsRefresh(projectRoot))
      .catch(() => {
        // 刷新失败不阻断状态操作；下一次变更会重试
      });
    void import("./project-skills-refresh")
      .then((m) => m.scheduleSkillsRefresh(projectRoot))
      .catch(() => {
        // 同上
      });
  }
}

// ── Catalog 层（不依赖项目）───────────────────────────────

export { listPacks, getPack };

// ── 项目视图层 ────────────────────────────────────────────

export function listProjectPacks(projectRoot: string): ProjectPackView[] {
  return getProjectView(projectRoot).packs;
}

export function listContent(projectRoot: string, kind: ContentKind): ResolvedContent[] {
  return getProjectView(projectRoot).contents.filter((c) => c.kind === kind);
}

export function getContent(projectRoot: string, fqid: Fqid): ResolvedContent | null {
  return getProjectView(projectRoot).byFqid.get(fqid) ?? null;
}

/** 全 app 唯一启停答案（原则 D3 / §5.3）。 */
export function isContentActive(projectRoot: string, fqid: Fqid): boolean {
  return getProjectView(projectRoot).byFqid.get(fqid)?.enabled ?? false;
}

// ── 内容读取（facade 专用）────────────────────────────────

export function readInstructions(projectRoot: string, fqid: Fqid): string {
  const item = getContent(projectRoot, fqid);
  if (!item || (item.kind !== "orchestrator" && item.kind !== "expert")) return "";
  const path = join(item.dir, "instructions.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8").trim();
}

export function getSkillDir(projectRoot: string, fqid: Fqid): string | null {
  const item = getContent(projectRoot, fqid);
  return item?.kind === "skill" ? item.dir : null;
}

export function listCommands(projectRoot: string): ResolvedCommand[] {
  return getProjectView(projectRoot).commands;
}

export function listPackMcpDefs(projectRoot: string): McpDef[] {
  return getProjectView(projectRoot).mcps;
}

// ── 引用解析 ──────────────────────────────────────────────

/**
 * 裸 id → FQID（§4.5.2 / §4.3.1）：
 * 同 pack → core pack → 全部已装 pack 中唯一匹配；多义返回 null。
 */
export function resolveBareContentId(
  projectRoot: string,
  kind: ContentKind,
  bareId: string,
  contextPackId?: string,
): Fqid | null {
  const view = getProjectView(projectRoot);
  if (contextPackId) {
    const same = toFqid(contextPackId, bareId);
    if (view.byFqid.get(same)?.kind === kind) return same;
  }
  const core = toFqid(CORE_PACK_ID, bareId);
  if (view.byFqid.get(core)?.kind === kind) return core;
  const matches = view.contents.filter((c) => c.kind === kind && c.id === bareId);
  if (matches.length === 1) return matches[0].fqid;
  if (matches.length > 1) {
    log.warn(`裸 id「${bareId}」在多个 pack 中存在，请用 FQID 消歧`, {
      kind,
      packs: matches.map((m) => m.packId),
    });
  }
  return null;
}

/**
 * 解析当前应使用的 orchestrator（FQID）。
 * tab 指定 → 项目默认 → core 默认；恒有 fallback（O-3：core 默认不可被删除，
 * 即使被禁用也返回它，保证聊天不进入无 agent 死态）。
 */
export function resolveOrchestratorId(
  projectRoot: string,
  tabOrchestratorId?: string | null,
): Fqid {
  const view = getProjectView(projectRoot);
  const explicit = tabOrchestratorId?.trim();
  if (explicit) {
    const fqid = explicit.includes(":")
      ? explicit
      : resolveBareContentId(projectRoot, "orchestrator", explicit);
    if (fqid && view.byFqid.get(fqid)?.kind === "orchestrator" && view.byFqid.get(fqid)!.enabled) {
      return fqid;
    }
  }
  const stateDefault = readDefaultOrchestrator(projectRoot);
  if (view.byFqid.get(stateDefault)?.kind === "orchestrator" && view.byFqid.get(stateDefault)!.enabled) {
    return stateDefault;
  }
  return DEFAULT_ORCHESTRATOR_FQID;
}

function readDefaultOrchestrator(projectRoot: string): Fqid {
  // 通过 state 服务读（视图里没有单挂 state；读取走缓存键一致的 readPacksState）
  // 注意：这里不用 getProjectView 之外的第二份缓存，避免双源。
  const state = readPacksState(projectRoot);
  return state.defaultOrchestrator ?? DEFAULT_ORCHESTRATOR_FQID;
}

/**
 * orchestrator 的 allowedExperts 解析（§5.4）：
 * 缺省 = 全部可用 experts；"$pack" = 同 pack 可用 experts；
 * 裸 id 按 resolveBareContentId；FQID 精确引用。结果去重保序。
 */
export function resolveAllowedExperts(projectRoot: string, orchestratorFqid: Fqid): Fqid[] {
  const view = getProjectView(projectRoot);
  const orch = view.byFqid.get(orchestratorFqid);
  if (!orch || orch.kind !== "orchestrator") return [];

  const enabledExperts = view.contents.filter((c) => c.kind === "expert" && c.enabled);
  const spec = (orch.definition as OrchestratorDef).allowedExperts;

  if (spec === undefined) return enabledExperts.map((e) => e.fqid);

  const out: Fqid[] = [];
  for (const token of spec) {
    if (token === "$pack") {
      out.push(...enabledExperts.filter((e) => e.packId === orch.packId).map((e) => e.fqid));
      continue;
    }
    const fqid = token.includes(":")
      ? token
      : resolveBareContentId(projectRoot, "expert", token, orch.packId);
    if (fqid && enabledExperts.some((e) => e.fqid === fqid)) out.push(fqid);
  }
  return [...new Set(out)];
}

/**
 * badge 唯一来源（§9.3，治 P10）：
 * fqid 直接命中；裸 id 按 core → firstparty/external（id 字典序）→ local 优先级解析。
 */
export function resolveBadge(projectRoot: string, fqidOrBareId: string): BadgeInfo | null {
  const view = getProjectView(projectRoot);
  let item: ResolvedContent | undefined;
  if (parseFqid(fqidOrBareId)) {
    item = view.byFqid.get(fqidOrBareId);
  } else {
    const matches = view.contents.filter((c) => c.id === fqidOrBareId);
    item =
      matches.find((c) => c.packId === CORE_PACK_ID) ??
      matches
        .filter((c) => c.packId !== LOCAL_PACK_ID)
        .sort((a, b) => a.packId.localeCompare(b.packId))[0] ??
      matches[0];
  }
  if (!item) return null;
  return {
    packId: item.origin.packId,
    packName: item.origin.packName,
    packTier: item.origin.packTier,
  };
}

// ── 测试专用：清空全部缓存（生产代码不需要）─────────────────

export function __resetResolverForTests(): void {
  projectViews.clear();
  listeners.clear();
}

/** 内部辅助：判断 fqid 是否属于 local pack（导出给 Phase 2+ 的 facade 用） */
export function isLocalContent(fqid: Fqid): boolean {
  return fqidBelongsToPack(fqid, LOCAL_PACK_ID);
}
