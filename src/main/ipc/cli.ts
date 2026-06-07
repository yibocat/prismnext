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
    async (event, args: { projectPath: string; worktreePath?: string; tabId?: string }) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");
      const manager = getCliManager(win);
      const cwd = args.worktreePath || args.projectPath || app.getPath("home");
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
        worktreePath?: string;
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
      const cwd = args.worktreePath || args.projectPath || app.getPath("home");
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
    async (_event, args: { projectPath: string; worktreePath?: string }) => {
      try {
        const sessions = await listClaudeSessions(args.projectPath);
        // If a worktree is active, also include its sessions
        if (args.worktreePath) {
          try {
            const wtSessions = await listClaudeSessions(args.worktreePath);
            // Merge — deduplicate by session id
            const seen = new Set(sessions.map((s) => s.id));
            for (const s of wtSessions) {
              if (!seen.has(s.id)) {
                sessions.push({ ...s, title: `[wt] ${s.title}` });
              }
            }
          } catch { /* worktree sessions not critical */ }
        }
        return sessions;
      } catch {
        return [] as ClaudeSession[];
      }
    },
  );

  ipcMain.handle(
    "cli:loadSession",
    async (_event, args: { projectPath: string; sessionId: string; worktreePath?: string }) => {
      // Try projectPath first; if not found there, try worktreePath.
      // loadSessionHistory returns [] on missing file — it does not throw.
      const messages = await loadSessionHistory(args.projectPath, args.sessionId);
      if (messages.length > 0) return messages;
      if (args.worktreePath) {
        return await loadSessionHistory(args.worktreePath, args.sessionId);
      }
      return [];
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
