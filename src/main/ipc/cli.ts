import { ipcMain, BrowserWindow, app } from "electron";
import { CliManager } from "../cli/cli-manager";
import { getAgent, getAllAgents, getDefaultAgentId } from "../agents/registry";
import type { SessionInfo } from "../agents/types";

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
    async (event, args: { projectPath: string; worktreePath?: string; tabId?: string; settings?: Record<string, string | null> }) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");
      const manager = getCliManager(win);
      const cwd = args.worktreePath || args.projectPath || app.getPath("home");
      manager.prewarm(tabId, cwd, args.settings);
      return { success: true };
    },
  );

  // ─── Status ───
  ipcMain.handle("cli:status", async () => {
    const manager = cliManager;
    if (!manager) {
      const defaultAgent = getAgent(getDefaultAgentId());
      return { available: true, agentId: defaultAgent?.id ?? "unknown", agentName: defaultAgent?.name ?? "Unknown" };
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
        sessionId?: string | null;
        settings?: Record<string, string | null>;
      },
    ) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");

      const manager = getCliManager(win);
      const cwd = args.worktreePath || args.projectPath || app.getPath("home");
      manager.sendPrompt(tabId, args.prompt, cwd, args.agent, args.sessionId ?? undefined, args.settings);
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
        const allSessions: SessionInfo[] = [];
        const agents = getAllAgents();

        for (const agent of agents) {
          const provider = agent.createSessionProvider();
          provider.setProjectRoot(args.projectPath);
          try {
            const sessions = await provider.listSessions();
            allSessions.push(...sessions);
          } catch { /* agent may not have sessions yet */ }

          // Also check worktree path — reuse the same provider to avoid
          // double migration scans and redundant index I/O.
          if (args.worktreePath) {
            provider.setProjectRoot(args.worktreePath);
            try {
              const wtSessions = await provider.listSessions();
              const seen = new Set(allSessions.map((s) => `${s.agentId}/${s.id}`));
              for (const s of wtSessions) {
                if (!seen.has(`${s.agentId}/${s.id}`)) {
                  allSessions.push({ ...s, title: `[wt] ${s.title}` });
                }
              }
            } catch { /* worktree not critical */ }
          }
        }

        return allSessions.sort((a, b) => b.lastModified - a.lastModified);
      } catch {
        return [] as SessionInfo[];
      }
    },
  );

  ipcMain.handle(
    "cli:loadSession",
    async (_event, args: {
      projectPath: string;
      sessionId: string;
      agentId?: string;
      worktreePath?: string;
    }) => {
      const agent = getAgent(args.agentId || "claude");
      const provider = agent?.createSessionProvider();
      if (!provider) return [];
      provider.setProjectRoot(args.projectPath);
      const messages = await provider.loadSession(args.sessionId);
      if (messages.length > 0) return messages;
      if (args.worktreePath) {
        provider.setProjectRoot(args.worktreePath);
        return await provider.loadSession(args.sessionId);
      }
      return [];
    },
  );

  ipcMain.handle(
    "cli:deleteSession",
    async (_event, args: {
      projectPath: string;
      sessionId: string;
      agentId?: string;
      worktreePath?: string;
    }) => {
      try {
        const agent = getAgent(args.agentId || "claude");
        // Try the project root first, then fall back to worktree path.
        // Sessions may live in either location depending on whether the
        // user was in worktree mode when the session was created.
        const paths = [args.projectPath];
        if (args.worktreePath && args.worktreePath !== args.projectPath) {
          paths.push(args.worktreePath);
        }
        for (const p of paths) {
          const provider = agent?.createSessionProvider();
          if (!provider) continue;
          provider.setProjectRoot(p);
          try {
            await provider.deleteSession(args.sessionId);
          } catch { /* try next path */ }
        }
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
