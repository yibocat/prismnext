import { Tray, Menu, nativeImage, app, type BrowserWindow, type NativeImage } from "electron";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getSettings } from "./settings";
import type { TrayMenuSnapshot, TrayStatus } from "../../shared/desktop-shell";

let tray: Tray | null = null;
let isQuitting = false;
let status: TrayStatus = "idle";
let getMainWindow: (() => BrowserWindow | null) | null = null;
let menuSnapshot: TrayMenuSnapshot = {
  showLabel: "Show prismnext",
  newChatLabel: "New Chat",
  quitLabel: "Quit prismnext",
  recent: [],
};

function trayIconDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "resources", "tray");
  }
  // electron-vite dev: appPath may not include repo `resources/`; cwd is project root.
  return join(process.cwd(), "resources", "tray");
}

function loadIcon(name: "idleTemplate" | "busyTemplate" | "attentionTemplate"): NativeImage {
  const dir = trayIconDir();
  const basePath = join(dir, `${name}.png`);
  const retinaPath = join(dir, `${name}@2x.png`);
  // macOS menu bar: 16pt @1x + 32pt @2x (Electron docs). Larger 1x assets
  // inflate the whole status-item chrome vs neighboring apps.
  let img = nativeImage.createFromPath(basePath);
  if (img.isEmpty()) return nativeImage.createEmpty();

  const { width } = img.getSize();
  if (process.platform === "darwin" && width > 18) {
    img = img.resize({ width: 16, height: 16 });
  }

  if (existsSync(retinaPath)) {
    img.addRepresentation({
      scaleFactor: 2,
      buffer: readFileSync(retinaPath),
    });
  }
  if (process.platform === "darwin") {
    img.setTemplateImage(true);
  }
  return img;
}

function iconForStatus(s: TrayStatus): NativeImage {
  if (s === "attention") return loadIcon("attentionTemplate");
  if (s === "busy") return loadIcon("busyTemplate");
  return loadIcon("idleTemplate");
}

function tooltipForStatus(s: TrayStatus): string {
  if (s === "attention") return "prismnext — Needs attention";
  if (s === "busy") return "prismnext — Working…";
  return "prismnext";
}

function showMainWindow(): BrowserWindow | null {
  const win = getMainWindow?.() ?? null;
  if (!win || win.isDestroyed()) return null;
  if (!win.isVisible()) win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
  return win;
}

function sendTrayAction(channel: string, payload?: Record<string, unknown>): void {
  const win = showMainWindow();
  if (!win) return;
  win.webContents.send(channel, payload ?? {});
}

function buildMenu(): Menu {
  const recentItems = menuSnapshot.recent.map((item) => ({
    label: item.title.length > 40 ? `${item.title.slice(0, 39)}…` : item.title,
    click: () => {
      sendTrayAction("shell:trayOpenRecent", {
        id: item.id,
        sessionId: item.sessionId,
        tabId: item.tabId,
      });
    },
  }));

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: menuSnapshot.showLabel,
      click: () => {
        showMainWindow();
      },
    },
    {
      label: menuSnapshot.newChatLabel,
      click: () => {
        sendTrayAction("shell:trayNewChat");
      },
    },
  ];

  if (recentItems.length > 0) {
    template.push({ type: "separator" }, ...recentItems);
  }

  template.push(
    { type: "separator" },
    {
      label: menuSnapshot.quitLabel,
      click: () => {
        quitFromTray();
      },
    },
  );

  return Menu.buildFromTemplate(template);
}

function applyStatusVisuals(): void {
  if (!tray) return;
  tray.setImage(iconForStatus(status));
  tray.setToolTip(tooltipForStatus(status));
}

/**
 * Pop menu on demand. Do **not** keep a persistent `setContextMenu` on macOS —
 * that makes the system open the menu on mouse-*down*. We open on mouse-*up*
 * (or `click` on other platforms) via `popUpContextMenu` only.
 */
function popupTrayMenu(): void {
  if (!tray) return;
  tray.popUpContextMenu(buildMenu());
}

function refreshTrayMenu(): void {
  // Menu is built fresh on each popup; nothing to attach while idle.
  if (!tray) return;
}

export function setTrayWindowGetter(getter: () => BrowserWindow | null): void {
  getMainWindow = getter;
}

export function getIsQuitting(): boolean {
  return isQuitting;
}

export function setIsQuitting(value: boolean): void {
  isQuitting = value;
}

export function quitFromTray(): void {
  isQuitting = true;
  destroyTray();
  app.quit();
}

export function isTrayIconEnabled(): boolean {
  const settings = getSettings() as { trayIconEnabled?: boolean };
  return settings.trayIconEnabled !== false;
}

export function setTrayStatus(next: TrayStatus): void {
  status = next;
  applyStatusVisuals();
}

export function setTrayMenuSnapshot(snapshot: TrayMenuSnapshot): void {
  menuSnapshot = {
    showLabel: snapshot.showLabel || menuSnapshot.showLabel,
    newChatLabel: snapshot.newChatLabel || menuSnapshot.newChatLabel,
    quitLabel: snapshot.quitLabel || menuSnapshot.quitLabel,
    recent: Array.isArray(snapshot.recent) ? snapshot.recent.slice(0, 3) : [],
  };
  refreshTrayMenu();
}

export function syncTrayFromSettings(): void {
  if (isTrayIconEnabled()) {
    ensureTray();
  } else {
    destroyTray();
    // If window was hidden behind tray, bring it back so the user is not stuck.
    const win = getMainWindow?.();
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  }
}

export function ensureTray(): void {
  if (!isTrayIconEnabled()) {
    destroyTray();
    return;
  }
  if (tray) {
    applyStatusVisuals();
    refreshTrayMenu();
    return;
  }
  const icon = iconForStatus(status);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip(tooltipForStatus(status));
  // Never attach a persistent context menu on macOS — that opens on press.
  // Open on release instead (mouse-up); other platforms use click.
  if (process.platform === "darwin") {
    tray.on("mouse-up", () => {
      popupTrayMenu();
    });
    tray.on("right-click", () => {
      popupTrayMenu();
    });
  } else {
    tray.on("click", () => {
      popupTrayMenu();
    });
    tray.on("right-click", () => {
      popupTrayMenu();
    });
  }
  applyStatusVisuals();
}

export function destroyTray(): void {
  if (!tray) return;
  tray.destroy();
  tray = null;
}
