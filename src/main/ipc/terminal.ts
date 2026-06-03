import { ipcMain, BrowserWindow } from "electron";
import * as terminalService from "../services/terminal";
import * as terminalConfig from "../services/terminal-config";
import type { TerminalConfig } from "../services/terminal-config";

export function registerTerminalHandlers(): void {
  // ─── Session management ───

  ipcMain.handle(
    "terminal:create",
    async (event, args: { sessionId: string; projectRoot: string }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window available");

      const onData = (sid: string, data: string) => {
        if (win.isDestroyed()) return;
        win.webContents.send("terminal:data", { sessionId: sid, data });
      };
      const onExit = (sid: string, exitCode: number) => {
        if (win.isDestroyed()) return;
        win.webContents.send("terminal:exit", { sessionId: sid, exitCode });
      };

      return terminalService.createSession(
        args.sessionId,
        args.projectRoot,
        onData,
        onExit,
      );
    },
  );

  ipcMain.handle(
    "terminal:destroy",
    async (_event, args: { sessionId: string }) => {
      terminalService.destroySession(args.sessionId);
    },
  );

  // Destroy ALL sessions for a tab (by tabId prefix, ignoring generation suffix)
  ipcMain.handle(
    "terminal:destroyTab",
    async (_event, args: { tabId: string }) => {
      terminalService.destroySessionsByPrefix(args.tabId + ":");
    },
  );

  // ─── I/O ───

  ipcMain.handle(
    "terminal:write",
    async (_event, args: { sessionId: string; data: string }) => {
      terminalService.writeToSession(args.sessionId, args.data);
    },
  );

  ipcMain.handle(
    "terminal:resize",
    async (_event, args: { sessionId: string; cols: number; rows: number }) => {
      terminalService.resizeSession(args.sessionId, args.cols, args.rows);
    },
  );

  // ─── Environment ───

  ipcMain.handle("terminal:envInfo", async () => {
    return terminalService.getEnvInfo();
  });

  // ─── Config ───

  ipcMain.handle(
    "terminal:loadConfig",
    async (_event, args: { projectRoot: string }) => {
      return terminalConfig.loadConfig(args.projectRoot);
    },
  );

  ipcMain.handle(
    "terminal:saveConfig",
    async (_event, args: { projectRoot: string; config: TerminalConfig }) => {
      terminalConfig.saveConfig(args.projectRoot, args.config);
    },
  );
}

/** Kill all PTY sessions — call on window close / app quit. */
export function destroyAllTerminalSessions(): void {
  terminalService.destroyAllSessions();
}
