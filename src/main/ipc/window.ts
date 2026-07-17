import { BrowserWindow, ipcMain } from "electron";

let primaryWindow: BrowserWindow | null = null;
let handlersRegistered = false;

export function setMainWindow(win: BrowserWindow | null) {
  primaryWindow = win && !win.isDestroyed() ? win : null;
}

export function getPrimaryWindow(): BrowserWindow | null {
  if (primaryWindow && !primaryWindow.isDestroyed()) return primaryWindow;
  const first = BrowserWindow.getAllWindows()[0] ?? null;
  primaryWindow = first;
  return first;
}

function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerWindowHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle(
    "window:setTitle",
    (event, args: { title: string }) => {
      const win = windowFromEvent(event);
      if (win) {
        win.setTitle(args.title);
      }
    },
  );

  ipcMain.handle("window:isMaximized", (event) => {
    return windowFromEvent(event)?.isMaximized() ?? false;
  });
  ipcMain.handle("window:isFullscreen", (event) => {
    return windowFromEvent(event)?.isFullScreen() ?? false;
  });

  ipcMain.handle("window:minimize", (event) => {
    windowFromEvent(event)?.minimize();
  });
  ipcMain.handle("window:maximize", (event) => {
    const win = windowFromEvent(event);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.handle("window:close", (event) => {
    windowFromEvent(event)?.close();
  });
}

let newWindowHandlerRegistered = false;

/** Call once after `createWindow` exists so Cmd+N / menu can open another window. */
export function registerNewWindowHandler(createWindow: () => BrowserWindow): void {
  if (newWindowHandlerRegistered) return;
  newWindowHandlerRegistered = true;
  ipcMain.handle("window:new", () => {
    const win = createWindow();
    return { ok: true as const, id: win.id };
  });
}

export function attachWindowStateEmitter(win: BrowserWindow): void {
  const emitState = () => {
    if (win.isDestroyed()) return;
    win.webContents.send("window:stateChange", {
      isMaximized: win.isMaximized(),
      isFullscreen: win.isFullScreen(),
    });
  };

  win.on("enter-full-screen", emitState);
  win.on("leave-full-screen", emitState);
  win.on("maximize", emitState);
  win.on("unmaximize", emitState);
}
