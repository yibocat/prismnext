import { Notification, type BrowserWindow } from "electron";
import { getSettings } from "./settings";
import {
  notifyDedupeKey,
  shouldSendDesktopNotification,
  type DesktopNotifyKind,
} from "../../shared/platform/desktop-shell";

let getMainWindow: (() => BrowserWindow | null) | null = null;
const recentKeys = new Map<string, number>();
const DEDUPE_MS = 2000;

export function setDesktopNotificationWindowGetter(
  getter: () => BrowserWindow | null,
): void {
  getMainWindow = getter;
}

function isWindowInBackground(win: BrowserWindow | null): {
  focused: boolean;
  visible: boolean;
} {
  if (!win || win.isDestroyed()) {
    return { focused: false, visible: false };
  }
  return {
    focused: win.isFocused(),
    visible: win.isVisible(),
  };
}

export type DesktopNotifyPayload = {
  kind: DesktopNotifyKind;
  title: string;
  body: string;
  tabId?: string;
};

/** Show an OS notification when the window is unfocused/hidden and settings allow. */
export function notifyDesktop(payload: DesktopNotifyPayload): boolean {
  const settings = getSettings() as { desktopNotifications?: boolean };
  const enabled = settings.desktopNotifications !== false;
  const win = getMainWindow?.() ?? null;
  const { focused, visible } = isWindowInBackground(win);

  if (
    !shouldSendDesktopNotification({
      desktopNotificationsEnabled: enabled,
      notificationsSupported: Notification.isSupported(),
      windowFocused: focused,
      windowVisible: visible,
    })
  ) {
    return false;
  }

  const key = notifyDedupeKey(payload.kind, payload.tabId ?? "_");
  const now = Date.now();
  const prev = recentKeys.get(key);
  if (prev != null && now - prev < DEDUPE_MS) return false;
  recentKeys.set(key, now);

  const n = new Notification({
    title: payload.title || "prismnext",
    body: payload.body,
    silent: false,
  });
  n.on("click", () => {
    const w = getMainWindow?.();
    if (!w || w.isDestroyed()) return;
    if (!w.isVisible()) w.show();
    if (w.isMinimized()) w.restore();
    w.focus();
    if (payload.tabId) {
      w.webContents.send("shell:focusChatTab", { tabId: payload.tabId });
    }
  });
  n.show();
  return true;
}
