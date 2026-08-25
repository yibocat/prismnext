import { ipcMain, BrowserWindow } from "electron";
import * as terminalService from "../terminal/terminal";
import * as terminalConfig from "../terminal/terminal-config";
import { registerBashJobIntent } from "../terminal/ai-bash-runner";
import { destroyAllAiPty } from "../terminal/ai-pty";
import type { TerminalConfig } from "../terminal/terminal-config";
import { getRemoteSessionBroker } from "./remote";
import { firstRemoteAbs, toHostFsParams } from "../remote/fs-bridge";

export function registerTerminalHandlers(): void {
  // ─── Session management ───

  ipcMain.handle(
    "terminal:create",
    async (
      event,
      args: { sessionId: string; tabId: string; projectRoot: string; cwd: string },
    ) => {
      const remote = firstRemoteAbs(args.projectRoot, args.cwd);
      if (remote) {
        return getRemoteSessionBroker().invoke(
          remote.profileId,
          "terminal:create",
          toHostFsParams({ ...args }),
        );
      }
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window available");

      const onData = (sid: string, tabId: string, data: string) => {
        if (win.isDestroyed()) return;
        win.webContents.send("terminal:data", { sessionId: sid, tabId, data });
      };
      const onExit = (sid: string, tabId: string, exitCode: number) => {
        if (win.isDestroyed()) return;
        win.webContents.send("terminal:exit", { sessionId: sid, tabId, exitCode });
      };

      return terminalService.createSession({
        sessionId: args.sessionId,
        tabId: args.tabId,
        projectRoot: args.projectRoot,
        cwd: args.cwd,
        onData,
        onExit,
      });
    },
  );

  ipcMain.handle(
    "terminal:destroy",
    async (_event, args: { sessionId: string }) => {
      terminalService.destroySession(args.sessionId);
      const broker = getRemoteSessionBroker();
      for (const [profileId, state] of Object.entries(broker.snapshot().byProfileId)) {
        if (state.phase === "ready") {
          await broker.invoke(profileId, "terminal:destroy", args).catch(() => undefined);
        }
      }
    },
  );

  // Destroy ALL sessions for a tab (by tabId prefix, ignoring generation suffix)
  ipcMain.handle(
    "terminal:destroyTab",
    async (_event, args: { tabId: string }) => {
      terminalService.destroySessionsByPrefix(args.tabId + ":");
    },
  );

  ipcMain.handle(
    "terminal:destroyTabs",
    async (_event, args: { tabIds: string[] }) => {
      terminalService.destroySessionsByTabIds(args.tabIds);
    },
  );

  ipcMain.handle(
    "terminal:registerBashJob",
    async (
      _event,
      args: { sessionId: string; toolCallId: string; command: string },
    ) => {
      registerBashJobIntent(args);
    },
  );

  ipcMain.handle("terminal:destroyAllAiPty", async () => {
    destroyAllAiPty();
  });

  // ─── I/O ───

  ipcMain.handle(
    "terminal:write",
    async (_event, args: { sessionId: string; data: string }) => {
      terminalService.writeToSession(args.sessionId, args.data);
      const broker = getRemoteSessionBroker();
      for (const [profileId, state] of Object.entries(broker.snapshot().byProfileId)) {
        if (state.phase === "ready") {
          await broker.invoke(profileId, "terminal:write", args).catch(() => undefined);
        }
      }
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
