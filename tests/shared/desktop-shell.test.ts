import { describe, expect, it } from "vitest";
import {
  countActiveAgents,
  formatTrayAccessoryTitle,
  formatTrayTooltip,
  notifyDedupeKey,
  pickRecentSessionsForTray,
  resolveTrayStatus,
  shouldHideOnClose,
  shouldOpenTrayMenuOnClick,
  shouldSendDesktopNotification,
} from "../../src/shared/platform/desktop-shell";

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

  it("skips tray menu reopen during dismiss echo window", () => {
    expect(shouldOpenTrayMenuOnClick({ now: 1000, ignoreUntil: 900 })).toBe(true);
    expect(shouldOpenTrayMenuOnClick({ now: 1000, ignoreUntil: 1100 })).toBe(false);
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

  it("counts streaming tabs and live sub-agents", () => {
    expect(
      countActiveAgents([
        { isStreaming: true, subAgentRuns: { a: { status: "running" }, b: { status: "done" } } },
        { isStreaming: false, subAgentRuns: { c: { status: "stopping" } } },
      ]),
    ).toBe(3);
  });

  it("formats a compact extra title for running count", () => {
    expect(formatTrayAccessoryTitle({ status: "idle", runningCount: 0 })).toBe("");
    expect(formatTrayAccessoryTitle({ status: "busy", runningCount: 2 })).toBe("2");
    expect(formatTrayAccessoryTitle({ status: "busy", runningCount: 12 })).toBe("9+");
    expect(formatTrayAccessoryTitle({ status: "attention", runningCount: 0 })).toBe("!");
  });

  it("formats tray tooltip with project name and status", () => {
    expect(formatTrayTooltip({ status: "idle", projectName: "MyPaper" })).toBe("MyPaper");
    expect(formatTrayTooltip({ status: "busy", projectName: "MyPaper", runningCount: 2 })).toBe(
      "MyPaper — 2 running",
    );
    expect(formatTrayTooltip({ status: "busy", projectName: "MyPaper" })).toBe(
      "MyPaper — Working…",
    );
    expect(formatTrayTooltip({ status: "attention", projectName: "MyPaper" })).toBe(
      "MyPaper — Needs attention",
    );
    expect(formatTrayTooltip({ status: "idle" })).toBe("prismnext");
    expect(formatTrayTooltip({ status: "busy" })).toBe("prismnext — Working…");
  });
});
