import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionChromeEntry,
  getSessionChromeEntry,
  isSessionUnread,
  markSessionAutoUnreadIfBackground,
  markSessionRead,
  setSessionIcon,
  setSessionUnread,
} from "../../src/renderer/lib/chat/session-chrome";
import { useSettingsStore } from "../../src/renderer/stores/settings-store";

const PROJECT = "/Users/test/project-a";
const SESSION = "sess-1";

describe("session-chrome", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: {},
      loaded: true,
    });
    vi.stubGlobal("electronAPI", {
      settingsSet: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("persists unread and clears on mark read", async () => {
    await setSessionUnread(PROJECT, SESSION, true);
    expect(isSessionUnread(PROJECT, SESSION)).toBe(true);
    expect(useSettingsStore.getState().settings.sessionChromeByProject?.[PROJECT]?.[SESSION]).toEqual({
      unread: true,
    });

    await markSessionRead(PROJECT, SESSION);
    expect(isSessionUnread(PROJECT, SESSION)).toBe(false);
    expect(useSettingsStore.getState().settings.sessionChromeByProject?.[PROJECT]?.[SESSION]).toBeUndefined();
  });

  it("removes chrome entry on clear", async () => {
    await setSessionUnread(PROJECT, SESSION, true);
    await clearSessionChromeEntry(PROJECT, SESSION);
    expect(useSettingsStore.getState().settings.sessionChromeByProject?.[PROJECT]).toBeUndefined();
    expect(window.electronAPI.settingsSet).toHaveBeenLastCalledWith({
      sessionChromeByProject: {},
    });
  });

  it("persists lucide / emoji icons and omits the default color", async () => {
    await setSessionIcon(PROJECT, SESSION, { name: "BookOpen", color: "default" });
    expect(getSessionChromeEntry(PROJECT, SESSION)).toEqual({
      icon: { kind: "lucide", value: "BookOpen" },
    });

    await setSessionIcon(PROJECT, SESSION, { kind: "lucide", value: "BookOpen", color: "warning" });
    expect(getSessionChromeEntry(PROJECT, SESSION)?.icon).toEqual({
      kind: "lucide",
      value: "BookOpen",
      color: "warning",
    });

    await setSessionIcon(PROJECT, SESSION, { kind: "emoji", value: "🧪", color: "warning" });
    expect(getSessionChromeEntry(PROJECT, SESSION)?.icon).toEqual({
      kind: "emoji",
      value: "🧪",
    });
  });

  it("drops an unknown lucide name instead of persisting it", async () => {
    await setSessionUnread(PROJECT, SESSION, true);
    await setSessionIcon(PROJECT, SESSION, { kind: "lucide", value: "NotARealIcon" });
    expect(getSessionChromeEntry(PROJECT, SESSION)).toEqual({ unread: true });
  });

  it("does not auto-unread the session the user is looking at", async () => {
    await markSessionAutoUnreadIfBackground(PROJECT, SESSION, () => true);
    expect(isSessionUnread(PROJECT, SESSION)).toBe(false);
  });

  it("auto-unreads a background session, then yields if it became active", async () => {
    await markSessionAutoUnreadIfBackground(PROJECT, SESSION, () => false);
    expect(isSessionUnread(PROJECT, SESSION)).toBe(true);

    let checks = 0;
    await markSessionAutoUnreadIfBackground(PROJECT, SESSION, () => {
      checks += 1;
      return checks > 1;
    });
    expect(isSessionUnread(PROJECT, SESSION)).toBe(false);
  });
});

describe("session context menu dismiss", () => {
  it("does not synthesize Escape to close the icon submenu", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/session-context-menu.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/new KeyboardEvent/);
  });
});
