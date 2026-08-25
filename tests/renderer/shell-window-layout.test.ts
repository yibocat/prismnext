import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAIN_AREA_MIN, RIGHT_AREA_MIN, SIDEBAR_LEFT_MAX, SIDEBAR_LEFT_MIN } from "@/styles/constants";
import { SHELL_SASH_DETENT_ARM_PX } from "@/lib/workspace/shell-sash";
import { useLayoutStore } from "@/stores/layout-store";
import { beginShellSashDrag, endShellSashDrag } from "@/lib/workspace/shell-sash";
import {
  applyShellWindowLayout,
  getShellLive,
  measureShellGroupPx,
  resetShellLiveForTests,
  subscribeShellLive,
} from "@/lib/workspace/shell-layout-controller";

const L_MIN = SIDEBAR_LEFT_MIN;
const C_MIN = MAIN_AREA_MIN;

describe("shell window apply", () => {
  afterEach(() => {
    resetShellLiveForTests();
    vi.unstubAllGlobals();
  });

  it("watches window resize only — sash pointer-up does not water-fill", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../../src/renderer/lib/workspace/shell-layout-controller.ts"),
      "utf-8",
    );
    expect(src).toContain("visualViewport");
    expect(src).not.toContain("observer.observe");
    expect(src).not.toMatch(/getElementById\("main-layout"\)/);
    const pointerUp = src.slice(src.indexOf("const onPointerUp"), src.indexOf("window.addEventListener(\"resize\""));
    expect(pointerUp).toContain("endShellSashDrag");
    expect(pointerUp).not.toContain("scheduleShellWindowApply");
  });

  it("measures innerWidth, not #main-layout.clientWidth", () => {
    vi.stubGlobal("innerWidth", 1280);
    const node = document.createElement("div");
    node.id = "main-layout";
    Object.defineProperty(node, "clientWidth", { value: 900 });
    document.body.append(node);
    expect(measureShellGroupPx()).toBe(1280);
    node.remove();
  });

  it("does not notify twice when the window width has not changed", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: SIDEBAR_LEFT_MAX,
      rightAreaExpanded: false,
      editorMaximized: false,
    });
    expect(applyShellWindowLayout({ source: "window" }).leftPx).toBe(SIDEBAR_LEFT_MAX);
    const onLive = vi.fn();
    const stop = subscribeShellLive(onLive);
    expect(applyShellWindowLayout({ source: "window" }).leftPx).toBe(SIDEBAR_LEFT_MAX);
    expect(onLive).not.toHaveBeenCalled();
    stop();
  });

  it("keeps a sash-held 520 while the pointer is down, even if the window path fires", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: SIDEBAR_LEFT_MAX,
      rightAreaExpanded: false,
      editorMaximized: false,
    });
    beginShellSashDrag();
    expect(applyShellWindowLayout({
      source: "sash",
      sashLeftPx: SIDEBAR_LEFT_MAX,
    }).leftPx).toBe(SIDEBAR_LEFT_MAX);
    vi.stubGlobal("innerWidth", 800);
    expect(applyShellWindowLayout({ source: "window" }).leftPx).toBe(SIDEBAR_LEFT_MAX);
    endShellSashDrag();
    expect(applyShellWindowLayout({ source: "window" }).leftPx).toBe(400);
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_LEFT_MAX);
  });

  it("keeps a sash-committed 520 until the window width changes", () => {
    vi.stubGlobal("innerWidth", 800);
    useLayoutStore.setState({
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: SIDEBAR_LEFT_MAX,
      rightAreaExpanded: false,
      editorMaximized: false,
    });
    expect(applyShellWindowLayout({
      source: "sash",
      sashLeftPx: SIDEBAR_LEFT_MAX,
    }).leftPx).toBe(SIDEBAR_LEFT_MAX);
    expect(applyShellWindowLayout({ source: "window" }).leftPx).toBe(SIDEBAR_LEFT_MAX);
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_LEFT_MAX);
  });

  it("opens split Right at the remembered pixel width, not half the window", () => {
    vi.stubGlobal("innerWidth", 1400);
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
    const next = applyShellWindowLayout({ source: "programmatic" });
    expect(next.rightMode).toBe("split");
    expect(next.rightPx).toBe(500);
    expect(next.centerPx).toBe(1400 - L_MIN - 500);
    expect(next.rightPx).not.toBe(Math.round((1400 - L_MIN) / 2));
  });

  it("keeps a sash-held Right width and does not snap it back to half", () => {
    vi.stubGlobal("innerWidth", 1400);
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
    expect(applyShellWindowLayout({
      source: "sash",
      sashRightPx: 700,
    }).rightPx).toBe(700);
    useLayoutStore.setState({ rightAreaWidth: 700 });
    expect(applyShellWindowLayout({
      source: "sash",
      sashRightPx: 700,
    }).rightPx).toBe(700);
    expect(applyShellWindowLayout({ source: "window" }).rightPx).toBe(700);
  });

  it("sticks a growing Right sash at Content 400, then previews maximize after 140px", () => {
    vi.stubGlobal("innerWidth", 1400);
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
    const main = 1400 - L_MIN;
    const stickRight = main - C_MIN;
    expect(applyShellWindowLayout({
      source: "sash",
      sashRightPx: stickRight + SHELL_SASH_DETENT_ARM_PX - 1,
    })).toMatchObject({
      rightMode: "split",
      centerPx: C_MIN,
      rightPx: stickRight,
    });
    expect(useLayoutStore.getState().editorMaximized).toBe(false);

    const preview = applyShellWindowLayout({
      source: "sash",
      sashRightPx: stickRight + SHELL_SASH_DETENT_ARM_PX,
    });
    expect(preview.rightMode).toBe("maximize");
    expect(preview.centerPx).toBe(0);
    expect(preview.rightPx).toBe(main);
    expect(useLayoutStore.getState().editorMaximized).toBe(false);
  });

  it("keeps Right closed and remembers the sash width after snap-close then grow", () => {
    vi.stubGlobal("innerWidth", 1400);
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
    expect(applyShellWindowLayout({ source: "programmatic" }).rightMode).toBe("split");

    vi.stubGlobal("innerWidth", L_MIN + RIGHT_AREA_MIN + C_MIN - 1);
    const closed = applyShellWindowLayout({ source: "window" });
    expect(closed.rightMode).toBe("closed");
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);

    vi.stubGlobal("innerWidth", 1400);
    const grown = applyShellWindowLayout({ source: "window" });
    expect(grown.rightMode).toBe("closed");
    expect(grown.rightPx).toBe(0);
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);
  });

  it("keeps maximize through a window fold and restores Left at 280 only", () => {
    vi.stubGlobal("innerWidth", 1100);
    useLayoutStore.setState({
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: 400,
      rightAreaExpanded: true,
      editorMaximized: true,
      rightAreaWidth: 500,
    });
    expect(applyShellWindowLayout({ source: "programmatic" }).rightMode).toBe("maximize");

    vi.stubGlobal("innerWidth", L_MIN + C_MIN - 1);
    const folded = applyShellWindowLayout({ source: "window" });
    expect(folded.rightMode).toBe("maximize");
    expect(folded.leftPx).toBe(0);
    expect(folded.centerPx).toBe(0);
    expect(useLayoutStore.getState().editorMaximized).toBe(true);
    expect(useLayoutStore.getState().leftWindowCollapsed).toBe(true);
    expect(useLayoutStore.getState().leftPinToMin).toBe(true);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);

    vi.stubGlobal("innerWidth", 1100);
    const restored = applyShellWindowLayout({ source: "window" });
    expect(restored.rightMode).toBe("maximize");
    expect(restored.leftPx).toBe(L_MIN);
    expect(restored.centerPx).toBe(0);
    expect(restored.rightPx).toBe(1100 - L_MIN);
    expect(restored.leftPinToMin).toBe(true);
    expect(useLayoutStore.getState().editorMaximized).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(400);
  });

  it("lets a later window apply re-fold Left after a cramped toggle open", () => {
    vi.stubGlobal("innerWidth", 500);
    useLayoutStore.setState({
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: L_MIN,
      rightAreaExpanded: false,
      editorMaximized: false,
    });
    const opened = applyShellWindowLayout({ source: "toggle" });
    expect(opened.leftPx).toBe(L_MIN);
    expect(opened.leftWindowCollapsed).toBe(false);

    vi.stubGlobal("innerWidth", 499);
    const folded = applyShellWindowLayout({ source: "window" });
    expect(folded.leftPx).toBe(0);
    expect(folded.leftWindowCollapsed).toBe(true);
    expect(useLayoutStore.getState().leftUserExpanded).toBe(true);
    expect(useLayoutStore.getState().leftWindowCollapsed).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(L_MIN);
  });

  it("yields a 520 Left when the window shrinks below 920", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: SIDEBAR_LEFT_MAX,
      rightAreaExpanded: false,
      editorMaximized: false,
    });
    expect(applyShellWindowLayout({ source: "window" }).leftPx).toBe(SIDEBAR_LEFT_MAX);
    vi.stubGlobal("innerWidth", 750);
    const next = applyShellWindowLayout({ source: "window" });
    expect(next.leftPx).toBe(350);
    expect(next.centerPx).toBe(C_MIN);
    expect(useLayoutStore.getState().sidebarWidth).toBe(SIDEBAR_LEFT_MAX);
  });

  it("applies a gradual Left yield and does not persist the sash width", () => {
    vi.stubGlobal("innerWidth", 750);
    useLayoutStore.setState({
      leftSidebarView: "sessions",
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: 400,
      rightAreaExpanded: false,
      editorMaximized: false,
    });
    const next = applyShellWindowLayout({ source: "window" });
    expect(next.leftPx).toBe(350);
    expect(next.centerPx).toBe(C_MIN);
    expect(useLayoutStore.getState().sidebarWidth).toBe(400);
    expect(useLayoutStore.getState().leftPinToMin).toBe(false);
    expect(getShellLive().leftPx).toBe(350);
  });

  it("window-folds Left to 0 without writing the sash width", () => {
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
    const next = applyShellWindowLayout({ source: "window" });
    expect(next.leftPx).toBe(0);
    expect(useLayoutStore.getState().leftWindowCollapsed).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(280);
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
      leftSidebarView: "sessions",
    });
    const next = applyShellWindowLayout({ source: "window" });
    expect(next.leftPx).toBe(L_MIN);
    expect(useLayoutStore.getState().sidebarWidth).toBe(400);
    expect(useLayoutStore.getState().leftPinToMin).toBe(true);
    expect(useLayoutStore.getState().leftWindowCollapsed).toBe(false);
  });

  it("closes split Right after it has yielded to 280 and does not persist a squeezed width", () => {
    vi.stubGlobal("innerWidth", L_MIN + 280 + C_MIN - 1);
    useLayoutStore.setState({
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: 280,
      rightAreaExpanded: true,
      editorMaximized: false,
      rightAreaWidth: 280,
      leftSidebarView: "sessions",
    });
    const next = applyShellWindowLayout({ source: "window" });
    expect(next.rightMode).toBe("closed");
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
    expect(useLayoutStore.getState().sidebarWidth).toBe(280);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(280);
  });

  it("does not immediately re-fold a user-opened Left on the toggle path", () => {
    vi.stubGlobal("innerWidth", 500);
    useLayoutStore.setState({
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      sidebarWidth: 280,
      rightAreaExpanded: false,
      editorMaximized: false,
      leftSidebarView: "sessions",
    });
    const next = applyShellWindowLayout({ source: "toggle" });
    expect(next.leftPx).toBe(L_MIN);
    expect(next.leftWindowCollapsed).toBe(false);
  });
});
