import { join } from "node:path";
import { ipcMain } from "electron";
import { ensureDefaultMcpServers } from "../services/project-mcp-defaults";
import {
  readWritableTeamMcpJson,
  writeWritableTeamMcpJson,
} from "../services/team-mcp-files";
import { invalidateCatalog } from "../teams/catalog";
import { invalidateResolver } from "../teams/resolver";
import { PROJECT_DEFAULT_TEAM_ID } from "../../shared/teams/types";
import { PROJECT_AGENT_DIRNAME, PROJECT_META_DIR } from "../../shared/workbench/paths";

function refreshMcpCatalog(projectPath: string): void {
  invalidateCatalog();
  invalidateResolver(projectPath);
}

export function registerMcpHandlers(): void {
  /**
   * Seed/repair mcp.json. Pi connects selected servers on send;
   * this no longer prewarms or reloads OpenCode.
   */
  ipcMain.handle(
    "mcp:ensure",
    async (_e, args: { projectPath: string }) => {
      const projectPath = args.projectPath?.trim();
      if (!projectPath) {
        return { ok: false as const };
      }
      const ensure = ensureDefaultMcpServers(join(projectPath, PROJECT_META_DIR, PROJECT_AGENT_DIRNAME));
      if (ensure.added || ensure.migrated || ensure.reenabled || ensure.removed) {
        refreshMcpCatalog(projectPath);
      }
      return {
        ok: true as const,
        ensure,
        reloadedSessions: 0,
      };
    },
  );

  /** Repair defaults and refresh the team catalog. Live Pi sessions pick this up on the next send / new chat. */
  ipcMain.handle(
    "mcp:apply",
    async (_e, args: { projectPath: string }) => {
      const projectPath = args.projectPath?.trim();
      if (!projectPath) {
        return { ok: false as const, reloadedSessions: 0, error: "missing projectPath" };
      }
      ensureDefaultMcpServers(join(projectPath, PROJECT_META_DIR, PROJECT_AGENT_DIRNAME));
      refreshMcpCatalog(projectPath);
      return { ok: true as const, reloadedSessions: 0 };
    },
  );

  /** Read a writable team's mcp.json (v2 array). Defaults to Project Team. */
  ipcMain.handle(
    "mcp:readTeamJson",
    async (_e, args: { projectPath: string; teamId?: string }) => {
      const projectPath = args.projectPath?.trim();
      if (!projectPath) throw new Error("missing projectPath");
      const teamId = args.teamId?.trim() || PROJECT_DEFAULT_TEAM_ID;
      return {
        teamId,
        content: readWritableTeamMcpJson(projectPath, teamId),
      };
    },
  );

  /** Write a writable team's mcp.json. Does not push into OpenCode. */
  ipcMain.handle(
    "mcp:writeTeamJson",
    async (_e, args: { projectPath: string; teamId?: string; content: string }) => {
      const projectPath = args.projectPath?.trim();
      if (!projectPath) {
        return { ok: false as const, reloadedSessions: 0, error: "missing projectPath" };
      }
      const teamId = args.teamId?.trim() || PROJECT_DEFAULT_TEAM_ID;
      writeWritableTeamMcpJson(projectPath, teamId, args.content ?? "[]\n");
      refreshMcpCatalog(projectPath);
      return { ok: true as const, teamId, reloadedSessions: 0 };
    },
  );
}
