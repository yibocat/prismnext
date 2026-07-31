import { join } from "node:path";
import { ipcMain } from "electron";
import { AcpService } from "../acp/service";
import {
  ensureDefaultMcpServers,
  getPaperSearchMcpHealth,
} from "../services/project-mcp-defaults";

export function registerMcpHandlers(): void {
  /**
   * Seed/repair mcp.json + refresh ACP cache. When seed/migrate/reenable
   * actually changed the file, also push into open sessions (Bug #25) —
   * otherwise Settings→load would leave running chats on the old MCP set.
   *
   * MCP changes use session/load — do not invalidate project chat prewarm
   * (that forced a full OpenCode reload on the next send).
   */
  ipcMain.handle(
    "mcp:ensure",
    async (_e, args: { projectPath: string }) => {
      const projectPath = args.projectPath?.trim();
      if (!projectPath) {
        return { ok: false as const, health: getPaperSearchMcpHealth() };
      }
      const ensure = ensureDefaultMcpServers(join(projectPath, ".prismnext", "agent"));
      const acp = AcpService.getInstance();
      acp.prewarmProject(projectPath);
      let reloadedSessions = 0;
      if (ensure.added || ensure.migrated || ensure.reenabled) {
        const applied = await acp.applyProjectMcpConfig(projectPath);
        reloadedSessions = applied.reloadedSessions;
      }
      return {
        ok: true as const,
        health: getPaperSearchMcpHealth(),
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
      const result = await AcpService.getInstance().applyProjectMcpConfig(projectPath);
      return { ok: true as const, ...result, health: getPaperSearchMcpHealth() };
    },
  );

  ipcMain.handle("mcp:paperSearchHealth", async () => {
    return getPaperSearchMcpHealth();
  });
}
