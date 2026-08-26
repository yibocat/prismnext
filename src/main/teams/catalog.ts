/**
 * catalog.ts — team root discovery and directory scanning (design 2026-08-10 §6.1).
 *
 * Answers only "what teams exist on disk and what assets does each contain".
 * Install/enable/override state lives in state-app/state-project; semantic
 * resolution lives in resolver.ts.
 *
 * Four roots, each tagged with scope + source:
 *   bundled  resources/teams/                    (app, core/bundled; read-only)
 *   pro      <proPackageDir>/<teamsRoot>/        (app, pro; read-only, license-gated)
 *   user     ~/.prismnext/teams/                 (app, user; writable)
 *   project  <projectRoot>/.workbench/agent/teams/ (project, user; writable)
 *
 * Dual layout (T0 froze the on-disk format; T6 migrates it): the new layout
 * Canonical layout: team.json + orchestrators/<id>/ + subagents/ (+ skills/commands).
 * Legacy fallback only: plugin.json + experts/ (still readable; do not author new packs this way).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAppPath, getResourcesPath } from "../app/paths";
import type {
  AssetKind,
  Fqid,
  McpServerDef,
  RosterSpec,
  TeamManifest,
  TeamScope,
  TeamSource,
} from "../../shared/teams/types";
import type { OrchestratorDefV2, SubagentDefV2 } from "../../shared/teams/view";
import {
  CORE_TEAM_ID,
  LOCAL_TEAM_ID,
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
  USER_TEAM_PUBLISHER,
} from "../../shared/teams/types";
import { fmInt, fmString, parseFlatFrontmatter } from "../../shared/teams/frontmatter";
import { createLogger } from "../app/logger";
import { homeSkillsDir } from "../workbench/home";
import { appTeamsDir, projectTeamsDir } from "./scope";

const log = createLogger("teams-catalog");

// ── Scanned asset ─────────────────────────────────────────

export interface ScannedAsset {
  kind: AssetKind;
  id: string;
  name: string;
  description: string;
  /** Asset dir absolute path (command = the .md file path). */
  path: string;
  /** orchestrator/subagent parsed definition (identity fields stripped). */
  definition?: OrchestratorDefV2 | SubagentDefV2;
  /** command parsed payload. */
  command?: {
    template: string;
    action?: string;
    agent?: string;
    model?: string;
    order: number;
  };
}

/** A discovered team before any project-state resolution. */
export interface TeamRecord {
  manifest: TeamManifest;
  scope: TeamScope;
  source: TeamSource;
  dir: string;
  writable: boolean;
  hasOrchestrator: boolean;
  orchestratorId?: string;
  assets: ScannedAsset[];
  mcps: McpServerDef[];
}

// ── Roots ─────────────────────────────────────────────────

/**
 * Candidate roots for first-party `resources/teams` or `resources/commands`.
 * Host is packaged Node: `process.resourcesPath` is empty, so `getAppPath()`
 * (`~/.prismnext-host/current`) must be tried — not only Electron extraResources.
 */
export function bundledResourceDirCandidates(
  kind: "teams" | "commands",
  opts?: {
    override?: string;
    appPath?: string;
    resourcesPath?: string;
    cwd?: string;
  },
): string[] {
  const override = opts?.override?.trim();
  if (override) return [override];
  const resourcesPath = opts?.resourcesPath ?? getResourcesPath();
  const appPath = opts?.appPath ?? getAppPath();
  const cwd = opts?.cwd ?? process.cwd();
  const out: string[] = [];
  const add = (base: string) => {
    if (!base) return;
    const dir = join(base, "resources", kind);
    if (!out.includes(dir)) out.push(dir);
  };
  add(resourcesPath);
  add(appPath);
  add(cwd);
  return out;
}

export function firstExistingDir(candidates: string[], fallback: string): string {
  for (const dir of candidates) {
    if (dir && existsSync(dir)) return dir;
  }
  return fallback;
}

/** first-party teams dir (dev + packaged + Host payload; vitest can override). */
export function getBundledTeamsDir(): string {
  const override = process.env.PRISM_FIRST_PARTY_TEAMS_DIR?.trim()
    ?? process.env.PRISM_FIRST_PARTY_PACKS_DIR?.trim();
  const candidates = bundledResourceDirCandidates("teams", { override });
  return firstExistingDir(
    candidates,
    candidates[candidates.length - 1] ?? join(process.cwd(), "resources", "teams"),
  );
}

/**
 * App-level slash commands dir (`resources/commands/`) — not a team.
 * Packaged beside teams under `resources/`.
 */
export function getBundledAppCommandsDir(): string {
  const override = process.env.PRISM_APP_COMMANDS_DIR?.trim();
  if (override) return override;
  const teamsDir = getBundledTeamsDir();
  // …/resources/teams → …/resources/commands
  const sibling = join(teamsDir, "..", "commands");
  if (existsSync(sibling)) return sibling;
  const candidates = bundledResourceDirCandidates("commands");
  return firstExistingDir(
    candidates,
    candidates[candidates.length - 1] ?? join(process.cwd(), "resources", "commands"),
  );
}

/** External roots registered at runtime (pro packs + test fixtures). */
const externalRoots = new Map<string, { dir: string; source: TeamSource }>();

function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Register an external root (the single registration entry). */
export function registerExternalTeamRoot(dir: string, source: TeamSource = "pro"): void {
  const key = normalizeDir(dir);
  if (externalRoots.has(key)) return;
  externalRoots.set(key, { dir, source });
  invalidateCatalog();
}

export function unregisterExternalTeamRoot(dir: string): void {
  if (externalRoots.delete(normalizeDir(dir))) invalidateCatalog();
}

/** External root dirs (matches the legacy catalog's string[] shape). */
export function listExternalTeamRoots(): string[] {
  return [...externalRoots.values()].map((r) => r.dir);
}

/** Source of a registered external root (default "pro"). */
export function getExternalTeamRootSource(dir: string): TeamSource {
  return externalRoots.get(normalizeDir(dir))?.source ?? "pro";
}

// ── Manifest read + validate ──────────────────────────────

function readManifest(dir: string): TeamManifest | null {
  // New layout wins; legacy plugin.json is the fallback (T0 froze disk format).
  const newPath = join(dir, "team.json");
  const legacyPath = join(dir, "plugin.json");
  const path = existsSync(newPath) ? newPath : existsSync(legacyPath) ? legacyPath : null;
  if (!path) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    log.warn("team manifest parse failed, skipping team", { dir, error: String(err) });
    return null;
  }
  const m = raw as Partial<TeamManifest>;
  if (
    !m ||
    typeof m.id !== "string" ||
    !m.id ||
    typeof m.name !== "string" ||
    typeof m.description !== "string" ||
    typeof m.version !== "string" ||
    (m.tier !== "free" && m.tier !== "pro") ||
    typeof m.publisher !== "string" ||
    !m.publisher
  ) {
    log.warn("team manifest fails schema, skipping team", { dir });
    return null;
  }
  return m as TeamManifest;
}

// ── Asset scanning ────────────────────────────────────────

/**
 * Parse a roster field: accepts a RosterSpec object or a legacy string array.
 * Legacy bare ids (allowedExperts) are lifted to same-team FQIDs (the legacy
 * "same pack first" rule); "$pack" → "@team". The on-disk format stays legacy
 * (T0 froze it); only the in-memory RosterSpec is normalized.
 */
function parseRoster(raw: unknown, teamId: string): RosterSpec | undefined {
  if (!raw) return undefined;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.mode === "all") return { mode: "all" };
    if (o.mode === "list" && Array.isArray(o.members)) {
      return { mode: "list", members: o.members.filter((m): m is string => typeof m === "string") };
    }
    return undefined;
  }
  // Legacy: allowedExperts string[] → list of refs.
  if (Array.isArray(raw)) {
    const members = raw
      .filter((m): m is string => typeof m === "string")
      .map((m) => {
        if (m === "$pack") return "@team";
        // Already an FQID → keep; bare id → same-team FQID.
        return m.includes(":") ? m : `${teamId}:${m}`;
      });
    return { mode: "list", members };
  }
  return undefined;
}

function scanOrchestrator(teamDir: string, teamId: string): { def: ScannedAsset; orchestratorId: string } | null {
  // New layout: orchestrator/ (singular, at most one). Legacy: orchestrators/<id>/.
  const singular = join(teamDir, "orchestrator");
  const legacy = join(teamDir, "orchestrators");
  if (existsSync(singular)) {
    const jsonPath = join(singular, "orchestrator.json");
    if (existsSync(jsonPath)) {
      const def = readAgentDef(jsonPath, "orchestrator", "orchestrator", teamId);
      if (def) return { def, orchestratorId: def.id };
    }
  }
  if (existsSync(legacy)) {
    if (existsSync(singular)) {
      log.warn("team has both orchestrator/ and orchestrators/; orchestrator/ wins", { teamDir });
    }
    const entries = readdirSync(legacy, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (entries.length > 1) {
      log.warn("team has multiple orchestrators/ entries; only the first is used (≤1 lead per team)", {
        teamDir,
        count: entries.length,
      });
    }
    const first = entries[0];
    if (first) {
      const jsonPath = join(legacy, first.name, "orchestrator.json");
      if (existsSync(jsonPath)) {
        const def = readAgentDef(jsonPath, "orchestrator", first.name, teamId);
        if (def) return { def, orchestratorId: first.name };
      }
    }
  }
  return null;
}

function readAgentDef(
  jsonPath: string,
  kind: "orchestrator" | "subagent",
  dirName: string,
  teamId: string,
): (ScannedAsset & { definition: OrchestratorDefV2 | SubagentDefV2 }) | null {
  try {
    const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
    if (raw.id !== undefined && raw.id !== dirName) {
      log.warn("agent json id mismatches dir name; dir name wins", { jsonPath, jsonId: raw.id });
    }
    const base = {
      id: dirName,
      name: typeof raw.name === "string" ? raw.name : dirName,
      description: typeof raw.description === "string" ? raw.description : "",
      model: typeof raw.model === "string" ? raw.model : undefined,
      thoughtLevel: typeof raw.thoughtLevel === "string" ? raw.thoughtLevel : undefined,
      temperature: typeof raw.temperature === "number" ? raw.temperature : undefined,
      permission:
        raw.permission && typeof raw.permission === "object" && !Array.isArray(raw.permission)
          ? (raw.permission as Record<string, unknown>)
          : undefined,
    };
    const definition =
      kind === "orchestrator"
        ? ({
            ...base,
            roster: parseRoster(raw.roster ?? raw.allowedExperts, teamId),
            // Missing allowedSkills / allowedCommands → own-team only.
            skillsRoster:
              parseRoster(raw.skillsRoster ?? raw.allowedSkills, teamId)
              ?? { mode: "list", members: ["@team"] },
            commandsRoster:
              parseRoster(raw.commandsRoster ?? raw.allowedCommands, teamId)
              ?? { mode: "list", members: ["@team"] },
          } as OrchestratorDefV2)
        : ({
            ...base,
            modules: Array.isArray(raw.modules) ? (raw.modules as string[]) : undefined,
          } as SubagentDefV2);
    return {
      kind,
      id: dirName,
      name: definition.name,
      description: definition.description,
      path: join(jsonPath, ".."),
      definition,
    };
  } catch (err) {
    log.warn("agent json parse failed, skipping", { jsonPath, error: String(err) });
    return null;
  }
}

function scanSubagents(teamDir: string, teamId: string): ScannedAsset[] {
  // New layout: subagents/. Legacy: experts/.
  const newRoot = join(teamDir, "subagents");
  const legacyRoot = join(teamDir, "experts");
  const root = existsSync(newRoot) ? newRoot : existsSync(legacyRoot) ? legacyRoot : null;
  if (!root) return [];
  const out: ScannedAsset[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const jsonPath = join(root, entry.name, "subagent.json");
    const legacyJsonPath = join(root, entry.name, "expert.json");
    const path = existsSync(jsonPath) ? jsonPath : existsSync(legacyJsonPath) ? legacyJsonPath : null;
    if (!path) continue;
    const def = readAgentDef(path, "subagent", entry.name, teamId);
    if (def) out.push(def);
  }
  return out;
}

function scanSkillRoot(root: string): ScannedAsset[] {
  if (!existsSync(root)) return [];
  const out: ScannedAsset[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const skillMdPath = join(dir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;
    let name = entry.name;
    let description = "";
    try {
      const parsed = parseFlatFrontmatter(readFileSync(skillMdPath, "utf-8"));
      if (parsed) {
        name = fmString(parsed.fm, "name") ?? entry.name;
        description = fmString(parsed.fm, "description") ?? "";
      }
    } catch (err) {
      log.warn("SKILL.md read failed, treating as bare dir", { dir, error: String(err) });
    }
    out.push({ kind: "skill", id: entry.name, name, description, path: dir });
  }
  return out;
}

function scanSkills(teamDir: string): ScannedAsset[] {
  return scanSkillRoot(join(teamDir, "skills"));
}

function skillRootFingerprint(root: string): string {
  if (!existsSync(root)) return "missing";
  const parts: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = join(root, entry.name, "SKILL.md");
    try {
      const st = statSync(skillMd);
      parts.push(`${entry.name}:${st.mtimeMs}:${st.size}`);
    } catch {
      // vanished SKILL.md is part of the fingerprint change
    }
  }
  return parts.sort().join("|");
}

/** User skills live in `~/.prismnext/skills/<id>` and hang off Common Team. */
function attachHomeUserSkills(teams: TeamRecord[], byId: Map<string, TeamRecord>): void {
  const extras = scanSkillRoot(homeSkillsDir());
  const existing = byId.get(MY_CONTENT_TEAM_ID);
  if (existing) {
    const have = new Set(existing.assets.filter((a) => a.kind === "skill").map((a) => a.id));
    for (const skill of extras) {
      if (!have.has(skill.id)) existing.assets.push(skill);
    }
    return;
  }
  if (extras.length === 0) return;
  const record: TeamRecord = {
    manifest: {
      id: MY_CONTENT_TEAM_ID,
      name: "Common Team",
      description: "Workbench user skills.",
      version: "1.0.0",
      packFormatVersion: 1,
      tier: "free",
      publisher: USER_TEAM_PUBLISHER,
    },
    scope: "app",
    source: "user",
    dir: homeSkillsDir(),
    writable: true,
    hasOrchestrator: false,
    orchestratorId: undefined,
    assets: extras,
    mcps: [],
  };
  teams.push(record);
  byId.set(MY_CONTENT_TEAM_ID, record);
}

/** Scan `*.md` command files under a commands directory (team or app). */
export function scanCommandMarkdownDir(root: string): ScannedAsset[] {
  if (!existsSync(root)) return [];
  const out: ScannedAsset[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const id = entry.name.replace(/\.md$/, "");
    const filePath = join(root, entry.name);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = parseFlatFrontmatter(raw);
      out.push({
        kind: "command",
        id,
        name: id,
        description: parsed ? (fmString(parsed.fm, "description") ?? "") : "",
        path: filePath,
        command: {
          template: parsed ? parsed.body : raw.trim(),
          action: parsed ? fmString(parsed.fm, "action") : undefined,
          agent: parsed ? fmString(parsed.fm, "agent") : undefined,
          model: parsed ? fmString(parsed.fm, "model") : undefined,
          order: parsed ? fmInt(parsed.fm, "order", 1000) : 1000,
        },
      });
    } catch (err) {
      log.warn("command read failed, skipping", { filePath, error: String(err) });
    }
  }
  return out;
}

function scanCommands(teamDir: string): ScannedAsset[] {
  return scanCommandMarkdownDir(join(teamDir, "commands"));
}

/** App-level commands (`resources/commands/`). FQIDs use {@link APP_COMMANDS_OWNER_ID}. */
export function listAppCommandAssets(): ScannedAsset[] {
  return scanCommandMarkdownDir(getBundledAppCommandsDir());
}

/** Read a team's mcp.json (McpServerDef[]; the single v2 MCP schema). */
export function readTeamMcpServers(teamDir: string): McpServerDef[] {
  const path = join(teamDir, "mcp.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (m): m is McpServerDef =>
        m && typeof m.id === "string" && typeof m.name === "string" && !!m.transport,
    );
  } catch (err) {
    log.warn("mcp.json parse failed, treating as empty", { teamDir, error: String(err) });
    return [];
  }
}

// ── Team assembly ─────────────────────────────────────────

function classifySource(manifest: TeamManifest, rootSource: TeamSource): TeamSource {
  if (manifest.id === CORE_TEAM_ID) return "core";
  return rootSource;
}

function scanTeam(
  dir: string,
  scope: TeamScope,
  rootSource: TeamSource,
  writable: boolean,
  idOverride?: string,
): TeamRecord | null {
  // idOverride (the legacy Local Pack surfaced as project.local) synthesizes a
  // manifest when the dir has no team.json/plugin.json.
  let manifest = readManifest(dir);
  if (!manifest && idOverride) {
    manifest = {
      id: idOverride,
      name: "This project",
      description: "Skills, agents and commands created in this project.",
      version: "0.0.0",
      packFormatVersion: 1,
      tier: "free",
      publisher: "user",
    };
  }
  if (!manifest) return null;
  // teamId must equal the directory name (unless overridden for the fallback).
  const dirName = dir.replace(/\\/g, "/").split("/").pop()!;
  if (!idOverride && manifest.id !== dirName) {
    log.warn("teamId mismatches dir name, skipping team", { dir, teamId: manifest.id, dirName });
    return null;
  }
  if (idOverride && manifest.id !== idOverride) {
    // A real manifest inside the fallback dir disagrees with the override → skip.
    log.warn("fallback dir manifest id mismatches the override, skipping", { dir, manifestId: manifest.id, idOverride });
    return null;
  }
  manifest = { ...manifest, id: idOverride ?? manifest.id };
  // Reserved ids may only come from their proper root: prismnext.core from the
  // bundled root, project.local from a project root. Anything else is rejected.
  if (manifest.id === CORE_TEAM_ID && rootSource !== "bundled") {
    log.warn("non-bundled root declares the reserved core id, rejecting", { dir });
    return null;
  }
  if (manifest.id === PROJECT_DEFAULT_TEAM_ID && scope !== "project") {
    log.warn("non-project root declares the reserved project.local id, rejecting", { dir });
    return null;
  }

  const orchestrator = scanOrchestrator(dir, manifest.id);
  const subagents = scanSubagents(dir, manifest.id);
  const skills = scanSkills(dir);
  const commands = scanCommands(dir);
  const assets: ScannedAsset[] = [
    ...(orchestrator ? [orchestrator.def] : []),
    ...subagents,
    ...skills,
    ...commands,
  ];
  const mcps = readTeamMcpServers(dir);

  return {
    manifest,
    scope,
    source: classifySource(manifest, rootSource),
    dir,
    writable,
    hasOrchestrator: orchestrator !== null,
    orchestratorId: orchestrator?.orchestratorId,
    assets,
    mcps,
  };
}

// ── Cache ─────────────────────────────────────────────────

interface CatalogSnapshot {
  fingerprint: string;
  teams: TeamRecord[];
  byId: Map<string, TeamRecord>;
}

let cache: CatalogSnapshot | null = null;

function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/** Fingerprint a team dir from the mtimes/sizes of its manifest + asset files. */
function teamDirFingerprint(teamDir: string): string {
  const parts: string[] = [];
  const addFile = (p: string) => {
    try {
      const st = statSync(p);
      parts.push(`${p}:${st.mtimeMs}:${st.size}`);
    } catch {
      // A vanished file is part of the fingerprint change.
    }
  };
  addFile(join(teamDir, "team.json"));
  addFile(join(teamDir, "plugin.json"));
  for (const sub of ["orchestrator", "orchestrators", "subagents", "experts"]) {
    const root = join(teamDir, sub);
    if (!existsSync(root)) continue;
    for (const e of readdirSync(root)) {
      for (const json of ["orchestrator.json", "subagent.json", "expert.json"]) {
        addFile(join(root, e, json));
      }
      addFile(join(root, e, "instructions.md"));
    }
  }
  const skillsRoot = join(teamDir, "skills");
  if (existsSync(skillsRoot)) {
    for (const e of readdirSync(skillsRoot)) addFile(join(skillsRoot, e, "SKILL.md"));
  }
  const commandsRoot = join(teamDir, "commands");
  if (existsSync(commandsRoot)) {
    for (const e of readdirSync(commandsRoot)) {
      if (e.endsWith(".md")) addFile(join(commandsRoot, e));
    }
  }
  addFile(join(teamDir, "mcp.json"));
  return parts.sort().join("|");
}

function appCommandsDirFingerprint(): string {
  const root = getBundledAppCommandsDir();
  if (!existsSync(root)) return "app-commands:missing";
  const parts: string[] = [];
  for (const entry of readdirSync(root)) {
    if (!entry.endsWith(".md")) continue;
    try {
      const st = statSync(join(root, entry));
      parts.push(`${entry}:${st.mtimeMs}:${st.size}`);
    } catch {
      /* ignore */
    }
  }
  return `app-commands:${parts.sort().join(",")}`;
}

function computeFingerprint(projectRoots: string[]): string {
  const roots = [
    getBundledTeamsDir(),
    ...listExternalTeamRoots(),
    appTeamsDir(),
    ...projectRoots.map((r) => projectTeamsDir(r)),
  ];
  const parts: string[] = [appCommandsDirFingerprint()];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      parts.push(teamDirFingerprint(join(root, entry.name)));
    }
  }
  parts.push(`home-skills:${skillRootFingerprint(homeSkillsDir())}`);
  return djb2(parts.sort().join("||"));
}

function buildSnapshot(projectRoots: string[]): CatalogSnapshot {
  const teams: TeamRecord[] = [];
  const byId = new Map<string, TeamRecord>();

  const roots: Array<{ dir: string; scope: TeamScope; source: TeamSource; writable: boolean }> = [
    { dir: getBundledTeamsDir(), scope: "app", source: "bundled", writable: false },
    ...listExternalTeamRoots().map((dir) => {
      const source = getExternalTeamRootSource(dir);
      return {
        dir,
        scope: "app" as const,
        source,
        // Home user-created roots are writable; pro/registry roots are not.
        writable: source === "user",
      };
    }),
    { dir: appTeamsDir(), scope: "app", source: "user", writable: true },
    ...projectRoots.map((r) => ({
      dir: projectTeamsDir(r),
      scope: "project" as const,
      source: "user" as const,
      writable: true,
    })),
  ];

  for (const root of roots) {
    if (!existsSync(root.dir)) continue;
    for (const entry of readdirSync(root.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const team = scanTeam(join(root.dir, entry.name), root.scope, root.source, root.writable);
      if (!team) continue;
      if (byId.has(team.manifest.id)) {
        log.warn("team id conflict, later one ignored", {
          teamId: team.manifest.id,
          dir: team.dir,
          kept: byId.get(team.manifest.id)!.dir,
        });
        continue;
      }
      teams.push(team);
      byId.set(team.manifest.id, team);
    }
  }

  // User-authored skills live in ~/.prismnext/skills/. Paper-side hangar
  // folders are not a write target and are not listed as skills.
  for (const team of teams) {
    if (team.manifest.id === PROJECT_DEFAULT_TEAM_ID || team.manifest.id === LOCAL_TEAM_ID) {
      team.assets = team.assets.filter((asset) => asset.kind !== "skill");
    }
  }
  attachHomeUserSkills(teams, byId);

  teams.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  return { fingerprint: computeFingerprint(projectRoots), teams, byId };
}

function getCatalog(projectRoots: string[]): CatalogSnapshot {
  const fingerprint = computeFingerprint(projectRoots);
  if (cache && cache.fingerprint === fingerprint) return cache;
  cache = buildSnapshot(projectRoots);
  return cache;
}

export function invalidateCatalog(): void {
  cache = null;
}

/** Current fingerprint (part of the resolver viewKey). */
export function currentCatalogFingerprint(projectRoots: string[] = []): string {
  return getCatalog(projectRoots).fingerprint;
}

// ── Queries ───────────────────────────────────────────────

/** All discovered teams (app + the given project roots), before state resolution. */
export function scanAllTeams(projectRoots: string[] = []): TeamRecord[] {
  return getCatalog(projectRoots).teams;
}

export function getTeamRecord(teamId: string, projectRoots: string[] = []): TeamRecord | null {
  return getCatalog(projectRoots).byId.get(teamId) ?? null;
}
