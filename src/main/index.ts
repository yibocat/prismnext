// First import — pins userData before settings/logger touch app.getPath("userData").
import "./user-data-bootstrap";

import { app, BrowserWindow, protocol, session } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { exec } from "node:child_process";
import { registerLiteraturePdfProtocol } from "./services/literature-pdf-protocol";
import { discoverAndRegisterProTeams } from "./services/pro-teams-discovery";
import { ensureUserTeamsRegistered } from "./services/user-teams";
import { ensureUserTeamsMigrated } from "./teams/migrate-user-teams";
import { ensureMyContentTeam } from "./teams/my-content";
import { disposeChat, registerIpcHandlers } from "./ipc/index";
import {
  setMainWindow,
  getPrimaryWindow,
  registerWindowHandlers,
  registerNewWindowHandler,
  attachWindowStateEmitter,
} from "./ipc/window";
import { installApplicationMenu } from "./menu";
import { destroyAllTerminalSessions } from "./ipc/terminal";
import { destroyAllAiPty } from "./services/ai-pty";
import { getExecutionRegistry, initExecutionRegistry } from "./services/execution-registry";
import { startExecutionEventBroadcast } from "./ipc/execution";
import { disposeAllTectonicDaemonSessions } from "./services/tectonic-daemon";
import { startTerminalBridge, stopTerminalBridge, setTerminalBridgeWindow } from "./services/terminal-bridge";
import { startLiteratureBridge, stopLiteratureBridge } from "./services/literature-bridge";
import { startLatexBridge, stopLatexBridge } from "./services/latex-bridge";
import { startResearchBriefBridge, stopResearchBriefBridge } from "./services/research-brief-bridge";
import { startExperimentLogBridge, stopExperimentLogBridge } from "./services/experiment-log-bridge";
import { startInteractionBridge, stopInteractionBridge } from "./services/interaction-bridge";
import { startImageDescribeBridge, stopImageDescribeBridge } from "./services/image-describe-bridge";
import { installMainProcessNetwork } from "./lib/main-network";
import { registerCrashHandlers } from "./lib/crash-handler";
import { installCsp } from "./lib/csp";
import { createLogger } from "./services/logger";
import { setDesktopNotificationWindowGetter } from "./services/desktop-notifications";
import {
  getIsQuitting,
  isTrayIconEnabled,
  setIsQuitting,
  setTrayWindowGetter,
  syncTrayFromSettings,
} from "./services/tray";
import { shouldHideOnClose } from "../shared/desktop-shell";

const log = createLogger("main", "startup");

// Register crash handlers as early as possible — before any startup code that
// could throw an uncaughtException. Makes main-process crashes visible in the
// Log Viewer and durable in <userData>/logs/crashes.log.
registerCrashHandlers();

function brandIconPath(...parts: string[]): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "resources", "brand", ...parts);
  }
  // electron-vite dev: cwd is the project root.
  return join(process.cwd(), "resources", "brand", ...parts);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "literature-pdf",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const isMac = process.platform === "darwin";

let mainWindow: BrowserWindow | null = null;

// ─── Window size persistence ───

function getBoundsPath(): string {
  const userData = app.getPath("userData");
  const dir = join(userData, "PrismNext");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const nextPath = join(dir, "window-bounds.json");
  // Migrate legacy bounds from older app names.
  if (!existsSync(nextPath)) {
    // Legacy in-userData subfolders from older app names (literal on-disk names).
    for (const legacy of ["Prism", "Prism Next"] as const) {
      const legacyPath = join(userData, legacy, "window-bounds.json");
      if (existsSync(legacyPath)) {
        try {
          writeFileSync(nextPath, readFileSync(legacyPath, "utf-8"));
        } catch {}
        break;
      }
    }
  }
  return nextPath;
}

type BoundsMemory = { x: number; y: number; width: number; height: number };

function readNormalBounds(win: BrowserWindow): BoundsMemory | null {
  const remembered = (win as BrowserWindow & { _lastNormalBounds?: BoundsMemory })._lastNormalBounds;
  if (
    remembered
    && typeof remembered.width === "number"
    && typeof remembered.height === "number"
  ) {
    return remembered;
  }
  if (win.isMaximized() || win.isFullScreen() || win.isMinimized()) return null;
  const bounds = win.getBounds();
  if (bounds.x < -1000 || bounds.y < -1000) return null;
  return bounds;
}

function saveWindowBounds(win: BrowserWindow) {
  try {
    const bounds = readNormalBounds(win);
    if (!bounds) return;
    writeFileSync(getBoundsPath(), JSON.stringify(bounds));
  } catch {}
}

/** Keep last non-maximized size so restore / next launch match the user’s window. */
function attachWindowBoundsPersistence(win: BrowserWindow) {
  const remember = () => {
    if (win.isDestroyed() || win.isMaximized() || win.isFullScreen() || win.isMinimized()) return;
    const bounds = win.getBounds();
    if (bounds.x < -1000 || bounds.y < -1000) return;
    (win as BrowserWindow & { _lastNormalBounds?: BoundsMemory })._lastNormalBounds = bounds;
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    remember();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!win.isDestroyed()) saveWindowBounds(win);
    }, 250);
  };

  remember();
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("maximize", remember);
  win.on("unmaximize", () => {
    remember();
    saveWindowBounds(win);
  });
}

function restoreWindowBounds(): Partial<Electron.BrowserWindowConstructorOptions> {
  try {
    const data = readFileSync(getBoundsPath(), "utf-8");
    const bounds = JSON.parse(data) as BoundsMemory;
    if (
      bounds
      && typeof bounds.width === "number"
      && typeof bounds.height === "number"
      && bounds.width >= 393
      && bounds.height >= 600
    ) {
      return {
        ...(typeof bounds.x === "number" ? { x: bounds.x } : {}),
        ...(typeof bounds.y === "number" ? { y: bounds.y } : {}),
        width: bounds.width,
        height: bounds.height,
      };
    }
  } catch {}
  return {};
}

function pickWindowForShell(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  return getPrimaryWindow();
}

function finalizeExecutionsForQuit(): void {
  try {
    void getExecutionRegistry().finalizeForQuit();
  } catch {
    // Registry may not be initialized during early quit.
  }
}

function disposeGlobalsWhenNoWindows(): void {
  if (BrowserWindow.getAllWindows().length > 0) return;
  finalizeExecutionsForQuit();
  disposeChat();
  destroyAllAiPty();
  destroyAllTerminalSessions();
  stopTerminalBridge();
  stopLiteratureBridge();
  stopLatexBridge();
  stopResearchBriefBridge();
  stopExperimentLogBridge();
  stopInteractionBridge();
  stopImageDescribeBridge();
  setTerminalBridgeWindow(null);
  void import("./ipc/log").then((m) => m.disposeLogger());
  mainWindow = null;
  setMainWindow(null);
}

function createWindow(): BrowserWindow {
  const existing = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  const savedBounds = restoreWindowBounds();
  const windowConfig: Electron.BrowserWindowConstructorOptions = {
    width: savedBounds.width ?? 1400,
    height: savedBounds.height ?? 900,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 393,
    minHeight: 600,
    title: "prismnext",
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

  // Offset additional windows so they don't stack exactly on the first.
  if (existing.length > 0) {
    const anchor = BrowserWindow.getFocusedWindow() ?? existing[existing.length - 1];
    const b = anchor.getBounds();
    windowConfig.x = b.x + 28;
    windowConfig.y = b.y + 28;
    windowConfig.width = b.width;
    windowConfig.height = b.height;
  }

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
    const winIcon = brandIconPath("app-icon-dark.png");
    if (existsSync(winIcon)) windowConfig.icon = winIcon;
  }

  const win = new BrowserWindow(windowConfig);
  mainWindow = win;
  setMainWindow(win);
  setTerminalBridgeWindow(win);
  attachWindowStateEmitter(win);
  attachWindowBoundsPersistence(win);

  // Re-warm child_process after macOS App Nap / background suspension.
  win.on("focus", () => {
    mainWindow = win;
    setMainWindow(win);
    setTerminalBridgeWindow(win);
    exec("git --version", { timeout: 15000 }, () => {
      // focus warmup complete
    });
  });

  win.on("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });

  win.on("close", (event) => {
    saveWindowBounds(win);
    const remaining = BrowserWindow.getAllWindows().filter((w) => w !== win && !w.isDestroyed());
    // Tray hide-on-close only when this is the last window.
    if (
      remaining.length === 0
      && shouldHideOnClose({
        trayIconEnabled: isTrayIconEnabled(),
        isQuitting: getIsQuitting(),
      })
    ) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null;
      setMainWindow(mainWindow);
      setTerminalBridgeWindow(mainWindow);
    }
    disposeGlobalsWhenNoWindows();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    // FREEZE_SPLASH=1 keeps the loading screen visible for design iteration
    const url = process.env.FREEZE_SPLASH
      ? process.env.ELECTRON_RENDERER_URL + "?freeze-splash"
      : process.env.ELECTRON_RENDERER_URL;
    void win.loadURL(url);

    // Dev only: Cmd+Option+I toggles DevTools (no menu entry in production builds).
    win.webContents.on("before-input-event", (_event, input) => {
      if (input.type !== "keyDown") return;
      if (input.meta && input.alt && input.key?.toLowerCase() === "i") {
        win.webContents.toggleDevTools();
      }
    });
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

// Pro 私有包的 packs 发现与注册必须先于 IPC 注册（§8.2）：
// catalog 在任何 packs:* handler 服务前就要包含 pro pack（locked 与否由 resolver 门控）。
discoverAndRegisterProTeams();

// Register IPC handlers that don't need the window reference
registerIpcHandlers();
registerWindowHandlers();
registerNewWindowHandler(createWindow);

app.whenReady().then(async () => {
  registerLiteraturePdfProtocol();
  installMainProcessNetwork();
  // M2 canonicalizes legacy user-packs before the catalog sees any user Team.
  ensureUserTeamsMigrated();
  // Always-on My Content + chat lead (safety net so Core can be offloaded).
  ensureMyContentTeam();
  // Temporary read compatibility for any legacy directory that could not be
  // migrated safely (for example, an unreadable manifest).
  ensureUserTeamsRegistered();
  // Inject CSP on the default session (renderer only — browser webviews use a
  // separate persist:browser partition). Must run before createWindow().
  installCsp(session.defaultSession);

  const aboutIcon = brandIconPath("app-icon-dark.png");
  app.setAboutPanelOptions({
    applicationName: "prismnext",
    applicationVersion: app.getVersion(),
    copyright: "prismnext",
    ...(existsSync(aboutIcon) ? { iconPath: aboutIcon } : {}),
  });

  startTerminalBridge();
  initExecutionRegistry(join(app.getPath("userData"), "execution-history"));
  startExecutionEventBroadcast();
  startLiteratureBridge();
  startLatexBridge();
  startResearchBriefBridge();
  startExperimentLogBridge();
  startInteractionBridge();
  startImageDescribeBridge();

  try {
    const { initAppUpdater } = await import("./services/update-checker");
    initAppUpdater();
  } catch (err) {
    log.warn("App updater init failed", { error: (err as Error).message });
  }

  installApplicationMenu({
    getTargetWindow: pickWindowForShell,
    createWindow,
  });
  setTrayWindowGetter(() => pickWindowForShell());
  setDesktopNotificationWindowGetter(() => pickWindowForShell());
  syncTrayFromSettings();

  createWindow();

  // Initialize settings and prompt infrastructure. Agent runtimes stay lazy:
  // opening the app or a project must not spawn OpenCode.
  try {
    const { getSettings, pruneOrphanProviderSettings } = await import("./services/settings");

    // GC leftovers from pre-v0.6.8 provider removals (orphan API keys etc.)
    // before anything below reads settings — orphans must not re-register.
    try {
      const pruned = pruneOrphanProviderSettings();
      if (pruned.length) {
        console.log(`[prismnext] Pruned orphan provider settings: ${pruned.join(", ")}`);
        log.info("Pruned orphan provider settings", { ids: pruned });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("Orphan provider settings prune failed", { error: message });
    }

    const settings = getSettings() as Record<string, unknown>;

    // ── Initialize Prompt System ──
    try {
      const { promptManager } = await import("./prompts");
      promptManager.initialize();

      // Restore layer toggle states from persisted settings
      if ((settings as any).promptLayers) {
        promptManager.loadLayerStates((settings as any).promptLayers as Record<string, boolean>);
      }

      const { registerLegacyBuiltinCommandStatesHooks } = await import("./services/teams-state");
      const { clearLegacyBuiltinCommandStates } = await import("./services/settings");
      // R11：legacy settings.builtinCommands（全局启停）→ 首个迁移项目的
      // legacy settings.builtinCommands → teams.json migration; consumed once.。
      registerLegacyBuiltinCommandStatesHooks({
        read: () => {
          const states = (getSettings() as Record<string, unknown>).builtinCommands;
          return states && typeof states === "object" && !Array.isArray(states)
            ? (states as Record<string, boolean>)
            : null;
        },
        clear: () => clearLegacyBuiltinCommandStates(),
      });

      log.info("Prompt system initialized");
    } catch (err: any) {
      log.warn("Prompt system init failed", { error: (err as Error).message });
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[prismnext] Agent infrastructure init failed: ${message}`);
    log.warn("Agent infrastructure init failed", { error: message });
  }
});

// Kill in-flight experiment / AI bash PTYs even when quit skips window `closed`
// (macOS menu Quit paths). Safe to call twice alongside the closed handler.
app.on("before-quit", () => {
  setIsQuitting(true);
  disposeAllTectonicDaemonSessions();
  finalizeExecutionsForQuit();
  destroyAllAiPty();
  destroyAllTerminalSessions();
});

app.on("window-all-closed", () => {
  // Tray keep-alive: a hidden BrowserWindow still counts, so we rarely hit this
  // while tray is enabled. When tray is off, quit on non-mac as before.
  if (isTrayIconEnabled() && !getIsQuitting()) return;
  if (!isMac) {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    return;
  }
  const win = pickWindowForShell();
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.focus();
  }
});
