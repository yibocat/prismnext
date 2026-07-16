import { describe, expect, it } from "vitest";
import {
  notifyDedupeKey,
  pickRecentSessionsForTray,
  resolveTrayStatus,
  shouldHideOnClose,
  shouldSendDesktopNotification,
} from "../../src/shared/desktop-shell";

describe("desktop-shell", () => {
  it("resolves tray status with attention over busy", () => {
    expect(
      resolveTrayStatus({ hasPendingPermission: true, isStreaming: true }),
    ).toBe("attention");
    expect(
      resolveTrayStatus({ hasPendingPermission: false, isStreaming: true }),
    ).toBe("busy");
    expect(
      resolveTrayStatus({ hasPendingPermission: false, isStreaming: false }),
    ).toBe("idle");
  });

  it("hides on close only when tray is on and not quitting", () => {
    expect(shouldHideOnClose({ trayIconEnabled: true, isQuitting: false })).toBe(true);
    expect(shouldHideOnClose({ trayIconEnabled: true, isQuitting: true })).toBe(false);
    expect(shouldHideOnClose({ trayIconEnabled: false, isQuitting: false })).toBe(false);
  });

  it("sends notifications only when enabled, supported, and background", () => {
    expect(
      shouldSendDesktopNotification({
        desktopNotificationsEnabled: true,
        notificationsSupported: true,
        windowFocused: false,
        windowVisible: true,
      }),
    ).toBe(true);
    expect(
      shouldSendDesktopNotification({
        desktopNotificationsEnabled: true,
        notificationsSupported: true,
        windowFocused: true,
        windowVisible: true,
      }),
    ).toBe(false);
    expect(
      shouldSendDesktopNotification({
        desktopNotificationsEnabled: true,
        notificationsSupported: true,
        windowFocused: false,
        windowVisible: false,
      }),
    ).toBe(true);
    expect(
      shouldSendDesktopNotification({
        desktopNotificationsEnabled: false,
        notificationsSupported: true,
        windowFocused: false,
        windowVisible: false,
      }),
    ).toBe(false);
  });

  it("builds stable dedupe keys", () => {
    expect(notifyDedupeKey("turn_complete", "tab-1")).toBe("turn_complete:tab-1");
  });

  it("picks newest sessions for tray recent list", () => {
    const picked = pickRecentSessionsForTray(
      [
        { id: "a", lastModified: 1 },
        { id: "b", lastModified: 30 },
        { id: "c", lastModified: 20 },
        { id: "d", lastModified: 10 },
      ],
      3,
    );
    expect(picked.map((s) => s.id)).toEqual(["b", "c", "d"]);
  });
});
