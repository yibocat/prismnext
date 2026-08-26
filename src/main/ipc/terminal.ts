import { ipcMain, BrowserWindow } from "electron";
import * as terminalService from "../terminal/terminal";
import * as terminalConfig from "../terminal/terminal-config";
import { registerBashJobIntent } from "../terminal/ai-bash-runner";
import { destroyAllAiPty } from "../terminal/ai-pty";
import type { TerminalConfig } from "../terminal/terminal-config";
import { getRemoteSessionBroker } from "./remote";
import { firstRemoteAbs, toHostFsParams } from "../remote/fs-bridge";

/** Host terminal sessions — write/resize/destroy must not fan out to every profile. */
const remoteSessions = new Map<string, string>();

function remoteProfileForSession(sessionId: string): string | undefined {
  return remoteSessions.get(sessionId);
}

async function invokeRemoteTerminal(
  profileId: string,
  method: "terminal:write" | "terminal:resize" | "terminal:destroy",
  args: Record<string, unknown>,
): Promise<unknown> {
  return getRemoteSessionBroker().invoke(profileId, method, args).catch(() => undefined);
}

export function registerTerminalHandlers(): void {
  // ─── Session management ───

  ipcMain.handle(
    "terminal:create",
    async (
      event,
      args: {
        sessionId: string;
        tabId: string;
        projectRoot: string;
        cwd: string;
        cols?: number;
        rows?: number;
      },
    ) => {
      const remote = firstRemoteAbs(args.projectRoot, args.cwd);
      if (remote) {
        remoteSessions.set(args.sessionId, remote.profileId);
        return getRemoteSessionBroker().invoke(
          remote.profileId,
          "terminal:create",
          toHostFsParams({ ...args }),
        );
      }
      remoteSessions.delete(args.sessionId);
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
        cols: args.cols,
        rows: args.rows,
        onData,
        onExit,
      });
    },
  );

  ipcMain.handle(
    "terminal:destroy",
    async (_event, args: { sessionId: string }) => {
      const profileId = remoteProfileForSession(args.sessionId);
      remoteSessions.delete(args.sessionId);
      if (profileId) {
        await invokeRemoteTerminal(profileId, "terminal:destroy", args);
        return;
      }
      terminalService.destroySession(args.sessionId);
    },
  );

  // Destroy ALL sessions for a tab (by tabId prefix, ignoring generation suffix)
  ipcMain.handle(
    "terminal:destroyTab",
    async (_event, args: { tabId: string }) => {
      const prefix = args.tabId + ":";
      const doomed = [...remoteSessions.entries()].filter(([sessionId]) => sessionId.startsWith(prefix));
      for (const [sessionId] of doomed) remoteSessions.delete(sessionId);
      terminalService.destroySessionsByPrefix(prefix);
      for (const [sessionId, profileId] of doomed) {
        await invokeRemoteTerminal(profileId, "terminal:destroy", { sessionId });
      }
    },
  );

  ipcMain.handle(
    "terminal:destroyTabs",
    async (_event, args: { tabIds: string[] }) => {
      terminalService.destroySessionsByTabIds(args.tabIds);
      for (const tabId of args.tabIds) {
        const prefix = tabId + ":";
        const doomed = [...remoteSessions.entries()].filter(([sessionId]) => sessionId.startsWith(prefix));
        for (const [sessionId, profileId] of doomed) {
          remoteSessions.delete(sessionId);
          await invokeRemoteTerminal(profileId, "terminal:destroy", { sessionId });
        }
      }
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
      const profileId = remoteProfileForSession(args.sessionId);
      if (profileId) {
        await invokeRemoteTerminal(profileId, "terminal:write", args);
        return;
      }
      terminalService.writeToSession(args.sessionId, args.data);
    },
  );

  ipcMain.handle(
    "terminal:resize",
    async (_event, args: { sessionId: string; cols: number; rows: number }) => {
      const profileId = remoteProfileForSession(args.sessionId);
      if (profileId) {
        await invokeRemoteTerminal(profileId, "terminal:resize", args);
        return;
      }
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
  remoteSessions.clear();
}
