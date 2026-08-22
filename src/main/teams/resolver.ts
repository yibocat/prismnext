/**
 * resolver.ts — the TeamResolver (design 2026-08-10 §6).
 *
 * The SINGLE component that answers "what teams exist, what assets exist,
 * whether they are usable, and what they look like". Skills / commands / MCP /
 * agents-sync / chat (via resolveChatOrchestrator) consume this layer.
 *
 * Pipeline: discover → validate → state → gate → index → shadow → roster → emit.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  AssetKind,
  BlockReason,
  Fqid,
  McpServerDef,
  RosterRef,
  TeamManifest,
} from "../../shared/teams/types";
import { APP_COMMANDS_OWNER_ID, CORE_TEAM_ID, MY_CONTENT_TEAM_ID } from "../../shared/teams/types";
import { parseFqid, resolveTri, toFqid } from "../../shared/teams/state";
import type {
  AssetViewV2,
  OrchestratorDefV2,
  RosterEntryView,
  RosterView,
  SubagentDefV2,
  TeamViewV2,
} from "../../shared/teams/view";
import { createLogger } from "../app/logger";
import { _registeredRoots } from "../project/active-project-roots";
import { licenseGrants, licenseStateVersion } from "../services/teams-license";
import {
  appTeamsStateWriteCounter,
  onAppTeamsStateWritten,
  readAppTeamsState,
} from "./state-app";
import {
  onProjectTeamsStateWritten,
  projectTeamsStateMtime,
  projectTeamsStateWriteCounter,
  readProjectTeamsState,
} from "./state-project";
import {
  currentCatalogFingerprint,
  invalidateCatalog,
  listAppCommandAssets,
  scanAllTeams,
  type ScannedAsset,
  type TeamRecord,
} from "./catalog";
import { compareByPrecedence } from "./precedence";
import { canReference } from "./scope";

const log = createLogger("teams-resolver", "agent");

// ── Invalidation subscriptions ────────────────────────────
// App-state writes affect EVERY project → invalidate all. Project-state writes
// invalidate only their own project. Catalog changes (team roots) invalidate all.

onAppTeamsStateWritten(() => invalidateResolver());
onProjectTeamsStateWritten((root) => invalidateResolver(root));

// ── View cache ────────────────────────────────────────────

interface ProjectView {
  key: string;
  teams: TeamViewV2[];
  assets: AssetViewV2[];
  byFqid: Map<Fqid, AssetViewV2>;
}

const projectViews = new Map<string, ProjectView>();
let hostVersionOverrideForTests: string | null | undefined;

function viewKey(projectRoot: string): string {
  return [
    currentCatalogFingerprint([projectRoot]),
    String(appTeamsStateWriteCounter()),
    String(projectTeamsStateMtime(projectRoot)),
    String(projectTeamsStateWriteCounter()),
    String(licenseStateVersion()),
  ].join("#");
}

// ── State resolution (design §5.3) ────────────────────────

function hostVersion(): string | null {
  if (hostVersionOverrideForTests !== undefined) return hostVersionOverrideForTests;
  try {
    const { app } = require("electron") as typeof import("electron");
    if (app && typeof app.getVersion === "function") return app.getVersion();
  } catch {
    // vitest / non-Electron
  }
  return process.env.npm_package_version ?? null;
}

function satisfiesMinHost(minHostVersion?: string): boolean {
  if (!minHostVersion) return true;
  const host = hostVersion();
  if (!host) return true;
  const pa = host.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = minHostVersion.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

function resolveTeamState(
  record: TeamRecord,
  appState: ReturnType<typeof readAppTeamsState>,
  projectState: ReturnType<typeof readProjectTeamsState>,
): TeamViewV2 {
  const id = record.manifest.id;
  const licenseOk = record.manifest.tier === "pro" ? licenseGrants(record.manifest.feature) : true;
  const compatible = satisfiesMinHost(record.manifest.minHostVersion);
  // core = installed by default unless opted out via teams-state.uninstalled;
  // user / project teams are always "installed"; others need an install record.
  const uninstalled = appState.uninstalled ?? [];
  const installed =
    record.source === "user" ||
    record.scope === "project" ||
    (record.source === "core"
      ? !uninstalled.includes(id)
      : appState.installed.some((r) => r.teamId === id));

  const enabledApp = appState.teamEnabled[id];
  const enabledProject = undefined;
  const flag = resolveTri(undefined, enabledApp, true);

  const blockedBy: BlockReason | undefined =
    !installed
      ? "not-installed"
      : !licenseOk
        ? "license"
        : !compatible
          ? "incompatible"
          : enabledApp === false
            ? "team-disabled-app"
            : undefined;

  const counts: Record<AssetKind, number> = {
    orchestrator: 0,
    subagent: 0,
    skill: 0,
    command: 0,
    mcp: 0,
  };
  for (const a of record.assets) counts[a.kind] += 1;
  counts.mcp = record.mcps.length;

  return {
    manifest: record.manifest,
    scope: record.scope,
    source: record.source,
    dir: record.dir,
    writable: record.writable,
    hasOrchestrator: record.hasOrchestrator,
    orchestratorId: record.orchestratorId,
    installed,
    licenseOk,
    compatible,
    enabled: !blockedBy && flag,
    blockedBy,
    enabledApp,
    enabledProject,
    counts,
  };
}

// ── Override application (project wins over app) ──────────

function applyOverride(
  kind: AssetKind,
  def: unknown,
  appOverride: unknown,
  projectOverride: unknown,
): unknown {
  if (kind !== "orchestrator" && kind !== "subagent") return def;
  const merged: Record<string, unknown> = { ...(def as Record<string, unknown>) };
  // Apply app first, then project (project wins).
  for (const override of [appOverride, projectOverride]) {
    if (!override || typeof override !== "object") continue;
    const o = override as Record<string, unknown>;
    if (o.model !== undefined) merged.model = o.model || undefined;
    if (o.thoughtLevel !== undefined) merged.thoughtLevel = o.thoughtLevel || undefined;
    if (o.temperature !== undefined) merged.temperature = o.temperature;
    if (o.permission !== undefined) merged.permission = o.permission;
    if (kind === "subagent" && Array.isArray(o.modules)) {
      merged.modules = o.modules.length ? o.modules : undefined;
    }
    if (kind === "orchestrator" && Array.isArray(o.allowedExperts)) {
      // Keep bare ids / FQIDs as written; resolveRoster resolves via resolveRef.
      merged.roster = {
        mode: "list",
        members: o.allowedExperts.filter((m): m is string => typeof m === "string"),
      };
    }
    if (kind === "orchestrator" && Array.isArray(o.allowedSkills)) {
      merged.skillsRoster = {
        mode: "list",
        members: o.allowedSkills.filter((m): m is string => typeof m === "string"),
      };
    }
    if (kind === "orchestrator" && Array.isArray(o.allowedCommands)) {
      merged.commandsRoster = {
        mode: "list",
        members: o.allowedCommands.filter((m): m is string => typeof m === "string"),
      };
    }
  }
  return merged;
}

// ── View build ────────────────────────────────────────────

function buildProjectView(projectRoot: string): ProjectView {
  const appState = readAppTeamsState();
  const projectState = readProjectTeamsState(projectRoot);
  const records = scanAllTeams([projectRoot]);

  const teams = records.map((r) => resolveTeamState(r, appState, projectState));
  const teamById = new Map(teams.map((t) => [t.manifest.id, t]));

  // ── Index assets ──
  const assets: AssetViewV2[] = [];
  for (const team of teams) {
    // Assets of a team that isn't installed in this project never enter the
    // runtime set (matches the legacy resolver's `if (!pack.installed) continue`).
    // The team itself still surfaces in listTeams with blockedBy:"not-installed".
    if (!team.installed) continue;
    const record = records.find((r) => r.manifest.id === team.manifest.id)!;
    const origin = {
      teamId: team.manifest.id,
      teamName: team.manifest.name,
      scope: team.scope,
      source: team.source,
      tier: team.manifest.tier,
    };
    const pushAsset = (
      kind: AssetKind,
      id: string,
      name: string,
      description: string,
      dir: string,
      rawDef: unknown,
    ) => {
      const fqid = toFqid(team.manifest.id, id);
      const enabledApp = appState.assetEnabled[fqid];
      const enabledProject = undefined;
      const blockedBy: BlockReason | undefined = !team.enabled
        ? team.blockedBy
        : enabledApp === false
          ? "asset-disabled-app"
          : undefined;
      const hasOverride =
        appState.assetOverrides[fqid] !== undefined ||
        projectState.assetOverrides[fqid] !== undefined;
      assets.push({
        fqid,
        kind,
        teamId: team.manifest.id,
        id,
        name,
        description,
        definition: applyOverride(
          kind,
          rawDef,
          appState.assetOverrides[fqid],
          projectState.assetOverrides[fqid],
        ),
        dir,
        origin,
        enabled: !blockedBy,
        blockedBy,
        enabledApp,
        enabledProject,
        editable: team.writable,
        hasOverride,
        runtimeName: id, // shadow pass below rewrites on collision
      });
    };

    for (const a of record.assets) {
      pushAsset(a.kind, a.id, a.name, a.description, a.path, a.definition ?? a.command);
    }
    for (const m of record.mcps) {
      pushAsset("mcp", m.id, m.name, m.description ?? "", record.dir, m);
    }
  }

  // App-level commands (`resources/commands/`) — not a team; always present.
  for (const a of listAppCommandAssets()) {
    const fqid = toFqid(APP_COMMANDS_OWNER_ID, a.id);
    const enabledApp = appState.assetEnabled[fqid];
    const enabledProject = undefined;
    const blockedBy: BlockReason | undefined =
      enabledApp === false
        ? "asset-disabled-app"
        : undefined;
    assets.push({
      fqid,
      kind: "command",
      teamId: APP_COMMANDS_OWNER_ID,
      id: a.id,
      name: a.name,
      description: a.description,
      definition: a.command,
      dir: a.path,
      origin: {
        teamId: APP_COMMANDS_OWNER_ID,
        teamName: "App",
        scope: "app",
        source: "bundled",
        tier: "free",
      },
      enabled: !blockedBy,
      blockedBy,
      enabledApp,
      enabledProject,
      editable: false,
      hasOverride:
        appState.assetOverrides[fqid] !== undefined
        || projectState.assetOverrides[fqid] !== undefined,
      runtimeName: a.id,
    });
  }

  // ── Shadow pass: runtimeName + blockedBy:"shadowed" (design §7.1) ──
  // App / core commands keep their bare id as the stable slash name; others
  // keep the bare id when globally unique, else ALL colliding parties get the
  // <teamId>--<id> prefix.
  applyShadowing(assets, teamById);

  const byFqid = new Map(assets.map((a) => [a.fqid, a]));
  return { key: viewKey(projectRoot), teams, assets, byFqid };
}

/**
 * Compute runtimeName and mark shadowed assets. Runs on the ENABLED asset set
 * per kind. An asset blocked for another reason keeps that reason; shadowing
 * only marks otherwise-active assets that lose a same-name collision.
 */
function applyShadowing(
  assets: AssetViewV2[],
  teamById: Map<string, TeamViewV2>,
): void {
  const kinds: AssetKind[] = ["orchestrator", "subagent", "skill", "command", "mcp"];
  for (const kind of kinds) {
    const active = assets.filter((a) => a.kind === kind && a.enabled);
    const byName = new Map<string, AssetViewV2[]>();
    for (const a of active) {
      const runtimeKey = kind === "mcp"
        ? ((a.definition as { name?: unknown } | undefined)?.name as string | undefined) ?? a.id
        : a.id;
      const list = byName.get(runtimeKey) ?? [];
      list.push(a);
      byName.set(runtimeKey, list);
    }
    for (const [runtimeKey, group] of byName) {
      if (group.length === 1) {
        group[0].runtimeName = runtimeKey;
        continue;
      }
      // Collision: every party gets the prefixed name (including the winner),
      // so the runtime name is unambiguous. The winner is the most specific.
      const sorted = [...group].sort((a, b) => {
        const ta = teamById.get(a.teamId);
        const tb = teamById.get(b.teamId);
        return compareByPrecedence(
          {
            scope: ta?.scope ?? "app",
            source: ta?.source ?? (a.teamId === APP_COMMANDS_OWNER_ID ? "bundled" : "user"),
            teamId: a.teamId,
          },
          {
            scope: tb?.scope ?? "app",
            source: tb?.source ?? (b.teamId === APP_COMMANDS_OWNER_ID ? "bundled" : "user"),
            teamId: b.teamId,
          },
        );
      });
      // App + core keep the bare id as the stable slash anchor; others prefix.
      const keepsBare = (teamId: string) =>
        teamId === CORE_TEAM_ID || teamId === APP_COMMANDS_OWNER_ID;
      for (const a of sorted) {
        a.runtimeName = kind === "mcp"
          ? runtimeKey
          : keepsBare(a.teamId)
            ? a.id
            : `${a.teamId}--${a.id}`;
      }
      // Mark all but the winner as shadowed (they lose the bare-name invocation).
      const winner = sorted[0];
      for (const a of sorted) {
        if (a !== winner && (kind === "mcp" || !keepsBare(a.teamId))) {
          // Only mark shadowed when it actually loses the invocation name.
          a.blockedBy = a.blockedBy ?? "shadowed";
        }
      }
    }
  }
}

function getProjectView(projectRoot: string): ProjectView {
  const key = viewKey(projectRoot);
  const cached = projectViews.get(projectRoot);
  if (cached && cached.key === key) return cached;
  const view = buildProjectView(projectRoot);
  projectViews.set(projectRoot, view);
  return view;
}

// ── Invalidation + change fan-out ─────────────────────────

type TeamsChangeListener = (projectRoot?: string) => void;
const listeners = new Set<TeamsChangeListener>();

export function onTeamsViewChanged(listener: TeamsChangeListener): { dispose: () => void } {
  listeners.add(listener);
  return { dispose: () => listeners.delete(listener) };
}

export function invalidateResolver(projectRoot?: string): void {
  if (projectRoot) projectViews.delete(projectRoot);
  else {
    projectViews.clear();
    invalidateCatalog();
  }
  for (const listener of listeners) {
    try {
      listener(projectRoot);
    } catch (err) {
      log.error("teams view listener threw", { error: String(err) });
    }
  }
}

/**
 * The single change fan-out point (design §6.2). All writes go through
 * lifecycle.ts, which always calls this. Wires four downstreams so a missed
 * invalidation (B2) is structurally impossible.
 */
export function notifyTeamsChanged(projectRoot?: string): void {
  invalidateResolver(projectRoot);
  const roots = projectRoot ? [projectRoot] : _registeredRoots();
  if (roots.length === 0) return;
  for (const root of roots) {
    void import("../services/project-subagents-refresh")
      .then((m) => m.scheduleSubagentsRefresh(root))
      .catch(() => {});
    void import("../skills/project-skills-refresh")
      .then((m) => m.scheduleSkillsRefresh(root))
      .catch(() => {});
  }
}

// ── Catalog layer (no project) ────────────────────────────

/** Raw discovered teams for the marketplace (no project-state resolution). */
export function listAllTeams(projectRoots: string[] = []): TeamRecord[] {
  return scanAllTeams(projectRoots);
}

// ── Project view layer ────────────────────────────────────

export function listTeams(projectRoot: string): TeamViewV2[] {
  return getProjectView(projectRoot).teams;
}

export function getTeam(projectRoot: string, teamId: string): TeamViewV2 | null {
  return getProjectView(projectRoot).teams.find((t) => t.manifest.id === teamId) ?? null;
}

export function listAssets(projectRoot: string, kind?: AssetKind): AssetViewV2[] {
  const assets = getProjectView(projectRoot).assets;
  return kind ? assets.filter((a) => a.kind === kind) : assets;
}

export function getAsset(projectRoot: string, fqid: Fqid): AssetViewV2 | null {
  return getProjectView(projectRoot).byFqid.get(fqid) ?? null;
}

/** The single enablement answer (design §5.3). */
export function isAssetActive(projectRoot: string, fqid: Fqid): boolean {
  return getProjectView(projectRoot).byFqid.get(fqid)?.enabled ?? false;
}

// ── Reference resolution (two functions, two rules — design §7.5) ──

/**
 * resolveRef — for AUTHORIZED references (roster members, a command's agent:
 * field). Rule: exact FQID > same team > the §7.5 precedence table.
 * Returns the FQID or null (ambiguous / not found).
 */
export function resolveRef(
  projectRoot: string,
  ref: string,
  fromTeamId?: string,
  kind?: AssetKind,
): Fqid | null {
  const view = getProjectView(projectRoot);
  if (parseFqid(ref)) {
    const asset = view.byFqid.get(ref);
    return asset && (!kind || asset.kind === kind) ? ref : null;
  }
  if (fromTeamId) {
    const same = toFqid(fromTeamId, ref);
    const asset = view.byFqid.get(same);
    if (asset && (!kind || asset.kind === kind)) return same;
  }
  const matches = view.assets.filter((a) => a.id === ref && (!kind || a.kind === kind));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].fqid;
  const sorted = [...matches].sort((a, b) =>
    compareByPrecedence(precedenceKey(view, a), precedenceKey(view, b)),
  );
  return sorted[0].fqid;
}

/** Precedence key for an asset; app commands are not TeamViews. */
function precedenceKey(
  view: ProjectView,
  asset: AssetViewV2,
): { scope: TeamViewV2["scope"]; source: TeamViewV2["source"]; teamId: string } {
  const team = view.teams.find((t) => t.manifest.id === asset.teamId);
  return {
    scope: team?.scope ?? "app",
    source: team?.source ?? (asset.teamId === APP_COMMANDS_OWNER_ID ? "bundled" : "user"),
    teamId: asset.teamId,
  };
}

/**
 * resolveInvocation — for RUNTIME invocation by exposure name (a `/command`,
 * an MCP server name, an agent file base). Rule: the §7.5 precedence table
 * over the ENABLED set, matching by runtimeName then by bare id.
 */
export function resolveInvocation(
  projectRoot: string,
  kind: AssetKind,
  runtimeName: string,
): AssetViewV2 | null {
  const view = getProjectView(projectRoot);
  const candidates = view.assets.filter(
    (a) => a.kind === kind && a.enabled && (a.runtimeName === runtimeName || a.id === runtimeName),
  );
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) =>
    compareByPrecedence(precedenceKey(view, a), precedenceKey(view, b)),
  );
  return sorted[0];
}

// ── Active team (design §7.1; three-layer fallback) ───────

/**
 * Resolve the active team: session override ?? project default ?? app default
 * ?? core (when installed) ?? My Content ?? any usable lead team.
 * My Content is the always-on safety net so Core can be disabled/uninstalled.
 */
export function resolveActiveTeam(
  projectRoot: string,
  sessionTeamId?: string | null,
): TeamViewV2 | null {
  const view = getProjectView(projectRoot);
  const usable = (t: TeamViewV2 | undefined): t is TeamViewV2 =>
    !!t && t.enabled && t.hasOrchestrator;

  if (sessionTeamId?.trim()) {
    const t = view.teams.find((x) => x.manifest.id === sessionTeamId.trim());
    if (usable(t)) return t;
  }
  const projectDefault = readProjectTeamsState(projectRoot).defaultTeam;
  if (projectDefault) {
    const t = view.teams.find((x) => x.manifest.id === projectDefault);
    if (usable(t)) return t;
  }
  const appDefault = readAppTeamsState().defaultTeam;
  if (appDefault) {
    const t = view.teams.find((x) => x.manifest.id === appDefault);
    if (usable(t)) return t;
  }
  const core = view.teams.find((x) => x.manifest.id === CORE_TEAM_ID);
  if (usable(core)) return core;
  const myContent = view.teams.find((x) => x.manifest.id === MY_CONTENT_TEAM_ID);
  if (usable(myContent)) return myContent;
  return view.teams.find(usable) ?? null;
}

/** Chat / prewarm / stack-preview: the lead agent OpenCode should run. */
export interface ChatOrchestratorResolved {
  teamId: string;
  fqid: Fqid;
  /** OpenCode agent file base (`agents/<runtimeName>.md`). */
  runtimeName: string;
  name: string;
  definition: OrchestratorDefV2;
}

/**
 * Resolve the chat lead agent from the v2 active-team chain.
 * Tab override may be a teamId, orchestrator FQID, runtimeName, or bare asset id.
 * When unset, uses resolveActiveTeam (session → project → app → core → My Content).
 */
export function resolveChatOrchestrator(
  projectRoot: string,
  opts?: {
    sessionTeamId?: string | null;
    /** @deprecated Prefer sessionTeamId; still accepted for tab.orchestratorId. */
    orchestratorId?: string | null;
  },
): ChatOrchestratorResolved {
  const view = getProjectView(projectRoot);
  const pick = (asset: AssetViewV2): ChatOrchestratorResolved => ({
    teamId: asset.teamId,
    fqid: asset.fqid,
    runtimeName: asset.runtimeName,
    name: asset.name,
    definition: asset.definition as OrchestratorDefV2,
  });

  let resolved: ChatOrchestratorResolved | null = null;

  const override = opts?.orchestratorId?.trim();
  if (override) {
    // Team id → that team's lead (session-style override via old field).
    const asTeam = view.teams.find((t) => t.manifest.id === override);
    if (asTeam?.enabled && asTeam.hasOrchestrator && asTeam.orchestratorId) {
      const asset = view.byFqid.get(toFqid(asTeam.manifest.id, asTeam.orchestratorId));
      if (asset?.enabled && asset.kind === "orchestrator") resolved = pick(asset);
    }
    if (!resolved) {
      const byFqid = view.byFqid.get(override);
      if (byFqid?.enabled && byFqid.kind === "orchestrator") resolved = pick(byFqid);
    }
    if (!resolved) {
      const byName = view.assets.find(
        (a) =>
          a.kind === "orchestrator"
          && a.enabled
          && (a.runtimeName === override || a.id === override),
      );
      if (byName) resolved = pick(byName);
    }
  }

  if (!resolved) {
    const team = resolveActiveTeam(projectRoot, opts?.sessionTeamId);
    if (!team?.orchestratorId) {
      throw new Error("No installed team with an enabled lead agent");
    }
    const fqid = toFqid(team.manifest.id, team.orchestratorId);
    const asset = view.byFqid.get(fqid);
    if (!asset?.enabled || asset.kind !== "orchestrator") {
      throw new Error(`Active lead agent not found or disabled: ${fqid}`);
    }
    resolved = pick(asset);
  }

  log.debug("resolveChatOrchestrator", {
    project: basename(projectRoot),
    sessionTeamId: opts?.sessionTeamId ?? null,
    orchestratorIdArg: opts?.orchestratorId ?? null,
    teamId: resolved.teamId,
    fqid: resolved.fqid,
    runtimeName: resolved.runtimeName,
    name: resolved.name,
  });
  return resolved;
}

// ── Roster resolution (design §6.3; never silently drop) ──

export function resolveRoster(projectRoot: string, teamId: string): RosterView | null {
  const view = getProjectView(projectRoot);
  const team = view.teams.find((t) => t.manifest.id === teamId);
  if (!team || !team.hasOrchestrator || !team.orchestratorId) return null;
  const orchestratorFqid = toFqid(teamId, team.orchestratorId);
  const orchAsset = view.byFqid.get(orchestratorFqid);
  if (!orchAsset) return null;

  const spec = (orchAsset.definition as OrchestratorDefV2).roster ?? { mode: "all" as const };
  const allSubagents = view.assets.filter((a) => a.kind === "subagent");

  const toEntry = (s: AssetViewV2, via: RosterEntryView["via"]): RosterEntryView => ({
    fqid: s.fqid,
    name: s.name,
    origin: s.origin,
    via,
    unavailable: s.enabled ? undefined : s.blockedBy,
  });

  if (spec.mode === "all") {
    return {
      teamId,
      orchestratorFqid,
      spec,
      entries: allSubagents.filter((s) => s.enabled).map((s) => toEntry(s, "all")),
    };
  }

  const out: RosterEntryView[] = [];
  const seen = new Set<Fqid>();
  const pushUnique = (e: RosterEntryView) => {
    if (seen.has(e.fqid)) return;
    seen.add(e.fqid);
    out.push(e);
  };

  for (const ref of spec.members as RosterRef[]) {
    if (ref === "@team") {
      for (const s of allSubagents.filter((x) => x.teamId === teamId)) {
        pushUnique(toEntry(s, "team"));
      }
      continue;
    }
    // Exact FQID, else authorized bare-id resolve (override members / legacy
    // same-team lift that pointed at a missing asset, e.g. user.local:foo → core:foo).
    let target = view.byFqid.get(ref) ?? null;
    if (!target) {
      const bare = parseFqid(ref)?.contentId ?? ref;
      const resolved = resolveRef(projectRoot, bare, teamId, "subagent");
      if (resolved) target = view.byFqid.get(resolved) ?? null;
    }
    if (!target) {
      // Dangling reference: keep it, marked, so the UI can explain.
      out.push({
        fqid: ref,
        name: ref,
        origin: {
          teamId: parseFqid(ref)?.teamId ?? "",
          teamName: parseFqid(ref)?.teamId ?? "",
          scope: "app",
          source: "bundled",
          tier: "free",
        },
        via: "explicit",
        unavailable: "not-installed",
      });
      continue;
    }
    if (!canReference(team, target.origin)) {
      out.push({ ...toEntry(target, "explicit"), unavailable: "out-of-scope" });
      continue;
    }
    pushUnique(toEntry(target, "explicit"));
  }

  return { teamId, orchestratorFqid, spec, entries: out };
}

/**
 * Skills allowlist for a team (mirrors resolveRoster for subagents).
 * Default when unset: own-team skills only (`@team`) — not the global union.
 * Teams without a lead still expose own-team skills (no foreign `+` slot).
 */
export function resolveSkillsRoster(projectRoot: string, teamId: string): RosterView | null {
  const view = getProjectView(projectRoot);
  const team = view.teams.find((t) => t.manifest.id === teamId);
  if (!team) return null;

  const allSkills = view.assets.filter((a) => a.kind === "skill");
  const toEntry = (s: AssetViewV2, via: RosterEntryView["via"]): RosterEntryView => ({
    fqid: s.fqid,
    name: s.name,
    origin: s.origin,
    via,
    unavailable: s.enabled ? undefined : s.blockedBy,
  });

  const ownOnly = (): RosterView => ({
    teamId,
    orchestratorFqid: team.orchestratorId ? toFqid(teamId, team.orchestratorId) : `${teamId}:`,
    spec: { mode: "list", members: ["@team"] },
    entries: allSkills.filter((s) => s.teamId === teamId).map((s) => toEntry(s, "team")),
  });

  if (!team.hasOrchestrator || !team.orchestratorId) return ownOnly();

  const orchestratorFqid = toFqid(teamId, team.orchestratorId);
  const orchAsset = view.byFqid.get(orchestratorFqid);
  if (!orchAsset) return ownOnly();

  const spec =
    (orchAsset.definition as OrchestratorDefV2).skillsRoster
    ?? { mode: "list" as const, members: ["@team"] };

  if (spec.mode === "all") {
    // Product: skills are never "all teams". Treat as own-team only.
    return ownOnly();
  }

  const out: RosterEntryView[] = [];
  const seen = new Set<Fqid>();
  const pushUnique = (e: RosterEntryView) => {
    if (seen.has(e.fqid)) return;
    seen.add(e.fqid);
    out.push(e);
  };

  for (const ref of spec.members as RosterRef[]) {
    if (ref === "@team") {
      for (const s of allSkills.filter((x) => x.teamId === teamId)) {
        pushUnique(toEntry(s, "team"));
      }
      continue;
    }
    let target = view.byFqid.get(ref) ?? null;
    if (!target) {
      const bare = parseFqid(ref)?.contentId ?? ref;
      const resolved = resolveRef(projectRoot, bare, teamId, "skill");
      if (resolved) target = view.byFqid.get(resolved) ?? null;
    }
    if (!target || target.kind !== "skill") {
      out.push({
        fqid: ref,
        name: ref,
        origin: {
          teamId: parseFqid(ref)?.teamId ?? "",
          teamName: parseFqid(ref)?.teamId ?? "",
          scope: "app",
          source: "bundled",
          tier: "free",
        },
        via: "explicit",
        unavailable: "not-installed",
      });
      continue;
    }
    if (!canReference(team, target.origin)) {
      out.push({ ...toEntry(target, "explicit"), unavailable: "out-of-scope" });
      continue;
    }
    pushUnique(toEntry(target, "explicit"));
  }

  return { teamId, orchestratorFqid, spec, entries: out };
}

/**
 * Commands allowlist for a team (mirrors resolveSkillsRoster).
 * Default when unset: own-team commands only (`@team`).
 */
export function resolveCommandsRoster(projectRoot: string, teamId: string): RosterView | null {
  const view = getProjectView(projectRoot);
  const team = view.teams.find((t) => t.manifest.id === teamId);
  if (!team) return null;

  // Team roster never includes app-level commands (they are not team assets).
  const allCommands = view.assets.filter(
    (a) => a.kind === "command" && a.teamId !== APP_COMMANDS_OWNER_ID,
  );
  const toEntry = (c: AssetViewV2, via: RosterEntryView["via"]): RosterEntryView => ({
    fqid: c.fqid,
    name: c.name,
    origin: c.origin,
    via,
    unavailable: c.enabled ? undefined : c.blockedBy,
  });

  const ownOnly = (): RosterView => ({
    teamId,
    orchestratorFqid: team.orchestratorId ? toFqid(teamId, team.orchestratorId) : `${teamId}:`,
    spec: { mode: "list", members: ["@team"] },
    entries: allCommands.filter((c) => c.teamId === teamId).map((c) => toEntry(c, "team")),
  });

  if (!team.hasOrchestrator || !team.orchestratorId) return ownOnly();

  const orchestratorFqid = toFqid(teamId, team.orchestratorId);
  const orchAsset = view.byFqid.get(orchestratorFqid);
  if (!orchAsset) return ownOnly();

  const spec =
    (orchAsset.definition as OrchestratorDefV2).commandsRoster
    ?? { mode: "list" as const, members: ["@team"] };

  if (spec.mode === "all") {
    return ownOnly();
  }

  const out: RosterEntryView[] = [];
  const seen = new Set<Fqid>();
  const pushUnique = (e: RosterEntryView) => {
    if (seen.has(e.fqid)) return;
    seen.add(e.fqid);
    out.push(e);
  };

  for (const ref of spec.members as RosterRef[]) {
    if (ref === "@team") {
      for (const c of allCommands.filter((x) => x.teamId === teamId)) {
        pushUnique(toEntry(c, "team"));
      }
      continue;
    }
    let target = view.byFqid.get(ref) ?? null;
    if (!target) {
      const bare = parseFqid(ref)?.contentId ?? ref;
      const resolved = resolveRef(projectRoot, bare, teamId, "command");
      if (resolved) target = view.byFqid.get(resolved) ?? null;
    }
    if (!target || target.kind !== "command") {
      out.push({
        fqid: ref,
        name: ref,
        origin: {
          teamId: parseFqid(ref)?.teamId ?? "",
          teamName: parseFqid(ref)?.teamId ?? "",
          scope: "app",
          source: "bundled",
          tier: "free",
        },
        via: "explicit",
        unavailable: "not-installed",
      });
      continue;
    }
    if (!canReference(team, target.origin)) {
      out.push({ ...toEntry(target, "explicit"), unavailable: "out-of-scope" });
      continue;
    }
    pushUnique(toEntry(target, "explicit"));
  }

  return { teamId, orchestratorFqid, spec, entries: out };
}

/**
 * Slash menu / expand default set: all enabled app commands ∪ active team
 * commands roster (own + foreign via +). App commands are never team-owned.
 */
export function listEffectiveSlashCommands(
  projectRoot: string,
  teamId?: string | null,
): AssetViewV2[] {
  const view = getProjectView(projectRoot);
  const appCmds = view.assets.filter(
    (a) => a.kind === "command" && a.teamId === APP_COMMANDS_OWNER_ID && a.enabled,
  );
  const activeId = teamId?.trim() || resolveActiveTeam(projectRoot)?.manifest.id || null;
  if (!activeId) return appCmds;

  const roster = resolveCommandsRoster(projectRoot, activeId);
  const byFqid = new Map<Fqid, AssetViewV2>();
  for (const c of appCmds) byFqid.set(c.fqid, c);
  for (const entry of roster?.entries ?? []) {
    if (entry.unavailable) continue;
    if (entry.fqid.startsWith(`${APP_COMMANDS_OWNER_ID}:`)) continue;
    const asset = view.byFqid.get(entry.fqid);
    if (asset?.kind === "command" && asset.enabled) byFqid.set(asset.fqid, asset);
  }
  return [...byFqid.values()];
}

// ── Content read ──────────────────────────────────────────

export function readInstructions(projectRoot: string, fqid: Fqid): string {
  const item = getAsset(projectRoot, fqid);
  if (!item || (item.kind !== "orchestrator" && item.kind !== "subagent")) return "";
  const path = join(item.dir, "instructions.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8").trim();
}

/** MCP servers as first-class assets (design §7.4). */
export function listMcpServers(projectRoot: string): AssetViewV2[] {
  return listAssets(projectRoot, "mcp");
}

// ── Test-only reset ───────────────────────────────────────

export function __resetTeamsResolverForTests(): void {
  projectViews.clear();
  listeners.clear();
  invalidateCatalog();
}

/** Test-only stable host version injection for runtime compatibility gates. */
export function __setHostVersionForTests(version: string | null | undefined): void {
  hostVersionOverrideForTests = version;
  projectViews.clear();
}
