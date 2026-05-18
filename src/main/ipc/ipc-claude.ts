import { ipcMain, BrowserWindow } from "electron";
import {
  checkClaudeStatus,
  executeClaudeCode,
  resumeClaudeCode,
  cancelClaudeExecution,
  answerClaudeQuestion,
  listClaudeSessions,
  loadSessionHistory,
} from "../services/claude";

export function registerClaudeHandlers(): void {
  ipcMain.handle("claude:status", async () => {
    return checkClaudeStatus();
  });

  ipcMain.handle(
    "claude:send",
    async (
      event,
      args: {
        projectPath: string;
        prompt: string;
        sessionId?: string;
        tabId?: string;
        model?: string;
        effortLevel?: string;
      },
    ) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");

      if (args.sessionId) {
        return resumeClaudeCode(win, args.projectPath, args.sessionId, args.prompt, tabId, args.model, args.effortLevel);
      }
      return executeClaudeCode(win, args.projectPath, args.prompt, tabId, args.model, args.effortLevel);
    },
  );

  ipcMain.handle("claude:cancel", async (event, args: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    return cancelClaudeExecution(win, args.tabId || "default");
  });

  ipcMain.handle("claude:answer", async (event, args: { tabId: string; answer: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    return answerClaudeQuestion(win, args.tabId, args.answer);
  });

  ipcMain.handle(
    "claude:listSessions",
    async (_event, args: { projectPath: string }) => {
      return listClaudeSessions(args.projectPath);
    },
  );

  ipcMain.handle(
    "claude:loadSession",
    async (_event, args: { projectPath: string; sessionId: string }) => {
      return loadSessionHistory(args.projectPath, args.sessionId);
    },
  );
}
