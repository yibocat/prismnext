// tests/renderer/turn-window.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  TURN_WINDOW_HARD,
  TURN_WINDOW_PAGE,
  TURN_WINDOW_SOFT,
  _clearAllTurnWindowStateForTests,
  clearTurnWindowState,
  getTurnWindowState,
  initialWindowStart,
  maybeSnapWindowStart,
  pageUpWindowStart,
  resolveWindowStart,
  setTurnHeight,
  setTurnWindowStart,
  spacerHeightPx,
} from "../../src/renderer/lib/chat/turn-window";

describe("turn-window math", () => {
  it("initialWindowStart mounts all turns when total ≤ SOFT", () => {
    expect(initialWindowStart(0)).toBe(0);
    expect(initialWindowStart(TURN_WINDOW_SOFT)).toBe(0);
  });

  it("initialWindowStart keeps only HARD turns when total > SOFT", () => {
    expect(initialWindowStart(TURN_WINDOW_SOFT + 1)).toBe(
      TURN_WINDOW_SOFT + 1 - TURN_WINDOW_HARD,
    );
    expect(initialWindowStart(100)).toBe(100 - TURN_WINDOW_HARD);
  });

  it("maybeSnapWindowStart snaps only when following, not streaming, and mounted > SOFT", () => {
    const start = 0;
    const total = TURN_WINDOW_SOFT + 1; // mounted = total - start = 15
    expect(
      maybeSnapWindowStart({
        totalTurns: total,
        windowStart: start,
        followingBottom: true,
        isStreaming: false,
      }),
    ).toBe(total - TURN_WINDOW_HARD);

    expect(
      maybeSnapWindowStart({
        totalTurns: total,
        windowStart: start,
        followingBottom: false,
        isStreaming: false,
      }),
    ).toBe(start);

    expect(
      maybeSnapWindowStart({
        totalTurns: total,
        windowStart: start,
        followingBottom: true,
        isStreaming: true,
      }),
    ).toBe(start);
  });

  it("maybeSnapWindowStart is a no-op when mounted ≤ SOFT", () => {
    expect(
      maybeSnapWindowStart({
        totalTurns: TURN_WINDOW_SOFT,
        windowStart: 0,
        followingBottom: true,
        isStreaming: false,
      }),
    ).toBe(0);
  });

  it("pageUpWindowStart steps back by PAGE and clamps to 0", () => {
    expect(pageUpWindowStart(20)).toBe(20 - TURN_WINDOW_PAGE);
    expect(pageUpWindowStart(TURN_WINDOW_PAGE - 1)).toBe(0);
    expect(pageUpWindowStart(0)).toBe(0);
  });

  it("spacerHeightPx sums measured heights and estimates missing ones", () => {
    const heights = new Map<number, number>([
      [0, 100],
      [1, 200],
    ]);
    // windowStart=3 → turns 0,1,2; turn 2 missing → estimate
    expect(spacerHeightPx(3, heights, 50)).toBe(100 + 200 + 50);
    expect(spacerHeightPx(0, heights)).toBe(0);
  });
});

describe("turn-window per-tab state", () => {
  beforeEach(() => {
    _clearAllTurnWindowStateForTests();
  });

  it("stores windowStart and heights per tabId", () => {
    setTurnWindowStart("tab-a", 7);
    setTurnHeight("tab-a", 0, 120);
    setTurnHeight("tab-b", 0, 999);
    expect(getTurnWindowState("tab-a").windowStart).toBe(7);
    expect(getTurnWindowState("tab-a").heights).toEqual(new Map([[0, 120]]));
    expect(getTurnWindowState("tab-b").heights.get(0)).toBe(999);
  });
});

describe("resolveWindowStart", () => {
  beforeEach(() => {
    _clearAllTurnWindowStateForTests();
  });

  it("returns 0 and stores 0 when totalTurns ≤ SOFT", () => {
    expect(resolveWindowStart("tab-a", TURN_WINDOW_SOFT)).toBe(0);
    expect(getTurnWindowState("tab-a").windowStart).toBe(0);
    expect(resolveWindowStart("tab-a", Math.max(0, TURN_WINDOW_SOFT - 1))).toBe(0);
  });

  it("initializes to initialWindowStart on first call when totalTurns > SOFT", () => {
    const total = TURN_WINDOW_SOFT + 5;
    const expected = initialWindowStart(total);
    expect(resolveWindowStart("tab-a", total)).toBe(expected);
    expect(getTurnWindowState("tab-a").windowStart).toBe(expected);
  });

  it("returns stored windowStart on subsequent calls when still valid", () => {
    const total = TURN_WINDOW_SOFT + 10;
    resolveWindowStart("tab-a", total);
    setTurnWindowStart("tab-a", 3);
    expect(resolveWindowStart("tab-a", total)).toBe(3);
  });

  it("recalculates when stored windowStart ≥ totalTurns", () => {
    const total = TURN_WINDOW_SOFT + 3;
    resolveWindowStart("tab-a", 100);
    const expected = initialWindowStart(total);
    expect(resolveWindowStart("tab-a", total)).toBe(expected);
    expect(getTurnWindowState("tab-a").windowStart).toBe(expected);
  });

  it("clearTurnWindowState resets initialization so next call re-initializes", () => {
    const total = TURN_WINDOW_SOFT + 5;
    resolveWindowStart("tab-a", total);
    setTurnWindowStart("tab-a", 99);
    clearTurnWindowState("tab-a");
    const expected = initialWindowStart(total);
    expect(resolveWindowStart("tab-a", total)).toBe(expected);
  });

  it("re-inits to HARD tail when total jumps from ≤SOFT to >SOFT (history hydrate)", () => {
    expect(resolveWindowStart("tab-a", 0)).toBe(0);
    const total = 100;
    const expected = initialWindowStart(total);
    expect(resolveWindowStart("tab-a", total)).toBe(expected);
    expect(getTurnWindowState("tab-a").windowStart).toBe(expected);
  });

  it("does not clobber a paged-up windowStart when total grows while already >SOFT", () => {
    const total = TURN_WINDOW_SOFT + 20;
    resolveWindowStart("tab-a", total);
    setTurnWindowStart("tab-a", 5);
    expect(resolveWindowStart("tab-a", total + 1)).toBe(5);
  });
});
