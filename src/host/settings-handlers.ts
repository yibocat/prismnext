import { join } from "node:path";
import { ensureDefaultMcpServers } from "../main/teams/project-mcp-defaults";
import { readWritableTeamMcpJson, writeWritableTeamMcpJson } from "../main/teams/team-mcp-files";
import { invalidateCatalog } from "../main/teams/catalog";
import { invalidateResolver } from "../main/teams/resolver";
import { PROJECT_DEFAULT_TEAM_ID } from "../shared/teams/types";
import { PROJECT_AGENT_DIRNAME, PROJECT_META_DIR } from "../shared/workbench/paths";
import { pickPermissionPatch, readHostPermissions, writeHostPermissions } from "./host-permissions";
import type { HostHandlerContext } from "./context";

function projectPath(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  const raw = typeof params.projectPath === "string"
    ? params.projectPath
    : typeof params.projectRoot === "string"
      ? params.projectRoot
      : ctx.remoteRoot ?? "";
  return raw.trim();
}

function refreshMcp(projectPath: string): void {
  invalidateCatalog();
  invalidateResolver(projectPath);
}

export const settingsHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "settings:getRemotePermissions"() {
    return { ...readHostPermissions(), storedOn: "server" };
  },
  async "settings:setRemotePermissions"(params) {
    const patch = pickPermissionPatch(params);
    if (!patch) return readHostPermissions();
    return writeHostPermissions(patch);
  },
  async "mcp:ensure"(params, ctx) {
    const root = projectPath(params, ctx);
    if (!root) return { ok: false };
    const ensure = ensureDefaultMcpServers(join(root, PROJECT_META_DIR, PROJECT_AGENT_DIRNAME));
    if (ensure.added || ensure.migrated || ensure.reenabled || ensure.removed) {
      refreshMcp(root);
    }
    return { ok: true, ensure, reloadedSessions: 0 };
  },
  async "mcp:apply"(params, ctx) {
    const root = projectPath(params, ctx);
    if (!root) return { ok: false, reloadedSessions: 0, error: "missing projectPath" };
    ensureDefaultMcpServers(join(root, PROJECT_META_DIR, PROJECT_AGENT_DIRNAME));
    refreshMcp(root);
    return { ok: true, reloadedSessions: 0 };
  },
  async "mcp:readTeamJson"(params, ctx) {
    const root = projectPath(params, ctx);
    if (!root) throw new Error("missing projectPath");
    const teamId = String(params.teamId ?? "").trim() || PROJECT_DEFAULT_TEAM_ID;
    return { teamId, content: readWritableTeamMcpJson(root, teamId) };
  },
  async "mcp:writeTeamJson"(params, ctx) {
    const root = projectPath(params, ctx);
    if (!root) return { ok: false, reloadedSessions: 0, error: "missing projectPath" };
    const teamId = String(params.teamId ?? "").trim() || PROJECT_DEFAULT_TEAM_ID;
    writeWritableTeamMcpJson(root, teamId, String(params.content ?? "[]\n"));
    refreshMcp(root);
    return { ok: true, teamId, reloadedSessions: 0 };
  },
};
