/**
 * Spec contract for 2026-08-24 shell layout refactor Phase 0.
 * These cases are the six red-line gestures — geometry + apply + store.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAIN_AREA_MIN, RIGHT_AREA_MIN, SIDEBAR_LEFT_MIN } from "@/styles/constants";
import { SHELL_SASH_DETENT_ARM_PX } from "@/lib/workspace/shell-sash";
import {
  computeCanSplitRightArea,
  openRightArea,
  SPLIT_MAIN_MIN_PX,
} from "@/lib/workspace/right-area-layout";
import {
  applyShellWindowLayout,
  getShellLive,
  resetShellLiveForTests,
} from "@/lib/workspace/shell-layout-controller";
import { useLayoutStore } from "@/stores/layout-store";

const L_MIN = SIDEBAR_LEFT_MIN;
const C_MIN = MAIN_AREA_MIN;
const R_MIN = RIGHT_AREA_MIN;
const ARM = SHELL_SASH_DETENT_ARM_PX;
const HOLD_SPLIT = C_MIN + R_MIN;

function workspaceSplit(windowPx: number, extra?: Record<string, unknown>) {
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
    ...extra,
  });
}

describe("shell-layout-gestures (spec Phase 0)", () => {
  afterEach(() => {
    resetShellLiveForTests();
    vi.unstubAllGlobals();
  });

  it("1. Right sash: stick Content at 400, then preview maximize after 140px", () => {
    workspaceSplit(1400);
    applyShellWindowLayout({ source: "programmatic" });
    const main = 1400 - L_MIN;
    const stickRight = main - C_MIN;

    const stuck = applyShellWindowLayout({
      source: "sash",
      sashRightPx: stickRight + ARM - 1,
    });
    expect(stuck.rightMode).toBe("split");
    expect(stuck.centerPx).toBe(C_MIN);
    expect(stuck.rightPx).toBe(stickRight);
    expect(useLayoutStore.getState().editorMaximized).toBe(false);

    const preview = applyShellWindowLayout({
      source: "sash",
      sashRightPx: stickRight + ARM,
    });
    expect(preview.rightMode).toBe("maximize");
    expect(preview.centerPx).toBe(0);
    expect(preview.rightPx).toBe(main);
    expect(useLayoutStore.getState().editorMaximized).toBe(false);
  });

  it("2. Right sash small-drag overshoot closes the rail, it does not maximize", () => {
    workspaceSplit(1400);
    applyShellWindowLayout({ source: "programmatic" });

    const closed = applyShellWindowLayout({ source: "sash", sashRightPx: 0 });
    expect(closed.rightMode).toBe("closed");
    expect(closed.rightPx).toBe(0);
    expect(closed.centerPx).toBe(1400 - L_MIN);
    expect(useLayoutStore.getState().editorMaximized).toBe(false);
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(true);
  });

  it("3. snap-close then grow keeps Right closed and the remembered width", () => {
    workspaceSplit(1400);
    expect(applyShellWindowLayout({ source: "programmatic" }).rightMode).toBe("split");

    vi.stubGlobal("innerWidth", L_MIN + R_MIN + C_MIN - 1);
    expect(applyShellWindowLayout({ source: "window" }).rightMode).toBe("closed");
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);

    vi.stubGlobal("innerWidth", 1400);
    const grown = applyShellWindowLayout({ source: "window" });
    expect(grown.rightMode).toBe("closed");
    expect(grown.rightPx).toBe(0);
    expect(useLayoutStore.getState().rightAreaWidth).toBe(500);
  });

  it("4. maximize shrinks to 679 then grows to 1100 with Left pinned at 280", () => {
    workspaceSplit(1100, { editorMaximized: true, sidebarWidth: 400 });
    expect(applyShellWindowLayout({ source: "programmatic" }).rightMode).toBe("maximize");

    vi.stubGlobal("innerWidth", 679);
    const folded = applyShellWindowLayout({ source: "window" });
    expect(folded.rightMode).toBe("maximize");
    expect(folded.leftPx).toBe(0);
    expect(folded.centerPx).toBe(0);
    expect(useLayoutStore.getState().leftWindowCollapsed).toBe(true);
    expect(useLayoutStore.getState().leftPinToMin).toBe(true);
    expect(useLayoutStore.getState().editorMaximized).toBe(true);

    vi.stubGlobal("innerWidth", 1100);
    const restored = applyShellWindowLayout({ source: "window" });
    expect(restored.rightMode).toBe("maximize");
    expect(restored.leftPx).toBe(L_MIN);
    expect(restored.centerPx).toBe(0);
    expect(restored.rightPx).toBe(1100 - L_MIN);
    expect(restored.leftPinToMin).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(400);
  });

  it("5. a window apply after a cramped Left toggle may fold Left again", () => {
    workspaceSplit(500, { rightAreaExpanded: false });
    const opened = applyShellWindowLayout({ source: "toggle" });
    expect(opened.leftPx).toBe(L_MIN);

    vi.stubGlobal("innerWidth", 499);
    const folded = applyShellWindowLayout({ source: "window" });
    expect(folded.leftPx).toBe(0);
    expect(folded.leftWindowCollapsed).toBe(true);
    expect(useLayoutStore.getState().leftUserExpanded).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(L_MIN);
  });

  it("7. a 1920 window can sash past 1100 and maximize after Content's detent", () => {
    workspaceSplit(1920);
    applyShellWindowLayout({ source: "programmatic" });
    const main = 1920 - L_MIN;
    const stickRight = main - C_MIN;
    expect(stickRight).toBeGreaterThan(1100);

    const capped = applyShellWindowLayout({ source: "sash", sashRightPx: 1100 });
    expect(capped.rightMode).toBe("split");
    expect(capped.rightPx).toBe(1100);
    expect(capped.centerPx).toBe(main - 1100);

    const preview = applyShellWindowLayout({
      source: "sash",
      sashRightPx: stickRight + ARM,
    });
    expect(preview.rightMode).toBe("maximize");
    expect(preview.centerPx).toBe(0);
    expect(preview.rightPx).toBe(main);
  });

  it("6. opening split and holding split share the 680 main-area floor", () => {
    expect(SPLIT_MAIN_MIN_PX).toBe(HOLD_SPLIT);

    workspaceSplit(L_MIN + HOLD_SPLIT, { rightAreaExpanded: false });
    applyShellWindowLayout({ source: "programmatic" });
    expect(computeCanSplitRightArea()).toBe(true);
    openRightArea();
    expect(useLayoutStore.getState().editorMaximized).toBe(false);
    expect(getShellLive().rightMode).toBe("split");

    workspaceSplit(L_MIN + HOLD_SPLIT - 1, { rightAreaExpanded: false });
    applyShellWindowLayout({ source: "programmatic" });
    expect(computeCanSplitRightArea()).toBe(false);
  });
});
