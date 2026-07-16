import { app, BrowserWindow, protocol, session } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { exec } from "node:child_process";
import { registerLiteraturePdfProtocol } from "./services/literature-pdf-protocol";
import { registerIpcHandlers } from "./ipc/index";
import { setMainWindow, registerWindowHandlers } from "./ipc/window";
import { installApplicationMenu } from "./menu";
import { disposeChat } from "./ipc/chat";
import { destroyAllTerminalSessions } from "./ipc/terminal";
import { destroyAllAiPty } from "./services/ai-pty";
import { startTerminalBridge, stopTerminalBridge, setTerminalBridgeWindow } from "./services/terminal-bridge";
import { startLiteratureBridge, stopLiteratureBridge } from "./services/literature-bridge";
import { startLatexBridge, stopLatexBridge } from "./services/latex-bridge";
import { startResearchBriefBridge, stopResearchBriefBridge } from "./services/research-brief-bridge";
import { startExperimentLogBridge, stopExperimentLogBridge } from "./services/experiment-log-bridge";
import { installMainProcessNetwork } from "./lib/main-network";
import { registerCrashHandlers } from "./lib/crash-handler";
import { installCsp } from "./lib/csp";
import { createLogger } from "./services/logger";
import { providerApiKeyEnvVar } from "../shared/opencode-provider";

const log = createLogger("main", "startup");

// Register crash handlers as early as possible — before any startup code that
// could throw an uncaughtException. Makes main-process crashes visible in the
// Log Viewer and durable in <userData>/logs/crashes.log.
registerCrashHandlers();

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

  installApplicationMenu(() => mainWindow);

  // Make window available to IPC handlers and register window events
  setMainWindow(mainWindow);
  setTerminalBridgeWindow(mainWindow);
  registerWindowHandlers();

  // Re-warm child_process after macOS App Nap / background suspension.
  // When the app loses focus for a while, macOS may throttle the process,
  // making the first spawn after resume slow again. A quick dummy exec on
  // focus restores fast git / agent performance.
  mainWindow.on("focus", () => {
    exec("git --version", { timeout: 15000 }, () => {
      // focus warmup complete
    });
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", () => {
    if (mainWindow) saveWindowBounds(mainWindow);
  });

  mainWindow.on("closed", () => {
    disposeChat();
    destroyAllAiPty();
    destroyAllTerminalSessions();
    stopTerminalBridge();
    stopLiteratureBridge();
    stopLatexBridge();
    stopResearchBriefBridge();
    stopExperimentLogBridge();
    setTerminalBridgeWindow(null);
    import("./ipc/log").then((m) => m.disposeLogger());
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    // FREEZE_SPLASH=1 keeps the loading screen visible for design iteration
    const url = process.env.FREEZE_SPLASH
      ? process.env.ELECTRON_RENDERER_URL + "?freeze-splash"
      : process.env.ELECTRON_RENDERER_URL;
    mainWindow.loadURL(url);

    // Dev only: Cmd+Option+I toggles DevTools (no menu entry in production builds).
    mainWindow.webContents.on("before-input-event", (_event, input) => {
      if (input.type !== "keyDown") return;
      if (input.meta && input.alt && input.key?.toLowerCase() === "i") {
        mainWindow?.webContents.toggleDevTools();
      }
    });
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Register IPC handlers that don't need the window reference
registerIpcHandlers();

app.whenReady().then(async () => {
  registerLiteraturePdfProtocol();
  installMainProcessNetwork();
  // Inject CSP on the default session (renderer only — browser webviews use a
  // separate persist:browser partition). Must run before createWindow().
  installCsp(session.defaultSession);
  startTerminalBridge();
  startLiteratureBridge();
  startLatexBridge();
  startResearchBriefBridge();
  startExperimentLogBridge();
  createWindow();

  // App-level ACP warm-up — spawn opencode once at startup.
  // The same process serves all projects. First session/create is instant.
  try {
    const { AcpService } = await import("./acp/service");
    const { getSettings } = await import("./services/settings");

    const settings = getSettings() as Record<string, unknown>;
    const aiApiKeys = (settings.aiApiKeys as Record<string, string>) || {};
    const aiBaseUrls = (settings.aiBaseUrls as Record<string, string>) || {};

    // ── Initialize Prompt System ──
    try {
      const { promptManager } = await import("./prompts");
      promptManager.initialize();

      // Restore layer toggle states from persisted settings
      if ((settings as any).promptLayers) {
        promptManager.loadLayerStates((settings as any).promptLayers as Record<string, boolean>);
      }

      const { commandRegistry } = await import("./commands/registry");
      if ((settings as any).builtinCommands) {
        commandRegistry.applyBuiltinStates((settings as any).builtinCommands as Record<string, boolean>);
      }

      log.info("Prompt system initialized");
    } catch (err: any) {
      log.warn("Prompt system init failed", { error: (err as Error).message });
    }

    // Build env vars from ALL saved keys so OpenCode can use them
    const extraEnv: Record<string, string> = {};
    for (const [provider, apiKey] of Object.entries(aiApiKeys)) {
      if (!apiKey) continue;
      extraEnv[providerApiKeyEnvVar(provider)] = apiKey;
      if (aiBaseUrls[provider] && provider !== "opencode-go" && provider !== "opencode-zen") {
        extraEnv[`${provider.replace(/-/g, "_").toUpperCase()}_BASE_URL`] = aiBaseUrls[provider];
      }
    }

    const service = AcpService.getInstance();
    await service.initialize(extraEnv);
    console.log("[prism] OpenCode ACP ready");
    log.info("OpenCode ACP server ready");

    // Register non-bundled providers (DeepSeek, OpenRouter, custom) via ACP
    // Built-in providers (anthropic, openai, google) are already recognized.
    for (const [provider] of Object.entries(aiApiKeys)) {
      if (!aiApiKeys[provider]) continue;
      try {
        const result = await service.setAuth(provider, {
          apiKey: aiApiKeys[provider],
          baseUrl: aiBaseUrls[provider] || "",
        });
        if (result.success) {
          console.log(`[prism] Provider registered: ${provider}`);
          log.info(`Provider registered: ${provider}`);
        }
        // Non-builtin providers may not support ACP providers/set —
        // they still work via env vars passed to the process.
      } catch (err: any) {
        console.warn(`[prism] Failed to register ${provider}: ${err.message}`);
        log.warn(`Failed to register provider ${provider}`, { error: err.message });
      }
    }
  } catch {
    // Pre-warm is best-effort — app still works, initialize retries on first use
  }
});

// Kill in-flight experiment / AI bash PTYs even when quit skips window `closed`
// (macOS menu Quit paths). Safe to call twice alongside the closed handler.
app.on("before-quit", () => {
  destroyAllAiPty();
  destroyAllTerminalSessions();
});

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
