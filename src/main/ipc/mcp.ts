import { join } from "node:path";
import { ipcMain } from "electron";
import { AcpService } from "../acp/service";
import { ensureDefaultMcpServers } from "../services/project-mcp-defaults";
import {
  readWritableTeamMcpJson,
  writeWritableTeamMcpJson,
} from "../services/team-mcp-files";
import { invalidateCatalog } from "../teams/catalog";
import { invalidateResolver } from "../teams/resolver";
import { PROJECT_DEFAULT_TEAM_ID } from "../../shared/teams/types";

export function registerMcpHandlers(): void {
  /**
   * Seed/repair mcp.json + refresh ACP cache. When ensure actually changed the file,
   * also push into open sessions (Bug #25) — otherwise Settings→load would leave
   * running chats on the old MCP set.
   *
   * MCP changes use session/load — do not invalidate project chat prewarm
   * (that forced a full OpenCode reload on the next send).
   */
  ipcMain.handle(
    "mcp:ensure",
    async (_e, args: { projectPath: string }) => {
      const projectPath = args.projectPath?.trim();
      if (!projectPath) {
        return { ok: false as const };
      }
      const ensure = ensureDefaultMcpServers(join(projectPath, ".prismnext", "agent"));
      const acp = AcpService.getInstanceForProject(projectPath);
      acp.prewarmProject(projectPath);
      let reloadedSessions = 0;
      if (ensure.added || ensure.migrated || ensure.reenabled || ensure.removed) {
        const applied = await acp.applyProjectMcpConfig(projectPath);
        reloadedSessions = applied.reloadedSessions;
      }
      return {
        ok: true as const,
        ensure,
        reloadedSessions,
      };
    },
  );

  /** Ensure + push MCP set into open project sessions via session/load. */
  ipcMain.handle(
    "mcp:apply",
    async (_e, args: { projectPath: string }) => {
      const projectPath = args.projectPath?.trim();
      if (!projectPath) {
        return { ok: false as const, reloadedSessions: 0, error: "missing projectPath" };
      }
      const result = await AcpService.getInstanceForProject(projectPath).applyProjectMcpConfig(projectPath);
      return { ok: true as const, ...result };
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

  /** Write a writable team's mcp.json and apply to open sessions. */
  ipcMain.handle(
    "mcp:writeTeamJson",
    async (_e, args: { projectPath: string; teamId?: string; content: string }) => {
      const projectPath = args.projectPath?.trim();
      if (!projectPath) {
        return { ok: false as const, reloadedSessions: 0, error: "missing projectPath" };
      }
      const teamId = args.teamId?.trim() || PROJECT_DEFAULT_TEAM_ID;
      writeWritableTeamMcpJson(projectPath, teamId, args.content ?? "[]\n");
      // mcp.json is part of the catalog fingerprint, but projectViews stay stale
      // until cleared — Settings → MCP list reads listAssets via that cache.
      invalidateCatalog();
      invalidateResolver(projectPath);
      const applied = await AcpService.getInstanceForProject(projectPath).applyProjectMcpConfig(
        projectPath,
      );
      return { ok: true as const, teamId, reloadedSessions: applied.reloadedSessions };
    },
  );
}
