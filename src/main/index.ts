import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { registerIpcHandlers } from "./ipc/index";
import { setMainWindow, registerWindowHandlers } from "./ipc/window";
import { killAllClaudeProcesses } from "./services/claude";
import { disposeCliManager } from "./ipc/cli";
import { destroyAllTerminalSessions } from "./ipc/terminal";

const isMac = process.platform === "darwin";

let mainWindow: BrowserWindow | null = null;

// ─── Window size persistence ───

function getBoundsPath(): string {
  const dir = join(app.getPath("userData"), "Prism");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "window-bounds.json");
}

function saveWindowBounds(win: BrowserWindow) {
  try {
    // Save the un-maximized bounds, not the maximized screen-filling ones
    const bounds = win.isMaximized() || win.isFullScreen()
      ? (win as any)._lastNormalBounds ?? win.getBounds()
      : win.getBounds();
    // Skip saving if window is minimized (negative coords)
    if (bounds.x < -1000 || bounds.y < -1000) return;
    writeFileSync(getBoundsPath(), JSON.stringify(bounds));
  } catch {}
}

function restoreWindowBounds(): Partial<Electron.BrowserWindowConstructorOptions> {
  try {
    const data = readFileSync(getBoundsPath(), "utf-8");
    const bounds = JSON.parse(data);
    if (bounds && typeof bounds.width === "number" && typeof bounds.height === "number") {
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }
  } catch {}
  return {};
}

function createWindow() {
  const savedBounds = restoreWindowBounds();
  const windowConfig: Electron.BrowserWindowConstructorOptions = {
    width: savedBounds.width ?? 1400,
    height: savedBounds.height ?? 900,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 393,
    minHeight: 600,
    title: "Prism",
    show: false,
    backgroundColor: "#00000000",
    transparent: true,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      enableBlinkFeatures: "AcceleratedSmallCanvases",
    },
  };

  if (isMac) {
    // macOS: hiddenInset gives native traffic lights, no titlebar
    // vibrancy + transparent = native desktop-blur glass effect
    windowConfig.titleBarStyle = "hiddenInset";
    windowConfig.vibrancy = "under-window";
    windowConfig.visualEffectState = "active";
  } else {
    // Windows/Linux: frameless so our custom titlebar is the only one
    windowConfig.frame = false;
    windowConfig.autoHideMenuBar = true;
    // Windows: acrylic blur effect for desktop transparency
    if (process.platform === "win32") {
      windowConfig.backgroundMaterial = "acrylic";
    }
  }

  mainWindow = new BrowserWindow(windowConfig);

  // Make window available to IPC handlers and register window events
  setMainWindow(mainWindow);
  registerWindowHandlers();

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", () => {
    if (mainWindow) saveWindowBounds(mainWindow);
  });

  mainWindow.on("closed", () => {
    killAllClaudeProcesses();
    disposeCliManager();
    destroyAllTerminalSessions();
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
