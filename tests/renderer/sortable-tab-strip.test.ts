import { describe, expect, it } from "vitest";
import {
  clampClientXToTabRange,
  clampClientYToStackRange,
  computeInsertIndex,
  computeVerticalInsertIndex,
  isNoOpReorder,
  reorderIndex,
  shouldSuppressClickAfterDrag,
} from "../../src/renderer/lib/workspace/sortable-tab-strip";

describe("computeInsertIndex", () => {
  const rects = [
    { left: 0, width: 100 },
    { left: 100, width: 100 },
    { left: 200, width: 100 },
  ];

  it("returns leftmost / middle / end slots by midpoint", () => {
    expect(computeInsertIndex(10, rects)).toBe(0);
    expect(computeInsertIndex(120, rects)).toBe(1);
    expect(computeInsertIndex(240, rects)).toBe(2);
    expect(computeInsertIndex(400, rects)).toBe(3);
  });

  it("treats past-last-edge overshoot as append after clamp", () => {
    const x = clampClientXToTabRange(500, rects);
    expect(x).toBe(300);
    expect(computeInsertIndex(x, rects)).toBe(3);
  });

  it("treats before-first overshoot as insert at start after clamp", () => {
    const x = clampClientXToTabRange(-40, rects);
    expect(x).toBe(0);
    expect(computeInsertIndex(x, rects)).toBe(0);
  });
});

describe("clampClientXToTabRange", () => {
  const rects = [
    { left: 50, width: 100 },
    { left: 150, width: 100 },
  ];

  it("clamps outside the first/last tab edges", () => {
    expect(clampClientXToTabRange(10, rects)).toBe(50);
    expect(clampClientXToTabRange(400, rects)).toBe(250);
    expect(clampClientXToTabRange(180, rects)).toBe(180);
  });
});

describe("reorderIndex", () => {
  it("maps insert slots to post-removal destination", () => {
    expect(reorderIndex(1, 0)).toBe(0);
    expect(reorderIndex(1, 3)).toBe(2);
    expect(reorderIndex(0, 4)).toBe(3);
    expect(reorderIndex(2, 1)).toBe(1);
  });
});

describe("computeVerticalInsertIndex", () => {
  const rects = [
    { top: 0, height: 40 },
    { top: 40, height: 40 },
    { top: 80, height: 40 },
  ];

  it("returns slots by vertical midpoint", () => {
    expect(computeVerticalInsertIndex(10, rects)).toBe(0);
    expect(computeVerticalInsertIndex(50, rects)).toBe(1);
    expect(computeVerticalInsertIndex(130, rects)).toBe(3);
    expect(computeVerticalInsertIndex(clampClientYToStackRange(-20, rects), rects)).toBe(0);
  });

  it("snaps past or onto the first/last row with edge slack", () => {
    expect(computeVerticalInsertIndex(-80, rects, 36)).toBe(0);
    expect(computeVerticalInsertIndex(30, rects, 36)).toBe(0);
    expect(computeVerticalInsertIndex(95, rects, 36)).toBe(3);
    expect(computeVerticalInsertIndex(400, rects, 36)).toBe(3);
  });
});

describe("isNoOpReorder", () => {
  it("detects slots that keep the same order", () => {
    expect(isNoOpReorder(1, 1)).toBe(true);
    expect(isNoOpReorder(1, 2)).toBe(true);
    expect(isNoOpReorder(1, 0)).toBe(false);
    expect(isNoOpReorder(1, 3)).toBe(false);
  });
});

describe("shouldSuppressClickAfterDrag", () => {
  it("swallows only the ghost click right after a drag, not the next real click", () => {
    expect(shouldSuppressClickAfterDrag(1_000, null)).toBe(false);
    expect(shouldSuppressClickAfterDrag(1_000, 1_000)).toBe(true);
    expect(shouldSuppressClickAfterDrag(1_200, 1_000)).toBe(true);
    expect(shouldSuppressClickAfterDrag(1_500, 1_000)).toBe(false);
  });
});
