import { describe, expect, it, vi, beforeEach } from "vitest";
import { useLayoutStore } from "@/stores/layout-store";
import {
  computeCanSplitRightArea,
  isRightAreaToggleAnimating,
  measureMainAreaWidthPx,
  openRightArea,
  openRightAreaForDeepLink,
  closeRightArea,
  resetRightAreaForProjectOpen,
  RIGHT_AREA_OPEN_ATTR,
  SPLIT_MAIN_MIN_PX,
  toggleMaximizedRightArea,
  toggleRightAreaMaximize,
} from "@/lib/workspace/right-area-layout";
import { applyShellWindowLayout, getShellLive, resetShellLiveForTests } from "@/lib/workspace/shell-layout-controller";
import { PANEL_RESIZE_HIT, RIGHT_AREA_TOGGLE_MS } from "@/lib/workspace/layout-constants";
import { MAIN_AREA_MIN, RIGHT_AREA_MIN } from "@/styles/constants";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("right-area-layout", () => {
  beforeEach(() => {
    resetShellLiveForTests();
    vi.stubGlobal("innerWidth", 1400);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    useLayoutStore.setState({
      rightAreaExpanded: false,
      editorMaximized: false,
      rightAreaWidth: 500,
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: 280,
    });
    resetRightAreaForProjectOpen();
    applyShellWindowLayout({ source: "programmatic" });
  });

  it("computeCanSplitRightArea uses the 680px hold-split floor", () => {
    expect(SPLIT_MAIN_MIN_PX).toBe(MAIN_AREA_MIN + RIGHT_AREA_MIN);

    vi.stubGlobal("innerWidth", 280 + MAIN_AREA_MIN + RIGHT_AREA_MIN);
    applyShellWindowLayout({ source: "programmatic" });
    expect(measureMainAreaWidthPx()).toBe(SPLIT_MAIN_MIN_PX);
    expect(computeCanSplitRightArea()).toBe(true);

    vi.stubGlobal("innerWidth", 280 + MAIN_AREA_MIN + RIGHT_AREA_MIN - 1);
    applyShellWindowLayout({ source: "programmatic" });
    expect(computeCanSplitRightArea()).toBe(false);
  });

  it("openRightArea splits when main is exactly 680", () => {
    vi.stubGlobal("innerWidth", 280 + MAIN_AREA_MIN + RIGHT_AREA_MIN);
    applyShellWindowLayout({ source: "programmatic" });
    openRightArea();
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(false);
    expect(getShellLive().rightMode).toBe("split");
  });

  it("openRightArea uses split on wide window", () => {
    vi.stubGlobal("innerWidth", 1400);
    applyShellWindowLayout({ source: "programmatic" });
    openRightArea();
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(false);
    expect(getShellLive().rightPx).toBe(500);
    expect(getShellLive().centerPx).toBeGreaterThan(0);
  });

  it("openRightArea keeps split on a medium main (does not fake-maximize)", () => {
    vi.stubGlobal("innerWidth", 1000);
    useLayoutStore.setState({ rightAreaWidth: 500 });
    applyShellWindowLayout({ source: "programmatic" });
    openRightArea();
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(false);
    expect(getShellLive().rightMode).toBe("split");
    expect(getShellLive().rightPx).toBeGreaterThanOrEqual(RIGHT_AREA_MIN);
    expect(getShellLive().centerPx).toBeGreaterThanOrEqual(MAIN_AREA_MIN);
  });

  it("openRightArea maximizes on narrow main-area", () => {
    vi.stubGlobal("innerWidth", 700);
    applyShellWindowLayout({ source: "programmatic" });
    openRightArea();
    const st = useLayoutStore.getState();
    expect(st.editorMaximized).toBe(true);
    expect(getShellLive().rightMode).toBe("maximize");
    expect(getShellLive().centerPx).toBe(0);
  });

  it("openRightArea is a no-op when already expanded (preserves drag width)", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({
      rightAreaExpanded: true,
      editorMaximized: false,
      rightAreaWidth: 700,
    });
    applyShellWindowLayout({ source: "programmatic" });
    expect(getShellLive().rightPx).toBe(700);
    openRightArea();
    expect(getShellLive().rightPx).toBe(700);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(700);
  });

  it("openRightArea still expands when store says expanded but the rail is closed (chat deep-link)", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({
      rightAreaExpanded: true,
      editorMaximized: false,
      rightAreaWidth: 500,
    });
    resetShellLiveForTests();
    openRightArea();
    expect(getShellLive().rightPx).toBe(500);
    expect(getShellLive().rightMode).toBe("split");
  });

  it("openRightAreaForDeepLink preserves maximize when already expanded", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true });
    applyShellWindowLayout({ source: "programmatic" });
    openRightAreaForDeepLink();
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(true);
    expect(getShellLive().rightMode).toBe("maximize");
    expect(getShellLive().centerPx).toBe(0);
  });

  it("openRightAreaForDeepLink does not unmaximize split workspace", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: false, rightAreaWidth: 500 });
    applyShellWindowLayout({ source: "programmatic" });
    openRightAreaForDeepLink();
    const st = useLayoutStore.getState();
    expect(st.editorMaximized).toBe(false);
    expect(getShellLive().rightMode).toBe("split");
    expect(getShellLive().rightPx).toBe(500);
  });

  it("closeRightArea syncs store and live pixels", () => {
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: false, rightAreaWidth: 400 });
    applyShellWindowLayout({ source: "programmatic" });
    closeRightArea();
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(false);
    expect(st.editorMaximized).toBe(false);
    expect(getShellLive().rightPx).toBe(0);
    expect(getShellLive().rightMode).toBe("closed");
  });

  it("toggleRightAreaMaximize opens maximized when closed", () => {
    vi.stubGlobal("innerWidth", 1400);
    applyShellWindowLayout({ source: "programmatic" });
    toggleRightAreaMaximize();
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(true);
    expect(getShellLive().rightMode).toBe("maximize");
    expect(getShellLive().centerPx).toBe(0);
  });

  it("toggleRightAreaMaximize restores split when maximized and wide enough", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true, rightAreaWidth: 500 });
    applyShellWindowLayout({ source: "programmatic" });
    toggleRightAreaMaximize();
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(false);
    expect(getShellLive().rightMode).toBe("split");
    expect(getShellLive().rightPx).toBe(500);
  });

  it("toggleRightAreaMaximize closes when narrow and already maximized", () => {
    vi.stubGlobal("innerWidth", 700);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true });
    applyShellWindowLayout({ source: "programmatic" });
    toggleRightAreaMaximize();
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
  });

  it("measureMainAreaWidthPx subtracts inline left sidebar", () => {
    vi.stubGlobal("innerWidth", 1200);
    applyShellWindowLayout({ source: "programmatic" });
    expect(measureMainAreaWidthPx()).toBe(920);
  });

  it("keeps the sash hit narrower than a typical scrollbar so the thumb stays clickable", () => {
    expect(PANEL_RESIZE_HIT.fine).toBeLessThanOrEqual(6);
    expect(PANEL_RESIZE_HIT.coarse).toBeLessThanOrEqual(8);
  });

  it("toggleMaximizedRightArea opens maximized when closed and closes when already maximized", () => {
    vi.stubGlobal("innerWidth", 1400);
    applyShellWindowLayout({ source: "programmatic" });
    toggleMaximizedRightArea();
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(true);
    expect(useLayoutStore.getState().editorMaximized).toBe(true);
    expect(getShellLive().rightMode).toBe("maximize");

    toggleMaximizedRightArea();
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
    expect(useLayoutStore.getState().editorMaximized).toBe(false);
    expect(getShellLive().rightPx).toBe(0);
  });

  it("toggleMaximizedRightArea promotes split to maximize instead of restoring split", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({
      rightAreaExpanded: true,
      editorMaximized: false,
      rightAreaWidth: 500,
    });
    applyShellWindowLayout({ source: "programmatic" });
    toggleMaximizedRightArea();
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(true);
    expect(st.rightAreaWidth).toBe(500);
    expect(getShellLive().rightMode).toBe("maximize");
    expect(getShellLive().centerPx).toBe(0);
  });

  it("does not animate project-open reset", () => {
    resetRightAreaForProjectOpen();
    expect(document.documentElement.hasAttribute("data-right-area-animating")).toBe(false);
    expect(isRightAreaToggleAnimating()).toBe(false);
  });

  it("eases click and shortcut RightArea toggles on the pixel columns", () => {
    const css = readFileSync(
      join(import.meta.dirname, "../../src/renderer/styles/globals.css"),
      "utf-8",
    );
    expect(css).toContain("[data-right-area-animating]");
    expect(css).toContain("#right-area");
    expect(css).toContain("#center");
    expect(css).toContain(`${RIGHT_AREA_TOGGLE_MS}ms`);
    expect(css).toContain("[data-right-area-open]");
    expect(css).toContain("[data-right-area-pinned-chrome]");
    expect(css).toContain("[data-pinned-right-extra]");
    expect(css).toContain("[data-content-right-spacer]");
    expect(css).toContain("[data-pinned-status-dot]");
    expect(css).toContain("[data-status-dot-hit]");

    const chrome = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/sidebar-controls.tsx"),
      "utf-8",
    );
    const app = readFileSync(
      join(import.meta.dirname, "../../src/renderer/App.tsx"),
      "utf-8",
    );
    const topBar = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/content-top-bar/index.tsx"),
      "utf-8",
    );
    expect(chrome).toContain("data-right-area-pinned-chrome");
    expect(chrome).toContain("data-right-area-hit-chrome");
    expect(chrome).toContain("data-pinned-right-extra");
    expect(app).toContain("RightAreaPinnedChrome");
    expect(app).toContain("StatusDotPinnedChrome");
    expect(app).toContain("ShellFrame");
    const frame = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/layout/shell-frame.tsx"),
      "utf-8",
    );
    expect(frame).toContain("geo.rightPx");
    expect(frame).toContain("fitMainAreaColumns");
    expect(frame).not.toMatch(/maximized && "pointer-events-none w-0"/);
    expect(frame).toContain('id="center"');
    expect(frame).not.toMatch(/id="center"[\s\S]*?flex-1/);
    expect(frame).toContain("commitShellSashSession");
    const controller = readFileSync(
      join(import.meta.dirname, "../../src/renderer/lib/workspace/shell-layout-controller.ts"),
      "utf-8",
    );
    expect(controller).toContain("sashRightPx");
    expect(topBar).toContain("ContentRightAreaSpacer");
    expect(chrome).toContain("data-pinned-status-dot");
    const statusDotFn = chrome.slice(
      chrome.indexOf("export function StatusDotPinnedChrome"),
      chrome.indexOf("export function LeftSidebarPinnedChrome"),
    );
    expect(statusDotFn).toContain("data-content-sidebar-spacer");
    expect(statusDotFn).not.toContain("ContentSidebarSpacer");
    expect(statusDotFn).not.toContain("SidebarHitChrome");
    expect(statusDotFn).not.toContain("useLayoutStore((s) => s.editorMaximized)");
    expect(topBar).toContain("data-status-dot-hit");

    openRightArea();
    expect(document.documentElement.hasAttribute("data-right-area-animating")).toBe(true);
    expect(document.documentElement.hasAttribute(RIGHT_AREA_OPEN_ATTR)).toBe(true);
    expect(isRightAreaToggleAnimating()).toBe(true);

    closeRightArea();
    expect(document.documentElement.hasAttribute(RIGHT_AREA_OPEN_ATTR)).toBe(false);
  });

  it("does not open RightArea from Settings (empty panel)", () => {
    useLayoutStore.setState({ leftSidebarView: "settings" });
    openRightArea();
    toggleMaximizedRightArea();
    expect(getShellLive().rightPx).toBe(0);
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
  });
});
