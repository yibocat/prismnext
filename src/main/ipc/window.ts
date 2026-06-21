import { BrowserWindow, ipcMain } from "electron";

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow) {
  mainWindow = win;
}

export function registerWindowHandlers() {
  ipcMain.handle(
    "window:setTitle",
    (event, args: { title: string }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.setTitle(args.title);
      }
    },
  );

  ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("window:isFullscreen", () => mainWindow?.isFullScreen() ?? false);

  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle("window:close", () => mainWindow?.close());

  // Emit state changes to renderer
  const emitState = () => {
    mainWindow?.webContents.send("window:stateChange", {
      isMaximized: mainWindow?.isMaximized() ?? false,
      isFullscreen: mainWindow?.isFullScreen() ?? false,
    });
  };

  mainWindow?.on("enter-full-screen", emitState);
  mainWindow?.on("leave-full-screen", emitState);
  mainWindow?.on("maximize", emitState);
  mainWindow?.on("unmaximize", emitState);
}
