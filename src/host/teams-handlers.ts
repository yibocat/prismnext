import type { IconSpec } from "../shared/platform/icon-spec";
import {
  PROJECT_DEFAULT_TEAM_ID,
  type AssetKind,
  type AssetOverride,
  type Fqid,
  type TeamScope,
} from "../shared/teams/types";
import {
  getAsset,
  getTeam,
  listAssets,
  listMcpServers,
  listTeams,
  readInstructions,
  resolveActiveTeam,
  resolveCommandsRoster,
  resolveRoster,
  resolveSkillsRoster,
} from "../main/teams/resolver";
import { getTeamRecord } from "../main/teams/catalog";
import { _registeredRoots } from "../main/project/active-project-roots";
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
  setTeamIconImage,
  uninstallTeam,
  updateTeamIcon,
} from "../main/teams/lifecycle";
import { ensureMyContentTeam } from "../main/teams/my-content";
import { setProjectDefaultTeam } from "../main/teams/state-project";
import type { HostHandlerContext } from "./context";

function projectRoot(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  const raw = typeof params.projectRoot === "string"
    ? params.projectRoot
    : typeof params.projectPath === "string"
      ? params.projectPath
      : ctx.remoteRoot ?? "";
  return raw.trim();
}

function requireRoot(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  const root = projectRoot(params, ctx);
  if (!root) throw new Error("No project root");
  return root;
}

function listUnifiedMcpServers(root: string): Array<{
  name: string;
  enabled: boolean;
  origin: string;
  autoStart: boolean;
}> {
  const out: Array<{ name: string; enabled: boolean; origin: string; autoStart: boolean }> = [];
  for (const asset of listMcpServers(root)) {
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

export const teamsHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "teams:list"(params, ctx) {
    const root = projectRoot(params, ctx);
    if (!root) return [];
    return listTeams(root);
  },
  async "teams:get"(params, ctx) {
    const root = projectRoot(params, ctx);
    const teamId = String(params.teamId ?? "");
    if (!root || !teamId) return null;
    return getTeam(root, teamId);
  },
  async "teams:listAssets"(params, ctx) {
    const root = projectRoot(params, ctx);
    if (!root) return [];
    return listAssets(root, params.kind as AssetKind | undefined);
  },
  async "teams:getRoster"(params, ctx) {
    const root = projectRoot(params, ctx);
    const teamId = String(params.teamId ?? "");
    if (!root || !teamId) return null;
    return resolveRoster(root, teamId);
  },
  async "teams:getSkillsRoster"(params, ctx) {
    const root = projectRoot(params, ctx);
    const teamId = String(params.teamId ?? "");
    if (!root || !teamId) return null;
    return resolveSkillsRoster(root, teamId);
  },
  async "teams:getCommandsRoster"(params, ctx) {
    const root = projectRoot(params, ctx);
    const teamId = String(params.teamId ?? "");
    if (!root || !teamId) return null;
    return resolveCommandsRoster(root, teamId);
  },
  async "teams:getActiveTeam"(params, ctx) {
    const root = projectRoot(params, ctx);
    if (!root) return null;
    return resolveActiveTeam(root, typeof params.sessionTeamId === "string" ? params.sessionTeamId : null);
  },
  async "teams:readInstructions"(params, ctx) {
    const root = projectRoot(params, ctx);
    const fqid = String(params.fqid ?? "");
    if (!root || !fqid) return "";
    return readInstructions(root, fqid);
  },
  async "teams:listMcp"(params, ctx) {
    const root = projectRoot(params, ctx);
    if (!root) return [];
    return listUnifiedMcpServers(root);
  },
  async "teams:getTeamContents"(params, ctx) {
    const teamId = String(params.teamId ?? "");
    if (!teamId) return [];
    const root = projectRoot(params, ctx);
    const roots = root ? [root] : [..._registeredRoots()];
    const record = getTeamRecord(teamId, roots);
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
  async "teams:listProjectMcps"(params, ctx) {
    const root = projectRoot(params, ctx);
    if (!root) return [];
    return listMcpServers(root);
  },
  async "teams:install"(params) {
    return installTeam(String(params.teamId ?? ""));
  },
  async "teams:uninstall"(params) {
    uninstallTeam(String(params.teamId ?? ""));
    return { ok: true };
  },
  async "teams:setEnabled"(params, ctx) {
    const scope: TeamScope = params.scope === "project" ? "project" : "app";
    return setTeamEnabled(
      String(params.teamId ?? ""),
      params.enabled === null ? null : Boolean(params.enabled),
      scope,
      projectRoot(params, ctx) || undefined,
    );
  },
  async "teams:setAssetEnabled"(params, ctx) {
    const scope: TeamScope = params.scope === "project" ? "project" : "app";
    setAssetEnabled(
      String(params.fqid ?? "") as Fqid,
      params.enabled === null ? null : Boolean(params.enabled),
      scope,
      projectRoot(params, ctx) || undefined,
    );
    return { ok: true };
  },
  async "teams:saveAssetOverride"(params, ctx) {
    if (!params.fqid || typeof params.patch !== "object" || params.patch === null) {
      throw new Error("Invalid override payload");
    }
    const scope: TeamScope = params.scope === "app" ? "app" : "project";
    saveAssetOverride(
      String(params.fqid) as Fqid,
      params.patch as AssetOverride,
      scope,
      projectRoot(params, ctx) || undefined,
    );
    return { ok: true };
  },
  async "teams:setActiveTeam"(params, ctx) {
    const scope = params.scope === "app" ? "app" : "project";
    const teamId = String(params.teamId ?? "");
    if (!teamId) throw new Error("teamId is required");
    if (scope === "app" && teamId === PROJECT_DEFAULT_TEAM_ID) {
      throw new Error("Project-scoped teams cannot be app defaults.");
    }
    if (scope === "project") {
      const root = requireRoot(params, ctx);
      // Laptop already validated the picker list. Host only records the
      // choice and seeds 通用团队 so Chat can run it.
      ensureMyContentTeam();
      setProjectDefaultTeam(root, teamId);
      return { ok: true };
    }
    setActiveTeam(teamId, scope, projectRoot(params, ctx) || undefined);
    return { ok: true };
  },
  async "teams:create"(params, ctx) {
    return createTeam({
      name: String(params.name ?? ""),
      description: typeof params.description === "string" ? params.description : undefined,
      longDescription: typeof params.longDescription === "string" ? params.longDescription : undefined,
      tags: Array.isArray(params.tags) ? params.tags.filter((item): item is string => typeof item === "string") : undefined,
      scope: params.scope === "app" ? "app" : "project",
      projectRoot: projectRoot(params, ctx) || undefined,
      leadName: typeof params.leadName === "string" ? params.leadName : undefined,
      leadInstructions: typeof params.leadInstructions === "string" ? params.leadInstructions : undefined,
      icon: params.icon && typeof params.icon === "object" ? params.icon as IconSpec : null,
      iconImagePngBase64: typeof params.iconImagePngBase64 === "string" ? params.iconImagePngBase64 : undefined,
    });
  },
  async "teams:updateIcon"(params, ctx) {
    updateTeamIcon(
      String(params.teamId ?? ""),
      projectRoot(params, ctx) || undefined,
      params.icon === null ? null : params.icon as IconSpec | null,
    );
    return { ok: true };
  },
  async "teams:setIconImage"(params, ctx) {
    setTeamIconImage(
      String(params.teamId ?? ""),
      projectRoot(params, ctx) || undefined,
      Buffer.from(String(params.pngBase64 ?? ""), "base64"),
    );
    return { ok: true };
  },
  async "teams:delete"(params, ctx) {
    deleteTeam(String(params.teamId ?? ""), projectRoot(params, ctx) || undefined);
    return { ok: true };
  },
  async "teams:promote"(params, ctx) {
    return promoteTeam(String(params.teamId ?? ""), requireRoot(params, ctx));
  },
  async "teams:demote"(params, ctx) {
    return demoteTeam(String(params.teamId ?? ""), requireRoot(params, ctx));
  },
  async "teams:moveAsset"(params, ctx) {
    return moveAsset(
      String(params.fqid ?? "") as Fqid,
      String(params.targetTeamId ?? ""),
      requireRoot(params, ctx),
    );
  },
  async "teams:setDefaultOrchestrator"(params, ctx) {
    const root = requireRoot(params, ctx);
    const fqid = String(params.fqid ?? "") as Fqid;
    const asset = getAsset(root, fqid);
    if (!asset || asset.kind !== "orchestrator" || !asset.enabled) {
      throw new Error(`Orchestrator is not active: ${fqid}`);
    }
    setActiveTeam(asset.teamId, "project", root);
    return { ok: true };
  },
  async "teams:resolveOrigin"(params, ctx) {
    const root = projectRoot(params, ctx);
    const fqidOrId = String(params.fqidOrId ?? "");
    if (!root || !fqidOrId) return null;
    const asset = getAsset(root, fqidOrId);
    if (!asset) return null;
    return {
      teamId: asset.origin.teamId,
      teamName: asset.origin.teamName,
      teamTier: asset.origin.tier,
    };
  },
  async "teams:getCoreState"(params, ctx) {
    const root = projectRoot(params, ctx);
    if (!root) return null;
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
  },
  async "teams:resetCoreDefaults"(params, ctx) {
    const root = requireRoot(params, ctx);
    if (params.kind !== "subagent" && params.kind !== "orchestrator") {
      throw new Error("Invalid kind");
    }
    const coreAssets = listAssets(root, params.kind).filter((c) => c.teamId === "prismnext.core");
    for (const asset of coreAssets) {
      setAssetEnabled(asset.fqid, null, "project", root);
      saveAssetOverride(asset.fqid, {}, "project", root);
    }
    return { ok: true };
  },
};
