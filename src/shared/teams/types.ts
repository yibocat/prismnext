/**
 * Agent Pack 体系 —— 统一数据模型（packFormatVersion 1）。
 *
 * 一份 schema 通吃 core / first-party / pro / local 全部 pack。
 * 设计依据：docs-private/specs/2026-08-08-agent-pack-architecture-refactor.md（§4 / 附录 A）。
 *
 * 核心约定：
 * - Pack 是唯一一等实体；内容项永远从 pack 目录直接读取（引用，不拷贝）。
 * - 全局唯一身份 = FQID（`${teamId}:${contentId}`）。
 * - 启停/可见性的唯一判定在 main 侧 PackResolver（§5），本文件只承载数据形状。
 */

// ── 基础枚举 ──────────────────────────────────────────────

export type TeamTier = "free" | "pro";

/** core = 内置核心包；firstparty = 官方免费包；external = 运行期注册的外部根（Pro）；local = 项目本地用户包 */
export type TeamKind = "core" | "firstparty" | "external" | "local";

export type AssetKind = "orchestrator" | "subagent" | "skill" | "command" | "mcp";

/** 全限定内容 id：`${teamId}:${contentId}`，如 `prismnext.core:peer-reviewer` */
export type Fqid = string;

// ── team.json（包清单，§4.2；legacy plugin.json 仍可读）────

export interface TeamAssetDecl {
  id: string;
  name: string;
  description?: string;
}

/**
 * contents 仅为 Gallery / 详情页 / badge 的【展示声明】。
 * 安装与解析永远以目录扫描为准；声明与扫描不一致时以扫描结果为准并记 warning。
 */
export interface TeamContentsDecl {
  orchestrators?: TeamAssetDecl[];
  /** Canonical name (formatVersion 2). */
  subagents?: TeamAssetDecl[];
  /** @deprecated Prefer subagents — kept for older manifests. */
  experts?: TeamAssetDecl[];
  skills?: TeamAssetDecl[];
  commands?: TeamAssetDecl[];
  /** 保留槽位：MCP server 声明（v1 不接运行时） */
  mcps?: TeamAssetDecl[];
}

export interface TeamManifest {
  /** pack id，全局唯一。规范 `<publisher>.<name>`；保留 `prismnext.core` / `user.local` */
  id: string;
  name: string;
  description: string;
  /** 详情页正文 */
  longDescription?: string;
  /** semver */
  version: string;
  /** 布局格式版本，当前恒为 1 */
  packFormatVersion: 1;
  /**
   * Disk layout version. `2` = team.json + orchestrators|orchestrator + subagents.
   * Omitted / older = may still use plugin.json + experts/ (scanner fallback).
   */
  formatVersion?: number;
  tier: TeamTier;
  /** 发布者标识，如 `prismnext` / `prismnext.pro` / 第三方 */
  publisher: string;
  /** 对应的 license feature id；缺省 = 仅要求 plan=pro（tier=pro 时生效） */
  feature?: string;
  domain?: string;
  category?: string;
  tags?: string[];
  developer?: string;
  /** 预留：pack 内图标相对路径 */
  icon?: string;
  /** 需要的最低 app 版本；不满足则 catalog 标记不兼容、禁止安装 */
  minHostVersion?: string;
  /** 本包内某 orchestrator 的 content id；启用 pack 时用于「设为默认」联动 */
  preferredOrchestrator?: string;
  contents?: TeamContentsDecl;
}

// ── 内容定义（pack 内文件格式，§4.3）─────────────────────

/**
 * orchestrator.json。注意【没有】builtin/removable/pluginId 字段——
 * 这些身份全部由 pack 归属推导（§5.2）。
 */
export interface OrchestratorDef {
  id: string;
  name: string;
  description: string;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  /**
   * 元素取值："$pack"（本包全部 experts）| 裸 id（同 pack → core → 全局唯一）| FQID。
   * 缺省 / 省略 = 全部当前可用 experts（维持旧语义）。
   */
  roster?: string[];
  permission?: Record<string, unknown>;
}

/** expert.json。同样不含 builtin/removable/pluginId。 */
export interface SubagentDef {
  id: string;
  name: string;
  description: string;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  /** shared prompt module keys（语义同旧 SubagentDefinition.modules） */
  modules?: string[];
  permission?: Record<string, unknown>;
}

/** mcp.json 数组元素（pack 声明的 MCP 服务器定义） */
export interface McpDef {
  id: string;
  name: string;
  description?: string;
  transport:
    | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
    | { type: "http"; url: string; headers?: Record<string, string> };
}

/**
 * 解析后的 MCP 视图（resolver 收集，UI 与运行时共用）。
 * enabled = pack 在本项目启用（pack.enabled，判定链与 content 一致）。
 * 运行时注入只使用 enabled 的 pack MCP。
 */
export interface ResolvedMcp extends McpDef {
  /** 全局唯一身份："<teamId>:<mcpId>" */
  fqid: Fqid;
  teamId: string;
  origin: AssetOrigin;
  enabled: boolean;
}

// ── 解析后视图（facade / UI 统一消费，§5.1）──────────────

export interface TeamView {
  manifest: TeamManifest;
  kind: TeamKind;
  /** pack 目录绝对路径（local = <projectRoot>/.prismnext/agent/local） */
  dir: string;
  /** core / local = true（隐式已装） */
  installedByDefault: boolean;
  /** tier=pro 且 license 不授权（展示态；内容激活在 resolver 单独判定） */
  locked: boolean;
  /** minHostVersion / packFormatVersion 校验结果 */
  compatible: boolean;
}

export interface ProjectTeamView extends TeamView {
  installed: boolean;
  enabled: boolean;
}

export interface AssetOrigin {
  teamId: string;
  teamName: string;
  teamTier: TeamTier;
  publisher: string;
}

export interface AssetView<TDef = unknown> {
  fqid: Fqid;
  kind: AssetKind;
  teamId: string;
  /** pack 内 id */
  id: string;
  name: string;
  description: string;
  /** overrides 已应用的定义（OrchestratorDef / SubagentDef / …） */
  definition: TDef;
  /** = PackResolver.isAssetActive 的结果（唯一启停答案） */
  enabled: boolean;
  /** = teamId === LOCAL_TEAM_ID */
  removable: boolean;
  origin: AssetOrigin;
  /** 内容目录绝对路径（commands 为 .md 文件路径） */
  dir: string;
}

export type ResolvedOrchestrator = AssetView<OrchestratorDef> & { kind: "orchestrator" };
export type ResolvedSubagent = AssetView<SubagentDef> & { kind: "subagent" };

export interface ResolvedCommand {
  fqid: Fqid;
  /** /name（pack 内 id） */
  name: string;
  description: string;
  template: string;
  action?: string;
  agent?: string;
  model?: string;
  order: number;
  enabled: boolean;
  origin: AssetOrigin;
}

export interface OriginInfo {
  teamId: string;
  teamName: string;
  teamTier: TeamTier;
}

// ── packs.json（项目状态，stateVersion 3，§4.4 + 2026-08-09 分层 spec）──

export const TEAMS_STATE_VERSION = 3;
export const CORE_TEAM_ID = "prismnext.core";
/**
 * Synthetic owner for app-level slash commands (`resources/commands/`).
 * Not a TeamView — never appears in Settings → Teams.
 */
export const APP_COMMANDS_OWNER_ID = "app";
/** Builtin app command ids (also used when rewriting legacy `prismnext.core:` FQIDs). */
export const APP_COMMAND_IDS = [
  "bib-check",
  "brief",
  "compact",
  "compile",
  "setup",
] as const;
export const LOCAL_TEAM_ID = "user.local";
/**
 * Always-on app team: hangar for unassigned user content + the undeletable
 * chat lead agent (system safety net when Core is disabled/uninstalled).
 */
export const MY_CONTENT_TEAM_ID = "user.my-content";
/** Singular lead id inside My Content (`orchestrator/orchestrator.json`). */
export const MY_CONTENT_LEAD_ID = "chat";
/** Marker publisher for user-created teams (auto-installed app-level packs). */
export const USER_TEAM_PUBLISHER = "user";
export const DEFAULT_ORCHESTRATOR_FQID: Fqid = `${CORE_TEAM_ID}:research-prism`;
/** Chat / active-team final fallback when no other lead is usable. */
export const FALLBACK_ORCHESTRATOR_FQID: Fqid = `${MY_CONTENT_TEAM_ID}:${MY_CONTENT_LEAD_ID}`;
/** Local Pack 目录（相对项目根）；pack-catalog / packs-state 共用此常量拼绝对路径 */
export const LOCAL_TEAM_REL = ".prismnext/agent/local";

/**
 * Project-level enable/disable override for a pack (spec L2).
 * Absent = automatically enabled once the pack is installed at app level.
 */
export interface ProjectTeamState {
  enabled: boolean;
}

export interface AssetOverride {
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  modules?: string[];
  /** 磁盘 key 冻结为 allowedExperts（contentOverrides 透传，无映射层；T6 迁移为 roster） */
  allowedExperts?: string[];
  /**
   * Lead-scoped skills allowlist (mirrors allowedExperts).
   * `$pack` / `@team` = own-team skills; FQIDs = foreign skills added via `+`.
   * Omit on disk → runtime defaults to own-team only (not global union).
   */
  allowedSkills?: string[];
  /**
   * Lead-scoped commands allowlist (mirrors allowedSkills).
   * `$pack` / `@team` = own-team commands; FQIDs = foreign commands added via `+`.
   */
  allowedCommands?: string[];
  permission?: Record<string, unknown>;
}

export interface TeamsProjectState {
  stateVersion: typeof TEAMS_STATE_VERSION;
  /** FQID；缺省 = DEFAULT_ORCHESTRATOR_FQID */
  defaultOrchestrator?: Fqid;
  /** 项目启停覆盖（缺省 = 已装自动启用）；不再存安装记录（应用级 packs-installed.json）。
   *  磁盘字段名冻结为 projectPackStates（T0；T6 迁移时统一改）。 */
  projectPackStates: Record<string, ProjectTeamState>;
  /** 任意 FQID 的逐项禁用（统一替代 disabledBuiltinIds / skills.disabled / .md.disabled）。
   *  磁盘字段名冻结为 disabledContent。 */
  disabledContent: Fqid[];
  /** 非 local 内容的 override，by FQID。磁盘字段名冻结为 contentOverrides。 */
  contentOverrides: Record<Fqid, AssetOverride>;
}

// ═══════════════════════════════════════════════════════════
// Team 架构 v2（design: 2026-08-10-teams-architecture-v2-design.md §5）
//
// 以下是 v2 的目标类型。T1 纯增量追加，与上方 v1 类型并行；
// 现有消费路径仍走 v1，T2/T3 切换，T6 迁移后 v1 类型整体删除。
// ═══════════════════════════════════════════════════════════

// ── 两个正交维度（§3.1）──────────────────────────────────

/** 作用域：组件在哪些项目可见。Team 的属性，组件继承之。 */
export type TeamScope = "app" | "project";

/** 来源：Team 从哪来（决定只读/可写、license 门控、优先级）。 */
export type TeamSource = "core" | "bundled" | "pro" | "registry" | "user";

// ── 名册（§3.4）──────────────────────────────────────────

/** 名册项：FQID 精确引用，或 "@team"（本团队全部子 Agent，动态展开）。 */
export type RosterRef = Fqid | "@team";

/**
 * 主 Agent 名册。缺省 = { mode: "all" }（全部启用的子 Agent，维持旧语义）。
 * 名册是引用列表，不是所有权声明 —— 被引用的子 Agent 归属不变、可多册共存。
 */
export type RosterSpec =
  | { mode: "all" }
  | { mode: "list"; members: RosterRef[] };

// ── MCP（v2：含 autoStart，治 B1）─────────────────────────

/**
 * 团队 mcp.json 数组元素（v2 唯一 MCP schema）。
 * 与 v1 McpDef 的差别：新增 autoStart。
 */
export interface McpServerDef {
  id: string;
  /** 运行时服务名（跨团队唯一性冲突按 §7.5 优先级裁决） */
  name: string;
  description?: string;
  /** 会话建立时立即连接；缺省 false = 懒加载（由 / 目录触发 session/load） */
  autoStart?: boolean;
  transport:
    | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
    | { type: "http"; url: string; headers?: Record<string, string> };
}

// ── 不可用原因（治 B8：UI 必须能解释每个灰掉的开关）─────────

export type BlockReason =
  | "not-installed"
  | "license"
  | "incompatible"
  | "team-disabled-app"
  | "team-disabled-project"
  | "asset-disabled-app"
  | "asset-disabled-project"
  /** 被更高优先级的同名组件遮蔽（§7.5） */
  | "shadowed";

// ── 三态与状态文件（§5.1.3 / §5.1.4）──────────────────────

/** 三态：true=启用 / false=停用 / 缺键=跟随上层。 */
export type TriState = Record<string, boolean>;

/** 应用级安装记录（teams-state.json 的 installed[] 元素）。 */
export interface InstalledTeamRecord {
  teamId: string;
  /** ISO 8601 */
  installedAt: string;
}

export const APP_TEAMS_STATE_VERSION = 1;
export const PROJECT_TEAMS_STATE_VERSION = 1;
/** 应用级状态文件（userData 下） */
export const APP_TEAMS_STATE_FILE = "teams-state.json";
/** 项目级状态文件（相对项目根） */
export const PROJECT_TEAMS_STATE_REL = ".prismnext/agent/teams.json";
/** 项目团队根目录（相对项目根） */
export const PROJECT_TEAMS_REL = ".prismnext/agent/teams";
/** 项目默认团队 id（user.local 的迁移目标，治 C1） */
export const PROJECT_DEFAULT_TEAM_ID = "project.local";
/** Seeded hangar lead inside project.local (`orchestrators/project/`). */
export const PROJECT_LOCAL_LEAD_ID = "project";
/** FQID of the project hangar lead (undeletable, like My Content Chat). */
export const PROJECT_LOCAL_LEAD_FQID: Fqid = `${PROJECT_DEFAULT_TEAM_ID}:${PROJECT_LOCAL_LEAD_ID}`;

/**
 * The sole runtime identity of the writable default project Team.
 * `user.local` is a legacy migration input and must never be accepted by v2
 * UI or resolver consumers as a current Team identity.
 */
export function isProjectLocalTeamId(teamId: string): boolean {
  return teamId === PROJECT_DEFAULT_TEAM_ID;
}

export function isProjectLocalLeadFqid(fqid: string): boolean {
  return fqid === PROJECT_LOCAL_LEAD_FQID;
}

/** 应用级状态 `<userData>/teams-state.json`（v2） */
export interface AppTeamsState {
  version: typeof APP_TEAMS_STATE_VERSION;
  /** 应用级安装记录（core / user / project 团队不入列） */
  installed: InstalledTeamRecord[];
  /**
   * Opt-out for teams that are installed by default (today: `prismnext.core`).
   * Bundled/pro/registry use `installed` instead; core stays out of `installed`
   * and is considered installed unless listed here.
   */
  uninstalled?: string[];
  /** 应用级默认（活动）团队 */
  defaultTeam?: string;
  /** 团队级三态覆盖（缺键 = 跟随默认 true） */
  teamEnabled: TriState;
  /** 组件级三态覆盖（缺键 = 跟随默认 true） */
  assetEnabled: TriState;
  /** 全局级 override（预留） */
  assetOverrides: Record<Fqid, AssetOverride>;
}

/** 项目级状态 `<projectRoot>/.prismnext/agent/teams.json`（v2） */
export interface ProjectTeamsState {
  version: typeof PROJECT_TEAMS_STATE_VERSION;
  /** 项目级默认（活动）团队 */
  defaultTeam?: string;
  /** 团队级三态覆盖（可推翻应用级，§5.3） */
  teamEnabled: TriState;
  /** 组件级三态覆盖 */
  assetEnabled: TriState;
  /** 项目级 override */
  assetOverrides: Record<Fqid, AssetOverride>;
}
