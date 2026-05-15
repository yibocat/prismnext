import { ipcMain, dialog, BrowserWindow } from "electron";
import * as fs from "./services/filesystem";
import { join } from "node:path";

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
    (_event, args: { title: string }) => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) {
        win.setTitle(args.title);
      }
    },
  );
}
