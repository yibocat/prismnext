import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import {
  computeCanSplitRightArea,
  deriveRightAreaVisualState,
  fitSplitRightWidthPx,
  commitRightAreaExpandedFromPixels,
  isRightAreaToggleAnimating,
  measureMainAreaWidthPx,
  openRightArea,
  openRightAreaForDeepLink,
  closeRightArea,
  resetRightAreaForProjectOpen,
  RIGHT_AREA_OPEN_ATTR,
  toggleMaximizedRightArea,
  toggleRightAreaMaximize,
  reconcileRightAreaOnMainAreaResize,
} from "@/lib/workspace/right-area-layout";
import { PANEL_RESIZE_HIT, RESIZE_FILL_PX, RIGHT_AREA_TOGGLE_MS } from "@/lib/workspace/layout-constants";
import { MAIN_AREA_MIN, RIGHT_AREA_MIN } from "@/styles/constants";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function mockPanel(state: { px: number; collapsed: boolean }): PanelImperativeHandle {
  return {
    collapse: vi.fn(() => {
      state.collapsed = true;
      state.px = 0;
    }),
    expand: vi.fn(() => {
      state.collapsed = false;
    }),
    resize: vi.fn((n: number) => {
      state.px = n;
      state.collapsed = n < 30;
    }),
    getSize: vi.fn(() => ({ inPixels: state.px })),
    isCollapsed: vi.fn(() => state.collapsed),
  } as unknown as PanelImperativeHandle;
}

describe("right-area-layout", () => {
  beforeEach(() => {
    vi.stubGlobal("innerWidth", 1400);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    resetRightAreaForProjectOpen({
      centerRef: mockPanel({ px: 900, collapsed: false }),
      rightAreaRef: mockPanel({ px: 0, collapsed: true }),
    });
    useLayoutStore.setState({
      rightAreaExpanded: false,
      editorMaximized: false,
      rightAreaWidth: 500,
      leftSidebarView: "sessions",
    });
  });

  it("deriveRightAreaVisualState", () => {
    expect(deriveRightAreaVisualState(false, false)).toBe("closed");
    expect(deriveRightAreaVisualState(true, false)).toBe("split");
    expect(deriveRightAreaVisualState(true, true)).toBe("maximize");
  });

  it("commitRightAreaExpandedFromPixels does not rewrite the store while a toggle eases", () => {
    useLayoutStore.setState({ rightAreaExpanded: false, editorMaximized: false });
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    openRightArea({ centerRef: center, rightAreaRef: right });
    expect(isRightAreaToggleAnimating()).toBe(true);
    expect(commitRightAreaExpandedFromPixels(0)).toBe(true);
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(true);
  });

  it("computeCanSplitRightArea respects 720px main-area floor", () => {
    vi.stubGlobal("innerWidth", 1000);
    const left = mockPanel({ px: 280, collapsed: false });
    expect(computeCanSplitRightArea(left)).toBe(true);

    vi.stubGlobal("innerWidth", 700);
    expect(computeCanSplitRightArea(left)).toBe(false);
  });

  it("openRightArea uses split on wide window", () => {
    vi.stubGlobal("innerWidth", 1400);
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    openRightArea({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(false);
    expect(right.resize).toHaveBeenCalledWith(500);
    expect(center.expand).toHaveBeenCalled();
  });

  it("fitSplitRightWidthPx never leaves center below MAIN_AREA_MIN", () => {
    // Medium main that canSplit (720) but preferred 500 would crush center to 220.
    expect(fitSplitRightWidthPx(720, 500)).toBe(RIGHT_AREA_MIN);
    expect(720 - fitSplitRightWidthPx(720, 500)).toBeGreaterThanOrEqual(MAIN_AREA_MIN);
    expect(fitSplitRightWidthPx(1200, 500)).toBe(500);
  });

  it("openRightArea clamps preferred width on medium main (does not fake-maximize)", () => {
    // window 1000 − left 280 = main 720 = SPLIT_MAIN_MIN; preferred 500 must clamp to 280.
    vi.stubGlobal("innerWidth", 1000);
    useLayoutStore.setState({ rightAreaWidth: 500 });
    const left = mockPanel({ px: 280, collapsed: false });
    const center = mockPanel({ px: 720, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    openRightArea({
      centerRef: center,
      rightAreaRef: right,
      leftSidebarRef: left,
    });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(false);
    expect(right.resize).toHaveBeenCalledWith(RIGHT_AREA_MIN);
    expect(center.expand).toHaveBeenCalled();
    expect(center.collapse).not.toHaveBeenCalled();
  });

  it("openRightArea maximizes on narrow main-area", () => {
    vi.stubGlobal("innerWidth", 700);
    const left = mockPanel({ px: 0, collapsed: true });
    const center = mockPanel({ px: 700, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    openRightArea({ centerRef: center, rightAreaRef: right, leftSidebarRef: left });
    const st = useLayoutStore.getState();
    expect(st.editorMaximized).toBe(true);
    expect(center.collapse).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("openRightArea is a no-op when already expanded (preserves drag width)", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({
      rightAreaExpanded: true,
      editorMaximized: false,
      rightAreaWidth: 700,
    });
    const center = mockPanel({ px: 700, collapsed: false });
    const right = mockPanel({ px: 700, collapsed: false });
    openRightArea({ centerRef: center, rightAreaRef: right });
    expect(right.resize).not.toHaveBeenCalled();
    expect(center.expand).not.toHaveBeenCalled();
    expect(useLayoutStore.getState().rightAreaWidth).toBe(700);
  });

  it("openRightArea still expands when store says expanded but panel is collapsed (chat deep-link)", () => {
    // requestRightAreaExpand() sets rightAreaExpanded before App's effect calls openRightArea.
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({
      rightAreaExpanded: true,
      editorMaximized: false,
      rightAreaWidth: 500,
    });
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    openRightArea({ centerRef: center, rightAreaRef: right });
    expect(right.expand).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(500);
    expect(center.expand).toHaveBeenCalled();
  });

  it("openRightAreaForDeepLink preserves maximize when already expanded", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true });
    const center = mockPanel({ px: 0, collapsed: true });
    const right = mockPanel({ px: 1100, collapsed: false });
    openRightAreaForDeepLink({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(true);
    expect(center.collapse).toHaveBeenCalled();
    expect(center.expand).not.toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("openRightAreaForDeepLink does not unmaximize split workspace", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: false, rightAreaWidth: 500 });
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 500, collapsed: false });
    openRightAreaForDeepLink({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.editorMaximized).toBe(false);
    expect(center.expand).not.toHaveBeenCalled();
    expect(center.collapse).not.toHaveBeenCalled();
    expect(right.resize).not.toHaveBeenCalled();
  });

  it("closeRightArea syncs store and panels", () => {
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: false, rightAreaWidth: 400 });
    const center = mockPanel({ px: 600, collapsed: false });
    const right = mockPanel({ px: 400, collapsed: false });
    closeRightArea({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(false);
    expect(st.editorMaximized).toBe(false);
    expect(right.collapse).toHaveBeenCalled();
    expect(center.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("toggleRightAreaMaximize opens maximized when closed", () => {
    vi.stubGlobal("innerWidth", 1400);
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    toggleRightAreaMaximize({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(true);
    expect(center.collapse).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("toggleRightAreaMaximize restores split when maximized and wide enough", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true, rightAreaWidth: 500 });
    const left = mockPanel({ px: 280, collapsed: false });
    const center = mockPanel({ px: 0, collapsed: true });
    const right = mockPanel({ px: 1100, collapsed: false });
    toggleRightAreaMaximize({
      centerRef: center,
      rightAreaRef: right,
      leftSidebarRef: left,
    });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(false);
    expect(center.expand).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(500);
  });

  it("toggleRightAreaMaximize closes when narrow and already maximized", () => {
    vi.stubGlobal("innerWidth", 700);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true });
    const center = mockPanel({ px: 0, collapsed: true });
    const right = mockPanel({ px: 700, collapsed: false });
    toggleRightAreaMaximize({ centerRef: center, rightAreaRef: right });
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
  });

  it("reconcileRightAreaOnMainAreaResize closes split workspace when too narrow", () => {
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: false });
    vi.stubGlobal("innerWidth", 700);
    const center = mockPanel({ px: 400, collapsed: false });
    const right = mockPanel({ px: 300, collapsed: false });
    reconcileRightAreaOnMainAreaResize({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(false);
    expect(st.editorMaximized).toBe(false);
    expect(right.collapse).toHaveBeenCalled();
    expect(center.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("reconcileRightAreaOnMainAreaResize keeps maximize when already maximized", () => {
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true });
    vi.stubGlobal("innerWidth", 700);
    const center = mockPanel({ px: 0, collapsed: true });
    const right = mockPanel({ px: 700, collapsed: false });
    reconcileRightAreaOnMainAreaResize({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(true);
    expect(center.collapse).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("measureMainAreaWidthPx subtracts inline left sidebar", () => {
    vi.stubGlobal("innerWidth", 1200);
    const left = mockPanel({ px: 280, collapsed: false });
    expect(measureMainAreaWidthPx(left)).toBe(920);
  });

  it("keeps the sash hit narrower than a typical scrollbar so the thumb stays clickable", () => {
    expect(PANEL_RESIZE_HIT.fine).toBeLessThanOrEqual(6);
    expect(PANEL_RESIZE_HIT.coarse).toBeLessThanOrEqual(8);
  });

  it("toggleMaximizedRightArea opens maximized when closed and closes when already maximized", () => {
    vi.stubGlobal("innerWidth", 1400);
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    toggleMaximizedRightArea({ centerRef: center, rightAreaRef: right });
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(true);
    expect(useLayoutStore.getState().editorMaximized).toBe(true);
    expect(center.collapse).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);

    toggleMaximizedRightArea({ centerRef: center, rightAreaRef: right });
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
    expect(useLayoutStore.getState().editorMaximized).toBe(false);
    expect(right.collapse).toHaveBeenCalled();
  });

  it("toggleMaximizedRightArea promotes split to maximize instead of restoring split", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({
      rightAreaExpanded: true,
      editorMaximized: false,
      rightAreaWidth: 500,
    });
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 500, collapsed: false });
    toggleMaximizedRightArea({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(true);
    expect(st.rightAreaWidth).toBe(500);
    expect(center.collapse).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("does not animate window reconcile or project-open reset", () => {
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: false });
    vi.stubGlobal("innerWidth", 700);
    const center = mockPanel({ px: 400, collapsed: false });
    const right = mockPanel({ px: 300, collapsed: false });
    reconcileRightAreaOnMainAreaResize({ centerRef: center, rightAreaRef: right });
    expect(document.documentElement.hasAttribute("data-right-area-animating")).toBe(false);
    expect(isRightAreaToggleAnimating()).toBe(false);

    resetRightAreaForProjectOpen({
      centerRef: mockPanel({ px: 900, collapsed: false }),
      rightAreaRef: mockPanel({ px: 0, collapsed: true }),
    });
    expect(document.documentElement.hasAttribute("data-right-area-animating")).toBe(false);
    expect(isRightAreaToggleAnimating()).toBe(false);
  });

  it("eases click and shortcut RightArea toggles on #center-right", () => {
    const css = readFileSync(
      join(import.meta.dirname, "../../src/renderer/styles/globals.css"),
      "utf-8",
    );
    expect(css).toContain("[data-right-area-animating]");
    expect(css).toContain("#center-right");
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
    expect(app).toContain("commitRightAreaExpandedFromPixels");
    expect(chrome).not.toContain("syncRightAreaOpenMark");
    expect(app).toContain("RightAreaPinnedChrome");
    expect(app).toContain("StatusDotPinnedChrome");
    expect(topBar).toContain("ContentRightAreaSpacer");
    expect(chrome).toContain("data-pinned-status-dot");
    expect(chrome).toMatch(/StatusDotPinnedChrome[\s\S]*ContentSidebarSpacer/);
    const statusDotFn = chrome.slice(
      chrome.indexOf("export function StatusDotPinnedChrome"),
      chrome.indexOf("export function LeftSidebarPinnedChrome"),
    );
    expect(statusDotFn).toContain("ContentSidebarSpacer");
    expect(statusDotFn).not.toContain("useLayoutStore((s) => s.editorMaximized)");
    expect(topBar).toContain("data-status-dot-hit");

    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    openRightArea({ centerRef: center, rightAreaRef: right });
    expect(document.documentElement.hasAttribute("data-right-area-animating")).toBe(true);
    expect(document.documentElement.hasAttribute(RIGHT_AREA_OPEN_ATTR)).toBe(true);
    expect(isRightAreaToggleAnimating()).toBe(true);

    closeRightArea({ centerRef: center, rightAreaRef: right });
    expect(document.documentElement.hasAttribute(RIGHT_AREA_OPEN_ATTR)).toBe(false);
  });

  it("does not open RightArea from Settings (empty panel)", () => {
    useLayoutStore.setState({ leftSidebarView: "settings" });
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    openRightArea({ centerRef: center, rightAreaRef: right });
    toggleMaximizedRightArea({ centerRef: center, rightAreaRef: right });
    expect(right.expand).not.toHaveBeenCalled();
    expect(right.resize).not.toHaveBeenCalled();
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
  });
});
