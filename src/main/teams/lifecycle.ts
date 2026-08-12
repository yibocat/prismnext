/**
 * lifecycle.ts — the ONLY module allowed to write Team state and trigger
 * notifyTeamsChanged (design §9, E4). IPC handlers are thin shells over this.
 *
 * Scope rules:
 *   install / uninstall       → app-level (no projectRoot)
 *   setTeamEnabled / setAssetEnabled / saveAssetOverride
 *                             → app or project layer per `scope`
 *   create / delete           → writable teams only, at the layer matching scope
 *   promote / demote / moveAsset → physical move + FQID rewrite + reference patch
 *   setActiveTeam             → session (renderer) / project / app layer
 *
 * Every mutation ends with notifyTeamsChanged so a missed invalidation (B2) is
 * structurally impossible.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CORE_TEAM_ID,
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
  USER_TEAM_PUBLISHER,
  type AssetKind,
  type AssetOverride,
  type Fqid,
  type TeamScope,
} from "../../shared/teams/types";
import { parseFqid, toFqid } from "../../shared/teams/state";
import {
  ICON_IMAGE_FILENAME,
  iconSpecToJSON,
  normalizeIconSpec,
  type IconSpec,
} from "../../shared/icon-spec";
import { createLogger } from "../services/logger";
import { _registeredRoots } from "../services/active-project-roots";
import { licenseGrants } from "../services/teams-license";
import { getTeamRecord, invalidateCatalog, scanAllTeams } from "./catalog";
import {
  getAsset,
  getTeam,
  isAssetActive,
  listTeams,
  notifyTeamsChanged,
  resolveRoster,
} from "./resolver";
import { isMyContentLeadFqid, isMyContentTeamId } from "./my-content";
import {
  readAppTeamsState,
  saveAppAssetOverride,
  setAppAssetEnabled,
  setAppDefaultTeam,
  setAppTeamEnabled,
  writeAppTeamsState,
} from "./state-app";
import {
  readProjectTeamsState,
  saveProjectAssetOverride,
  setProjectAssetEnabled,
  setProjectDefaultTeam,
  setProjectTeamEnabled,
  writeProjectTeamsState,
} from "./state-project";
import { appTeamsDir, canReference, projectTeamsDir } from "./scope";

const log = createLogger("teams-lifecycle", "agent");

export interface TeamMutationResult {
  applied?: boolean;
  /** Suggested team to make active after install/enable (has a lead agent). */
  suggestedActiveTeam?: string;
  /** The previous active team was moved back to core (UI hint). */
  defaultMovedTo?: string;
}

// ── Helpers ───────────────────────────────────────────────

function teamRecordOrThrow(teamId: string, projectRoot?: string) {
  const record = getTeamRecord(teamId, projectRoot ? [projectRoot] : []);
  if (!record) throw new Error(`Team not found in catalog: ${teamId}`);
  return record;
}

/** Suggest making a team active when it gains a usable lead and no non-core default exists. */
function activeTeamSuggestion(teamId: string, projectRoot?: string): string | undefined {
  const record = teamRecordOrThrow(teamId, projectRoot);
  if (!record.hasOrchestrator) return undefined;
  const currentDefault =
    (projectRoot ? readProjectTeamsState(projectRoot).defaultTeam : undefined) ??
    readAppTeamsState().defaultTeam;
  if (currentDefault && currentDefault !== CORE_TEAM_ID) return undefined;
  if (projectRoot) {
    const view = getTeam(projectRoot, teamId);
    if (!view?.enabled || !view.hasOrchestrator) return undefined;
  }
  return teamId;
}

/**
 * True when `teamId` is currently a usable lead team in `projectRoot` and no
 * other installed+enabled lead remains. My Content's chat lead counts — Core
 * may be removed whenever My Content (or any other lead team) is available.
 */
function isLastUsableLeadTeam(projectRoot: string, teamId: string): boolean {
  const teams = listTeams(projectRoot);
  const self = teams.find((t) => t.manifest.id === teamId);
  if (!self?.installed || !self.enabled || !self.hasOrchestrator) return false;
  return !teams.some(
    (t) =>
      t.manifest.id !== teamId
      && t.installed
      && t.enabled
      && t.hasOrchestrator,
  );
}

/**
 * When reassigning a cleared project/app default: prefer Core (still the
 * default research suite when installed), then My Content (always-on safety net).
 */
function fallbackLeadTeamId(excluding?: string): string | undefined {
  const appUninstalled = readAppTeamsState().uninstalled ?? [];
  const candidates = [CORE_TEAM_ID, MY_CONTENT_TEAM_ID];
  for (const id of candidates) {
    if (id === excluding) continue;
    if (id === CORE_TEAM_ID && appUninstalled.includes(CORE_TEAM_ID)) continue;
    const record = getTeamRecord(id);
    if (record?.hasOrchestrator) return id;
  }
  return undefined;
}

function assertMyContentImmutable(teamId: string, action: string): void {
  if (!isMyContentTeamId(teamId)) return;
  throw new Error(
    `Common Team is the always-on safety-net team and cannot be ${action}.`,
  );
}

function assertCanRemoveLeadTeam(
  teamId: string,
  action: "uninstall" | "disable",
  projectRoot?: string,
): void {
  assertMyContentImmutable(teamId, action === "uninstall" ? "uninstalled" : "disabled");
  const roots = projectRoot ? [projectRoot] : [..._registeredRoots()];
  // No open project → still refuse removing the last app-level lead (My Content
  // normally covers this; keep the guard for broken/missing installs).
  if (roots.length === 0) {
    const record = getTeamRecord(teamId);
    if (!record?.hasOrchestrator) return;
    const myContent = getTeamRecord(MY_CONTENT_TEAM_ID);
    if (teamId !== MY_CONTENT_TEAM_ID && myContent?.hasOrchestrator) return;
    const state = readAppTeamsState();
    const otherInstalledLead =
      (myContent?.hasOrchestrator && teamId !== MY_CONTENT_TEAM_ID)
      || state.installed.some((r) => {
        if (r.teamId === teamId) return false;
        const other = getTeamRecord(r.teamId);
        return Boolean(other?.hasOrchestrator);
      });
    if (!otherInstalledLead && (teamId === CORE_TEAM_ID || record.source === "core")) {
      throw new Error(
        action === "uninstall"
          ? "Cannot uninstall the last team with a lead agent. Install or create another lead team first."
          : "Cannot disable the last team with a lead agent. Enable or create another lead team first.",
      );
    }
    return;
  }
  for (const root of roots) {
    if (!isLastUsableLeadTeam(root, teamId)) continue;
    throw new Error(
      action === "uninstall"
        ? "Cannot uninstall the last team with a lead agent. Install or create another lead team first."
        : "Cannot disable the last team with a lead agent. Enable or create another lead team first.",
    );
  }
}

function pruneProjectTeamReferences(projectRoot: string, teamId: string): void {
  const state = readProjectTeamsState(projectRoot);
  const belongsToTeam = (key: string) => parseFqid(key)?.teamId === teamId;
  const fallback = state.defaultTeam === teamId ? fallbackLeadTeamId(teamId) : undefined;
  writeProjectTeamsState(projectRoot, {
    ...state,
    defaultTeam:
      state.defaultTeam === teamId
        ? fallback
        : state.defaultTeam,
    teamEnabled: Object.fromEntries(Object.entries(state.teamEnabled).filter(([key]) => key !== teamId)),
    assetEnabled: Object.fromEntries(Object.entries(state.assetEnabled).filter(([key]) => !belongsToTeam(key))),
    assetOverrides: Object.fromEntries(
      Object.entries(state.assetOverrides).filter(([key]) => !belongsToTeam(key)),
    ),
  });
}

function projectReferencesTeam(projectRoot: string, teamId: string): boolean {
  const state = readProjectTeamsState(projectRoot);
  if (state.defaultTeam === teamId || teamId in state.teamEnabled) return true;
  const isTeamAsset = (key: string) => parseFqid(key)?.teamId === teamId;
  return Object.keys(state.assetEnabled).some(isTeamAsset)
    || Object.keys(state.assetOverrides).some(isTeamAsset);
}

// ── Install / uninstall (app-level) ───────────────────────

/** Install a team at app level (visible to all projects). No projectRoot. */
export function installTeam(teamId: string): TeamMutationResult {
  const record = teamRecordOrThrow(teamId);
  if (record.manifest.tier === "pro" && !licenseGrants(record.manifest.feature)) {
    throw new Error(`Team requires an active Pro license: ${teamId}`);
  }
  const state = readAppTeamsState();
  const uninstalled = state.uninstalled ?? [];
  // Core is installed-by-default; "install" clears the opt-out list.
  if (record.source === "core") {
    const wasOut = uninstalled.includes(teamId);
    if (wasOut) {
      writeAppTeamsState({
        ...state,
        uninstalled: uninstalled.filter((id) => id !== teamId),
      });
    }
    notifyTeamsChanged();
    return { applied: wasOut, suggestedActiveTeam: activeTeamSuggestion(teamId) };
  }
  const already = state.installed.some((r) => r.teamId === teamId);
  if (!already) {
    writeAppTeamsState({
      ...state,
      installed: [...state.installed, { teamId, installedAt: new Date().toISOString() }],
      uninstalled: uninstalled.filter((id) => id !== teamId),
    });
  }
  notifyTeamsChanged();
  return { applied: !already, suggestedActiveTeam: activeTeamSuggestion(teamId) };
}

/**
 * Uninstall a team at app level. Zero file deletion — catalog files stay so
 * the team can be re-installed from Browse. Project / user-created teams are
 * rejected (use delete). Core is allowed (opt-out via `uninstalled[]`).
 */
export function uninstallTeam(teamId: string): void {
  if (teamId === PROJECT_DEFAULT_TEAM_ID) {
    throw new Error(`Team cannot be uninstalled: ${teamId}`);
  }
  assertMyContentImmutable(teamId, "uninstalled");
  const record = teamRecordOrThrow(teamId);
  if (record.scope === "project") {
    throw new Error("Project teams are deleted, not uninstalled.");
  }
  if (record.manifest.publisher === USER_TEAM_PUBLISHER) {
    throw new Error("User-created teams are deleted, not uninstalled.");
  }
  // Refuse when this would leave every open project without a lead agent.
  // My Content's chat lead counts as a usable replacement for Core.
  assertCanRemoveLeadTeam(teamId, "uninstall");

  const state = readAppTeamsState();
  const uninstalled = state.uninstalled ?? [];

  if (record.source === "core") {
    if (uninstalled.includes(teamId)) return;
    writeAppTeamsState({
      ...state,
      uninstalled: [...uninstalled, teamId],
      defaultTeam:
        state.defaultTeam === teamId
          ? fallbackLeadTeamId(teamId)
          : state.defaultTeam,
    });
  } else {
    if (!state.installed.some((r) => r.teamId === teamId)) return;
    writeAppTeamsState({
      ...state,
      installed: state.installed.filter((r) => r.teamId !== teamId),
      defaultTeam:
        state.defaultTeam === teamId
          ? fallbackLeadTeamId(teamId)
          : state.defaultTeam,
    });
  }
  for (const projectRoot of _registeredRoots()) {
    pruneProjectTeamReferences(projectRoot, teamId);
  }
  notifyTeamsChanged();
}

// ── Enable / disable (tri-state, app or project layer) ────

/** Set a team's tri-state at the given layer. value=null deletes the key (follow the other layer). */
export function setTeamEnabled(
  teamId: string,
  value: boolean | null,
  scope: TeamScope,
  projectRoot?: string,
): TeamMutationResult {
  if (teamId === PROJECT_DEFAULT_TEAM_ID && value === false) {
    throw new Error(
      "The project team is the always-on project hangar and cannot be disabled.",
    );
  }
  if (value === false) {
    assertMyContentImmutable(teamId, "disabled");
  }
  teamRecordOrThrow(teamId, projectRoot);
  let defaultMovedTo: string | undefined;

  if (value === false) {
    assertCanRemoveLeadTeam(
      teamId,
      "disable",
      scope === "project" ? projectRoot : undefined,
    );
  }

  if (scope === "app") {
    setAppTeamEnabled(teamId, value);
  } else {
    if (!projectRoot) throw new Error("projectRoot is required for project-scope changes");
    setProjectTeamEnabled(projectRoot, teamId, value);
    // Disabling the active team's pack → move default to My Content / Core.
    if (value === false) {
      const current = readProjectTeamsState(projectRoot).defaultTeam;
      if (current === teamId) {
        const next = fallbackLeadTeamId(teamId);
        setProjectDefaultTeam(projectRoot, next ?? null);
        defaultMovedTo = next;
      }
    }
  }

  notifyTeamsChanged(scope === "project" ? projectRoot : undefined);
  return {
    suggestedActiveTeam: value === true ? activeTeamSuggestion(teamId, projectRoot) : undefined,
    defaultMovedTo,
  };
}

/** Set an asset's tri-state at the given layer. */
export function setAssetEnabled(
  fqid: Fqid,
  value: boolean | null,
  scope: TeamScope,
  projectRoot?: string,
): void {
  if (value === false && isMyContentLeadFqid(fqid)) {
    throw new Error("Common Team's chat lead cannot be disabled.");
  }
  if (scope === "app") {
    setAppAssetEnabled(fqid, value);
  } else {
    if (!projectRoot) throw new Error("projectRoot is required for project-scope changes");
    setProjectAssetEnabled(projectRoot, fqid, value);
  }
  notifyTeamsChanged(scope === "project" ? projectRoot : undefined);
}

/** Save an asset override at the given layer (all-undefined patch removes the key). */
export function saveAssetOverride(
  fqid: Fqid,
  patch: AssetOverride,
  scope: TeamScope,
  projectRoot?: string,
): void {
  if (scope === "app") {
    saveAppAssetOverride(fqid, patch);
  } else {
    if (!projectRoot) throw new Error("projectRoot is required for project-scope changes");
    saveProjectAssetOverride(projectRoot, fqid, patch);
  }
  notifyTeamsChanged(scope === "project" ? projectRoot : undefined);
}

// ── Active team ───────────────────────────────────────────

/** Set the active team at the project or app layer. Validates enabled + hasOrchestrator. */
export function setActiveTeam(
  teamId: string,
  scope: "project" | "app",
  projectRoot?: string,
): void {
  if (scope === "project") {
    if (!projectRoot) throw new Error("projectRoot is required for project-scope changes");
    const view = getTeam(projectRoot, teamId);
    if (!view?.enabled || !view.hasOrchestrator) {
      log.warn("setActiveTeam rejected", { teamId, scope, projectRoot, enabled: view?.enabled, hasOrchestrator: view?.hasOrchestrator });
      throw new Error(`Team has no usable lead agent: ${teamId}`);
    }
    setProjectDefaultTeam(projectRoot, teamId);
    log.info("setActiveTeam", {
      teamId,
      scope,
      projectRoot,
      lead: view.orchestratorId,
      teamName: view.manifest.name,
    });
    // defaultTeam write already invalidates the resolver via onProjectTeamsStateWritten.
    // Do NOT call notifyTeamsChanged here — that schedules skills/subagents sync +
    // OpenCode reload, which is for content/enablement changes, not active-team flips.
    // (Calling it made the UI look done while a heavy reload still ran — next switch stuttered.)
  } else {
    // App-level default: validate against any open project view when possible.
    const record = teamRecordOrThrow(teamId, projectRoot);
    if (!record.hasOrchestrator) {
      throw new Error(`Team has no lead agent: ${teamId}`);
    }
    setAppDefaultTeam(teamId);
    log.info("setActiveTeam", { teamId, scope, lead: record.orchestratorId });
    // Same as project scope: state write invalidates; skip content-refresh fan-out.
  }
}

// ── Create / delete (writable teams) ──────────────────────

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "team";
}

function uniqueTeamId(prefix: string, base: string, existingDirs: string[]): string {
  const existing = new Set(existingDirs);
  for (let i = 0; i < 100; i++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const id = `${prefix}.${base}-${suffix}`;
    if (!existing.has(id)) return id;
  }
  return `${prefix}.${base}-${Date.now().toString(36)}`;
}

export interface CreateTeamInput {
  name: string;
  description?: string;
  longDescription?: string;
  tags?: string[];
  scope: TeamScope;
  projectRoot?: string;
  /** Defaults to the team name. */
  leadName?: string;
  /** Defaults to a short generic lead brief. */
  leadInstructions?: string;
  /** Optional team visual identity (emoji / lucide). Image icons use `iconImagePngBase64`. */
  icon?: IconSpec | null;
  /** Optional PNG bytes (base64) written to `<teamDir>/icon.png`. */
  iconImagePngBase64?: string;
}

function writeTeamManifest(
  dir: string,
  id: string,
  fields: {
    name: string;
    description: string;
    longDescription?: string;
    tags?: string[];
    icon?: IconSpec | null;
  },
): void {
  mkdirSync(dir, { recursive: true });
  const manifest: Record<string, unknown> = {
    id,
    name: fields.name,
    description: fields.description,
    version: "0.1.0",
    packFormatVersion: 1,
    formatVersion: 2,
    tier: "free",
    publisher: USER_TEAM_PUBLISHER,
  };
  if (fields.longDescription) manifest.longDescription = fields.longDescription;
  if (fields.tags && fields.tags.length > 0) manifest.tags = fields.tags;
  // Image icons are written via setTeamIconImage / createTeam iconImagePngBase64.
  const normalized = normalizeIconSpec(fields.icon);
  if (normalized && normalized.kind !== "image") {
    const iconJson = iconSpecToJSON(normalized);
    if (iconJson) manifest.icon = iconJson;
  }
  writeFileSync(join(dir, "team.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

/** Every custom team ships with exactly one lead (≤1 lead per team). */
function seedDefaultLead(
  dir: string,
  opts: { teamName: string; leadName: string; leadInstructions: string },
): void {
  const orchDir = join(dir, "orchestrators", "lead");
  mkdirSync(orchDir, { recursive: true });
  writeFileSync(
    join(orchDir, "orchestrator.json"),
    `${JSON.stringify(
      {
        id: "lead",
        name: opts.leadName,
        description: `Lead agent for ${opts.teamName}`,
        // `$pack` → `@team`: own-team subagents / skills expand into this lead's allowlists.
        allowedExperts: ["$pack"],
        allowedSkills: ["$pack"],
        allowedCommands: ["$pack"],
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  writeFileSync(join(orchDir, "instructions.md"), opts.leadInstructions, "utf-8");
}

function defaultLeadInstructions(teamName: string): string {
  return `You are the lead agent for **${teamName}**.\n\nOwn the main conversation, use tools when needed, and keep answers concise and practical.\n`;
}

/** Create a team at the given scope. Returns the new teamId. */
export function createTeam(input: CreateTeamInput): { teamId: string; dir: string } {
  const name = input.name.trim();
  if (!name) throw new Error("Team name is required");
  const description = (input.description ?? "").trim();
  const longDescription = (input.longDescription ?? "").trim() || undefined;
  const tags = (input.tags ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const leadName = (input.leadName ?? "").trim() || name;
  const leadInstructions =
    (input.leadInstructions ?? "").trim() || defaultLeadInstructions(name);

  const write = (dir: string, id: string) => {
    writeTeamManifest(dir, id, { name, description, longDescription, tags, icon: input.icon });
    seedDefaultLead(dir, { teamName: name, leadName, leadInstructions });
    if (input.iconImagePngBase64) {
      const png = Buffer.from(input.iconImagePngBase64, "base64");
      if (png.length > 0 && png.length <= 256 * 1024) {
        writeFileSync(join(dir, ICON_IMAGE_FILENAME), png);
        writeTeamManifestIcon(dir, { kind: "image", value: ICON_IMAGE_FILENAME });
      }
    }
  };

  if (input.scope === "app") {
    const root = appTeamsDir();
    mkdirSync(root, { recursive: true });
    const existing = existsSync(root)
      ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
      : [];
    const id = uniqueTeamId("user", slugify(name), existing);
    const dir = join(root, id);
    write(dir, id);
    invalidateCatalog();
    notifyTeamsChanged();
    log.info("app team created", { teamId: id });
    return { teamId: id, dir };
  }

  if (!input.projectRoot) throw new Error("projectRoot is required for project-scope teams");
  const root = projectTeamsDir(input.projectRoot);
  mkdirSync(root, { recursive: true });
  const existing = existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  const id = uniqueTeamId("project", slugify(name), existing);
  const dir = join(root, id);
  write(dir, id);
  invalidateCatalog();
  notifyTeamsChanged(input.projectRoot);
  log.info("project team created", { teamId: id, projectRoot: input.projectRoot });
  return { teamId: id, dir };
}

function removeTeamIconImageFile(teamDir: string): void {
  const path = join(teamDir, ICON_IMAGE_FILENAME);
  if (existsSync(path)) {
    try {
      rmSync(path, { force: true });
    } catch {
      /* best-effort */
    }
  }
}

function writeTeamManifestIcon(teamDir: string, icon: IconSpec | null): void {
  const manifestPath = join(teamDir, "team.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
  const iconJson = iconSpecToJSON(normalizeIconSpec(icon));
  if (iconJson) manifest.icon = iconJson;
  else delete manifest.icon;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

/**
 * Rewrite a writable team's `icon` field in team.json. Read-only / built-in teams
 * are rejected — only user (app) and project teams can be re-imagined.
 * Non-image icons also remove a leftover `icon.png` on disk.
 */
export function updateTeamIcon(
  teamId: string,
  projectRoot: string | undefined,
  icon: IconSpec | null,
): void {
  if (teamId === CORE_TEAM_ID || teamId === PROJECT_DEFAULT_TEAM_ID) {
    throw new Error(`Team icon cannot be changed: ${teamId}`);
  }
  assertMyContentImmutable(teamId, "updated");
  const record = teamRecordOrThrow(teamId, projectRoot);
  if (!record.writable) {
    throw new Error(`Only user/project teams can be edited: ${teamId}`);
  }
  const normalized = normalizeIconSpec(icon);
  if (normalized?.kind === "image") {
    throw new Error("Use setTeamIconImage to write image icons");
  }
  // Switching to emoji/lucide/null drops any leftover icon.png.
  removeTeamIconImageFile(record.dir);
  writeTeamManifestIcon(record.dir, normalized);
  invalidateCatalog();
  notifyTeamsChanged(projectRoot);
  log.info("team icon updated", { teamId });
}

/**
 * Write PNG bytes to `<teamDir>/icon.png` and set manifest.icon to
 * `{ kind: "image", value: "icon.png" }`. Writable teams only.
 */
export function setTeamIconImage(
  teamId: string,
  projectRoot: string | undefined,
  pngBytes: Buffer,
): void {
  if (teamId === CORE_TEAM_ID || teamId === PROJECT_DEFAULT_TEAM_ID) {
    throw new Error(`Team icon cannot be changed: ${teamId}`);
  }
  assertMyContentImmutable(teamId, "updated");
  const record = teamRecordOrThrow(teamId, projectRoot);
  if (!record.writable) {
    throw new Error(`Only user/project teams can be edited: ${teamId}`);
  }
  if (!pngBytes || pngBytes.length === 0) {
    throw new Error("Empty icon image");
  }
  // Soft cap (~256 KB) — icons are already resized client-side to 128px.
  if (pngBytes.length > 256 * 1024) {
    throw new Error("Icon image is too large");
  }
  writeFileSync(join(record.dir, ICON_IMAGE_FILENAME), pngBytes);
  writeTeamManifestIcon(record.dir, { kind: "image", value: ICON_IMAGE_FILENAME });
  invalidateCatalog();
  notifyTeamsChanged(projectRoot);
  log.info("team icon image written", { teamId, bytes: pngBytes.length });
}

/** Delete a writable team (app user team or project team). Read-only teams are rejected. */
export function deleteTeam(teamId: string, projectRoot?: string): void {
  if (teamId === CORE_TEAM_ID || teamId === PROJECT_DEFAULT_TEAM_ID) {
    throw new Error(`Team cannot be deleted: ${teamId}`);
  }
  assertMyContentImmutable(teamId, "deleted");
  const record = teamRecordOrThrow(teamId, projectRoot);
  if (!record.writable) {
    throw new Error(`Only user/project teams can be deleted (disable others instead): ${teamId}`);
  }
  rmSync(record.dir, { recursive: true, force: true });
  // Prune state references at both layers.
  const appState = readAppTeamsState();
  writeAppTeamsState({
    ...appState,
    installed: appState.installed.filter((r) => r.teamId !== teamId),
    teamEnabled: Object.fromEntries(Object.entries(appState.teamEnabled).filter(([k]) => k !== teamId)),
    assetEnabled: Object.fromEntries(
      Object.entries(appState.assetEnabled).filter(([k]) => parseFqid(k)?.teamId !== teamId),
    ),
    assetOverrides: Object.fromEntries(
      Object.entries(appState.assetOverrides).filter(([k]) => parseFqid(k)?.teamId !== teamId),
    ),
  });
  const roots = new Set([..._registeredRoots(), ...(projectRoot ? [projectRoot] : [])]);
  for (const root of roots) {
    pruneProjectTeamReferences(root, teamId);
  }
  invalidateCatalog();
  notifyTeamsChanged(projectRoot);
  log.info("team deleted", { teamId });
}

// ── Promote / demote / moveAsset (physical move + reference patch) ──

/** Rewrite every reference to oldTeamId across both state layers to newTeamId. */
function patchTeamReferences(oldTeamId: string, newTeamId: string, projectRoot?: string): void {
  const rewriteFqid = (fqid: string) =>
    parseFqid(fqid)?.teamId === oldTeamId ? toFqid(newTeamId, parseFqid(fqid)!.contentId) : fqid;

  const appState = readAppTeamsState();
  const remapRecord = (rec: Record<string, boolean>) =>
    Object.fromEntries(Object.entries(rec).map(([k, v]) => [parseFqid(k) ? rewriteFqid(k) : k === oldTeamId ? newTeamId : k, v]));
  const rewriteOverride = (override: AssetOverride): AssetOverride => ({
    ...override,
    ...(override.allowedExperts
      ? { allowedExperts: override.allowedExperts.map(rewriteFqid) }
      : {}),
    ...(override.allowedSkills
      ? { allowedSkills: override.allowedSkills.map(rewriteFqid) }
      : {}),
    ...(override.allowedCommands
      ? { allowedCommands: override.allowedCommands.map(rewriteFqid) }
      : {}),
  });
  writeAppTeamsState({
    ...appState,
    teamEnabled: remapRecord(appState.teamEnabled),
    assetEnabled: remapRecord(appState.assetEnabled),
    assetOverrides: Object.fromEntries(
      Object.entries(appState.assetOverrides).map(([k, v]) => [rewriteFqid(k), rewriteOverride(v)]),
    ),
    defaultTeam: appState.defaultTeam === oldTeamId ? newTeamId : appState.defaultTeam,
  });

  const roots = new Set([..._registeredRoots(), ...(projectRoot ? [projectRoot] : [])]);
  for (const root of roots) {
    const projState = readProjectTeamsState(root);
    writeProjectTeamsState(root, {
      ...projState,
      teamEnabled: remapRecord(projState.teamEnabled),
      assetEnabled: remapRecord(projState.assetEnabled),
      assetOverrides: Object.fromEntries(
        Object.entries(projState.assetOverrides).map(([k, v]) => [rewriteFqid(k), rewriteOverride(v)]),
      ),
      defaultTeam: projState.defaultTeam === oldTeamId ? newTeamId : projState.defaultTeam,
    });
  }
  rewriteRosterReferences(
    new Map([[`${oldTeamId}:`, `${newTeamId}:`]]),
    projectRoot,
  );
  rewriteCommandAgentReferences(
    new Map([[`${oldTeamId}:`, `${newTeamId}:`]]),
    projectRoot,
  );
}

function rosterReferencesTeamRoot(root: string, teamId: string): boolean {
  if (!existsSync(root)) return false;
  const prefix = `${teamId}:`;
  for (const team of readdirSync(root, { withFileTypes: true })) {
    if (!team.isDirectory()) continue;
    const teamDir = join(root, team.name);
    const candidates = [
      join(teamDir, "orchestrator", "orchestrator.json"),
      ...(
        existsSync(join(teamDir, "orchestrators"))
          ? readdirSync(join(teamDir, "orchestrators"), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => join(teamDir, "orchestrators", entry.name, "orchestrator.json"))
          : []
      ),
    ];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      try {
        const raw = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
        const legacy = Array.isArray(raw.allowedExperts) ? raw.allowedExperts : [];
        const roster = raw.roster as { members?: unknown } | undefined;
        const members = Array.isArray(roster?.members) ? roster.members : [];
        if ([...legacy, ...members].some((value) => typeof value === "string" && value.startsWith(prefix))) {
          return true;
        }
      } catch {
        // A malformed roster cannot establish a safe reference; leave it for
        // the catalog's existing parse warning rather than blocking unrelated
        // lifecycle operations.
      }
    }
  }
  return false;
}

function rosterReferencesTeam(projectRoot: string, teamId: string): boolean {
  return rosterReferencesTeamRoot(projectTeamsDir(projectRoot), teamId);
}

/**
 * Rewrite FQID references stored in writable orchestrator files. State keys
 * are not sufficient: roster members are durable Team content and otherwise
 * become dangling after promote/demote/move.
 */
function rewriteRosterReferences(rewrites: Map<string, string>, projectRoot?: string): void {
  const roots = new Set<string>([
    appTeamsDir(),
    ...(projectRoot ? [projectTeamsDir(projectRoot)] : []),
    ..._registeredRoots().map((root) => projectTeamsDir(root)),
  ]);
  const rewriteRef = (value: string): string => {
    for (const [from, to] of rewrites) {
      if (value.startsWith(from)) return `${to}${value.slice(from.length)}`;
    }
    return value;
  };

  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const team of readdirSync(root, { withFileTypes: true })) {
      if (!team.isDirectory()) continue;
      const teamDir = join(root, team.name);
      const candidates = [
        join(teamDir, "orchestrator", "orchestrator.json"),
        ...(
          existsSync(join(teamDir, "orchestrators"))
            ? readdirSync(join(teamDir, "orchestrators"), { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => join(teamDir, "orchestrators", entry.name, "orchestrator.json"))
            : []
        ),
      ];
      for (const file of candidates) {
        if (!existsSync(file)) continue;
        try {
          const raw = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
          let changed = false;
          if (Array.isArray(raw.allowedExperts)) {
            const next = raw.allowedExperts.map((value) => {
              if (typeof value !== "string") return value;
              const rewritten = rewriteRef(value);
              changed ||= rewritten !== value;
              return rewritten;
            });
            raw.allowedExperts = next;
          }
          if (Array.isArray(raw.allowedSkills)) {
            const next = raw.allowedSkills.map((value) => {
              if (typeof value !== "string") return value;
              const rewritten = rewriteRef(value);
              changed ||= rewritten !== value;
              return rewritten;
            });
            raw.allowedSkills = next;
          }
          if (Array.isArray(raw.allowedCommands)) {
            const next = raw.allowedCommands.map((value) => {
              if (typeof value !== "string") return value;
              const rewritten = rewriteRef(value);
              changed ||= rewritten !== value;
              return rewritten;
            });
            raw.allowedCommands = next;
          }
          if (
            raw.roster
            && typeof raw.roster === "object"
            && (raw.roster as { mode?: unknown }).mode === "list"
            && Array.isArray((raw.roster as { members?: unknown }).members)
          ) {
            const roster = raw.roster as { mode: "list"; members: unknown[] };
            roster.members = roster.members.map((value) => {
              if (typeof value !== "string") return value;
              const rewritten = rewriteRef(value);
              changed ||= rewritten !== value;
              return rewritten;
            });
          }
          if (changed) writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
        } catch (err) {
          log.warn("failed to rewrite roster reference", { file, error: String(err) });
        }
      }
    }
  }
}

function rewriteCommandAgentReferences(rewrites: Map<string, string>, projectRoot?: string): void {
  const roots = new Set<string>([
    appTeamsDir(),
    ...(projectRoot ? [projectTeamsDir(projectRoot)] : []),
    ..._registeredRoots().map((root) => projectTeamsDir(root)),
  ]);
  const rewriteRef = (value: string): string => {
    for (const [from, to] of rewrites) {
      if (value.startsWith(from)) return `${to}${value.slice(from.length)}`;
    }
    return value;
  };
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const team of readdirSync(root, { withFileTypes: true })) {
      if (!team.isDirectory()) continue;
      const commandsDir = join(root, team.name, "commands");
      if (!existsSync(commandsDir)) continue;
      for (const entry of readdirSync(commandsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const file = join(commandsDir, entry.name);
        try {
          const content = readFileSync(file, "utf-8");
          const updated = content.replace(
            /^(\s*agent:\s*)(["']?)([^\s"'#]+)\2(\s*)$/gm,
            (_whole, prefix: string, quote: string, value: string, suffix: string) => {
              const rewritten = rewriteRef(value);
              return rewritten === value ? _whole : `${prefix}${quote}${rewritten}${quote}${suffix}`;
            },
          );
          if (updated !== content) writeFileSync(file, updated, "utf-8");
        } catch (err) {
          log.warn("failed to rewrite command agent reference", { file, error: String(err) });
        }
      }
    }
  }
}

/** Promote a project team to app scope (move dir + rewrite manifest id + patch references). */
export function promoteTeam(teamId: string, projectRoot: string): { newTeamId: string } {
  if (teamId === PROJECT_DEFAULT_TEAM_ID) {
    throw new Error("The project default team cannot be promoted.");
  }
  const record = teamRecordOrThrow(teamId, projectRoot);
  if (record.scope !== "project") throw new Error(`Team is not project-scoped: ${teamId}`);
  if (!record.writable) throw new Error(`Team is not writable: ${teamId}`);

  const newTeamId = `user.${teamId.replace(/^project\./, "")}`;
  const targetDir = join(appTeamsDir(), newTeamId);
  if (existsSync(targetDir)) throw new Error(`Target team already exists: ${newTeamId}`);

  mkdirSync(appTeamsDir(), { recursive: true });
  // Move the directory, then rewrite the manifest id.
  renameSyncSafe(record.dir, targetDir);
  const manifest = JSON.parse(readFileSync(join(targetDir, "team.json"), "utf-8")) as Record<string, unknown>;
  manifest.id = newTeamId;
  writeFileSync(join(targetDir, "team.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  patchTeamReferences(teamId, newTeamId, projectRoot);
  invalidateCatalog();
  notifyTeamsChanged();
  log.info("team promoted to app scope", { from: teamId, to: newTeamId });
  return { newTeamId };
}

/** Demote an app user team to a project (refused if other projects reference it). */
export function demoteTeam(teamId: string, projectRoot: string): { newTeamId: string } {
  const record = teamRecordOrThrow(teamId, projectRoot);
  if (record.scope !== "app") throw new Error(`Team is not app-scoped: ${teamId}`);
  if (record.source !== "user") throw new Error(`Only user teams can be demoted: ${teamId}`);
  const referencingProject = _registeredRoots().find(
    (root) => root !== projectRoot
      && (projectReferencesTeam(root, teamId) || rosterReferencesTeam(root, teamId)),
  );
  const appRosterReference = rosterReferencesTeamRoot(appTeamsDir(), teamId);
  if (referencingProject || appRosterReference) {
    throw new Error(
      `Cannot demote ${teamId}: it is still referenced by ${
        referencingProject ? `project ${referencingProject}` : "another app Team"
      }`,
    );
  }

  const newTeamId = `project.${teamId.replace(/^user\./, "")}`;
  const targetDir = join(projectTeamsDir(projectRoot), newTeamId);
  if (existsSync(targetDir)) throw new Error(`Target team already exists: ${newTeamId}`);

  mkdirSync(projectTeamsDir(projectRoot), { recursive: true });
  renameSyncSafe(record.dir, targetDir);
  const manifest = JSON.parse(readFileSync(join(targetDir, "team.json"), "utf-8")) as Record<string, unknown>;
  manifest.id = newTeamId;
  writeFileSync(join(targetDir, "team.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  patchTeamReferences(teamId, newTeamId, projectRoot);
  // Demoted teams leave the app-level install record.
  const appState = readAppTeamsState();
  writeAppTeamsState({
    ...appState,
    installed: appState.installed.filter((r) => r.teamId !== teamId),
  });
  invalidateCatalog();
  notifyTeamsChanged(projectRoot);
  log.info("team demoted to project scope", { from: teamId, to: newTeamId });
  return { newTeamId };
}

/** Move an asset to another writable team (move dir + FQID rewrite + reference patch). */
export function moveAsset(
  fqid: Fqid,
  targetTeamId: string,
  projectRoot: string,
): { newFqid: Fqid } {
  const parsed = parseFqid(fqid);
  if (!parsed) throw new Error(`Invalid fqid: ${fqid}`);
  const asset = getAsset(projectRoot, fqid);
  if (!asset) throw new Error(`Asset not found: ${fqid}`);
  if (!asset.editable) throw new Error(`Asset is read-only (not in a writable team): ${fqid}`);

  const target = teamRecordOrThrow(targetTeamId, projectRoot);
  if (!target.writable) throw new Error(`Target team is read-only: ${targetTeamId}`);
  if (!canReference(target, asset.origin)) {
    throw new Error(
      `Cannot move a project-scoped asset into an app-scoped team (promote the team first): ${fqid}`,
    );
  }

  const kindDir: Record<string, string> = {
    orchestrator: "orchestrator",
    subagent: "subagents",
    skill: "skills",
    command: "commands",
    mcp: "",
  };
  if (asset.kind === "mcp") {
    throw new Error("Moving MCP servers between teams is not supported yet (edit mcp.json).");
  }
  const sub = kindDir[asset.kind];
  const targetDir = asset.kind === "orchestrator"
    ? join(target.dir, sub)
    : asset.kind === "command"
      ? join(target.dir, sub, `${asset.id}.md`)
      : join(target.dir, sub, asset.id);
  if (existsSync(targetDir)) throw new Error(`Target already has an asset named ${asset.id}`);

  mkdirSync(join(target.dir, sub), { recursive: true });
  renameSyncSafe(asset.dir, targetDir);

  const newFqid = toFqid(targetTeamId, asset.id);
  // Patch references to the old fqid (rosters, overrides, state keys).
  patchAssetReferences(projectRoot, fqid, newFqid);
  invalidateCatalog();
  notifyTeamsChanged(projectRoot);
  log.info("asset moved", { from: fqid, to: newFqid });
  return { newFqid };
}

/** Rewrite every reference to oldFqid across both state layers to newFqid. */
function patchAssetReferences(projectRoot: string, oldFqid: Fqid, newFqid: Fqid): void {
  const remap = (rec: Record<string, boolean>) =>
    Object.fromEntries(Object.entries(rec).map(([k, v]) => [k === oldFqid ? newFqid : k, v]));
  const remapOverrides = (rec: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(rec).map(([k, v]) => [k === oldFqid ? newFqid : k, v]));

  const appState = readAppTeamsState();
  writeAppTeamsState({
    ...appState,
    assetEnabled: remap(appState.assetEnabled),
    assetOverrides: remapOverrides(appState.assetOverrides) as typeof appState.assetOverrides,
  });
  const projState = readProjectTeamsState(projectRoot);
  writeProjectTeamsState(projectRoot, {
    ...projState,
    assetEnabled: remap(projState.assetEnabled),
    assetOverrides: remapOverrides(projState.assetOverrides) as typeof projState.assetOverrides,
  });
  rewriteRosterReferences(
    new Map([[oldFqid, newFqid]]),
    projectRoot,
  );
  rewriteCommandAgentReferences(
    new Map([[oldFqid, newFqid]]),
    projectRoot,
  );
}

/** Cross-device-safe rename (renameSync fails across volumes; copy+remove fallback). */
function renameSyncSafe(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch {
    copyDir(from, to);
    rmSync(from, { recursive: true, force: true });
  }
}

function copyDir(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const s = join(from, entry.name);
    const d = join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else writeFileSync(d, readFileSync(s));
  }
}

// ── Cross-team roster referrers (subagent delete confirm) ─

export interface SubagentRosterReferrer {
  teamId: string;
  teamName: string;
  orchestratorFqid: Fqid;
}

/**
 * Other teams that explicitly list this subagent on their lead roster
 * (`+` / allowlist). Birth-team `@team` and mode `"all"` are not "added".
 *
 * Follow-up: skills / commands / MCPs need the same
 * referrer → confirm → purge-on-delete flow once their create/ownership UI
 * is ready — extend this pattern instead of inventing a parallel helper.
 */
export function listSubagentRosterReferrers(
  projectRoot: string,
  subagentRef: string,
): SubagentRosterReferrer[] {
  const asset = getAsset(projectRoot, subagentRef);
  if (!asset || asset.kind !== "subagent") return [];
  const out: SubagentRosterReferrer[] = [];
  for (const team of listTeams(projectRoot)) {
    if (team.manifest.id === asset.teamId) continue;
    const roster = resolveRoster(projectRoot, team.manifest.id);
    if (!roster || roster.spec.mode !== "list") continue;
    const hit = roster.entries.some((e) => e.via === "explicit" && e.fqid === asset.fqid);
    if (!hit) continue;
    out.push({
      teamId: team.manifest.id,
      teamName: team.manifest.name,
      orchestratorFqid: roster.orchestratorFqid,
    });
  }
  return out.sort((a, b) => a.teamName.localeCompare(b.teamName));
}

function rosterMemberPointsAt(member: string, targetFqid: Fqid, projectRoot: string): boolean {
  if (member === "@team" || member === "$pack") return false;
  if (member === targetFqid) return true;
  const direct = getAsset(projectRoot, member);
  if (direct?.fqid === targetFqid) return true;
  const parsed = parseFqid(member);
  if (parsed && toFqid(parsed.teamId, parsed.contentId) === targetFqid) return true;
  return false;
}

/** Strip explicit foreign-roster refs to this subagent (project-layer override). */
export function purgeSubagentFromForeignRosters(
  projectRoot: string,
  subagentRef: string,
): number {
  const asset = getAsset(projectRoot, subagentRef);
  if (!asset || asset.kind !== "subagent") return 0;
  const referrers = listSubagentRosterReferrers(projectRoot, asset.fqid);
  let purged = 0;
  for (const ref of referrers) {
    const roster = resolveRoster(projectRoot, ref.teamId);
    if (!roster || roster.spec.mode !== "list") continue;
    const next = roster.spec.members.filter(
      (m) => !rosterMemberPointsAt(m, asset.fqid, projectRoot),
    );
    if (next.length === roster.spec.members.length) continue;
    saveAssetOverride(
      roster.orchestratorFqid,
      { allowedExperts: next },
      "project",
      projectRoot,
    );
    purged += 1;
  }
  if (purged > 0) {
    log.info("purged subagent from foreign rosters", { fqid: asset.fqid, purged });
  }
  return purged;
}

// ── Read-side re-exports for IPC ──────────────────────────

export { listTeams, getTeam, getAsset, isAssetActive };
export { scanAllTeams };
