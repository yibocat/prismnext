import { ipcMain, dialog, BrowserWindow } from "electron";
import * as fs from "./services/filesystem";
import { join } from "node:path";
import { compileLatex, synctexEdit } from "./services/compiler";
import { detectTexlive, detectTectonic } from "./services/texlive-detect";
import {
  checkClaudeStatus,
  executeClaudeCode,
  resumeClaudeCode,
  cancelClaudeExecution,
  answerClaudeQuestion,
  listClaudeSessions,
  loadSessionHistory,
} from "./services/claude";

export function registerIpcHandlers(): void {
  // ─── Filesystem Operations ───

  ipcMain.handle("fs:scan", async (_event, args: { rootPath: string }) => {
    return fs.scanProjectFolder(args.rootPath);
  });

  ipcMain.handle("fs:read", async (_event, args: { absPath: string }) => {
    const content = await fs.readTexFileContent(args.absPath);
    return { content };
  });

  ipcMain.handle("fs:readImage", async (_event, args: { absPath: string }) => {
    const dataUrl = await fs.readImageAsDataUrl(args.absPath);
    return { dataUrl };
  });

  ipcMain.handle(
    "fs:write",
    async (_event, args: { absPath: string; content: string }) => {
      await fs.writeTexFileContent(args.absPath, args.content);
    },
  );

  ipcMain.handle(
    "fs:create",
    async (
      _event,
      args: { rootPath: string; relativePath: string; content: string },
    ) => {
      const absPath = await fs.createFileOnDisk(
        args.rootPath,
        args.relativePath,
        args.content,
      );
      return { absPath };
    },
  );

  ipcMain.handle("fs:delete", async (_event, args: { absPath: string }) => {
    await fs.deleteFileFromDisk(args.absPath);
  });

  ipcMain.handle(
    "fs:deleteFolder",
    async (_event, args: { absPath: string }) => {
      await fs.deleteFolderFromDisk(args.absPath);
    },
  );

  ipcMain.handle(
    "fs:rename",
    async (_event, args: { oldPath: string; newPath: string }) => {
      await fs.renameFileOnDisk(args.oldPath, args.newPath);
    },
  );

  ipcMain.handle("fs:mkdir", async (_event, args: { absPath: string }) => {
    await fs.createDirectory(args.absPath);
  });

  // ─── Dialog Operations ───

  ipcMain.handle("dialog:openFolder", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      return { canceled: true, path: null };
    }

    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Open Project Folder",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null };
    }

    return { canceled: false, path: result.filePaths[0] };
  });

  // ─── Window Operations ───

  ipcMain.handle(
    "window:setTitle",
    (event, args: { title: string }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.setTitle(args.title);
      }
    },
  );

  // ─── Compile Operations ───

  ipcMain.handle(
    "compile:execute",
    async (
      _event,
      args: { projectDir: string; mainFile: string; useTexlive?: boolean },
    ) => {
      const result = await compileLatex(
        args.projectDir,
        args.mainFile,
        args.useTexlive,
      );
      if (result.success && result.pdfBytes) {
        return { pdfBytes: result.pdfBytes };
      } else {
        return { error: result.error || "Compilation failed" };
      }
    },
  );

  ipcMain.handle(
    "compile:synctex",
    async (
      _event,
      args: { projectDir: string; page: number; x: number; y: number },
    ) => {
      return synctexEdit(args.projectDir, args.page, args.x, args.y);
    },
  );

  ipcMain.handle("compile:detectTexlive", async () => {
    const texliveStatus = await detectTexlive();
    const tectonicAvailable = await detectTectonic();
    return {
      texlive: texliveStatus,
      tectonic: tectonicAvailable,
    };
  });

  // ─── Claude Operations ───

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
