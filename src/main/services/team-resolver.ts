/**
 * pack-resolver.ts —— Agent Pack 体系的唯一解析层（设计文档 §5）。
 *
 * 「有什么内容、内容是否可用、内容长什么样」——全 app 只在这里回答：
 *
 *   enumerate → gate(tier/license) → overrides → active
 *
 * 启停/可见性的唯一判定 = isAssetActive()（原则 D3）。
 * 旧的三套分散机制（disabledBuiltinIds / skills.disabled / .md.disabled）
 * 在 Phase 2-4 被本层取代后删除。
 *
 * Phase 1 纯读：不接任何现有消费路径（experts-sync / skills-sync /
 * commandRegistry 的接管分别发生在 Phase 2 / 3）。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  OriginInfo,
  AssetKind,
  AssetOverride,
  SubagentDef,
  Fqid,
  McpDef,
  OrchestratorDef,
  TeamView,
  ProjectTeamView,
  ResolvedCommand,
  AssetView,
  ResolvedMcp,
} from "../../shared/teams/types";
import {
  CORE_TEAM_ID,
  DEFAULT_ORCHESTRATOR_FQID,
  LOCAL_TEAM_ID,
  USER_TEAM_PUBLISHER,
} from "../../shared/teams/types";
import { fqidBelongsToPack, parseFqid, toFqid } from "../../shared/teams/state";
import {
  contentDirFingerprint,
  currentCatalogFingerprint,
  getLocalTeamDir,
  getLocalTeamView,
  getTeam,
  getTeamContents,
  getTeamMcpDefs,
  listTeams,
  readTeamMcpDefs,
  scanLocalTeamContents,
  type ScannedAssetItem,
} from "./team-catalog";
import { licenseGrants, licenseStateVersion } from "./teams-license";
import {
  isTeamInstalled,
  onTeamsInstalledChanged,
  teamsInstalledWriteCounter,
} from "./teams-installed";
import {
  onTeamsStateWritten,
  teamsStateMtime,
  teamsStateWriteCounter,
  readTeamsState,
} from "./teams-state";
import { createLogger } from "./logger";

const log = createLogger("pack-resolver");

// packs.json 写入 → resolver 视图失效（§5.5；viewKey 的 mtime/计数器兜底，
// 订阅保证进程内立即失效并广播 onDidChange 监听者）。
onTeamsStateWritten((root) => {
  invalidateResolver(root);
});

// App-level install file changes affect EVERY project's view (installed state
// feeds the shared judgment chain) → invalidate all project views.
// (Registered after the caches below are declared; the callback only runs on
// actual writes, so no TDZ concern at module load.)
onTeamsInstalledChanged(() => {
  invalidateResolver();
});

// ── 项目视图缓存 ──────────────────────────────────────────

interface ProjectView {
  key: string;
  packs: ProjectTeamView[];
  contents: AssetView[];
  commands: ResolvedCommand[];
  mcps: ResolvedMcp[];
  byFqid: Map<Fqid, AssetView>;
}

const projectViews = new Map<string, ProjectView>();

function viewKey(projectRoot: string): string {
  return [
    currentCatalogFingerprint(),
    String(teamsStateMtime(projectRoot)),
    String(teamsStateWriteCounter()),
    String(teamsInstalledWriteCounter()),
    String(licenseStateVersion()),
    contentDirFingerprint(getLocalTeamDir(projectRoot)),
  ].join("#");
}

// ── overrides 应用（语义对齐旧 applyExpertOverride / applyOrchestratorOverride）──

function applyOverrideToDef(
  kind: "orchestrator" | "subagent",
  def: OrchestratorDef | SubagentDef,
  override: AssetOverride | undefined,
): OrchestratorDef | SubagentDef {
  if (!override) return def;
  const next: Record<string, unknown> = { ...def };
  if (kind === "subagent" && override.modules !== undefined) {
    next.modules = override.modules.length ? override.modules : undefined;
  }
  if (kind === "orchestrator" && override.allowedExperts !== undefined) {
    next.roster = override.allowedExperts;
  }
  if (override.model !== undefined) next.model = override.model || undefined;
  if (override.thoughtLevel !== undefined) next.thoughtLevel = override.thoughtLevel || undefined;
  if (override.temperature !== undefined) next.temperature = override.temperature;
  if (override.permission !== undefined) next.permission = override.permission;
  return next as unknown as OrchestratorDef | SubagentDef;
}

// ── 视图构建 ──────────────────────────────────────────────

function buildProjectView(projectRoot: string): ProjectView {
  const state = readTeamsState(projectRoot);
  const disabled = new Set(state.disabledContent);

  const appPacks = listTeams();
  const localView = getLocalTeamView(projectRoot);
  const allPackViews: TeamView[] = [...appPacks, localView];

  const packs: ProjectTeamView[] = allPackViews.map((view) => {
    // Layering spec §4.3: single judgment chain shared by pack layer + content layer.
    const licenseOk =
      view.manifest.tier === "pro" ? licenseGrants(view.manifest.feature) : true;
    const installed =
      view.installedByDefault || isTeamInstalled(view.manifest.id);
    // Project override: absent = auto-enabled once installed (spec L2).
    const projectState = state.projectPackStates[view.manifest.id];
    const projectEnabled =
      view.kind === "local" ? true : (projectState?.enabled ?? installed);
    const enabled = licenseOk && projectEnabled;
    return { ...view, installed, enabled, record: undefined };
  });

  const contents: AssetView[] = [];
  const commands: ResolvedCommand[] = [];
  const mcps: ResolvedMcp[] = [];
  const byFqid = new Map<Fqid, AssetView>();

  for (const pack of packs) {
    if (!pack.installed) continue;
    const teamId = pack.manifest.id;
    const origin = {
      teamId,
      teamName: pack.manifest.name,
      teamTier: pack.manifest.tier,
      publisher: pack.manifest.publisher,
    };
    // §5.3 判定链：pack.enabled 已并入 license 门（buildProjectView），
    // 内容层直接复用，逐项禁用再叠加。
    const teamActive = pack.enabled;

    const items: ScannedAssetItem[] =
      teamId === LOCAL_TEAM_ID ? scanLocalTeamContents(projectRoot) : getTeamContents(teamId);

    for (const item of items) {
      const fqid = toFqid(teamId, item.id);
      const enabled = teamActive && !disabled.has(fqid);
      // Content is user-editable (deletable) in the Local Pack and in
      // user-created teams; plugin-provided content is read-only.
      const removable =
        teamId === LOCAL_TEAM_ID || pack.manifest.publisher === USER_TEAM_PUBLISHER;
      // overrides 只应用于非 local 内容（local 内容用户直接改文件）
      const override = removable ? undefined : state.contentOverrides[fqid];

      // command 同时进入两种视图：AssetView（isAssetActive/badge 用）
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
        item.kind === "orchestrator" || item.kind === "subagent"
          ? applyOverrideToDef(item.kind, item.definition!, override)
          : item.kind === "command"
            ? item.command
            : item.definition;

      const resolved: AssetView = {
        fqid,
        kind: item.kind,
        teamId,
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

    const teamMcps =
      teamId === LOCAL_TEAM_ID ? readTeamMcpDefs(getLocalTeamDir(projectRoot)) : getTeamMcpDefs(teamId);
    for (const mcp of teamMcps) {
      const fqid = toFqid(teamId, mcp.id);
      mcps.push({
        ...mcp,
        // 判定链与 content 一致：pack 在本项目停用 → MCP 不注入运行时；
        // 逐项禁用（disabledContent）也可单独关闭某个 MCP。
        fqid,
        teamId,
        origin,
        enabled: pack.enabled && !disabled.has(fqid),
      });
    }
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
export function notifyTeamsChanged(projectRoot?: string): void {
  invalidateResolver(projectRoot);
  if (projectRoot) {
    // 动态导入避免循环依赖：project-*-refresh → *-sync → pack-resolver
    void import("./project-subagents-refresh")
      .then((m) => m.scheduleSubagentsRefresh(projectRoot))
      .catch(() => {
        // 刷新失败不阻断状态操作；下一次变更会重试
      });
    void import("./project-skills-refresh")
      .then((m) => m.scheduleSkillsRefresh(projectRoot))
      .catch(() => {
        // 同上
      });
    // Pack enable/disable changes the effective MCP set → drop the ACP
    // agent-config cache so the next session/send re-reads mcp.json +
    // enabled pack MCPs (project-chat-prewarm also re-syncs on invalidation).
    void import("../acp/service")
      .then((m) => {
        m.AcpService.getInstance().invalidateAgentConfigCache(projectRoot);
      })
      .catch(() => {
        // 同上
      });
  }
}

// ── Catalog 层（不依赖项目）───────────────────────────────

export { listTeams, getTeam };

// ── 项目视图层 ────────────────────────────────────────────

export function listProjectTeams(projectRoot: string): ProjectTeamView[] {
  return getProjectView(projectRoot).packs;
}

export function listAssets(projectRoot: string, kind: AssetKind): AssetView[] {
  return getProjectView(projectRoot).contents.filter((c) => c.kind === kind);
}

export function getAsset(projectRoot: string, fqid: Fqid): AssetView | null {
  return getProjectView(projectRoot).byFqid.get(fqid) ?? null;
}

/** 全 app 唯一启停答案（原则 D3 / §5.3）。 */
export function isAssetActive(projectRoot: string, fqid: Fqid): boolean {
  return getProjectView(projectRoot).byFqid.get(fqid)?.enabled ?? false;
}

// ── 内容读取（facade 专用）────────────────────────────────

export function readInstructions(projectRoot: string, fqid: Fqid): string {
  const item = getAsset(projectRoot, fqid);
  if (!item || (item.kind !== "orchestrator" && item.kind !== "subagent")) return "";
  const path = join(item.dir, "instructions.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8").trim();
}

export function getSkillDir(projectRoot: string, fqid: Fqid): string | null {
  const item = getAsset(projectRoot, fqid);
  return item?.kind === "skill" ? item.dir : null;
}

export function listCommands(projectRoot: string): ResolvedCommand[] {
  return getProjectView(projectRoot).commands;
}

/** pack 提供的 MCP 视图（含 enabled/origin；UI 分组展示 + 运行时注入用）。 */
export function listProjectMcps(projectRoot: string): ResolvedMcp[] {
  return getProjectView(projectRoot).mcps;
}

/** 兼容旧 API：仅返回启用 pack 的 MCP 定义（无 origin/enabled 包装）。 */
export function listPackMcpDefs(projectRoot: string): McpDef[] {
  return getProjectView(projectRoot).mcps.filter((m) => m.enabled);
}

// ── 引用解析 ──────────────────────────────────────────────

/**
 * 裸 id → FQID（§4.5.2 / §4.3.1）：
 * 同 pack → core pack → 全部已装 pack 中唯一匹配；多义返回 null。
 */
export function resolveBareContentId(
  projectRoot: string,
  kind: AssetKind,
  bareId: string,
  contextPackId?: string,
): Fqid | null {
  const view = getProjectView(projectRoot);
  if (contextPackId) {
    const same = toFqid(contextPackId, bareId);
    if (view.byFqid.get(same)?.kind === kind) return same;
  }
  const core = toFqid(CORE_TEAM_ID, bareId);
  if (view.byFqid.get(core)?.kind === kind) return core;
  const matches = view.contents.filter((c) => c.kind === kind && c.id === bareId);
  if (matches.length === 1) return matches[0].fqid;
  if (matches.length > 1) {
    log.warn(`裸 id「${bareId}」在多个 pack 中存在，请用 FQID 消歧`, {
      kind,
      packs: matches.map((m) => m.teamId),
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
  // 通过 state 服务读（视图里没有单挂 state；读取走缓存键一致的 readTeamsState）
  // 注意：这里不用 getProjectView 之外的第二份缓存，避免双源。
  const state = readTeamsState(projectRoot);
  return state.defaultOrchestrator ?? DEFAULT_ORCHESTRATOR_FQID;
}

/**
 * orchestrator 的 roster 解析（§5.4）：
 * 缺省 = 全部可用 experts；"$pack" = 同 pack 可用 experts；
 * 裸 id 按 resolveBareContentId；FQID 精确引用。结果去重保序。
 */
export function resolveRosterRefs(projectRoot: string, orchestratorFqid: Fqid): Fqid[] {
  const view = getProjectView(projectRoot);
  const orch = view.byFqid.get(orchestratorFqid);
  if (!orch || orch.kind !== "orchestrator") return [];

  const enabledExperts = view.contents.filter((c) => c.kind === "subagent" && c.enabled);
  const spec = (orch.definition as OrchestratorDef).roster;

  if (spec === undefined) return enabledExperts.map((e) => e.fqid);

  const out: Fqid[] = [];
  for (const token of spec) {
    if (token === "$pack") {
      out.push(...enabledExperts.filter((e) => e.teamId === orch.teamId).map((e) => e.fqid));
      continue;
    }
    const fqid = token.includes(":")
      ? token
      : resolveBareContentId(projectRoot, "subagent", token, orch.teamId);
    if (fqid && enabledExperts.some((e) => e.fqid === fqid)) out.push(fqid);
  }
  return [...new Set(out)];
}

/**
 * badge 唯一来源（§9.3，治 P10）：
 * fqid 直接命中；裸 id 按 core → firstparty/external（id 字典序）→ local 优先级解析。
 */
export function resolveOrigin(projectRoot: string, fqidOrBareId: string): OriginInfo | null {
  const view = getProjectView(projectRoot);
  let item: AssetView | undefined;
  if (parseFqid(fqidOrBareId)) {
    item = view.byFqid.get(fqidOrBareId);
  } else {
    const matches = view.contents.filter((c) => c.id === fqidOrBareId);
    item =
      matches.find((c) => c.teamId === CORE_TEAM_ID) ??
      matches
        .filter((c) => c.teamId !== LOCAL_TEAM_ID)
        .sort((a, b) => a.teamId.localeCompare(b.teamId))[0] ??
      matches[0];
  }
  if (!item) return null;
  return {
    teamId: item.origin.teamId,
    teamName: item.origin.teamName,
    teamTier: item.origin.teamTier,
  };
}

// ── 测试专用：清空全部缓存（生产代码不需要）─────────────────

export function __resetResolverForTests(): void {
  projectViews.clear();
  listeners.clear();
}

/** 内部辅助：判断 fqid 是否属于 local pack（导出给 Phase 2+ 的 facade 用） */
export function isLocalContent(fqid: Fqid): boolean {
  return fqidBelongsToPack(fqid, LOCAL_TEAM_ID);
}
