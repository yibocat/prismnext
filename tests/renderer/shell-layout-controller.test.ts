import { afterEach, describe, expect, it, vi } from "vitest";
import { MAIN_AREA_MIN, SIDEBAR_LEFT_MIN } from "@/styles/constants";
import { SHELL_SASH_DETENT_ARM_PX } from "@/lib/workspace/shell-sash";
import {
  applyShellWindowLayout,
  deriveShellRightMode,
  beginShellSashSession,
  commitShellSashResult,
  commitShellSashSession,
  getShellLive,
  isShellLeftOpen,
  isShellRightOpen,
  moveShellSashSession,
  resetShellLiveForTests,
  subscribeShellLive,
} from "@/lib/workspace/shell-layout-controller";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { useLayoutStore } from "@/stores/layout-store";

const L_MIN = SIDEBAR_LEFT_MIN;
const C_MIN = MAIN_AREA_MIN;
const ARM = SHELL_SASH_DETENT_ARM_PX;

function workspaceSplit(windowPx: number) {
  vi.stubGlobal("innerWidth", windowPx);
  useLayoutStore.setState({
    leftSidebarView: "sessions",
    leftUserExpanded: true,
    leftWindowCollapsed: false,
    leftPinToMin: false,
    sidebarWidth: L_MIN,
    rightAreaExpanded: true,
    editorMaximized: false,
    rightAreaWidth: 500,
  });
}

describe("shell-layout-controller", () => {
  afterEach(() => {
    resetShellLiveForTests();
    vi.unstubAllGlobals();
  });

  it("maps store intent to the three Right modes", () => {
    expect(deriveShellRightMode(false, false)).toBe("closed");
    expect(deriveShellRightMode(true, false)).toBe("split");
    expect(deriveShellRightMode(true, true)).toBe("maximize");
  });

  it("does not write store chrome while a sash is moving", () => {
    workspaceSplit(1400);
    applyShellWindowLayout({ source: "programmatic" });
    expect(isShellLeftOpen(getShellLive())).toBe(true);
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(true);
    expect(useLayoutStore.getState().editorMaximized).toBe(false);

    applyShellWindowLayout({ source: "sash", sashLeftPx: 0 });
    expect(getShellLive().leftPx).toBe(0);
    expect(isShellLeftOpen(getShellLive())).toBe(false);
    expect(document.documentElement.hasAttribute("data-left-sidebar-collapsed")).toBe(true);
    expect(useLayoutStore.getState().leftUserExpanded).toBe(true);
    expect(useLayoutStore.getState().leftWindowCollapsed).toBe(false);

    const main = 1400 - L_MIN;
    applyShellWindowLayout({
      source: "sash",
      sashRightPx: main - C_MIN + ARM,
    });
    expect(getShellLive().rightMode).toBe("maximize");
    expect(useLayoutStore.getState().editorMaximized).toBe(false);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);
  });

  it("lets a 1920 sash session pass the 1100 preference cap and commit maximize", () => {
    workspaceSplit(1920);
    applyShellWindowLayout({ source: "programmatic" });
    const start = getShellLive().rightPx;
    const main = 1920 - L_MIN;
    const needDelta = main - C_MIN + ARM - start;
    beginShellSashSession("right", 2000);
    const moved = moveShellSashSession("right", 2000 - needDelta);
    expect(moved.rightMode).toBe("maximize");
    const committed = commitShellSashSession("right", 2000 - needDelta);
    expect(committed.rightMode).toBe("maximize");
    expect(useLayoutStore.getState().editorMaximized).toBe(true);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);
  });

  it("commits a Right maximize preview as maximize and keeps the split width", () => {
    workspaceSplit(1400);
    applyShellWindowLayout({ source: "programmatic" });
    const main = 1400 - L_MIN;
    const preview = applyShellWindowLayout({
      source: "sash",
      sashRightPx: main - C_MIN + ARM,
    });
    expect(preview.rightMode).toBe("maximize");

    const committed = commitShellSashResult("right", main - C_MIN + ARM, false);
    expect(committed.rightMode).toBe("maximize");
    expect(useLayoutStore.getState().editorMaximized).toBe(true);
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(true);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);

    const next = applyShellWindowLayout({ source: "programmatic" });
    expect(next.rightMode).toBe("maximize");
    expect(next.centerPx).toBe(0);
  });

  it("commits a Right overshoot as closed, not maximize", () => {
    workspaceSplit(1400);
    applyShellWindowLayout({ source: "programmatic" });
    applyShellWindowLayout({ source: "sash", sashRightPx: 0 });
    const committed = commitShellSashResult("right", 0, true);
    expect(committed.rightMode).toBe("closed");
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
    expect(useLayoutStore.getState().editorMaximized).toBe(false);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);
  });

  it("replays a nested apply instead of dropping it", () => {
    workspaceSplit(1400);
    applyShellWindowLayout({ source: "programmatic" });
    let nested = false;
    const stop = subscribeShellLive(() => {
      if (nested) return;
      nested = true;
      applyShellWindowLayout({ source: "sash", sashRightPx: 700 });
    });
    applyShellWindowLayout({ source: "sash", sashRightPx: 600 });
    stop();
    expect(getShellLive().rightPx).toBe(700);
  });

  it("derives left/right chrome from live pixels, not store mirrors", () => {
    workspaceSplit(1400);
    const open = applyShellWindowLayout({ source: "programmatic" });
    expect(isShellLeftOpen(open)).toBe(true);
    expect(isShellRightOpen(open)).toBe(true);
    const closedLeft = applyShellWindowLayout({ source: "sash", sashLeftPx: 0 });
    expect(isShellLeftOpen(closedLeft)).toBe(false);
    expect(isShellRightOpen(closedLeft)).toBe(true);
    expect(useLayoutStore.getState()).not.toHaveProperty("sidebarExpanded");
    expect(useLayoutStore.getState()).not.toHaveProperty("sidebarFullyCollapsed");
    expect(useLayoutStore.getState()).not.toHaveProperty("toggleSidebar");
    expect(useLayoutStore.getState()).not.toHaveProperty("toggleEditorMaximized");
  });

  it("keeps live chrome components off the store mirrors", () => {
    const controls = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/sidebar-controls.tsx"),
      "utf-8",
    );
    expect(controls).toContain("useShellLive");
    expect(controls).toContain("isShellLeftOpen");
    expect(controls).not.toContain("sidebarExpanded");
  });

  it("drops leftover TitleBar / MainToolbar files", () => {
    const layout = join(import.meta.dirname, "../../src/renderer/components/layout");
    expect(existsSync(join(layout, "title-bar.tsx"))).toBe(false);
    expect(existsSync(join(layout, "main-toolbar.tsx"))).toBe(false);
    const workspace = join(import.meta.dirname, "../../src/renderer/lib/workspace");
    expect(existsSync(join(workspace, "shell-window-layout.ts"))).toBe(false);
    expect(existsSync(join(workspace, "layout-resize-guard.ts"))).toBe(false);
    expect(existsSync(join(workspace, "left-nav/panel-refs.ts"))).toBe(false);
    const store = readFileSync(
      join(import.meta.dirname, "../../src/renderer/stores/layout-store.ts"),
      "utf-8",
    );
    expect(store).not.toContain("unmaximizeRightAreaPanel");
    expect(store).not.toContain("unmaximizeRightArea");
    expect(store).not.toContain("requestCenterExpand");
    expect(store).not.toContain("imperative handle");
  });
});
