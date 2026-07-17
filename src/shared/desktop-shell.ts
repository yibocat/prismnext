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

/**
 * Whether a tray click should open the menu.
 * After the menu closes, the dismissing click still fires — skip until `ignoreUntil`.
 */
export function shouldOpenTrayMenuOnClick(input: {
  now: number;
  ignoreUntil: number;
}): boolean {
  return input.now >= input.ignoreUntil;
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

/** RightArea modes that Tray can open maximized. */
export type TrayModeId = "texworkspace" | "literature" | "experiments";

export type TrayModeItem = {
  id: TrayModeId;
  label: string;
};

/** Localized Tray menu snapshot pushed from the renderer. */
export type TrayMenuSnapshot = {
  showLabel: string;
  newChatLabel: string;
  quitLabel: string;
  recent: TrayRecentItem[];
  /** Open project folder basename; shown as a disabled menu header when set. */
  projectName?: string | null;
  /** Mode shortcuts (only when a project is open). */
  modes?: TrayModeItem[];
};

/**
 * Tray hover tooltip. Prefer `projectName` when a project is open so the
 * menu-bar / tray item identifies which workspace is running.
 */
export function formatTrayTooltip(input: {
  status: TrayStatus;
  projectName?: string | null;
  appName?: string;
}): string {
  const app = (input.appName ?? "prismnext").trim() || "prismnext";
  const project = input.projectName?.trim() || "";
  const head = project || app;
  if (input.status === "attention") return `${head} — Needs attention`;
  if (input.status === "busy") return `${head} — Working…`;
  return head;
}

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
