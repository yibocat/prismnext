import { describe, expect, it } from "vitest";
import { MAIN_AREA_MIN, RIGHT_AREA_MIN, SIDEBAR_LEFT_MIN } from "@/styles/constants";
import { SHELL_SASH_DETENT_ARM_PX } from "@/lib/workspace/shell-sash";
import {
  clampShellLeftPreferredPx,
  computeShellGeometry,
  fitMainAreaColumns,
  shellGeometriesEqual,
  shellWindowCanHoldLeftRail,
  type ShellGeometryInput,
} from "@/lib/workspace/shell-geometry";

const L_MIN = SIDEBAR_LEFT_MIN;
const C_MIN = MAIN_AREA_MIN;
const HOLD_LEFT = C_MIN + L_MIN;

function layout(partial: Partial<ShellGeometryInput> & Pick<ShellGeometryInput, "windowPx">) {
  return computeShellGeometry({
    leftUserExpanded: true,
    leftWindowCollapsed: false,
    leftPinToMin: false,
    leftPreferredPx: L_MIN,
    rightMode: "closed",
    rightPreferredPx: 500,
    ...partial,
  });
}

describe("shell-geometry", () => {
  it("treats two geometries as equal only when every live field matches", () => {
    const a = layout({ windowPx: 1200, leftPreferredPx: L_MIN });
    expect(shellGeometriesEqual(a, { ...a })).toBe(true);
    expect(shellGeometriesEqual(a, { ...a, leftPx: a.leftPx - 1 })).toBe(false);
  });

  it("clamps a preferred left width to 280–520", () => {
    expect(clampShellLeftPreferredPx(220)).toBe(L_MIN);
    expect(clampShellLeftPreferredPx(400)).toBe(400);
    expect(clampShellLeftPreferredPx(900)).toBe(520);
  });

  it("holds an open left rail only when content still has 400px", () => {
    expect(shellWindowCanHoldLeftRail(HOLD_LEFT)).toBe(true);
    expect(shellWindowCanHoldLeftRail(HOLD_LEFT - 1)).toBe(false);
  });

  it("keeps Left still and lets Content take the rest when the window is wide", () => {
    const next = layout({ windowPx: 1200, leftPreferredPx: L_MIN });
    expect(next).toMatchObject({
      leftPx: L_MIN,
      centerPx: 1200 - L_MIN,
      rightPx: 0,
      rightMode: "closed",
      leftWindowCollapsed: false,
      leftPinToMin: false,
    });
  });

  it("shrinks Content first while a wider Left stays put", () => {
    const next = layout({ windowPx: 900, leftPreferredPx: 400 });
    expect(next.leftPx).toBe(400);
    expect(next.centerPx).toBe(500);
    expect(next.leftWindowCollapsed).toBe(false);
  });

  it("narrows Left from the sash width toward 280 after Content hits 400", () => {
    const next = layout({ windowPx: 750, leftPreferredPx: 400 });
    expect(next.leftPx).toBe(350);
    expect(next.centerPx).toBe(C_MIN);
    expect(next.leftWindowCollapsed).toBe(false);
    expect(next.leftPinToMin).toBe(false);
  });

  it("reaches 280 just as the window hits 680, then folds on the next pixel", () => {
    const atMin = layout({ windowPx: HOLD_LEFT, leftPreferredPx: 400 });
    expect(atMin.leftPx).toBe(L_MIN);
    expect(atMin.centerPx).toBe(C_MIN);

    const folded = layout({ windowPx: HOLD_LEFT - 1, leftPreferredPx: 400 });
    expect(folded.leftPx).toBe(0);
    expect(folded.centerPx).toBe(HOLD_LEFT - 1);
    expect(folded.leftWindowCollapsed).toBe(true);
    expect(folded.leftPinToMin).toBe(true);
  });

  it("reverses a Left yield when the window grows (does not pin)", () => {
    const yielded = layout({ windowPx: 750, leftPreferredPx: 400 });
    expect(yielded.leftPx).toBe(350);

    const restored = layout({ windowPx: 900, leftPreferredPx: 400 });
    expect(restored.leftPx).toBe(400);
    expect(restored.leftPinToMin).toBe(false);
  });

  it("keeps a pinned Left at 280 when the window grows after a fold", () => {
    const next = layout({
      windowPx: 1100,
      leftPreferredPx: 400,
      leftPinToMin: true,
    });
    expect(next.leftPx).toBe(L_MIN);
    expect(next.centerPx).toBe(1100 - L_MIN);
    expect(next.leftPinToMin).toBe(true);
  });

  it("restores a window-folded Left to 280 only, not the old sash width", () => {
    const stillFolded = layout({
      windowPx: HOLD_LEFT - 1,
      leftPreferredPx: 400,
      leftWindowCollapsed: true,
      leftPinToMin: true,
    });
    expect(stillFolded.leftPx).toBe(0);
    expect(stillFolded.leftWindowCollapsed).toBe(true);

    const restored = layout({
      windowPx: 1100,
      leftPreferredPx: 400,
      leftWindowCollapsed: true,
      leftPinToMin: true,
    });
    expect(restored.leftPx).toBe(L_MIN);
    expect(restored.centerPx).toBe(1100 - L_MIN);
    expect(restored.leftWindowCollapsed).toBe(false);
    expect(restored.leftPinToMin).toBe(true);
  });

  it("keeps a user-folded Left at 0 when the window grows", () => {
    const next = layout({
      windowPx: 1400,
      leftUserExpanded: false,
      leftPreferredPx: 400,
    });
    expect(next.leftPx).toBe(0);
    expect(next.centerPx).toBe(1400);
    expect(next.leftWindowCollapsed).toBe(false);
    expect(next.leftPinToMin).toBe(false);
  });

  it("does not immediately re-fold Left when the user opens it in a narrow window", () => {
    const next = layout({
      windowPx: 500,
      leftPreferredPx: L_MIN,
      crampedLeftAllowed: true,
    });
    expect(next.leftPx).toBe(L_MIN);
    expect(next.centerPx).toBe(220);
    expect(next.leftWindowCollapsed).toBe(false);
  });

  it("keeps split Right at the sash width until Content is at 400, then yields both rails", () => {
    const split = layout({
      windowPx: 1200,
      leftPreferredPx: L_MIN,
      rightMode: "split",
      rightPreferredPx: 500,
    });
    expect(split.rightMode).toBe("split");
    expect(split.leftPx).toBe(L_MIN);
    expect(split.rightPx).toBe(500);
    expect(split.centerPx).toBe(1200 - L_MIN - 500);

    const atFloor = layout({
      windowPx: 1180,
      leftPreferredPx: L_MIN,
      rightMode: "split",
      rightPreferredPx: 500,
    });
    expect(atFloor.rightMode).toBe("split");
    expect(atFloor.rightPx).toBe(500);
    expect(atFloor.centerPx).toBe(C_MIN);

    const yielded = layout({
      windowPx: 1100,
      leftPreferredPx: L_MIN,
      rightMode: "split",
      rightPreferredPx: 500,
    });
    expect(yielded.rightMode).toBe("split");
    expect(yielded.leftPx).toBe(L_MIN);
    expect(yielded.centerPx).toBe(C_MIN);
    expect(yielded.rightPx).toBe(420);
  });

  it("snap-closes split Right after both rails have yielded to 280, and pins Left", () => {
    const bothMin = layout({
      windowPx: L_MIN + RIGHT_AREA_MIN + C_MIN,
      leftPreferredPx: L_MIN,
      rightMode: "split",
      rightPreferredPx: 500,
    });
    expect(bothMin.leftPx).toBe(L_MIN);
    expect(bothMin.rightPx).toBe(RIGHT_AREA_MIN);
    expect(bothMin.centerPx).toBe(C_MIN);
    expect(bothMin.rightMode).toBe("split");

    const closed = layout({
      windowPx: L_MIN + RIGHT_AREA_MIN + C_MIN - 1,
      leftPreferredPx: L_MIN,
      rightMode: "split",
      rightPreferredPx: 500,
    });
    expect(closed.rightMode).toBe("closed");
    expect(closed.rightPx).toBe(0);
    expect(closed.leftPx).toBe(L_MIN);
    expect(closed.leftPinToMin).toBe(true);
    expect(closed.centerPx).toBe(L_MIN + RIGHT_AREA_MIN + C_MIN - 1 - L_MIN);
  });

  it("does not reopen a closed Right when the window grows", () => {
    const next = layout({
      windowPx: 1400,
      leftPreferredPx: L_MIN,
      rightMode: "closed",
      rightPreferredPx: 500,
    });
    expect(next.rightMode).toBe("closed");
    expect(next.rightPx).toBe(0);
    expect(next.centerPx).toBe(1400 - L_MIN);
  });

  it("treats maximized Right as the flex pane and still yields Left last", () => {
    const wide = layout({
      windowPx: 900,
      leftPreferredPx: 400,
      rightMode: "maximize",
    });
    expect(wide).toMatchObject({
      leftPx: 400,
      centerPx: 0,
      rightPx: 500,
      rightMode: "maximize",
    });

    const squeeze = layout({
      windowPx: 700,
      leftPreferredPx: 400,
      rightMode: "maximize",
    });
    expect(squeeze.leftPx).toBe(300);
    expect(squeeze.centerPx).toBe(0);
    expect(squeeze.rightPx).toBe(400);
    expect(squeeze.rightMode).toBe("maximize");

    const fold = layout({
      windowPx: HOLD_LEFT - 1,
      leftPreferredPx: 400,
      rightMode: "maximize",
    });
    expect(fold.leftPx).toBe(0);
    expect(fold.centerPx).toBe(0);
    expect(fold.rightPx).toBe(HOLD_LEFT - 1);
    expect(fold.rightMode).toBe("maximize");
    expect(fold.leftWindowCollapsed).toBe(true);
  });

  it("keeps Settings detail at the sash width when the list still has 400px", () => {
    const fits = layout({
      windowPx: 1300,
      leftPreferredPx: L_MIN,
      rightMode: "split",
      rightPreferredPx: 500,
      rightYieldEnabled: false,
    });
    expect(fits.leftPx).toBe(L_MIN);
    expect(fits.rightPx).toBe(500);
    expect(fits.centerPx).toBe(1300 - L_MIN - 500);
    expect(fits.rightMode).toBe("split");

    const clamped = layout({
      windowPx: 1100,
      leftPreferredPx: L_MIN,
      rightMode: "split",
      rightPreferredPx: 500,
      rightYieldEnabled: false,
    });
    expect(clamped.rightMode).toBe("split");
    expect(clamped.rightPx).toBe(420);
    expect(clamped.centerPx).toBe(C_MIN);
  });

  it("uses sash overrides instead of water-fill while dragging", () => {
    const next = layout({
      windowPx: 1200,
      leftPreferredPx: 400,
      sashLeftPx: 360,
    });
    expect(next.leftPx).toBe(360);
    expect(next.centerPx).toBe(840);
  });

  describe("right sash grow — Content floor then maximize (spec §3.4)", () => {
    const WINDOW = 1400;
    const MAIN = WINDOW - L_MIN;
    const STICK_RIGHT = MAIN - C_MIN;
    const ARM = SHELL_SASH_DETENT_ARM_PX;

    function grow(sashRightPx: number) {
      return layout({
        windowPx: WINDOW,
        leftPreferredPx: L_MIN,
        rightMode: "split",
        rightPreferredPx: 500,
        sashRightPx,
      });
    }

    it("tracks 1:1 while Content is still above 400", () => {
      const next = grow(STICK_RIGHT - 1);
      expect(next.rightMode).toBe("split");
      expect(next.rightPx).toBe(STICK_RIGHT - 1);
      expect(next.centerPx).toBe(C_MIN + 1);
    });

    it("sticks Content at 400 until the 140px detent is pulled", () => {
      const atFloor = grow(STICK_RIGHT);
      expect(atFloor.rightMode).toBe("split");
      expect(atFloor.centerPx).toBe(C_MIN);
      expect(atFloor.rightPx).toBe(STICK_RIGHT);

      const midDetent = grow(STICK_RIGHT + ARM - 1);
      expect(midDetent.rightMode).toBe("split");
      expect(midDetent.centerPx).toBe(C_MIN);
      expect(midDetent.rightPx).toBe(STICK_RIGHT);
    });

    it("promotes to maximize after the Content detent, not a 50% ceiling", () => {
      const next = grow(STICK_RIGHT + ARM);
      expect(next.rightMode).toBe("maximize");
      expect(next.centerPx).toBe(0);
      expect(next.rightPx).toBe(MAIN);
      expect(next.leftPx).toBe(L_MIN);
    });

    it("does not treat a small-drag collapse as maximize", () => {
      const next = grow(0);
      expect(next.rightMode).toBe("closed");
      expect(next.rightPx).toBe(0);
      expect(next.centerPx).toBe(MAIN);
    });

    it("does not treat the remembered 1100 ceiling as a live sash cap", () => {
      const wide = 1920;
      const main = wide - L_MIN;
      const stickRight = main - C_MIN;
      const next = layout({
        windowPx: wide,
        leftPreferredPx: L_MIN,
        rightMode: "split",
        rightPreferredPx: 500,
        sashRightPx: stickRight + ARM,
      });
      expect(next.rightMode).toBe("maximize");
      expect(next.centerPx).toBe(0);
      expect(next.rightPx).toBe(main);
      expect(stickRight).toBeGreaterThan(1100);
    });
  });

  it("fits inner columns so paper + sashes fill #main-area without clipping the right edge", () => {
    const closed = layout({ windowPx: 1400, leftPreferredPx: L_MIN });
    const split = layout({
      windowPx: 1400,
      leftPreferredPx: L_MIN,
      rightMode: "split",
      rightPreferredPx: 500,
    });
    const maximized = layout({
      windowPx: 1400,
      leftPreferredPx: L_MIN,
      rightMode: "maximize",
    });

    for (const geo of [closed, split, maximized]) {
      const fit = fitMainAreaColumns(geo);
      expect(fit.centerW + fit.rightSashPx + fit.rightW).toBe(geo.centerPx + geo.rightPx - 1);
    }
    expect(fitMainAreaColumns(closed).rightSashPx).toBe(0);
    expect(fitMainAreaColumns(split).rightSashPx).toBe(1);
    expect(fitMainAreaColumns(maximized).rightSashPx).toBe(1);
    expect(fitMainAreaColumns(maximized).centerW).toBe(0);
  });
});
