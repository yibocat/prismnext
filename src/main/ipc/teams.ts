// Pack lifecycle IPC (spec §9.5): listCatalog / install / setEnabled / uninstall /
// setContentEnabled / saveOverride / resetCoreDefaults / getCoreState /
// resolveOrigin / getContentView / setDefaultOrchestrator.
import { ipcMain } from "electron";
import { CORE_TEAM_ID } from "../../shared/teams/types";
import type { AssetKind, AssetOverride, Fqid } from "../../shared/teams/types";
import { getTeamContentsWithMcp } from "../services/team-catalog";
import {
  isAssetActive,
  listAssets,
  listProjectMcps,
  listProjectTeams,
  notifyTeamsChanged,
  resolveOrigin,
  resolveOrchestratorId,
} from "../services/team-resolver";
import {
  installTeam,
  setTeamEnabledFlow,
  uninstallTeam,
} from "../services/teams-lifecycle";
import {
  getCoreAssetModificationState,
  readTeamsState,
  resetCoreAssetsToDefaults,
  saveAssetOverride,
  setAssetDisabled,
  setDefaultOrchestratorFqid,
} from "../services/teams-state";

function requireProjectRoot(projectRoot: string | null | undefined): string {
  if (!projectRoot) throw new Error("No project root");
  return projectRoot;
}

const CONTENT_KINDS: AssetKind[] = ["orchestrator", "subagent", "skill", "command"];

export function registerPacksHandlers(): void {
  // catalog ∪ 项目状态（ProjectTeamView[]：installed/enabled/locked/compatible）
  ipcMain.handle("teams:list", async (_event, args?: { projectRoot?: string | null }) => {
    if (!args?.projectRoot) return [];
    return listProjectTeams(args.projectRoot);
  });

  ipcMain.handle(
    "teams:install",
    async (_event, args: { projectRoot: string; teamId: string }) => {
      return installTeam(requireProjectRoot(args.projectRoot), args.teamId);
    },
  );

  ipcMain.handle(
    "teams:setEnabled",
    async (_event, args: { projectRoot: string; teamId: string; enabled: boolean }) => {
      return setTeamEnabledFlow(requireProjectRoot(args.projectRoot), args.teamId, args.enabled);
    },
  );

  ipcMain.handle(
    "teams:uninstall",
    async (_event, args: { projectRoot: string; teamId: string }) => {
      uninstallTeam(requireProjectRoot(args.projectRoot), args.teamId);
    },
  );

  // 逐项启停（§6.2 轻量操作：disabledContent 增删，视图经写入订阅即时失效）
  ipcMain.handle(
    "teams:setAssetEnabled",
    async (_event, args: { projectRoot: string; fqid: Fqid; enabled: boolean }) => {
      setAssetDisabled(requireProjectRoot(args.projectRoot), args.fqid, !args.enabled);
    },
  );

  // Badge single source (spec §9.3, fixes P10): FQID or bare id.
  ipcMain.handle(
    "teams:resolveOrigin",
    async (_event, args?: { projectRoot?: string | null; fqidOrId?: string }) => {
      if (!args?.projectRoot || !args.fqidOrId) return null;
      return resolveOrigin(args.projectRoot, args.fqidOrId);
    },
  );

  // Settings grouped data (spec §9.2: expanded pack row = its content items).
  ipcMain.handle(
    "teams:listAssets",
    async (_event, args?: { projectRoot?: string | null; kind?: string }) => {
      if (!args?.projectRoot) return [];
      const kind = args.kind as AssetKind | undefined;
      if (!kind || !CONTENT_KINDS.includes(kind)) return [];
      return listAssets(args.projectRoot, kind);
    },
  );

  // Save an override for a content item (Phase 6: replaces legacy
  // `experts:saveBuiltinOverride` / `orchestrators:saveBuiltinOverride`).
  // An all-undefined patch removes the override (single-item reset).
  ipcMain.handle(
    "teams:saveAssetOverride",
    async (
      _event,
      args: { projectRoot: string; fqid: Fqid; patch: AssetOverride },
    ) => {
      const root = requireProjectRoot(args.projectRoot);
      if (!args.fqid || typeof args.patch !== "object" || args.patch === null) {
        throw new Error("Invalid override payload");
      }
      saveAssetOverride(root, args.fqid, args.patch);
      notifyTeamsChanged(root);
    },
  );

  // Core content modification state + default orchestrator (drives the
  // "Reset to defaults" availability and the Default badge). Replaces the
  // legacy `experts:getManifest` / `orchestrators:getManifest` consumers.
  ipcMain.handle(
    "teams:getCoreState",
    async (_event, args?: { projectRoot?: string | null }) => {
      if (!args?.projectRoot) return null;
      const root = args.projectRoot;
      const state = readTeamsState(root);
      const coreExperts = listAssets(root, "subagent").filter((c) => c.teamId === CORE_TEAM_ID);
      const coreOrchs = listAssets(root, "orchestrator").filter((c) => c.teamId === CORE_TEAM_ID);
      const expertState = getCoreAssetModificationState(
        root,
        coreExperts.map((c) => c.fqid),
      );
      const orchState = getCoreAssetModificationState(
        root,
        coreOrchs.map((c) => c.fqid),
      );
      const defaultOrch = coreOrchs.find((c) => c.fqid === state.defaultOrchestrator);
      // The EFFECTIVE default: resolver falls back to the core default when the
      // stored default's pack is disabled in this project (its content is not
      // active). The UI must show the agent that actually runs, not the raw
      // stored value — otherwise a disabled team keeps its DEFAULT badge even
      // though chat already uses the core default.
      const effectiveDefaultFqid = resolveOrchestratorId(root);
      return {
        defaultOrchestratorId: defaultOrch?.id ?? null,
        // Full-fidelity default (any pack, not just core): UI matches against
        // `orchestrator.fqid` so a non-core default is preserved across reloads
        // instead of silently falling back to the core default.
        defaultOrchestratorFqid: effectiveDefaultFqid,
        coreSubagentDisabledCount: expertState.disabledCount,
        coreSubagentOverrideCount: expertState.overrideCount,
        coreOrchestratorDisabledCount: orchState.disabledCount,
        coreOrchestratorOverrideCount: orchState.overrideCount,
      };
    },
  );

  // Factory-reset core content of a kind (Phase 6: replaces legacy
  // `experts:resetBuiltinsToDefaults`). The IPC layer resolves the kind-aware
  // core FQID set from the resolver view so packs-state stays storage-only.
  ipcMain.handle(
    "teams:resetCoreDefaults",
    async (_event, args: { projectRoot: string; kind: "subagent" | "orchestrator" }) => {
      const root = requireProjectRoot(args.projectRoot);
      if (args.kind !== "subagent" && args.kind !== "orchestrator") {
        throw new Error("Invalid kind");
      }
      const fqids = listAssets(root, args.kind)
        .filter((c) => c.teamId === CORE_TEAM_ID)
        .map((c) => c.fqid);
      resetCoreAssetsToDefaults(root, fqids);
      notifyTeamsChanged(root);
    },
  );

  // Catalog-level content scan (no install required; detail view "what's in this pack").
  // Includes MCP servers declared by the pack's mcp.json.
  ipcMain.handle("teams:getTeamContents", async (_event, args?: { teamId?: string }) => {
    if (!args?.teamId) return [];
    try {
      return getTeamContentsWithMcp(args.teamId);
    } catch {
      return [];
    }
  });

  // Pack-declared MCP servers (app-level resource, project-gated) — the MCP
  // settings page shows these under "From teams" with enabled/greyed state.
  ipcMain.handle("teams:listProjectMcps", async (_event, args?: { projectRoot?: string | null }) => {
    if (!args?.projectRoot) return [];
    return listProjectMcps(args.projectRoot);
  });

  // Spec §9.4 link UX confirm: target must be currently active to become default.
  ipcMain.handle(
    "teams:setDefaultOrchestrator",
    async (_event, args: { projectRoot: string; fqid: Fqid }) => {
      const root = requireProjectRoot(args.projectRoot);
      if (!isAssetActive(root, args.fqid)) {
        throw new Error(`Orchestrator is not active: ${args.fqid}`);
      }
      setDefaultOrchestratorFqid(root, args.fqid);
      notifyTeamsChanged(root);
    },
  );
}
