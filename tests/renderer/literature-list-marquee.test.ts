import { describe, expect, it } from "vitest";
import {
  collectRowIdsInMarquee,
  normalizeMarqueeRect,
  rectsIntersect,
} from "../../src/renderer/lib/literature/literature-list-marquee";

describe("normalizeMarqueeRect", () => {
  it("orders corners regardless of drag direction", () => {
    expect(normalizeMarqueeRect(10, 20, 30, 40)).toEqual({
      left: 10,
      top: 20,
      width: 20,
      height: 20,
    });
    expect(normalizeMarqueeRect(30, 40, 10, 20)).toEqual({
      left: 10,
      top: 20,
      width: 20,
      height: 20,
    });
  });
});

describe("rectsIntersect", () => {
  it("detects overlap", () => {
    const marquee = { left: 0, top: 0, width: 100, height: 100 };
    const row = { left: 50, top: 50, right: 150, bottom: 80, width: 100, height: 30, x: 50, y: 50, toJSON: () => ({}) };
    expect(rectsIntersect(marquee, row as DOMRect)).toBe(true);
  });

  it("detects separation", () => {
    const marquee = { left: 0, top: 0, width: 10, height: 10 };
    const row = { left: 20, top: 20, right: 40, bottom: 40, width: 20, height: 20, x: 20, y: 20, toJSON: () => ({}) };
    expect(rectsIntersect(marquee, row as DOMRect)).toBe(false);
  });
});

describe("collectRowIdsInMarquee", () => {
  it("returns ids for intersecting row shells", () => {
    const root = document.createElement("div");
    const rowA = document.createElement("div");
    rowA.dataset.literatureRowId = "a";
    rowA.dataset.literatureRowShell = "true";
    rowA.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 200, bottom: 24, width: 200, height: 24, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    const rowB = document.createElement("div");
    rowB.dataset.literatureRowId = "b";
    rowB.dataset.literatureRowShell = "true";
    rowB.getBoundingClientRect = () =>
      ({ left: 0, top: 40, right: 200, bottom: 64, width: 200, height: 24, x: 0, y: 40, toJSON: () => ({}) }) as DOMRect;

    root.append(rowA, rowB);

    const hits = collectRowIdsInMarquee(root, { left: 0, top: 0, width: 200, height: 30 });
    expect(hits).toEqual(["a"]);
  });
});
