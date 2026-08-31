/**
 * TeamsProjectState 纯函数助手（无副作用）——main 侧 packs-state.ts 负责落盘。
 */

import {
  APP_COMMAND_IDS,
  APP_COMMANDS_OWNER_ID,
  APP_TEAMS_STATE_VERSION,
  CORE_TEAM_ID,
  PROJECT_TEAMS_STATE_VERSION,
  TEAMS_STATE_VERSION,
  type AppTeamsState,
  type AssetOverride,
  type Fqid,
  type InstalledTeamRecord,
  type ProjectTeamsState,
  type TeamsProjectState,
  type TriState,
} from "./types";

export function emptyPacksState(): TeamsProjectState {
  return {
    stateVersion: TEAMS_STATE_VERSION,
    projectPackStates: {},
    disabledContent: [],
    contentOverrides: {},
  };
}

/** `${teamId}:${contentId}` */
export function toFqid(teamId: string, contentId: string): Fqid {
  return `${teamId}:${contentId}`;
}

/** 拆 FQID；不含 `:` 时返回 null（调用方按裸 id 逻辑处理） */
export function parseFqid(fqid: string): { teamId: string; contentId: string } | null {
  const idx = fqid.indexOf(":");
  if (idx <= 0 || idx === fqid.length - 1) return null;
  return { teamId: fqid.slice(0, idx), contentId: fqid.slice(idx + 1) };
}

/** fqid 是否属于某个 pack */
export function fqidBelongsToPack(fqid: string, teamId: string): boolean {
  return fqid.startsWith(`${teamId}:`);
}

/** Former Core slash commands now owned by `app:` (plus removed undo/redo). */
const CORE_TO_APP_COMMAND_IDS = new Set<string>([...APP_COMMAND_IDS, "undo", "redo"]);

/** Rewrite legacy `prismnext.core:<cmd>` → `app:<cmd>` for platform commands. */
export function rewriteCoreAppCommandFqid(fqid: string): string {
  const parsed = parseFqid(fqid);
  if (!parsed || parsed.teamId !== CORE_TEAM_ID) return fqid;
  if (!CORE_TO_APP_COMMAND_IDS.has(parsed.contentId)) return fqid;
  return toFqid(APP_COMMANDS_OWNER_ID, parsed.contentId);
}

function rewriteCoreAppCommandOverride(override: AssetOverride): AssetOverride {
  if (!override.allowedCommands?.length) return override;
  return {
    ...override,
    allowedCommands: override.allowedCommands.map(rewriteCoreAppCommandFqid),
  };
}

function rewriteCoreAppCommandStateMaps<T extends {
  assetEnabled: TriState;
  assetOverrides: Record<Fqid, AssetOverride>;
}>(state: T): T {
  const assetEnabled: TriState = {};
  for (const [fqid, value] of Object.entries(state.assetEnabled)) {
    assetEnabled[rewriteCoreAppCommandFqid(fqid)] = value;
  }
  const assetOverrides: Record<Fqid, AssetOverride> = {};
  for (const [fqid, value] of Object.entries(state.assetOverrides)) {
    assetOverrides[rewriteCoreAppCommandFqid(fqid)] = rewriteCoreAppCommandOverride(value);
  }
  return { ...state, assetEnabled, assetOverrides };
}

/**
 * 防御性解析 packs.json 原文。任何字段畸形都退化为安全默认，
 * 不让单个坏字段毁掉整个项目状态。
 */
export function normalizePacksState(raw: unknown): TeamsProjectState {
  if (!raw || typeof raw !== "object") return emptyPacksState();
  const obj = raw as Record<string, unknown>;

  // projectPackStates: { teamId: { enabled } } — only records explicit overrides
  const projectPackStates: TeamsProjectState["projectPackStates"] = {};
  if (obj.projectPackStates && typeof obj.projectPackStates === "object") {
    for (const [teamId, value] of Object.entries(obj.projectPackStates as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const st = value as Record<string, unknown>;
      if (typeof st.enabled !== "boolean") continue;
      projectPackStates[teamId] = { enabled: st.enabled };
    }
  }

  const disabledContent: Fqid[] = Array.isArray(obj.disabledContent)
    ? obj.disabledContent.filter((x): x is string => typeof x === "string" && parseFqid(x) !== null)
    : [];

  const contentOverrides: TeamsProjectState["contentOverrides"] = {};
  if (obj.contentOverrides && typeof obj.contentOverrides === "object") {
    for (const [key, value] of Object.entries(obj.contentOverrides as Record<string, unknown>)) {
      if (!parseFqid(key)) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      contentOverrides[key] = value as TeamsProjectState["contentOverrides"][string];
    }
  }

  return {
    stateVersion: TEAMS_STATE_VERSION,
    defaultOrchestrator:
      typeof obj.defaultOrchestrator === "string" && parseFqid(obj.defaultOrchestrator)
        ? obj.defaultOrchestrator
        : undefined,
    projectPackStates,
    disabledContent: [...new Set(disabledContent)],
    contentOverrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Team 架构 v2 —— 三态解析 + 状态文件 normalize（design §5.3）
// ═══════════════════════════════════════════════════════════

/**
 * 唯一的层级合并函数（全 app 只有这一个）。
 * 项目值 ?? 应用值 ?? 默认。三态：undefined（缺键）≠ false。
 */
export function resolveTri(
  project: boolean | undefined,
  app: boolean | undefined,
  fallback: boolean,
): boolean {
  return project ?? app ?? fallback;
}

/**
 * Whether the project enable flag meaningfully diverges from the app layer.
 * Unset app follows `fallback` (enable defaults to on). So project=true with
 * app unset is NOT an override — same effective value as following global.
 */
export function isProjectEnableOverridden(
  enabledProject: boolean | undefined,
  enabledApp: boolean | undefined,
  fallback = true,
): boolean {
  if (enabledProject === undefined) return false;
  return enabledProject !== (enabledApp ?? fallback);
}

// ── 字段白名单校验（治 v1 的 contentOverrides 直接 `as` 安全洞）──

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** 三态 map：只收 boolean 值，key 必须非空。 */
function normalizeTriState(raw: unknown): TriState {
  const out: TriState = {};
  if (!isPlainObject(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

/** override：字段白名单过滤（拒绝 __proto__ 等注入与未知字段）。不改写入参。 */
function normalizeAssetOverride(raw: unknown): AssetOverride | null {
  if (!isPlainObject(raw)) return null;
  const out: AssetOverride = {};
  if (typeof raw.model === "string") out.model = raw.model;
  if (typeof raw.thoughtLevel === "string") out.thoughtLevel = raw.thoughtLevel;
  if (typeof raw.temperature === "number") out.temperature = raw.temperature;
  if (Array.isArray(raw.modules)) {
    out.modules = raw.modules.filter((m): m is string => typeof m === "string");
  }
  if (Array.isArray(raw.allowedExperts)) {
    out.allowedExperts = raw.allowedExperts.filter((m): m is string => typeof m === "string");
  }
  if (Array.isArray(raw.allowedSkills)) {
    out.allowedSkills = raw.allowedSkills.filter((m): m is string => typeof m === "string");
  }
  if (Array.isArray(raw.allowedCommands)) {
    out.allowedCommands = raw.allowedCommands.filter((m): m is string => typeof m === "string");
  }
  if (isPlainObject(raw.permission)) {
    out.permission = raw.permission;
  }
  // 不在白名单里的 key 一律不进 out（不透传、不修改入参）。
  return out;
}

function normalizeOverridesMap(raw: unknown): Record<Fqid, AssetOverride> {
  const out: Record<Fqid, AssetOverride> = {};
  if (!isPlainObject(raw)) return out;
  for (const [fqid, value] of Object.entries(raw)) {
    if (!parseFqid(fqid)) continue;
    const normalized = normalizeAssetOverride(value);
    if (normalized) out[fqid] = normalized;
  }
  return out;
}

function normalizeInstalled(raw: unknown): InstalledTeamRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is InstalledTeamRecord =>
      isPlainObject(e) && typeof e.teamId === "string" && Boolean(e.teamId),
  ).map((e) => ({ teamId: e.teamId, installedAt: typeof e.installedAt === "string" ? e.installedAt : new Date(0).toISOString() }));
}

function normalizeDefaultTeam(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

function normalizeUninstalled(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && Boolean(x.trim())))];
}

export function emptyAppTeamsState(): AppTeamsState {
  return {
    version: APP_TEAMS_STATE_VERSION,
    installed: [],
    uninstalled: [],
    teamEnabled: {},
    assetEnabled: {},
    assetOverrides: {},
  };
}

export function emptyProjectTeamsState(): ProjectTeamsState {
  return {
    version: PROJECT_TEAMS_STATE_VERSION,
    teamEnabled: {},
    assetEnabled: {},
    assetOverrides: {},
  };
}

/** 防御性解析 teams-state.json（应用级）。任何字段畸形都退化为安全默认。 */
export function normalizeAppTeamsState(raw: unknown): AppTeamsState {
  if (!isPlainObject(raw)) return emptyAppTeamsState();
  return rewriteCoreAppCommandStateMaps({
    version: APP_TEAMS_STATE_VERSION,
    installed: normalizeInstalled(raw.installed),
    uninstalled: normalizeUninstalled(raw.uninstalled),
    defaultTeam: normalizeDefaultTeam(raw.defaultTeam),
    teamEnabled: normalizeTriState(raw.teamEnabled),
    assetEnabled: normalizeTriState(raw.assetEnabled),
    assetOverrides: normalizeOverridesMap(raw.assetOverrides),
  });
}

/** 防御性解析 teams.json（项目级）。 */
export function normalizeProjectTeamsState(raw: unknown): ProjectTeamsState {
  if (!isPlainObject(raw)) return emptyProjectTeamsState();
  return rewriteCoreAppCommandStateMaps({
    version: PROJECT_TEAMS_STATE_VERSION,
    defaultTeam: normalizeDefaultTeam(raw.defaultTeam),
    teamEnabled: normalizeTriState(raw.teamEnabled),
    assetEnabled: normalizeTriState(raw.assetEnabled),
    assetOverrides: normalizeOverridesMap(raw.assetOverrides),
  });
}

/** Read `defaultTeam` from a teams.json body. Invalid JSON → null. */
export function projectDefaultTeamFromRaw(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    return normalizeProjectTeamsState(JSON.parse(raw)).defaultTeam ?? null;
  } catch {
    return null;
  }
}

/** Merge a project default team into a teams.json body (preserves other keys). */
export function projectTeamsStateWithDefaultTeam(
  raw: string | null | undefined,
  teamId: string,
): string {
  let prev = emptyProjectTeamsState();
  if (raw?.trim()) {
    try {
      prev = normalizeProjectTeamsState(JSON.parse(raw));
    } catch {
      prev = emptyProjectTeamsState();
    }
  }
  return `${JSON.stringify({ ...prev, defaultTeam: teamId }, null, 2)}\n`;
}
