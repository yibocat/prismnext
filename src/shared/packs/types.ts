/**
 * Agent Pack 体系 —— 统一数据模型（packFormatVersion 1）。
 *
 * 一份 schema 通吃 core / first-party / pro / local 全部 pack。
 * 设计依据：docs-private/specs/2026-08-08-agent-pack-architecture-refactor.md（§4 / 附录 A）。
 *
 * 核心约定：
 * - Pack 是唯一一等实体；内容项永远从 pack 目录直接读取（引用，不拷贝）。
 * - 全局唯一身份 = FQID（`${packId}:${contentId}`）。
 * - 启停/可见性的唯一判定在 main 侧 PackResolver（§5），本文件只承载数据形状。
 */

// ── 基础枚举 ──────────────────────────────────────────────

export type PackTier = "free" | "pro";

/** core = 内置核心包；firstparty = 官方免费包；external = 运行期注册的外部根（Pro）；local = 项目本地用户包 */
export type PackKind = "core" | "firstparty" | "external" | "local";

export type ContentKind = "orchestrator" | "expert" | "skill" | "command" | "mcp";

/** 全限定内容 id：`${packId}:${contentId}`，如 `prismnext.core:peer-reviewer` */
export type Fqid = string;

// ── plugin.json（包清单，§4.2）────────────────────────────

export interface PackContentDecl {
  id: string;
  name: string;
  description?: string;
}

/**
 * contents 仅为 Gallery / 详情页 / badge 的【展示声明】。
 * 安装与解析永远以目录扫描为准；声明与扫描不一致时以扫描结果为准并记 warning。
 */
export interface PackContentsDecl {
  orchestrators?: PackContentDecl[];
  experts?: PackContentDecl[];
  skills?: PackContentDecl[];
  commands?: PackContentDecl[];
  /** 保留槽位：MCP server 声明（v1 不接运行时） */
  mcps?: PackContentDecl[];
}

export interface PackManifest {
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
  tier: PackTier;
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
  contents?: PackContentsDecl;
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
  allowedExperts?: string[];
  permission?: Record<string, unknown>;
}

/** expert.json。同样不含 builtin/removable/pluginId。 */
export interface ExpertDef {
  id: string;
  name: string;
  description: string;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  /** shared prompt module keys（语义同旧 ExpertDefinition.modules） */
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
  /** 全局唯一身份："<packId>:<mcpId>" */
  fqid: Fqid;
  packId: string;
  origin: ContentOrigin;
  enabled: boolean;
}

// ── 解析后视图（facade / UI 统一消费，§5.1）──────────────

export interface PackView {
  manifest: PackManifest;
  kind: PackKind;
  /** pack 目录绝对路径（local = <projectRoot>/.prismnext/agent/local） */
  dir: string;
  /** core / local = true（隐式已装） */
  installedByDefault: boolean;
  /** tier=pro 且 license 不授权（展示态；内容激活在 resolver 单独判定） */
  locked: boolean;
  /** minHostVersion / packFormatVersion 校验结果 */
  compatible: boolean;
}

export interface ProjectPackView extends PackView {
  installed: boolean;
  enabled: boolean;
}

export interface ContentOrigin {
  packId: string;
  packName: string;
  packTier: PackTier;
  publisher: string;
}

export interface ResolvedContent<TDef = unknown> {
  fqid: Fqid;
  kind: ContentKind;
  packId: string;
  /** pack 内 id */
  id: string;
  name: string;
  description: string;
  /** overrides 已应用的定义（OrchestratorDef / ExpertDef / …） */
  definition: TDef;
  /** = PackResolver.isContentActive 的结果（唯一启停答案） */
  enabled: boolean;
  /** = packId === LOCAL_PACK_ID */
  removable: boolean;
  origin: ContentOrigin;
  /** 内容目录绝对路径（commands 为 .md 文件路径） */
  dir: string;
}

export type ResolvedOrchestrator = ResolvedContent<OrchestratorDef> & { kind: "orchestrator" };
export type ResolvedExpert = ResolvedContent<ExpertDef> & { kind: "expert" };

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
  origin: ContentOrigin;
}

export interface BadgeInfo {
  packId: string;
  packName: string;
  packTier: PackTier;
}

// ── packs.json（项目状态，stateVersion 3，§4.4 + 2026-08-09 分层 spec）──

export const PACKS_STATE_VERSION = 3;
export const CORE_PACK_ID = "prismnext.core";
export const LOCAL_PACK_ID = "user.local";
/** Marker publisher for user-created teams (auto-installed app-level packs). */
export const USER_TEAM_PUBLISHER = "user";
export const DEFAULT_ORCHESTRATOR_FQID: Fqid = `${CORE_PACK_ID}:research-prism`;
/** Local Pack 目录（相对项目根）；pack-catalog / packs-state 共用此常量拼绝对路径 */
export const LOCAL_PACK_REL = ".prismnext/agent/local";

/**
 * Project-level enable/disable override for a pack (spec L2).
 * Absent = automatically enabled once the pack is installed at app level.
 */
export interface ProjectPackState {
  enabled: boolean;
}

export interface ContentOverride {
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  modules?: string[];
  allowedExperts?: string[];
  permission?: Record<string, unknown>;
}

export interface PacksState {
  stateVersion: typeof PACKS_STATE_VERSION;
  /** FQID；缺省 = DEFAULT_ORCHESTRATOR_FQID */
  defaultOrchestrator?: Fqid;
  /** 项目启停覆盖（缺省 = 已装自动启用）；不再存安装记录（应用级 packs-installed.json） */
  projectPackStates: Record<string, ProjectPackState>;
  /** 任意 FQID 的逐项禁用（统一替代 disabledBuiltinIds / skills.disabled / .md.disabled） */
  disabledContent: Fqid[];
  /** 非 local 内容的 override，by FQID */
  contentOverrides: Record<Fqid, ContentOverride>;
}
