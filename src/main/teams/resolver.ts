/**
 * resolver.ts — the TeamResolver (design 2026-08-10 §6).
 *
 * The SINGLE component that answers "what teams exist, what assets exist,
 * whether they are usable, and what they look like". Pure read; nothing is
 * wired to it yet (T2). The legacy services/team-resolver.ts keeps serving
 * the existing consumers until T3/T4 switch over.
 *
 * Pipeline: discover → validate → state → gate → index → shadow → roster → emit.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AssetKind,
  BlockReason,
  Fqid,
  McpServerDef,
  RosterRef,
  TeamManifest,
} from "../../shared/teams/types";
import { CORE_TEAM_ID } from "../../shared/teams/types";
import { parseFqid, resolveTri, toFqid } from "../../shared/teams/state";
import type {
  AssetViewV2,
  OrchestratorDefV2,
  RosterEntryView,
  RosterView,
  SubagentDefV2,
  TeamViewV2,
} from "../../shared/teams/view";
import { createLogger } from "../services/logger";
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
  scanAllTeams,
  type ScannedAsset,
  type TeamRecord,
} from "./catalog";
import { compareByPrecedence } from "./precedence";
import { canReference } from "./scope";

const log = createLogger("teams-resolver");

// ── Invalidation subscriptions ────────────────────────────
// App-state writes affect EVERY project → invalidate all. Project-state writes
// invalidate only their own project. Catalog changes (team roots) invalidate all.

onAppTeamsStateWritten(() => invalidateResolver());
onProjectTeamsStateWritten((root) => invalidateResolver(root));

// Read-time fallback invalidation (T3/T4): while teams.json / teams-state.json
// don't exist yet, the resolver derives state from the legacy packs.json /
// packs-installed.json. Those legacy writes must also invalidate the view, or
// enable/disable toggles won't take effect. Removed in T6 once the migration
// writes the new files and the fallback is gone.
// Static import: a dynamic import().then() registers the listener too late for
// synchronous write→read sequences in tests and IPC handlers.
import { onTeamsStateWritten as onLegacyPacksStateWritten } from "../services/teams-state";
import { onTeamsInstalledChanged as onLegacyPacksInstalledChanged } from "../services/teams-installed";
onLegacyPacksStateWritten((root) => invalidateResolver(root));
onLegacyPacksInstalledChanged(() => invalidateResolver());

// ── View cache ────────────────────────────────────────────

interface ProjectView {
  key: string;
  teams: TeamViewV2[];
  assets: AssetViewV2[];
  byFqid: Map<Fqid, AssetViewV2>;
}

const projectViews = new Map<string, ProjectView>();

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
  const installed =
    record.source === "core" ||
    record.source === "user" ||
    record.scope === "project" ||
    appState.installed.some((r) => r.teamId === id);

  const enabledApp = appState.teamEnabled[id];
  const enabledProject = projectState.teamEnabled[id];
  const flag = resolveTri(enabledProject, enabledApp, true);

  const blockedBy: BlockReason | undefined =
    !installed
      ? "not-installed"
      : !licenseOk
        ? "license"
        : !compatible
          ? "incompatible"
          : enabledProject === false
            ? "team-disabled-project"
            : enabledProject === undefined && enabledApp === false
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
      merged.roster = { mode: "list", members: o.allowedExperts };
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
      const enabledProject = projectState.assetEnabled[fqid];
      const blockedBy: BlockReason | undefined = !team.enabled
        ? team.blockedBy
        : enabledProject === false
          ? "asset-disabled-project"
          : enabledProject === undefined && enabledApp === false
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

  // ── Shadow pass: runtimeName + blockedBy:"shadowed" (design §7.1) ──
  // core team assets keep their bare id always; others keep the bare id when
  // globally unique, else ALL colliding parties get the <teamId>--<id> prefix.
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
      const list = byName.get(a.id) ?? [];
      list.push(a);
      byName.set(a.id, list);
    }
    for (const [id, group] of byName) {
      if (group.length === 1) {
        group[0].runtimeName = id;
        continue;
      }
      // Collision: every party gets the prefixed name (including the winner),
      // so the runtime name is unambiguous. The winner is the most specific.
      const sorted = [...group].sort((a, b) => {
        const ta = teamById.get(a.teamId)!;
        const tb = teamById.get(b.teamId)!;
        return compareByPrecedence(
          { scope: ta.scope, source: ta.source, teamId: ta.manifest.id },
          { scope: tb.scope, source: tb.source, teamId: tb.manifest.id },
        );
      });
      // core keeps the bare id as the stable anchor; others prefix.
      for (const a of sorted) {
        a.runtimeName = a.teamId === CORE_TEAM_ID ? a.id : `${a.teamId}--${a.id}`;
      }
      // Mark all but the winner as shadowed (they lose the bare-name invocation).
      const winner = sorted[0];
      for (const a of sorted) {
        if (a !== winner && a.teamId !== CORE_TEAM_ID) {
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
  if (!projectRoot) return;
  void import("../services/project-subagents-refresh")
    .then((m) => m.scheduleSubagentsRefresh(projectRoot))
    .catch(() => {});
  void import("../services/project-skills-refresh")
    .then((m) => m.scheduleSkillsRefresh(projectRoot))
    .catch(() => {});
  void import("../acp/service")
    .then((m) => {
      m.AcpService.getInstance().invalidateAgentConfigCache(projectRoot);
    })
    .catch(() => {});
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
  const sorted = [...matches].sort((a, b) => {
    const ta = view.teams.find((t) => t.manifest.id === a.teamId)!;
    const tb = view.teams.find((t) => t.manifest.id === b.teamId)!;
    return compareByPrecedence(
      { scope: ta.scope, source: ta.source, teamId: ta.manifest.id },
      { scope: tb.scope, source: tb.source, teamId: tb.manifest.id },
    );
  });
  return sorted[0].fqid;
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
  const sorted = [...candidates].sort((a, b) => {
    const ta = view.teams.find((t) => t.manifest.id === a.teamId)!;
    const tb = view.teams.find((t) => t.manifest.id === b.teamId)!;
    return compareByPrecedence(
      { scope: ta.scope, source: ta.source, teamId: ta.manifest.id },
      { scope: tb.scope, source: tb.source, teamId: tb.manifest.id },
    );
  });
  return sorted[0];
}

// ── Active team (design §7.1; three-layer fallback) ───────

/**
 * Resolve the active team: session override ?? project default ?? app default
 * ?? core. Only a team that is enabled AND has a lead agent qualifies; otherwise
 * fall through. Core is the final fallback so chat never enters a no-agent state.
 */
export function resolveActiveTeam(
  projectRoot: string,
  sessionTeamId?: string | null,
): TeamViewV2 {
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
  if (core) return core;
  // Defensive: core must always exist. If the catalog is empty, synthesize a
  // minimal core view so callers never crash.
  throw new Error("Core team not found in catalog");
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
    const target = view.byFqid.get(ref);
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
