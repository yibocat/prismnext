import { ipcMain, BrowserWindow } from "electron";
import { AgentManager } from "../agents/agent-manager";
import { getAgentConfig, DEFAULT_AGENT_ID } from "../agents/configs";
import {
  listClaudeSessions,
  loadSessionHistory,
} from "../services/claude";
import type { ClaudeSession } from "../services/claude";

// Singleton AgentManager instance
let agentManager: AgentManager | null = null;

function getAgentManager(win: BrowserWindow): AgentManager {
  if (!agentManager) {
    agentManager = new AgentManager(win);
  }
  return agentManager;
}

export function registerAgentHandlers(): void {
  // ─── Dispose on project switch ───
  ipcMain.handle("agent:dispose", async () => {
    disposeAgentManager();
    return { success: true };
  });

  // ─── Status ───
  ipcMain.handle("agent:status", async () => {
    try {
      const manager = agentManager;
      if (!manager) {
        return {
          available: true,
          agentId: DEFAULT_AGENT_ID,
          agentName: getAgentConfig(DEFAULT_AGENT_ID)?.name || "Unknown",
        };
      }
      const status = await manager.getStatus();
      return {
        available: status.available,
        agentId: manager.agentId,
        agentName: "Claude Code",
        error: status.error,
      };
    } catch (err: any) {
      return { available: false, error: err?.message || String(err) };
    }
  });

  // ─── Send Prompt ───

  ipcMain.handle(
    "agent:send",
    async (
      event,
      args: {
        projectPath: string;
        prompt: string;
        tabId?: string;
        agentId?: string;
      },
    ) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");

      const manager = getAgentManager(win);

      // Ensure session exists for this tab
      await manager.ensureSession(tabId, args.projectPath, args.agentId);

      // Send prompt (fire-and-forget, streaming via agent:stream events)
      manager.sendPrompt(tabId, args.prompt);
    },
  );

  // ─── Cancel ───

  ipcMain.handle(
    "agent:cancel",
    async (event, args: { tabId?: string }) => {
      const tabId = args.tabId || "default";
      const manager = agentManager;
      if (!manager) return;
      await manager.cancel(tabId);
    },
  );

  // ─── Answer Question (for AskUserQuestion tool) ───

  ipcMain.handle(
    "agent:answer",
    async (event, args: { tabId: string; answer: string }) => {
      // With ACP, this goes through the standard session/prompt flow.
      // For now, we re-send as a new prompt with the answer.
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return;

      const manager = agentManager;
      if (!manager) return;

      manager.sendPrompt(args.tabId, args.answer);
    },
  );

  // ─── Session Management (fallback to Claude JSONL for now) ───

  ipcMain.handle(
    "agent:listSessions",
    async (_event, args: { projectPath: string }) => {
      try {
        return await listClaudeSessions(args.projectPath);
      } catch {
        return [] as ClaudeSession[];
      }
    },
  );

  ipcMain.handle(
    "agent:loadSession",
    async (_event, args: { projectPath: string; sessionId: string }) => {
      try {
        return await loadSessionHistory(args.projectPath, args.sessionId);
      } catch {
        return [];
      }
    },
  );

  // ─── Delete Session ───

  ipcMain.handle(
    "agent:deleteSession",
    async (_event, args: { sessionId: string }) => {
      try {
        // Delete Claude session JSONL file
        const { unlink } = require("node:fs/promises");
        const { homedir } = require("node:os");
        const { join } = require("node:path");
        const encoded = (args as any).projectPath?.replace(/[^a-zA-Z0-9]/g, "-") || "-";
        const sessionFile = join(homedir(), ".claude", "projects", encoded, `${args.sessionId}.jsonl`);
        await unlink(sessionFile);
        console.log("[agent] Deleted session:", sessionFile);
        return { success: true };
      } catch (err: any) {
        console.error("[agent] Failed to delete session:", err?.message || err);
        return { success: false, error: err?.message || String(err) };
      }
    },
  );
}

// Cleanup on app exit
export function disposeAgentManager(): void {
  if (agentManager) {
    agentManager.closeAll();
    agentManager = null;
  }
}
