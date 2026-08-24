import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX, SIDEBAR_LEFT_MIN } from "../../src/renderer/styles/constants";
import {
  LEFT_SIDEBAR_RESIZE_HIT,
  LEFT_SIDEBAR_SASH_SEPARATOR_CLASS,
  LEFT_SIDEBAR_TOGGLE_MS,
  PANEL_RESIZE_HIT,
  PANEL_SASH_SEPARATOR_CLASS,
} from "../../src/renderer/lib/workspace/layout-constants";
import {
  LEFT_SIDEBAR_ANIMATING_ATTR,
  LEFT_SIDEBAR_COLLAPSED_ATTR,
  LEFT_SIDEBAR_WIDTH_VAR,
  syncLeftSidebarCollapsedMark,
  syncLeftSidebarWidthVar,
  toggleLeftSidebarPanel,
} from "../../src/renderer/lib/workspace/left-sidebar-panel";
import { applyShellWindowLayout, getShellLive } from "../../src/renderer/lib/workspace/shell-layout-controller";
import { useLayoutStore } from "../../src/renderer/stores/layout-store";

describe("left sidebar collapse chrome", () => {
  afterEach(() => {
    document.documentElement.removeAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR);
    document.documentElement.removeAttribute(LEFT_SIDEBAR_ANIMATING_ATTR);
    document.documentElement.style.removeProperty(LEFT_SIDEBAR_WIDTH_VAR);
    useLayoutStore.setState({
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
    });
  });

  it("does not change the launch min width", () => {
    expect(SIDEBAR_LEFT_MIN).toBe(SIDEBAR_LEFT_DEFAULT);
  });

  it("writes the sidebar slab as a clamped pixel width, not a window fraction", () => {
    syncLeftSidebarWidthVar(280);
    expect(document.documentElement.style.getPropertyValue(LEFT_SIDEBAR_WIDTH_VAR)).toBe("280px");
    syncLeftSidebarWidthVar(400);
    expect(document.documentElement.style.getPropertyValue(LEFT_SIDEBAR_WIDTH_VAR)).toBe("400px");
    syncLeftSidebarWidthVar(12);
    expect(document.documentElement.style.getPropertyValue(LEFT_SIDEBAR_WIDTH_VAR)).toBe(`${SIDEBAR_LEFT_MIN}px`);
    syncLeftSidebarWidthVar(900);
    expect(document.documentElement.style.getPropertyValue(LEFT_SIDEBAR_WIDTH_VAR)).toBe(`${SIDEBAR_LEFT_MAX}px`);
  });

  it("marks collapse on the document without flipping the store", () => {
    syncLeftSidebarCollapsedMark(0);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR)).toBe(true);
    expect(useLayoutStore.getState().leftUserExpanded).toBe(true);
    syncLeftSidebarCollapsedMark(280);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR)).toBe(false);
  });

  it("makes the left sash easier to grab and light up like RightArea", () => {
    expect(LEFT_SIDEBAR_RESIZE_HIT.fine).toBeGreaterThan(PANEL_RESIZE_HIT.fine);
    expect(LEFT_SIDEBAR_SASH_SEPARATOR_CLASS).toContain("hover:bg-border");
    expect(LEFT_SIDEBAR_SASH_SEPARATOR_CLASS).toContain("after:-left-[3px]");
    expect(PANEL_SASH_SEPARATOR_CLASS).toContain("hover:bg-border");
    const frame = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/shell-frame.tsx"),
      "utf-8",
    );
    expect(frame).toContain("LEFT_SIDEBAR_SASH_SEPARATOR_CLASS");
    expect(frame).toContain("data-shell-sash");
  });

  it("does not turn the unused no-drag class into a window-move hole", () => {
    const css = readFileSync(
      join(import.meta.dirname, "../../src/renderer/styles/globals.css"),
      "utf-8",
    );
    expect(css).toContain(".drag-region {");
    expect(css).toContain("[data-deferred-mac-spacer]");
    expect(css).toContain("[data-content-sidebar-spacer]");
    expect(css).toContain("[data-pinned-new-agent]");
    expect(css).toContain("[data-left-sidebar-pinned-chrome]");
    expect(css).toContain("[data-sidebar-hit-chrome]");
    expect(css).toContain("[data-left-sidebar-slab]");
    expect(css).toContain(LEFT_SIDEBAR_WIDTH_VAR);
    expect(css).toMatch(/\[data-left-sidebar-pinned-chrome\][\s\S]*pointer-events:\s*none/);
    expect(css).toMatch(/\[data-sidebar-hit-chrome\] svg[\s\S]*opacity:\s*0/);
    expect(css).toMatch(
      /\[data-sidebar-hit-chrome\] \[data-pinned-new-agent\][\s\S]*pointer-events:\s*auto/,
    );
    expect(css).not.toMatch(/\.no-drag\s*\{/);
    const topBar = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/content-top-bar/index.tsx"),
      "utf-8",
    );
    const app = readFileSync(
      join(import.meta.dirname, "../../src/renderer/App.tsx"),
      "utf-8",
    );
    const chrome = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/sidebar-controls.tsx"),
      "utf-8",
    );
    const shellShortcuts = readFileSync(
      join(import.meta.dirname, "../../src/renderer/hooks/use-app-shell-shortcuts.ts"),
      "utf-8",
    );
    const modeShortcuts = readFileSync(
      join(import.meta.dirname, "../../src/renderer/hooks/use-workspace-mode-shortcuts.ts"),
      "utf-8",
    );
    expect(topBar).toContain("ContentSidebarSpacer");
    expect(topBar).not.toContain("showSidebarControls");
    expect(app).toContain("LeftSidebarPinnedChrome");
    expect(app).toContain("syncLeftSidebarWidthVar");
    expect(app).toContain("ShellFrame");
    expect(chrome).toContain("data-left-sidebar-pinned-chrome");
    expect(chrome).toContain("data-sidebar-hit-chrome");
    expect(chrome).toContain("data-pinned-new-agent");
    expect(shellShortcuts).toContain('leftSidebarView === "settings"');
    expect(shellShortcuts).toContain("toggleMaximizedRightArea");
    expect(modeShortcuts).toContain('leftSidebarView === "settings"');
    const sidebar = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/left-sidebar.tsx"),
      "utf-8",
    );
    const frame = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/shell-frame.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("data-left-sidebar-slab");
    expect(sidebar).toContain("SidebarHitChrome");
    expect(css).toContain("width: 100%");
    expect(css).not.toContain("margin-left: calc(100% - var(--left-sidebar-width))");
    expect(css).not.toContain("[data-left-sidebar-overlay]");
    expect(sidebar).not.toContain("data-left-sidebar-overlay");
    expect(frame).toContain('id="main-layout"');
    expect(frame).toContain('id="left-sidebar"');
    expect(frame).toContain('id="main-area"');
    expect(frame).toContain("watchShellWindowSize");
    expect(frame).toContain("beginShellSashSession");
    expect(frame).not.toContain("new ResizeObserver");
    expect(app).not.toContain("reconcileRightAreaOnMainAreaResize");
    expect(css).toContain("[data-left-sidebar-animating]");
    expect(css).toContain("#left-sidebar");
    expect(css).toContain(`${LEFT_SIDEBAR_TOGGLE_MS}ms`);
  });

  it("eases a click collapse and hands chrome to the pinned cluster immediately", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("innerWidth", 1200);
    useLayoutStore.setState({
      sidebarWidth: 280,
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftSidebarView: "sessions",
    });
    toggleLeftSidebarPanel();
    expect(useLayoutStore.getState().leftUserExpanded).toBe(false);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_ANIMATING_ATTR)).toBe(true);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR)).toBe(true);
    vi.advanceTimersByTime(LEFT_SIDEBAR_TOGGLE_MS);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR)).toBe(true);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_ANIMATING_ATTR)).toBe(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("skips the motion when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("innerWidth", 1200);
    useLayoutStore.setState({
      sidebarWidth: 280,
      leftUserExpanded: true,
      leftWindowCollapsed: false,
    });
    toggleLeftSidebarPanel();
    expect(useLayoutStore.getState().leftUserExpanded).toBe(false);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_ANIMATING_ATTR)).toBe(false);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR)).toBe(true);
    vi.unstubAllGlobals();
  });

  it("lets Settings use the same fold toggle as the workspace", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("innerWidth", 1200);
    useLayoutStore.setState({
      leftSidebarView: "settings",
      leftUserExpanded: true,
      sidebarWidth: 280,
    });
    toggleLeftSidebarPanel();
    expect(useLayoutStore.getState().leftUserExpanded).toBe(false);
    vi.unstubAllGlobals();
  });

  it("window-folds Left to 0 without overlay when the window is too narrow", () => {
    vi.stubGlobal("innerWidth", 500);
    useLayoutStore.setState({
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: 280,
      rightAreaExpanded: false,
      editorMaximized: false,
    });
    applyShellWindowLayout({ source: "window" });
    expect(getShellLive().leftPx).toBe(0);
    expect(useLayoutStore.getState().leftWindowCollapsed).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(280);
    vi.unstubAllGlobals();
  });

  it("restores a window-folded Left to 280 and does not write the sash width", () => {
    vi.stubGlobal("innerWidth", 1100);
    useLayoutStore.setState({
      leftUserExpanded: true,
      leftWindowCollapsed: true,
      leftPinToMin: true,
      sidebarWidth: 400,
      rightAreaExpanded: false,
      editorMaximized: false,
    });
    applyShellWindowLayout({ source: "window" });
    expect(getShellLive().leftPx).toBe(280);
    expect(useLayoutStore.getState().sidebarWidth).toBe(400);
    expect(useLayoutStore.getState().leftPinToMin).toBe(true);
    expect(useLayoutStore.getState().leftWindowCollapsed).toBe(false);
    vi.unstubAllGlobals();
  });
});
