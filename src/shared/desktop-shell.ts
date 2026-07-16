/** Pure helpers for desktop notifications / tray (testable without Electron). */

export type TrayStatus = "idle" | "busy" | "attention";

export type DesktopNotifyKind = "turn_complete" | "action_required";

export function resolveTrayStatus(input: {
  hasPendingPermission: boolean;
  isStreaming: boolean;
}): TrayStatus {
  if (input.hasPendingPermission) return "attention";
  if (input.isStreaming) return "busy";
  return "idle";
}

/** True when the main window should stay alive on close (hide instead). */
export function shouldHideOnClose(input: {
  trayIconEnabled: boolean;
  isQuitting: boolean;
}): boolean {
  return input.trayIconEnabled && !input.isQuitting;
}

/** True when an OS notification may be shown. */
export function shouldSendDesktopNotification(input: {
  desktopNotificationsEnabled: boolean;
  notificationsSupported: boolean;
  windowFocused: boolean;
  windowVisible: boolean;
}): boolean {
  if (!input.desktopNotificationsEnabled) return false;
  if (!input.notificationsSupported) return false;
  if (input.windowFocused && input.windowVisible) return false;
  return true;
}

export function notifyDedupeKey(kind: DesktopNotifyKind, tabId: string): string {
  return `${kind}:${tabId}`;
}

/** One recent session/tab row in the Tray menu. */
export type TrayRecentItem = {
  /** Stable id for the menu item (prefer sessionId, else tabId). */
  id: string;
  title: string;
  sessionId?: string;
  tabId?: string;
};

/** Localized Tray menu snapshot pushed from the renderer. */
export type TrayMenuSnapshot = {
  showLabel: string;
  newChatLabel: string;
  quitLabel: string;
  recent: TrayRecentItem[];
};

export const TRAY_RECENT_LIMIT = 3;

/** Pick up to `limit` sessions by lastModified (newest first). */
export function pickRecentSessionsForTray<T extends { lastModified: number }>(
  sessions: T[],
  limit = TRAY_RECENT_LIMIT,
): T[] {
  return [...sessions]
    .sort((a, b) => b.lastModified - a.lastModified)
    .slice(0, Math.max(0, limit));
}
