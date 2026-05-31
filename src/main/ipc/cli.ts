import { ipcMain, BrowserWindow, app } from "electron";
import { CliManager } from "../cli/cli-manager";
import {
  listClaudeSessions,
  loadSessionHistory,
} from "../services/claude";
import type { ClaudeSession } from "../services/claude";

let cliManager: CliManager | null = null;

function getCliManager(win: BrowserWindow): CliManager {
  if (!cliManager) {
    cliManager = new CliManager(win);
  }
  return cliManager;
}

export function registerCliHandlers(): void {
  // ─── Dispose on project switch ───
  ipcMain.handle("cli:dispose", async () => {
    disposeCliManager();
    return { success: true };
  });

  // ─── Pre-warm: start persistent CLI process eagerly ───
  ipcMain.handle(
    "cli:prewarm",
    async (event, args: { projectPath: string; tabId?: string }) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");
      const manager = getCliManager(win);
      const cwd = args.projectPath || app.getPath("home");
      manager.prewarm(tabId, cwd);
      return { success: true };
    },
  );

  // ─── Status ───
  ipcMain.handle("cli:status", async () => {
    const manager = cliManager;
    if (!manager) {
      return { available: true, agentId: "claude", agentName: "Claude Code" };
    }
    return manager.getStatus();
  });

  // ─── Send Prompt ───
  ipcMain.handle(
    "cli:send",
    async (
      event,
      args: {
        projectPath: string;
        prompt: string;
        tabId?: string;
        agent?: string;
        model?: string | null;
        sessionId?: string | null;
      },
    ) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");

      const manager = getCliManager(win);
      const cwd = args.projectPath || app.getPath("home");
      manager.sendPrompt(tabId, args.prompt, cwd, args.agent, args.model, args.sessionId ?? undefined);
    },
  );

  // ─── Cancel ───
  ipcMain.handle(
    "cli:cancel",
    async (_event, args: { tabId?: string }) => {
      const manager = cliManager;
      if (!manager) return;
      manager.cancel(args.tabId || "default");
    },
  );

  // ─── Close Session ───
  ipcMain.handle(
    "cli:closeSession",
    async (_event, args: { tabId?: string }) => {
      const manager = cliManager;
      if (!manager) return;
      manager.closeSession(args.tabId || "default");
    },
  );

  // ─── Answer user question ───
  ipcMain.handle(
    "cli:answer",
    async (_event, args: { tabId: string; answer: string }) => {
      const manager = cliManager;
      if (!manager) return;
      manager.answer(args.tabId, args.answer);
    },
  );

  // ─── Gateway (third-party API proxy) ───
  ipcMain.handle(
    "cli:setGateway",
    async (_event, args: { baseUrl?: string; apiKey?: string }) => {
      const manager = cliManager;
      if (!manager) return;
      manager.setGateway(args.baseUrl, args.apiKey);
    },
  );

  // ─── Session Management (Claude JSONL for now) ───
  ipcMain.handle(
    "cli:listSessions",
    async (_event, args: { projectPath: string }) => {
      try {
        const cwd = args.projectPath || app.getPath("home");
        return await listClaudeSessions(cwd);
      } catch {
        return [] as ClaudeSession[];
      }
    },
  );

  ipcMain.handle(
    "cli:loadSession",
    async (_event, args: { projectPath: string; sessionId: string }) => {
      try {
        const cwd = args.projectPath || app.getPath("home");
        return await loadSessionHistory(cwd, args.sessionId);
      } catch {
        return [];
      }
    },
  );

  ipcMain.handle(
    "cli:deleteSession",
    async (_event, args: { projectPath: string; sessionId: string }) => {
      try {
        const { unlink } = require("node:fs/promises");
        const { homedir } = require("node:os");
        const { join } = require("node:path");
        const encoded = (args as any).projectPath?.replace(/[^a-zA-Z0-9]/g, "-") || "-";
        const sessionFile = join(
          homedir(),
          ".claude",
          "projects",
          encoded,
          `${args.sessionId}.jsonl`,
        );
        await unlink(sessionFile);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    },
  );
}

export function disposeCliManager(): void {
  if (cliManager) {
    cliManager.closeAll();
    cliManager = null;
  }
}
