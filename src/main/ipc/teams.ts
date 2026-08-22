// Teams IPC (design 2026-08-10 §10). Query handlers read the TeamResolver
// (teams/resolver.ts); mutation handlers are thin shells over the single write
// exit (teams/lifecycle.ts). Channel names are unchanged from the T0 rename so
// existing renderer call sites keep working; only the return shapes are new
// (TeamViewV2 / AssetViewV2 with scope / blockedBy / runtimeName).
import { ipcMain } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROJECT_DEFAULT_TEAM_ID,
  type AssetKind,
  type Fqid,
  type TeamScope,
} from "../../shared/teams/types";
import type { IconSpec } from "../../shared/platform/icon-spec";
import {
  getAsset,
  getTeam,
  isAssetActive,
  listAssets,
  listMcpServers,
  listTeams,
  readInstructions,
  resolveActiveTeam,
  resolveRoster,
} from "../teams/resolver";
import { getTeamRecord } from "../teams/catalog";
import { _registeredRoots } from "../services/active-project-roots";
import {
  createTeam,
  deleteTeam,
  demoteTeam,
  installTeam,
  moveAsset,
  promoteTeam,
  saveAssetOverride,
  setActiveTeam,
  setAssetEnabled,
  setTeamEnabled,
  uninstallTeam,
  updateTeamIcon,
  setTeamIconImage,
} from "../teams/lifecycle";
import type { AssetOverride } from "../../shared/teams/types";

function requireProjectRoot(projectRoot: string | null | undefined): string {
  if (!projectRoot) throw new Error("No project root");
  return projectRoot;
}

/** A unified MCP entry for the slash catalog (project entries + team entries). */
interface UnifiedMcpEntry {
  name: string;
  enabled: boolean;
  /** "project" = user-defined in the project hangar mcp.json; otherwise the team name. */
  origin: string;
  autoStart: boolean;
}

/**
 * Merge project mcp.json entries with team-provided MCP servers (B1 fix).
 * Project entries win on name collisions (explicit project config overrides a
 * team's declaration), matching the ACP merge in acp/service.ts.
 */
function listUnifiedMcpServers(projectRoot: string): UnifiedMcpEntry[] {
  const out: UnifiedMcpEntry[] = [];
  for (const asset of listMcpServers(projectRoot)) {
    if (!asset.enabled || asset.blockedBy) continue;
    const def = asset.definition as { name: string; autoStart?: boolean };
    out.push({
      name: def.name,
      enabled: true,
      origin: asset.origin.teamName,
      autoStart: def.autoStart === true,
    });
  }

  return out;
}

export function registerPacksHandlers(): void {
  // ── Queries (TeamResolver) ──

  // All teams visible in this project, with resolved state (scope / blockedBy /
  // enabled / counts). Drives Settings → Teams and the marketplace.
  ipcMain.handle("teams:list", async (_event, args?: { projectRoot?: string | null }) => {
    if (!args?.projectRoot) return [];
    return listTeams(args.projectRoot);
  });

  ipcMain.handle("teams:get", async (_event, args?: { projectRoot?: string | null; teamId?: string }) => {
    if (!args?.projectRoot || !args.teamId) return null;
    return getTeam(args.projectRoot, args.teamId);
  });

  // Assets of a kind (orchestrator / subagent / skill / command / mcp).
  ipcMain.handle(
    "teams:listAssets",
    async (_event, args?: { projectRoot?: string | null; kind?: string }) => {
      if (!args?.projectRoot) return [];
      return listAssets(args.projectRoot, args.kind as AssetKind | undefined);
    },
  );

  // A team's roster (lead agent + members with via/unavailable annotations).
  ipcMain.handle("teams:getRoster", async (_event, args?: { projectRoot?: string | null; teamId?: string }) => {
    if (!args?.projectRoot || !args.teamId) return null;
    return resolveRoster(args.projectRoot, args.teamId);
  });

  // Skills allowlist for a team (own-team + foreign skills added via `+`).
  ipcMain.handle(
    "teams:getSkillsRoster",
    async (_event, args?: { projectRoot?: string | null; teamId?: string }) => {
      if (!args?.projectRoot || !args.teamId) return null;
      const { resolveSkillsRoster } = await import("../teams/resolver");
      return resolveSkillsRoster(args.projectRoot, args.teamId);
    },
  );

  // Commands allowlist for a team (own-team + foreign commands added via `+`).
  ipcMain.handle(
    "teams:getCommandsRoster",
    async (_event, args?: { projectRoot?: string | null; teamId?: string }) => {
      if (!args?.projectRoot || !args.teamId) return null;
      const { resolveCommandsRoster } = await import("../teams/resolver");
      return resolveCommandsRoster(args.projectRoot, args.teamId);
    },
  );

  // The active team (session → project → app → core fallback).
  ipcMain.handle(
    "teams:getActiveTeam",
    async (_event, args?: { projectRoot?: string | null; sessionTeamId?: string | null }) => {
      if (!args?.projectRoot) return null;
      return resolveActiveTeam(args.projectRoot, args.sessionTeamId);
    },
  );

  ipcMain.handle(
    "teams:readInstructions",
    async (_event, args?: { projectRoot?: string | null; fqid?: string }) => {
      if (!args?.projectRoot || !args.fqid) return "";
      return readInstructions(args.projectRoot, args.fqid);
    },
  );

  // Unified MCP list for the slash catalog (B1 fix): project mcp.json entries
  // PLUS every enabled team's MCP servers (resolved by the TeamResolver).
  ipcMain.handle("teams:listMcp", async (_event, args?: { projectRoot?: string | null }) => {
    if (!args?.projectRoot) return [];
    return listUnifiedMcpServers(args.projectRoot);
  });

  // ── Legacy-compat query channels (kept so existing UI works until T5
  //  reworks each page; implemented over the new resolver) ──

  // Content inventory of a team (marketplace detail + pack detail panel).
  // projectRoot is required for project-scoped teams (e.g. project.local).
  ipcMain.handle(
    "teams:getTeamContents",
    async (_event, args?: { teamId?: string; projectRoot?: string | null }) => {
      if (!args?.teamId) return [];
      const roots = args.projectRoot?.trim()
        ? [args.projectRoot.trim()]
        : [..._registeredRoots()];
      const record = getTeamRecord(args.teamId, roots);
      if (!record) return [];
      const out: Array<{ kind: AssetKind; id: string; name: string; description: string }> =
        record.assets.map((a) => ({
          kind: a.kind,
          id: a.id,
          name: a.name,
          description: a.description,
        }));
      for (const m of record.mcps) {
        out.push({ kind: "mcp", id: m.id, name: m.name, description: m.description ?? "" });
      }
      return out;
    },
  );

  // Team-provided MCP servers (MCP settings page "From teams" section).
  ipcMain.handle("teams:listProjectMcps", async (_event, args?: { projectRoot?: string | null }) => {
    if (!args?.projectRoot) return [];
    return listMcpServers(args.projectRoot);
  });

  // ── Mutations (lifecycle; the single write exit) ──

  // Install is app-level (no projectRoot needed for the write itself).
  ipcMain.handle("teams:install", async (_event, args: { teamId: string }) => {
    return installTeam(args.teamId);
  });

  ipcMain.handle("teams:uninstall", async (_event, args: { teamId: string }) => {
    uninstallTeam(args.teamId);
  });

  // Team enable/disable is workbench-global (D-29). scope is kept for API
  // compatibility; both layers write the home teams-state.json.
  ipcMain.handle(
    "teams:setEnabled",
    async (
      _event,
      args: { projectRoot?: string | null; teamId: string; enabled: boolean | null; scope?: TeamScope },
    ) => {
      const scope: TeamScope = args.scope ?? "app";
      return setTeamEnabled(args.teamId, args.enabled, scope, args.projectRoot ?? undefined);
    },
  );

  // Asset enable/disable (tri-state).
  ipcMain.handle(
    "teams:setAssetEnabled",
    async (
      _event,
      args: { projectRoot?: string | null; fqid: Fqid; enabled: boolean | null; scope?: TeamScope },
    ) => {
      const scope: TeamScope = args.scope ?? "app";
      setAssetEnabled(args.fqid, args.enabled, scope, args.projectRoot ?? undefined);
    },
  );

  // Save an asset override at the given layer.
  ipcMain.handle(
    "teams:saveAssetOverride",
    async (
      _event,
      args: { projectRoot?: string | null; fqid: Fqid; patch: AssetOverride; scope?: TeamScope },
    ) => {
      if (!args.fqid || typeof args.patch !== "object" || args.patch === null) {
        throw new Error("Invalid override payload");
      }
      const scope: TeamScope = args.scope ?? "project";
      saveAssetOverride(args.fqid, args.patch, scope, args.projectRoot ?? undefined);
    },
  );

  // Set the active team (project or app layer).
  ipcMain.handle(
    "teams:setActiveTeam",
    async (
      _event,
      args: { projectRoot?: string | null; teamId: string; scope?: "project" | "app" },
    ) => {
      const scope = args.scope ?? "project";
      if (scope === "app" && args.teamId === PROJECT_DEFAULT_TEAM_ID) {
        throw new Error("Project-scoped teams cannot be app defaults.");
      }
      setActiveTeam(args.teamId, scope, args.projectRoot ?? undefined);
    },
  );

  // Create / delete a team (writable teams only). Custom teams are local hangars —
  // not store/distribution packs.
  ipcMain.handle(
    "teams:create",
    async (
      _event,
      args: {
        projectRoot?: string | null;
        name: string;
        description?: string;
        longDescription?: string;
        tags?: string[];
        scope: TeamScope;
        leadName?: string;
        leadInstructions?: string;
        icon?: IconSpec | null;
        iconImagePngBase64?: string;
      },
    ) => {
      return createTeam({
        name: args.name,
        description: args.description,
        longDescription: args.longDescription,
        tags: args.tags,
        scope: args.scope,
        projectRoot: args.projectRoot ?? undefined,
        leadName: args.leadName,
        leadInstructions: args.leadInstructions,
        icon: args.icon,
        iconImagePngBase64: args.iconImagePngBase64,
      });
    },
  );

  ipcMain.handle(
    "teams:updateIcon",
    async (
      _event,
      args: { teamId: string; projectRoot?: string | null; icon: IconSpec | null },
    ) => {
      updateTeamIcon(args.teamId, args.projectRoot ?? undefined, args.icon);
    },
  );

  ipcMain.handle(
    "teams:setIconImage",
    async (
      _event,
      args: { teamId: string; projectRoot?: string | null; pngBase64: string },
    ) => {
      setTeamIconImage(
        args.teamId,
        args.projectRoot ?? undefined,
        Buffer.from(args.pngBase64, "base64"),
      );
    },
  );

  ipcMain.handle(
    "teams:delete",
    async (_event, args: { teamId: string; projectRoot?: string | null }) => {
      deleteTeam(args.teamId, args.projectRoot ?? undefined);
    },
  );

  // Promote / demote a team across scopes; move an asset across teams.
  ipcMain.handle(
    "teams:promote",
    async (_event, args: { teamId: string; projectRoot: string }) => {
      return promoteTeam(args.teamId, requireProjectRoot(args.projectRoot));
    },
  );

  ipcMain.handle(
    "teams:demote",
    async (_event, args: { teamId: string; projectRoot: string }) => {
      return demoteTeam(args.teamId, requireProjectRoot(args.projectRoot));
    },
  );

  ipcMain.handle(
    "teams:moveAsset",
    async (_event, args: { projectRoot: string; fqid: Fqid; targetTeamId: string }) => {
      return moveAsset(args.fqid, args.targetTeamId, requireProjectRoot(args.projectRoot));
    },
  );

  // ── Legacy-compat mutations/state (mapped onto the new model) ──

  // Set the default lead agent by orchestrator FQID → activates its team.
  ipcMain.handle(
    "teams:setDefaultOrchestrator",
    async (_event, args: { projectRoot: string; fqid: Fqid }) => {
      const root = requireProjectRoot(args.projectRoot);
      const asset = getAsset(root, args.fqid);
      if (!asset || asset.kind !== "orchestrator" || !asset.enabled) {
        throw new Error(`Orchestrator is not active: ${args.fqid}`);
      }
      setActiveTeam(asset.teamId, "project", root);
    },
  );

  // Origin badge for a content item (FQID or bare id).
  ipcMain.handle(
    "teams:resolveOrigin",
    async (_event, args?: { projectRoot?: string | null; fqidOrId?: string }) => {
      if (!args?.projectRoot || !args.fqidOrId) return null;
      const asset = getAsset(args.projectRoot, args.fqidOrId);
      if (!asset) return null;
      return {
        teamId: asset.origin.teamId,
        teamName: asset.origin.teamName,
        teamTier: asset.origin.tier,
      };
    },
  );

  // Core content modification state + the effective active lead (drives the
  // Reset button and the Default badge on the legacy Teams & Agents page).
  ipcMain.handle("teams:getCoreState", async (_event, args?: { projectRoot?: string | null }) => {
    if (!args?.projectRoot) return null;
    const root = args.projectRoot;
    const coreSubagents = listAssets(root, "subagent").filter((c) => c.teamId === "prismnext.core");
    const coreOrchs = listAssets(root, "orchestrator").filter((c) => c.teamId === "prismnext.core");
    const countModified = (items: typeof coreSubagents) => ({
      disabledCount: items.filter((i) => i.enabledProject === false || i.enabledApp === false).length,
      overrideCount: items.filter((i) => i.hasOverride).length,
    });
    const subagentState = countModified(coreSubagents);
    const orchState = countModified(coreOrchs);
    const activeTeam = resolveActiveTeam(root);
    const activeOrchFqid = activeTeam?.orchestratorId
      ? `${activeTeam.manifest.id}:${activeTeam.orchestratorId}`
      : null;
    return {
      defaultOrchestratorId: activeTeam?.orchestratorId ?? null,
      defaultOrchestratorFqid: activeOrchFqid,
      coreSubagentDisabledCount: subagentState.disabledCount,
      coreSubagentOverrideCount: subagentState.overrideCount,
      coreOrchestratorDisabledCount: orchState.disabledCount,
      coreOrchestratorOverrideCount: orchState.overrideCount,
    };
  });

  // Factory-reset core content of a kind (clears per-item disables + overrides).
  ipcMain.handle(
    "teams:resetCoreDefaults",
    async (_event, args: { projectRoot: string; kind: "subagent" | "orchestrator" }) => {
      const root = requireProjectRoot(args.projectRoot);
      if (args.kind !== "subagent" && args.kind !== "orchestrator") {
        throw new Error("Invalid kind");
      }
      const coreAssets = listAssets(root, args.kind).filter((c) => c.teamId === "prismnext.core");
      for (const asset of coreAssets) {
        setAssetEnabled(asset.fqid, null, "project", root);
        saveAssetOverride(asset.fqid, {}, "project", root);
      }
    },
  );
}
