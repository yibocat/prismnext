import { join } from "node:path";
import { ipcMain } from "electron";
import { AcpService } from "../acp/service";
import {
  ensureDefaultMcpServers,
  getPaperSearchMcpHealth,
} from "../services/project-mcp-defaults";
import { invalidateProjectChatPrewarm } from "../services/project-chat-prewarm";

export function registerMcpHandlers(): void {
  /** Seed/repair mcp.json + refresh ACP cache (no session/load). */
  ipcMain.handle(
    "mcp:ensure",
    async (_e, args: { projectPath: string }) => {
      const projectPath = args.projectPath?.trim();
      if (!projectPath) {
        return { ok: false as const, health: getPaperSearchMcpHealth() };
      }
      ensureDefaultMcpServers(join(projectPath, ".prismnext", "agent"));
      AcpService.getInstance().prewarmProject(projectPath);
      return { ok: true as const, health: getPaperSearchMcpHealth() };
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
      invalidateProjectChatPrewarm(projectPath);
      const result = await AcpService.getInstance().applyProjectMcpConfig(projectPath);
      return { ok: true as const, ...result, health: getPaperSearchMcpHealth() };
    },
  );

  ipcMain.handle("mcp:paperSearchHealth", async () => {
    return getPaperSearchMcpHealth();
  });
}
