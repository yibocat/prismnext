import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc/index";
import { setMainWindow, registerWindowHandlers } from "./ipc/window";
import { killAllClaudeProcesses } from "./services/claude";
import { disposeCliManager } from "./ipc/cli";

const isMac = process.platform === "darwin";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const windowConfig: Electron.BrowserWindowConstructorOptions = {
    width: 1400,
    height: 900,
    minWidth: 393,
    minHeight: 600,
    title: "Prism",
    show: false,
    backgroundColor: "#0a0a0a",
    vibrancy: "under-window",
    visualEffectState: "active",
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      enableBlinkFeatures: "AcceleratedSmallCanvases",
    },
  };

  if (isMac) {
    // macOS: hiddenInset gives native traffic lights, no titlebar
    windowConfig.titleBarStyle = "hiddenInset";
  } else {
    // Windows/Linux: frameless so our custom titlebar is the only one
    windowConfig.frame = false;
    windowConfig.autoHideMenuBar = true;
  }

  mainWindow = new BrowserWindow(windowConfig);

  // Make window available to IPC handlers and register window events
  setMainWindow(mainWindow);
  registerWindowHandlers();

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    killAllClaudeProcesses();
    disposeCliManager();
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Register IPC handlers that don't need the window reference
registerIpcHandlers();

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
