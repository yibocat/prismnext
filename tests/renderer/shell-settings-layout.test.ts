import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MAIN_AREA_MIN, SIDEBAR_LEFT_MIN } from "@/styles/constants";
import { registerLeftNavItems } from "@/lib/workspace/left-nav/items";
import { commitShellSashResult } from "@/lib/workspace/shell-layout-controller";
import {
  applyShellWindowLayout,
  getShellLive,
  resetShellLiveForTests,
} from "@/lib/workspace/shell-layout-controller";
import { syncShellForLeftSidebarView } from "@/lib/workspace/shell-view-sync";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const L_MIN = SIDEBAR_LEFT_MIN;

function settingsEditorTab() {
  return {
    id: "settings-editor-1",
    title: "General",
    kind: "settings-editor" as const,
    isInitial: false,
  };
}

function workspaceSplit(windowPx: number) {
  vi.stubGlobal("innerWidth", windowPx);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  useLayoutStore.setState({
    leftSidebarView: "sessions",
    leftUserExpanded: true,
    leftWindowCollapsed: false,
    leftPinToMin: false,
    sidebarWidth: L_MIN,
    rightAreaExpanded: true,
    editorMaximized: false,
    rightAreaWidth: 500,
    settingsDetailWidth: 420,
    settingsDetailStacked: false,
    pendingRightAreaRestore: false,
  });
}

describe("shell-settings-layout (spec Phase 4)", () => {
  beforeAll(() => {
    try {
      registerLeftNavItems();
    } catch {
      // Already registered by another suite.
    }
  });

  afterEach(() => {
    resetShellLiveForTests();
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    vi.unstubAllGlobals();
  });

  it("persists a Settings detail sash to settingsDetailWidth, not RightArea", () => {
    workspaceSplit(1400);
    useLayoutStore.setState({ leftSidebarView: "settings" });
    useRightPanelStore.setState({
      tabs: [settingsEditorTab()],
      activeTabId: "settings-editor-1",
    });
    applyShellWindowLayout({ source: "programmatic" });
    expect(applyShellWindowLayout({ source: "sash", sashRightPx: 640 }).rightPx).toBe(640);

    commitShellSashResult("right", 640, false);
    expect(useLayoutStore.getState().settingsDetailWidth).toBe(640);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);
    expect(applyShellWindowLayout({ source: "programmatic" }).rightPx).toBe(640);
  });

  it("window-shrinks Settings detail to stacked without rewriting the remembered width", () => {
    workspaceSplit(1400);
    useLayoutStore.setState({ leftSidebarView: "settings" });
    useRightPanelStore.setState({
      tabs: [settingsEditorTab()],
      activeTabId: "settings-editor-1",
    });
    expect(applyShellWindowLayout({ source: "programmatic" }).rightMode).toBe("split");

    vi.stubGlobal("innerWidth", L_MIN + MAIN_AREA_MIN + 200);
    const stacked = applyShellWindowLayout({ source: "window" });
    expect(stacked.rightMode).toBe("maximize");
    expect(useLayoutStore.getState().settingsDetailStacked).toBe(true);
    expect(useLayoutStore.getState().settingsDetailWidth).toBe(420);
  });

  it("exiting Settings into another immersive view does not flash workspace RightArea", () => {
    workspaceSplit(1400);
    useLayoutStore.setState({
      rightAreaExpanded: true,
      pendingRightAreaRestore: false,
    });
    applyShellWindowLayout({ source: "programmatic" });

    syncShellForLeftSidebarView("sessions", "settings");
    expect(useLayoutStore.getState().pendingRightAreaRestore).toBe(true);

    syncShellForLeftSidebarView("settings", "templates");
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
    expect(getShellLive().rightMode).toBe("closed");
    expect(useLayoutStore.getState().pendingRightAreaRestore).toBe(true);
  });

  it("restores workspace RightArea when leaving Settings for sessions", () => {
    workspaceSplit(1400);
    applyShellWindowLayout({ source: "programmatic" });
    syncShellForLeftSidebarView("sessions", "settings");
    syncShellForLeftSidebarView("settings", "sessions");
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(true);
    expect(useLayoutStore.getState().pendingRightAreaRestore).toBe(false);
    expect(getShellLive().rightMode).toBe("split");
    expect(getShellLive().rightPx).toBe(500);
  });

  it("Settings close chrome calls closeSettingsDetailPanel, not closeRightArea", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/right-area.tsx"),
      "utf-8",
    );
    const settingsClose = src.slice(
      src.indexOf("{!inSettings ? ("),
      src.indexOf("{/* Window controls when editorMaximized"),
    );
    expect(settingsClose).toContain("closeSettingsDetailPanel");
    expect(settingsClose).not.toContain("closeRightArea");
  });

  it("App no longer mounts a Settings-only window resize listener", () => {
    const app = readFileSync(
      join(import.meta.dirname, "../../src/renderer/App.tsx"),
      "utf-8",
    );
    expect(app).not.toMatch(/addEventListener\(\s*"resize"/);
    expect(app).toContain("syncShellForLeftSidebarView");
  });
});
