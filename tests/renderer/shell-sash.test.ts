import { describe, expect, it } from "vitest";
import {
  SHELL_SASH_DETENT_ARM_PX,
  resolveShellSashWidth,
  shellSashDeltaPx,
} from "@/lib/workspace/shell-sash";
import { RIGHT_AREA_MAX, RIGHT_AREA_MIN, SIDEBAR_LEFT_MAX, SIDEBAR_LEFT_MIN } from "@/styles/constants";

const MIN = SIDEBAR_LEFT_MIN;
const MAX = SIDEBAR_LEFT_MAX;
const ARM = SHELL_SASH_DETENT_ARM_PX;

function drag(partial: Partial<Parameters<typeof resolveShellSashWidth>[0]> & {
  startWidthPx: number;
  deltaPx: number;
  collapsedAtStart: boolean;
}) {
  return resolveShellSashWidth({
    minPx: MIN,
    maxPx: MAX,
    ...partial,
  });
}

describe("shell-sash", () => {
  it("uses half the left min as the detent arm", () => {
    expect(ARM).toBe(140);
  });

  it("grows the left rail when the pointer moves right", () => {
    expect(shellSashDeltaPx("left", 400, 450)).toBe(50);
    expect(shellSashDeltaPx("right", 400, 350)).toBe(50);
  });

  it("tracks 1:1 above the min", () => {
    expect(drag({ startWidthPx: 400, deltaPx: 40, collapsedAtStart: false })).toEqual({
      widthPx: 440,
      collapsed: false,
    });
    expect(drag({ startWidthPx: 400, deltaPx: 200, collapsedAtStart: false })).toEqual({
      widthPx: MAX,
      collapsed: false,
    });
  });

  it("sticks at 280 until the detent arm is pulled, then collapses to 0", () => {
    expect(drag({ startWidthPx: 280, deltaPx: -20, collapsedAtStart: false })).toEqual({
      widthPx: MIN,
      collapsed: false,
    });
    expect(drag({ startWidthPx: 280, deltaPx: -(ARM - 1), collapsedAtStart: false })).toEqual({
      widthPx: MIN,
      collapsed: false,
    });
    expect(drag({ startWidthPx: 280, deltaPx: -ARM, collapsedAtStart: false })).toEqual({
      widthPx: 0,
      collapsed: true,
    });
  });

  it("does not pass through mid widths when collapsing past the detent", () => {
    const stuck = drag({ startWidthPx: 300, deltaPx: -50, collapsedAtStart: false });
    expect(stuck).toEqual({ widthPx: MIN, collapsed: false });
    const closed = drag({ startWidthPx: 300, deltaPx: -50 - ARM, collapsedAtStart: false });
    expect(closed).toEqual({ widthPx: 0, collapsed: true });
  });

  it("opens from 0 only after the same detent, then sticks at 280", () => {
    expect(drag({ startWidthPx: 0, deltaPx: ARM - 1, collapsedAtStart: true })).toEqual({
      widthPx: 0,
      collapsed: true,
    });
    expect(drag({ startWidthPx: 0, deltaPx: ARM, collapsedAtStart: true })).toEqual({
      widthPx: MIN,
      collapsed: false,
    });
    expect(drag({ startWidthPx: 0, deltaPx: ARM + 40, collapsedAtStart: true })).toEqual({
      widthPx: 320,
      collapsed: false,
    });
  });

  it("collapses a Right rail to 0 after the same detent — that is closed, not maximize", () => {
    const rightDrag = (deltaPx: number) =>
      resolveShellSashWidth({
        startWidthPx: RIGHT_AREA_MIN,
        deltaPx,
        minPx: RIGHT_AREA_MIN,
        maxPx: RIGHT_AREA_MAX,
        collapsedAtStart: false,
      });
    expect(rightDrag(-(ARM - 1))).toEqual({ widthPx: RIGHT_AREA_MIN, collapsed: false });
    expect(rightDrag(-ARM)).toEqual({ widthPx: 0, collapsed: true });
  });

  it("can collapse and pull the same gesture back open without a second detent", () => {
    const closed = drag({ startWidthPx: MIN, deltaPx: -ARM, collapsedAtStart: false });
    expect(closed).toEqual({ widthPx: 0, collapsed: true });
    const reopened = drag({ startWidthPx: MIN, deltaPx: 40, collapsedAtStart: false });
    expect(reopened).toEqual({ widthPx: MIN + 40, collapsed: false });
  });
});
