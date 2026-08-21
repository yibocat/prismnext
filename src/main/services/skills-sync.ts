import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { countPromptTokens } from "../lib/token-estimate";
import {
  libraryCardForRegistryUrl,
  PRISM_CURATED_SOURCE_ID,
} from "../../shared/skill-libraries";
import type { SkillInstallRecord } from "../../shared/skill-install-types";
import {
  CORE_TEAM_ID,
  isProjectLocalTeamId,
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
  PROJECT_TEAMS_REL,
  type TeamSource,
} from "../../shared/teams/types";
import { parseFqid } from "../../shared/teams/state";
import { homeSkillsRel } from "../../shared/workbench-paths";
import { parseGitHubInput, scanGitHubRepository } from "./skill-install-github";
import { validateRegistryIndex } from "./skills-registry";
import {
  listAssets,
  resolveActiveTeam,
  resolveRef,
  resolveSkillsRoster,
} from "../teams/resolver";
import { precedenceRank } from "../teams/precedence";
import { setAppAssetEnabled } from "../teams/state-app";
import { ensureMyContentTeam } from "../teams/my-content";
import { getTeamRecord, invalidateCatalog } from "../teams/catalog";
import {
  ensureWorkbenchHome,
  homeSkillDir,
  homeSkillsDir,
  homeSkillsManifestPath,
} from "../workbench/home";

/** Live project hangar skills (created only by explicit project-team CRUD). */
export const PRISM_LOCAL_SKILLS_REL = `${PROJECT_TEAMS_REL}/${PROJECT_DEFAULT_TEAM_ID}/skills`;
/**
 * Leftover OpenCode `skills.paths` scan entry (relative to session cwd).
 * Covers `.workbench/agent/teams/project.local/skills/<id>` at any depth.
 * Always emitted last so hangar skills shadow team/bundle skills.
 */
export const PRISM_OPENCODE_SKILLS_SCAN_REL = ".workbench/agent";

/** OpenCode built-in skills we keep enabled in core but hide from the agent. */
export const OPENCODE_HIDDEN_SKILLS = ["customize-opencode"] as const;

/**
 * Project-root artifacts OpenCode may create when cwd is the project.
 * prismnext never stores skills or OpenCode packages here — config lives in app userData.
 */
const PROJECT_OPENCODE_ARTIFACT_DIRS = [
  ".opencode",
  ".agents",
  ".prismnext/.opencode",
  ".prismnext/opencode",
] as const;

const OPENCODE_GITIGNORE_LINES = [".opencode/", ".agents/"];

export function normalizeProjectRoot(projectRoot: string): string {
  return basename(projectRoot) === ".prismnext" ? dirname(projectRoot) : projectRoot;
}

/** Absolute paths in OpenCode JSON config — forward slashes on all OSes. */
export function normalizeOpencodeConfigPath(absPath: string): string {
  return absPath.replace(/\\/g, "/");
}

/** Project root when path is under `.workbench/agent/`. */
export function projectRootFromAgentPath(absPath: string): string | null {
  const normalized = normalizeOpencodeConfigPath(absPath);
  const marker = "/.workbench/agent/";
  const idx = normalized.toLowerCase().indexOf(marker);
  if (idx === -1) return null;
  return normalized.slice(0, idx);
}

/** Whether a filesystem change should trigger skills OpenCode sync. */
export function isSkillsIntegrationPath(absPath: string, projectRoot: string): boolean {
  const normalized = normalizeOpencodeConfigPath(absPath);
  const homeSkills = normalizeOpencodeConfigPath(homeSkillsDir());
  if (normalized === homeSkills || normalized.startsWith(`${homeSkills}/`)) return true;
  const homeManifest = normalizeOpencodeConfigPath(homeSkillsManifestPath());
  if (normalized === homeManifest) return true;

  const root = normalizeOpencodeConfigPath(normalizeProjectRoot(projectRoot)).replace(/\/$/, "");
  const rootLower = root.toLowerCase();
  const normLower = normalized.toLowerCase();
  if (!normLower.startsWith(rootLower + "/") && normLower !== rootLower) return false;

  const rel = normalized.slice(root.length).replace(/^\//, "");
  const prefix = PRISM_LOCAL_SKILLS_REL.replace(/\\/g, "/");
  return rel === prefix || rel.startsWith(`${prefix}/`);
}

/** True when the path is the workbench skills manifest (not a skill folder). */
export function isSkillsManifestPath(absPath: string, _projectRoot?: string): boolean {
  return normalizeOpencodeConfigPath(absPath) === normalizeOpencodeConfigPath(homeSkillsManifestPath());
}

/** Re-export — legacy id stripped from manifests on read (Core ≠ install library). */
export { PRISM_CURATED_SOURCE_ID };

export type SkillLibrarySourceKind = "bundled" | "remote" | "github";

/** Hangar teams where user-created / source-installed skills live. */
function isHangarSkillTeam(teamId: string): boolean {
  return isProjectLocalTeamId(teamId) || teamId === MY_CONTENT_TEAM_ID;
}

export interface SkillLibrarySource {
  id: string;
  kind: SkillLibrarySourceKind;
  /** Normalized index.json URL for registry (`remote`) sources. */
  url?: string;
  /** GitHub `owner/repo` for `github` sources. */
  repo?: string;
  ref?: string;
  subPath?: string;
  /** When true, skills from this source appear in Skill library UI. */
  connected: boolean;
}

export interface SkillsManifest {
  /** @deprecated 启停已迁入 teams.json assetEnabled（R10）；仅为迁移输入保留读取 */
  disabled?: string[];
  /** @deprecated migrated to `sources` on read */
  registryUrls?: string[];
  sources?: SkillLibrarySource[];
  installs?: SkillInstallRecord[];
}

export interface SkillLibrarySourceInfo extends SkillLibrarySource {
  name: string;
  description: string;
  removable: boolean;
}

export interface InstalledSkillInfo {
  /** 全局唯一身份（`${teamId}:${contentId}`）；启停/删除按 FQID 操作 */
  fqid: string;
  /** pack 内 id（目录名；OpenCode 的技能名） */
  id: string;
  name: string;
  description: string;
  /** local 内容为项目相对路径；pack 内容为绝对路径（仅供展示/打开） */
  skillDirRel: string;
  enabled: boolean;
  /** o200k_base BPE estimate of SKILL.md body */
  tokenCount: number;
  installOrigin?: import("../../shared/skill-install-types").SkillInstallOrigin;
  /**
   * 来源（§5.6.2）：local 且有 install 记录 → "registry"；local 无记录 →
   * "custom"；core pack → "bundled"；其余 pack → "plugin"（badge 显示 pack 名）。
   */
  origin: "bundled" | "registry" | "custom" | "plugin";
  /** origin === "plugin" 时的 pack 展示名（badge 用） */
  originTeamName?: string;
  /** 是否可删除（= local 内容；pack 内容只能禁用，结构上杜绝误删） */
  removable: boolean;
}

export function readSkillsManifest(_projectRoot?: string): SkillsManifest {
  const path = homeSkillsManifestPath();
  if (!existsSync(path)) {
    return { disabled: [], sources: defaultLibrarySources(), installs: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as SkillsManifest;
    return {
      disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [],
      sources: normalizeLibrarySources(parsed),
      installs: Array.isArray(parsed.installs) ? parsed.installs : [],
    };
  } catch {
    return { disabled: [], sources: defaultLibrarySources(), installs: [] };
  }
}

function defaultLibrarySources(): SkillLibrarySource[] {
  // No built-in “curated = Core” source — Core skills ship with the Core team.
  // Users add GitHub / registry sources and install copies into hangars.
  return [];
}

function sourceIdForUrl(url: string): string {
  return `remote:${url}`;
}

function sourceIdForGitHub(repo: string, ref: string): string {
  return `github:${repo}@${ref}`;
}

function displayNameForSource(source: SkillLibrarySource): { name: string; description: string } {
  if (source.kind === "bundled") {
    return {
      name: source.id,
      description: "Legacy built-in source (removed — Core skills live on the Core team)",
    };
  }
  if (source.kind === "github") {
    const repo = source.repo ?? "GitHub";
    const ref = source.ref ?? "main";
    return {
      name: repo.split("/").pop() ?? repo,
      description: `GitHub · ${repo} · ${ref}`,
    };
  }
  const card = libraryCardForRegistryUrl(source.url ?? "");
  return { name: card.name, description: card.description };
}

export function normalizeLibrarySources(manifest: SkillsManifest): SkillLibrarySource[] {
  let sources: SkillLibrarySource[] = [];

  if (Array.isArray(manifest.sources) && manifest.sources.length > 0) {
    sources = manifest.sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      url: s.url,
      repo: s.repo,
      ref: s.ref,
      subPath: s.subPath,
      connected: s.connected !== false,
    }));
  } else if (Array.isArray(manifest.registryUrls)) {
    sources = manifest.registryUrls
      .filter((u) => typeof u === "string" && u.trim())
      .map((url) => ({
        id: sourceIdForUrl(url.trim()),
        kind: "remote" as const,
        url: url.trim(),
        connected: true,
      }));
  }

  // Drop legacy “prismnext Curated” (= Core pack mirror). Core skills are not
  // an install-library catalog anymore.
  return sources.filter(
    (s) => s.kind !== "bundled" && s.id !== PRISM_CURATED_SOURCE_ID,
  );
}

export function activeRemoteRegistryUrls(sources: SkillLibrarySource[]): string[] {
  return sources
    .filter((s) => s.kind === "remote" && s.connected && s.url?.trim())
    .map((s) => s.url!.trim());
}

/** @deprecated Always false — bundled curated library removed. */
export function isBundledLibraryConnected(_sources: SkillLibrarySource[]): boolean {
  return false;
}

export function listLibrarySources(projectRoot: string): SkillLibrarySourceInfo[] {
  const sources = readSkillsManifest(projectRoot).sources ?? defaultLibrarySources();
  return sources.map((source) => {
    const { name, description } = displayNameForSource(source);
    return {
      ...source,
      name,
      description,
      removable: source.kind !== "bundled",
    };
  });
}

function persistSources(projectRoot: string, manifest: SkillsManifest, sources: SkillLibrarySource[]): void {
  writeSkillsManifest(projectRoot, {
    disabled: manifest.disabled ?? [],
    sources,
    installs: manifest.installs ?? [],
  });
}

export function recordSkillInstalls(projectRoot: string, entries: SkillInstallRecord[]): void {
  const manifest = readSkillsManifest(projectRoot);
  const installs = [...(manifest.installs ?? [])];
  for (const entry of entries) {
    const index = installs.findIndex((item) => item.skillId === entry.skillId);
    if (index >= 0) installs[index] = entry;
    else installs.push(entry);
  }
  writeSkillsManifest(projectRoot, { ...manifest, installs });
}

export function removeSkillInstallRecord(projectRoot: string, skillId: string): void {
  const manifest = readSkillsManifest(projectRoot);
  const installs = (manifest.installs ?? []).filter((item) => item.skillId !== skillId);
  writeSkillsManifest(projectRoot, { ...manifest, installs });
}

/** 解析技能引用（FQID 原样；裸 id 按 resolver 规则解析）→ local 内容 id；非 local 或不存在 → null */
function resolveHangarSkillId(projectRoot: string, fqidOrBareId: string): string | null {
  const parsed = parseFqid(fqidOrBareId);
  if (parsed) {
    return isHangarSkillTeam(parsed.teamId) ? parsed.contentId : null;
  }
  const fqid = resolveRef(projectRoot, fqidOrBareId, undefined, "skill");
  if (!fqid) return null;
  const resolved = parseFqid(fqid);
  return resolved && isHangarSkillTeam(resolved.teamId) ? resolved.contentId : null;
}

/**
 * Delete a workbench hangar skill (Common Team / leftover project.local id).
 * Pack skills can only be disabled.
 */
export function deleteProjectSkill(projectRoot: string, fqidOrBareId: string): void {
  const localId = resolveHangarSkillId(projectRoot, fqidOrBareId);
  if (!localId) {
    throw new Error(
      `Only workbench user skills can be deleted (disable pack skills instead): ${fqidOrBareId}`,
    );
  }
  const skillDir = homeSkillDir(localId);
  if (existsSync(skillDir)) {
    rmSync(skillDir, { recursive: true, force: true });
  }
  removeSkillInstallRecord(projectRoot, localId);
  setAppAssetEnabled(`${MY_CONTENT_TEAM_ID}:${localId}`, null);
  invalidateCatalog();
}

export function writeSkillsManifest(_projectRoot: string, manifest: SkillsManifest): void {
  ensureWorkbenchHome();
  const path = homeSkillsManifestPath();
  writeFileSync(path, JSON.stringify(manifest, null, 2), "utf-8");
}

/**
 * 项目技能列表 —— 唯一来源 = PackResolver（§5.6.2）：
 * core / firstparty / external packs + Local Pack 的统一视图，
 * enabled 直接取 resolver 的 isAssetActive 判定（D3）。
 */
export function listProjectSkills(projectRoot: string): InstalledSkillInfo[] {
  const manifest = readSkillsManifest(projectRoot);
  const installBySkillId = new Map(
    (manifest.installs ?? []).map((item) => [item.skillId, item.origin]),
  );

  const results: InstalledSkillInfo[] = [];
  for (const skill of listAssets(projectRoot, "skill")) {
    let tokenCount = 0;
    try {
      tokenCount = countPromptTokens(readFileSync(join(skill.dir, "SKILL.md"), "utf-8")).tokenCount;
    } catch {
      // 读不到按 0 处理（目录扫描已确认 SKILL.md 存在，极端竞态才到这里）
    }
    const hangar = isHangarSkillTeam(skill.teamId);
    const installOrigin = hangar ? installBySkillId.get(skill.id) : undefined;
    const skillDirRel = hangar
      ? homeSkillsRel(skill.id)
      : skill.dir;
    results.push({
      fqid: skill.fqid,
      id: skill.id,
      name: skill.name || skill.id,
      description: skill.description || "",
      skillDirRel,
      enabled: skill.enabled,
      tokenCount,
      installOrigin,
      origin: hangar
        ? installOrigin
          ? "registry"
          : "custom"
        : skill.teamId === CORE_TEAM_ID
          ? "bundled"
          : "plugin",
      originTeamName:
        !hangar && skill.teamId !== CORE_TEAM_ID ? skill.origin.teamName : undefined,
      removable: skill.editable,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 逐项启停 —— 唯一状态操作 = teams.json assetEnabled（§5.6.2 / D3）。
 * FQID 原样使用；裸 id 按 resolver 规则解析（core → 全局唯一）。
 * 返回解析后的 FQID（未命中 → null）。
 */
export function setSkillContentEnabled(
  projectRoot: string,
  fqidOrBareId: string,
  enabled: boolean,
): string | null {
  const fqid = parseFqid(fqidOrBareId)
    ? fqidOrBareId
    : resolveRef(projectRoot, fqidOrBareId, undefined, "skill");
  if (!fqid) return null;
  setAppAssetEnabled(fqid, enabled ? true : false);
  return fqid;
}

export interface SkillPermissionScope {
  /** Active chat team — auto-available skills come from its skills roster. */
  teamId?: string | null;
  /** Bare skill ids explicitly invoked this turn (slash `/` escape hatch). */
  extraAllowIds?: string[];
}

/**
 * Compute which skills should be denied in OpenCode config.
 *
 * 1) Disabled assets (D3): bare id denied when no enabled same-name twin.
 * 2) Team scope: enabled skills not on the active team's skills allowlist
 *    (own-team + `+` foreign) are denied — unless listed in extraAllowIds
 *    (composer `/` manual invoke).
 */
export function computeProfileSkillDisabled(
  projectRoot: string,
  scope?: SkillPermissionScope,
): string[] {
  const skills = listAssets(projectRoot, "skill");
  const activeIds = new Set(skills.filter((s) => s.enabled).map((s) => s.id));
  const denied = new Set<string>();
  for (const skill of skills) {
    if (!skill.enabled && !activeIds.has(skill.id)) denied.add(skill.id);
  }

  const teamId = scope?.teamId ?? resolveActiveTeam(projectRoot)?.manifest.id ?? null;
  if (teamId) {
    const roster = resolveSkillsRoster(projectRoot, teamId);
    const allowed = new Set<string>();
    for (const entry of roster?.entries ?? []) {
      if (entry.unavailable) continue;
      const bare = parseFqid(entry.fqid)?.contentId ?? entry.fqid;
      if (bare) allowed.add(bare);
    }
    for (const id of scope?.extraAllowIds ?? []) {
      const trimmed = id.trim();
      if (!trimmed) continue;
      allowed.add(parseFqid(trimmed)?.contentId ?? trimmed);
    }
    for (const skill of skills) {
      if (skill.teamId === MY_CONTENT_TEAM_ID && skill.enabled) {
        allowed.add(skill.id);
        if (skill.runtimeName) allowed.add(skill.runtimeName);
      }
    }
    for (const skill of skills) {
      if (!skill.enabled) continue;
      if (!allowed.has(skill.id) && !allowed.has(skill.runtimeName)) {
        denied.add(skill.id);
      }
    }
  }

  return [...denied].sort();
}

export function buildSkillPermissions(disabled: string[]): Record<string, string> {
  const skill: Record<string, string> = { "*": "allow" };
  for (const name of OPENCODE_HIDDEN_SKILLS) {
    skill[name] = "deny";
  }
  for (const name of disabled) {
    if (name.trim()) skill[name.trim()] = "deny";
  }
  return skill;
}

/**
 * Merge skill permission maps for OpenCode config.
 * Never spread a string into an object — that produces {"0":"a",...} and crashes OpenCode.
 *
 * The result is authoritative: only `patch` (prismnext's computed allow/deny map)
 * plus the inherited `*` wildcard survive. Stale deny entries from previous
 * profile whitelists are dropped so skills don't stay blocked forever after
 * the user switches profiles.
 */
export function sanitizeSkillPermissionMap(
  existing: unknown,
  patch: Record<string, string>,
): Record<string, string> {
  const base: Record<string, string> = {};
  if (typeof existing === "string" && existing.trim()) {
    base["*"] = existing.trim();
  } else if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [key, value] of Object.entries(existing as Record<string, unknown>)) {
      if (/^\d+$/.test(key)) continue;
      if (typeof value === "string" && value.trim()) base[key] = value.trim();
    }
  }
  // Preserve only the wildcard from the inherited map; per-skill entries are
  // recomputed from `patch` so stale denies don't linger across profile switches.
  const wildcard = base["*"] ?? "allow";
  return { "*": wildcard, ...patch };
}

/** True when legacy bugs left numeric keys from spreading `"allow"` into an object. */
export function skillPermissionNeedsRepair(existing: unknown): boolean {
  if (typeof existing === "string") return false;
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return false;
  return Object.keys(existing as Record<string, unknown>).some((k) => /^\d+$/.test(k));
}

/** Remove OpenCode runtime dirs from the project tree (never prismnext's storage location). */
export function cleanupProjectOpenCodeArtifacts(projectRoot: string): void {
  const root = normalizeProjectRoot(projectRoot);
  for (const rel of PROJECT_OPENCODE_ARTIFACT_DIRS) {
    const path = join(root, rel);
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
    }
  }
}

/** Keep accidental OpenCode init artifacts out of git when the project uses git. */
export function ensureOpencodeArtifactsGitignored(projectRoot: string): void {
  const root = normalizeProjectRoot(projectRoot);
  // Only touch root .gitignore after the user has initialized git.
  if (!existsSync(join(root, ".git"))) return;
  const gitignorePath = join(root, ".gitignore");
  let content = "";
  if (existsSync(gitignorePath)) {
    try {
      content = readFileSync(gitignorePath, "utf-8");
    } catch {
      return;
    }
  }
  const missing = OPENCODE_GITIGNORE_LINES.filter((line) => !content.includes(line));
  if (missing.length === 0) return;

  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const block =
    "\n# OpenCode runtime artifacts (managed by prismnext, not project source)\n" +
    missing.join("\n") +
    "\n";
  writeFileSync(gitignorePath, content + prefix + block, "utf-8");
}

export interface ProjectSkillsOpencodePatch {
  skillsPaths: string[];
  skillPermissions: Record<string, string>;
}

/**
 * Prepare project skills state for Pi. Skill files are referenced in place —
 * bundled team skills stay in their team dirs; user skills live under
 * `~/.prismnext/skills/<id>`. Pi sessions load these dirs through
 * ClosedResourceLoader. This helper still cleans stray project `.opencode/`
 * artifacts and keeps `.gitignore` entries; it does not write OpenCode config.
 *
 * skills.paths order = OpenCode same-name shadow priority (later wins):
 *   [other teams (id sort)…, core team, .workbench/agent (hangar, highest)]
 * Matches resolver bare-id precedence (project.local > core > others).
 * Disabled / unlicensed teams omit their dirs; per-skill deny uses skillPermissions.
 */
export function syncProjectSkillsIntegration(
  projectRoot: string,
  scope?: SkillPermissionScope,
): {
  skillsCount: number;
  skillsPaths: string[];
  skillPermissions: Record<string, string>;
} {
  const root = normalizeProjectRoot(projectRoot);
  cleanupProjectOpenCodeArtifacts(root);
  ensureOpencodeArtifactsGitignored(root);
  mkdirSync(homeSkillsDir(), { recursive: true });

  // 有激活技能的团队目录（去重）。skills.paths 顺序 = OpenCode 同名遮蔽优先级
  // （later wins），按 §7.5 优先级 rank 降序排列：core（rank 5，最弱）最前，
  // 项目团队（rank 0，最强）最后。这修正了 v1 把 core 排在其他 pack 之后、
  // 等于内置团队反而覆盖用户安装团队的问题（D-9 行为变更）。
  // Paths stay broad so slash `/` can still resolve foreign skills; permission.skill
  // enforces the active-team allowlist (+ extraAllowIds for this turn).
  const teamDirs = new Map<string, string>(); // teamId → teamDir
  const teamMeta = new Map<string, { scope: "app" | "project"; source: TeamSource }>();
  for (const skill of listAssets(root, "skill")) {
    // Project-local skills are covered by the trailing `.workbench/agent` path.
    if (!skill.enabled || isProjectLocalTeamId(skill.teamId)) continue;
    if (!teamDirs.has(skill.teamId)) {
      teamDirs.set(skill.teamId, dirname(dirname(skill.dir)));
      teamMeta.set(skill.teamId, { scope: skill.origin.scope, source: skill.origin.source });
    }
  }
  const orderedPackIds = [...teamDirs.keys()].sort((a, b) => {
    const ma = teamMeta.get(a)!;
    const mb = teamMeta.get(b)!;
    // rank 降序（数字大的在前 = 更通用的排最前，later-wins 下最弱）。
    const d = precedenceRank({ scope: mb.scope, source: mb.source })
      - precedenceRank({ scope: ma.scope, source: ma.source });
    return d !== 0 ? d : a.localeCompare(b);
  });

  const effectiveScope: SkillPermissionScope = {
    teamId: scope?.teamId ?? resolveActiveTeam(root)?.manifest.id ?? null,
    extraAllowIds: scope?.extraAllowIds,
  };
  const disabled = computeProfileSkillDisabled(root, effectiveScope);

  return {
    skillsCount: listProjectSkills(root).length,
    skillsPaths: [
      ...orderedPackIds.map((teamId) => normalizeOpencodeConfigPath(teamDirs.get(teamId)!)),
      PRISM_OPENCODE_SKILLS_SCAN_REL,
    ],
    skillPermissions: buildSkillPermissions(disabled),
  };
}

/** Write a user skill into the workbench hangar (`~/.prismnext/skills/<id>`). */
export function installProjectSkill(
  projectRoot: string,
  skillId: string,
  content: string,
  targetTeamId?: string,
): { teamId: string; dir: string } {
  const root = normalizeProjectRoot(projectRoot);
  const id = skillId.trim();
  if (!id) throw new Error("Skill id is required");
  const tid = (targetTeamId?.trim() || MY_CONTENT_TEAM_ID);
  if (tid === MY_CONTENT_TEAM_ID || tid === PROJECT_DEFAULT_TEAM_ID || isProjectLocalTeamId(tid)) {
    ensureMyContentTeam();
    const dir = homeSkillDir(id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), content, "utf-8");
    invalidateCatalog();
    return { teamId: MY_CONTENT_TEAM_ID, dir };
  }
  const record = getTeamRecord(tid, [root]);
  if (!record) throw new Error(`Target team not found: ${tid}`);
  if (!record.writable) throw new Error(`Target team is read-only: ${tid}`);
  const dir = join(record.dir, "skills", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content, "utf-8");
  invalidateCatalog();
  return { teamId: tid, dir };
}

export async function addSkillLibrarySource(
  projectRoot: string,
  input: string,
): Promise<{
  sources: SkillLibrarySourceInfo[];
  sourceKind: "github" | "registry";
  packageCount: number;
  indexUrl?: string;
}> {
  return addLibrarySourceFromInput(projectRoot, input);
}

export async function addLibrarySourceFromInput(
  projectRoot: string,
  input: string,
): Promise<{
  sources: SkillLibrarySourceInfo[];
  sourceKind: "github" | "registry";
  packageCount: number;
  indexUrl?: string;
}> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Enter a GitHub repository URL or registry hostname.");
  }

  const parsed = parseGitHubInput(trimmed);
  if (parsed) {
    const repo = `${parsed.owner}/${parsed.repo}`;
    const ref = parsed.ref || "main";
    const { packages } = await scanGitHubRepository(parsed);
    const manifest = readSkillsManifest(projectRoot);
    const sources = [...(manifest.sources ?? defaultLibrarySources())];
    const id = sourceIdForGitHub(repo, ref);
    const existing = sources.find((s) => s.id === id);
    if (existing) {
      existing.connected = true;
      existing.repo = repo;
      existing.ref = ref;
      existing.subPath = parsed.subPath;
      existing.kind = "github";
    } else {
      sources.push({
        id,
        kind: "github",
        repo,
        ref,
        subPath: parsed.subPath,
        connected: true,
      });
    }
    persistSources(projectRoot, manifest, sources);
    syncProjectSkillsIntegration(projectRoot);
    return {
      sources: listLibrarySources(projectRoot),
      sourceKind: "github",
      packageCount: packages.length,
    };
  }

  const validation = await validateRegistryIndex(trimmed);
  const manifest = readSkillsManifest(projectRoot);
  const sources = [...(manifest.sources ?? defaultLibrarySources())];
  const url = validation.indexUrl;
  const existing = sources.find((s) => s.kind === "remote" && s.url === url);
  if (existing) {
    existing.connected = true;
  } else {
    sources.push({
      id: sourceIdForUrl(url),
      kind: "remote",
      url,
      connected: true,
    });
  }
  persistSources(projectRoot, manifest, sources);
  syncProjectSkillsIntegration(projectRoot);
  return {
    sources: listLibrarySources(projectRoot),
    sourceKind: "registry",
    packageCount: validation.skillCount,
    indexUrl: url,
  };
}

export function removeSkillLibrarySource(projectRoot: string, sourceId: string): SkillLibrarySourceInfo[] {
  const manifest = readSkillsManifest(projectRoot);
  const sources = (manifest.sources ?? defaultLibrarySources()).filter((s) => s.id !== sourceId);
  persistSources(projectRoot, manifest, sources);
  syncProjectSkillsIntegration(projectRoot);
  return listLibrarySources(projectRoot);
}

export function setSkillLibrarySourceConnected(
  projectRoot: string,
  sourceId: string,
  connected: boolean,
): SkillLibrarySourceInfo[] {
  const manifest = readSkillsManifest(projectRoot);
  const sources = [...(manifest.sources ?? defaultLibrarySources())];
  const target = sources.find((s) => s.id === sourceId);
  if (!target) {
    throw new Error(`Skill library source not found: ${sourceId}`);
  }
  target.connected = connected;
  persistSources(projectRoot, manifest, sources);
  syncProjectSkillsIntegration(projectRoot);
  return listLibrarySources(projectRoot);
}

/** @deprecated use addSkillLibrarySource */
export async function connectSkillRegistry(projectRoot: string, registryUrl: string): Promise<string[]> {
  const result = await addSkillLibrarySource(projectRoot, registryUrl);
  return activeRemoteRegistryUrls(
    result.sources.map(({ id, kind, url, connected }) => ({
      id,
      kind,
      url,
      connected,
    })),
  );
}

/** @deprecated use setSkillLibrarySourceConnected(..., false) */
export function disconnectSkillRegistry(projectRoot: string, registryUrl: string): string[] {
  const manifest = readSkillsManifest(projectRoot);
  const sources = manifest.sources ?? defaultLibrarySources();
  const target = sources.find((s) => s.kind === "remote" && s.url === registryUrl.trim());
  if (target) {
    return activeRemoteRegistryUrls(
      setSkillLibrarySourceConnected(projectRoot, target.id, false).map(
        ({ id, kind, url, connected }) => ({ id, kind, url, connected }),
      ),
    );
  }
  return activeRemoteRegistryUrls(sources);
}

/** @deprecated use listLibrarySources */
export function listConnectedRegistries(projectRoot: string): string[] {
  const sources = readSkillsManifest(projectRoot).sources ?? defaultLibrarySources();
  return activeRemoteRegistryUrls(sources);
}
