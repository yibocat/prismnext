import { ipcMain, dialog, BrowserWindow } from "electron";

export function registerDialogHandlers(): void {
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

  ipcMain.handle("dialog:openFile", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      return { canceled: true, paths: [] as string[] };
    }

    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      title: "Open File",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, paths: [] as string[] };
    }

    return { canceled: false, paths: result.filePaths };
  });

  ipcMain.handle(
    "dialog:openJsonFile",
    async () => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) {
        return { canceled: true, path: null as string | null };
      }

      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        title: "Import commands",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: null };
      }

      return { canceled: false, path: result.filePaths[0] };
    },
  );

  ipcMain.handle(
    "dialog:saveJsonFile",
    async (_event, args: { defaultPath?: string }) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) {
        return { canceled: true, path: null as string | null };
      }

      const result = await dialog.showSaveDialog(win, {
        title: "Export commands",
        defaultPath: args.defaultPath ?? "prismnext-commands.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true, path: null };
      }

      return { canceled: false, path: result.filePath };
    },
  );
}
