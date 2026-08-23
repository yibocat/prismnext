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
  commitLeftSidebarChrome,
  onLeftSidebarPanelResize,
  syncLeftSidebarCollapsedMark,
  syncLeftSidebarWidthVar,
  toggleLeftSidebarPanel,
  syncSettingsLeftSidebar,
  watchLeftSidebarResizeChrome,
} from "../../src/renderer/lib/workspace/left-sidebar-panel";
import { useLayoutStore } from "../../src/renderer/stores/layout-store";

function primaryPointer(type: "pointerdown" | "pointerup" | "pointercancel"): PointerEvent {
  return new PointerEvent(type, { isPrimary: true, bubbles: true });
}

describe("left sidebar collapse chrome", () => {
  afterEach(() => {
    const stop = watchLeftSidebarResizeChrome();
    window.dispatchEvent(primaryPointer("pointerup"));
    stop();
    document.documentElement.removeAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR);
    document.documentElement.removeAttribute(LEFT_SIDEBAR_ANIMATING_ATTR);
    document.documentElement.style.removeProperty(LEFT_SIDEBAR_WIDTH_VAR);
    useLayoutStore.setState({
      sidebarFullyCollapsed: false,
      sidebarExpanded: true,
      leftSidebarView: "sessions",
      leftSidebarOverlay: false,
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
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(false);
    syncLeftSidebarCollapsedMark(280);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR)).toBe(false);
  });

  it("commits the store only when asked", () => {
    commitLeftSidebarChrome(0);
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(true);
    commitLeftSidebarChrome(280);
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(false);
  });

  it("does not flip the store while the pointer is down, then commits from the mark", () => {
    const stop = watchLeftSidebarResizeChrome();
    window.dispatchEvent(primaryPointer("pointerdown"));
    onLeftSidebarPanelResize(0);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR)).toBe(true);
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(false);
    window.dispatchEvent(primaryPointer("pointerup"));
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(true);
    stop();
  });

  it("commits the store immediately when no gesture is active", () => {
    onLeftSidebarPanelResize(0);
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(true);
  });

  it("makes the left sash easier to grab and light up like RightArea", () => {
    expect(LEFT_SIDEBAR_RESIZE_HIT.fine).toBeGreaterThan(PANEL_RESIZE_HIT.fine);
    expect(LEFT_SIDEBAR_SASH_SEPARATOR_CLASS).toContain("hover:bg-border");
    expect(LEFT_SIDEBAR_SASH_SEPARATOR_CLASS).toContain("after:-left-[3px]");
    expect(PANEL_SASH_SEPARATOR_CLASS).toContain("hover:bg-border");
    const app = readFileSync(
      join(import.meta.dirname, "../../src/renderer/App.tsx"),
      "utf-8",
    );
    expect(app).toContain("resizeTargetMinimumSize={LEFT_SIDEBAR_RESIZE_HIT}");
    expect(app).toContain("resizeTargetMinimumSize={PANEL_RESIZE_HIT}");
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
    expect(topBar).toContain("leftSidebarRef");
    expect(topBar).not.toContain("showSidebarControls");
    expect(app).toContain("LeftSidebarPinnedChrome");
    expect(app).toContain("syncLeftSidebarWidthVar");
    expect(app).toContain("collapsible={!inSettings || sidebarUsesOverlay}");
    expect(app).toContain("syncSettingsLeftSidebar");
    expect(chrome).toContain("data-left-sidebar-pinned-chrome");
    expect(chrome).toContain("data-sidebar-hit-chrome");
    expect(chrome).toContain("data-pinned-new-agent");
    expect(chrome).toContain("hideSidebarToggle");
    expect(shellShortcuts).toContain('leftSidebarView === "settings"');
    expect(shellShortcuts).toContain("toggleMaximizedRightArea");
    expect(modeShortcuts).toContain('leftSidebarView === "settings"');
    const sidebar = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/left-sidebar.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("data-left-sidebar-slab");
    expect(sidebar).toContain("SidebarHitChrome");
    expect(sidebar).not.toMatch(/data-surface="sidebar"[^>]*!w-full/);
    expect(css).toContain("[data-left-sidebar-animating]");
    expect(css).toContain("flex-grow");
    expect(css).toContain(`${LEFT_SIDEBAR_TOGGLE_MS}ms`);
  });

  it("eases a click collapse and hands chrome to the pinned cluster immediately", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const panel = {
      isCollapsed: () => false,
      collapse: vi.fn(),
      expand: vi.fn(),
      resize: vi.fn(),
      getSize: () => ({ inPixels: 280, asPercentage: 40 }),
    };
    useLayoutStore.setState({
      leftSidebarOverlay: false,
      sidebarExpanded: true,
      sidebarFullyCollapsed: false,
      sidebarWidth: 280,
    });
    toggleLeftSidebarPanel({ current: panel });
    expect(panel.collapse).toHaveBeenCalledTimes(1);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_ANIMATING_ATTR)).toBe(true);
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(true);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR)).toBe(true);
    vi.advanceTimersByTime(LEFT_SIDEBAR_TOGGLE_MS);
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(true);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_COLLAPSED_ATTR)).toBe(true);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_ANIMATING_ATTR)).toBe(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("skips the motion when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const panel = {
      isCollapsed: () => false,
      collapse: vi.fn(),
      expand: vi.fn(),
      resize: vi.fn(),
      getSize: () => ({ inPixels: 280, asPercentage: 40 }),
    };
    useLayoutStore.setState({
      leftSidebarOverlay: false,
      sidebarExpanded: true,
      sidebarFullyCollapsed: false,
      sidebarWidth: 280,
    });
    toggleLeftSidebarPanel({ current: panel });
    expect(panel.collapse).toHaveBeenCalledTimes(1);
    expect(document.documentElement.hasAttribute(LEFT_SIDEBAR_ANIMATING_ATTR)).toBe(false);
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(true);
    vi.unstubAllGlobals();
  });

  it("does not collapse the left rail while Settings is open on a wide window", () => {
    vi.stubGlobal("innerWidth", 1400);
    const panel = {
      isCollapsed: () => false,
      collapse: vi.fn(),
      expand: vi.fn(),
      resize: vi.fn(),
      getSize: () => ({ inPixels: 280, asPercentage: 40 }),
    };
    useLayoutStore.setState({
      leftSidebarView: "settings",
      leftSidebarOverlay: false,
      sidebarExpanded: true,
      sidebarFullyCollapsed: false,
      sidebarWidth: 280,
    });
    toggleLeftSidebarPanel({ current: panel });
    expect(panel.collapse).not.toHaveBeenCalled();
    expect(useLayoutStore.getState().sidebarExpanded).toBe(true);
    vi.unstubAllGlobals();
  });

  it("opens a folded rail when entering Settings on a wide window", () => {
    vi.stubGlobal("innerWidth", 1400);
    const panel = {
      isCollapsed: () => true,
      collapse: vi.fn(),
      expand: vi.fn(),
      resize: vi.fn(),
      getSize: () => ({ inPixels: 0, asPercentage: 0 }),
    };
    useLayoutStore.setState({
      leftSidebarView: "settings",
      leftSidebarOverlay: true,
      sidebarExpanded: false,
      sidebarFullyCollapsed: true,
      sidebarWidth: 320,
    });
    syncSettingsLeftSidebar({ current: panel });
    expect(panel.expand).toHaveBeenCalledTimes(1);
    expect(panel.resize).toHaveBeenCalledWith(320);
    expect(useLayoutStore.getState().leftSidebarOverlay).toBe(false);
    expect(useLayoutStore.getState().sidebarExpanded).toBe(true);
    expect(useLayoutStore.getState().sidebarFullyCollapsed).toBe(false);
    vi.unstubAllGlobals();
  });

  it("shows Settings categories as overlay when the window is too narrow", () => {
    vi.stubGlobal("innerWidth", 500);
    const panel = {
      isCollapsed: () => false,
      collapse: vi.fn(),
      expand: vi.fn(),
      resize: vi.fn(),
      getSize: () => ({ inPixels: 280, asPercentage: 40 }),
    };
    useLayoutStore.setState({
      leftSidebarView: "settings",
      leftSidebarOverlay: false,
      sidebarExpanded: true,
      sidebarFullyCollapsed: false,
      sidebarWidth: 280,
    });
    syncSettingsLeftSidebar({ current: panel });
    expect(panel.collapse).toHaveBeenCalledTimes(1);
    expect(panel.expand).not.toHaveBeenCalled();
    expect(useLayoutStore.getState().leftSidebarOverlay).toBe(true);
    expect(useLayoutStore.getState().sidebarExpanded).toBe(false);
    vi.unstubAllGlobals();
  });

  it("opens the Settings overlay from a collapsed rail on a narrow window", () => {
    vi.stubGlobal("innerWidth", 500);
    const panel = {
      isCollapsed: () => true,
      collapse: vi.fn(),
      expand: vi.fn(),
      resize: vi.fn(),
      getSize: () => ({ inPixels: 0, asPercentage: 0 }),
    };
    useLayoutStore.setState({
      leftSidebarView: "settings",
      leftSidebarOverlay: false,
      sidebarExpanded: false,
      sidebarFullyCollapsed: true,
      sidebarWidth: 280,
    });
    toggleLeftSidebarPanel({ current: panel });
    expect(useLayoutStore.getState().leftSidebarOverlay).toBe(true);
    expect(panel.expand).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
