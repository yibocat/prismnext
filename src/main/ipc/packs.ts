// Pack lifecycle IPC (spec §9.5): listCatalog / install / setEnabled / uninstall /
// setContentEnabled / saveOverride / resetCoreDefaults / getCoreState /
// resolveBadge / getContentView / setDefaultOrchestrator.
import { ipcMain } from "electron";
import { CORE_PACK_ID } from "../../shared/packs/types";
import type { ContentKind, ContentOverride, Fqid } from "../../shared/packs/types";
import { getPackContentsWithMcp } from "../services/pack-catalog";
import {
  isContentActive,
  listContent,
  listProjectMcps,
  listProjectPacks,
  notifyPacksChanged,
  resolveBadge,
  resolveOrchestratorId,
} from "../services/pack-resolver";
import {
  installPack,
  setPackEnabledFlow,
  uninstallPack,
} from "../services/packs-lifecycle";
import {
  getCoreContentModificationState,
  readPacksState,
  resetCoreContentToDefaults,
  saveContentOverride,
  setContentDisabled,
  setDefaultOrchestratorFqid,
} from "../services/packs-state";

function requireProjectRoot(projectRoot: string | null | undefined): string {
  if (!projectRoot) throw new Error("No project root");
  return projectRoot;
}

const CONTENT_KINDS: ContentKind[] = ["orchestrator", "expert", "skill", "command"];

export function registerPacksHandlers(): void {
  // catalog ∪ 项目状态（ProjectPackView[]：installed/enabled/locked/compatible）
  ipcMain.handle("packs:listCatalog", async (_event, args?: { projectRoot?: string | null }) => {
    if (!args?.projectRoot) return [];
    return listProjectPacks(args.projectRoot);
  });

  ipcMain.handle(
    "packs:install",
    async (_event, args: { projectRoot: string; packId: string }) => {
      return installPack(requireProjectRoot(args.projectRoot), args.packId);
    },
  );

  ipcMain.handle(
    "packs:setEnabled",
    async (_event, args: { projectRoot: string; packId: string; enabled: boolean }) => {
      return setPackEnabledFlow(requireProjectRoot(args.projectRoot), args.packId, args.enabled);
    },
  );

  ipcMain.handle(
    "packs:uninstall",
    async (_event, args: { projectRoot: string; packId: string }) => {
      uninstallPack(requireProjectRoot(args.projectRoot), args.packId);
    },
  );

  // 逐项启停（§6.2 轻量操作：disabledContent 增删，视图经写入订阅即时失效）
  ipcMain.handle(
    "packs:setContentEnabled",
    async (_event, args: { projectRoot: string; fqid: Fqid; enabled: boolean }) => {
      setContentDisabled(requireProjectRoot(args.projectRoot), args.fqid, !args.enabled);
    },
  );

  // Badge single source (spec §9.3, fixes P10): FQID or bare id.
  ipcMain.handle(
    "packs:resolveBadge",
    async (_event, args?: { projectRoot?: string | null; fqidOrId?: string }) => {
      if (!args?.projectRoot || !args.fqidOrId) return null;
      return resolveBadge(args.projectRoot, args.fqidOrId);
    },
  );

  // Settings grouped data (spec §9.2: expanded pack row = its content items).
  ipcMain.handle(
    "packs:getContentView",
    async (_event, args?: { projectRoot?: string | null; kind?: string }) => {
      if (!args?.projectRoot) return [];
      const kind = args.kind as ContentKind | undefined;
      if (!kind || !CONTENT_KINDS.includes(kind)) return [];
      return listContent(args.projectRoot, kind);
    },
  );

  // Save an override for a content item (Phase 6: replaces legacy
  // `experts:saveBuiltinOverride` / `orchestrators:saveBuiltinOverride`).
  // An all-undefined patch removes the override (single-item reset).
  ipcMain.handle(
    "packs:saveOverride",
    async (
      _event,
      args: { projectRoot: string; fqid: Fqid; patch: ContentOverride },
    ) => {
      const root = requireProjectRoot(args.projectRoot);
      if (!args.fqid || typeof args.patch !== "object" || args.patch === null) {
        throw new Error("Invalid override payload");
      }
      saveContentOverride(root, args.fqid, args.patch);
      notifyPacksChanged(root);
    },
  );

  // Core content modification state + default orchestrator (drives the
  // "Reset to defaults" availability and the Default badge). Replaces the
  // legacy `experts:getManifest` / `orchestrators:getManifest` consumers.
  ipcMain.handle(
    "packs:getCoreState",
    async (_event, args?: { projectRoot?: string | null }) => {
      if (!args?.projectRoot) return null;
      const root = args.projectRoot;
      const state = readPacksState(root);
      const coreExperts = listContent(root, "expert").filter((c) => c.packId === CORE_PACK_ID);
      const coreOrchs = listContent(root, "orchestrator").filter((c) => c.packId === CORE_PACK_ID);
      const expertState = getCoreContentModificationState(
        root,
        coreExperts.map((c) => c.fqid),
      );
      const orchState = getCoreContentModificationState(
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
        coreExpertDisabledCount: expertState.disabledCount,
        coreExpertOverrideCount: expertState.overrideCount,
        coreOrchestratorDisabledCount: orchState.disabledCount,
        coreOrchestratorOverrideCount: orchState.overrideCount,
      };
    },
  );

  // Factory-reset core content of a kind (Phase 6: replaces legacy
  // `experts:resetBuiltinsToDefaults`). The IPC layer resolves the kind-aware
  // core FQID set from the resolver view so packs-state stays storage-only.
  ipcMain.handle(
    "packs:resetCoreDefaults",
    async (_event, args: { projectRoot: string; kind: "expert" | "orchestrator" }) => {
      const root = requireProjectRoot(args.projectRoot);
      if (args.kind !== "expert" && args.kind !== "orchestrator") {
        throw new Error("Invalid kind");
      }
      const fqids = listContent(root, args.kind)
        .filter((c) => c.packId === CORE_PACK_ID)
        .map((c) => c.fqid);
      resetCoreContentToDefaults(root, fqids);
      notifyPacksChanged(root);
    },
  );

  // Catalog-level content scan (no install required; detail view "what's in this pack").
  // Includes MCP servers declared by the pack's mcp.json.
  ipcMain.handle("packs:getPackContents", async (_event, args?: { packId?: string }) => {
    if (!args?.packId) return [];
    try {
      return getPackContentsWithMcp(args.packId);
    } catch {
      return [];
    }
  });

  // Pack-declared MCP servers (app-level resource, project-gated) — the MCP
  // settings page shows these under "From teams" with enabled/greyed state.
  ipcMain.handle("packs:listProjectMcps", async (_event, args?: { projectRoot?: string | null }) => {
    if (!args?.projectRoot) return [];
    return listProjectMcps(args.projectRoot);
  });

  // Spec §9.4 link UX confirm: target must be currently active to become default.
  ipcMain.handle(
    "packs:setDefaultOrchestrator",
    async (_event, args: { projectRoot: string; fqid: Fqid }) => {
      const root = requireProjectRoot(args.projectRoot);
      if (!isContentActive(root, args.fqid)) {
        throw new Error(`Orchestrator is not active: ${args.fqid}`);
      }
      setDefaultOrchestratorFqid(root, args.fqid);
      notifyPacksChanged(root);
    },
  );
}
