import { describe, expect, it, vi, afterEach } from "vitest";
import {
  computeSubmenuSide,
  estimateModelMenuWidth,
  estimateModelMenuWidthForBounds,
  modelMenuLeftEdge,
  resolveMenuBounds,
} from "@/components/modules/chat/agent-settings/use-submenu-side";

function mockViewport(width: number, height = 800) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
}

function bounds(width: number): { left: number; right: number; width: number } {
  const left = 16;
  return { left, right: left + width, width };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("model menu placement", () => {
  it("estimateModelMenuWidth respects viewport cap", () => {
    mockViewport(360);
    const rect = { left: 8, right: 352, top: 0, bottom: 0, width: 344, height: 0, x: 8, y: 0, toJSON: () => ({}) };
    expect(estimateModelMenuWidth(rect)).toBe(320);
  });

  it("estimateModelMenuWidthForBounds respects narrow panel", () => {
    expect(estimateModelMenuWidthForBounds(bounds(240))).toBe(240);
  });

  it("opens reasoning submenu to the right when there is room", () => {
    mockViewport(900);
    const rect = { left: 400, right: 520, top: 600, bottom: 620, width: 120, height: 20, x: 400, y: 600, toJSON: () => ({}) };
    expect(computeSubmenuSide("start", rect, bounds(868))).toBe("right");
  });

  it("opens reasoning submenu upward when narrow and composer sits at bottom", () => {
    mockViewport(320, 760);
    const rect = { left: 8, right: 312, top: 700, bottom: 720, width: 304, height: 20, x: 8, y: 700, toJSON: () => ({}) };
    const b = bounds(288);
    expect(modelMenuLeftEdge("start", rect, estimateModelMenuWidthForBounds(b))).toBe(8);
    expect(computeSubmenuSide("start", rect, b)).toBe("top");
  });

  it("opens reasoning submenu downward when narrow but row is mid-screen", () => {
    mockViewport(320, 760);
    const rect = { left: 8, right: 312, top: 400, bottom: 420, width: 304, height: 20, x: 8, y: 400, toJSON: () => ({}) };
    expect(computeSubmenuSide("start", rect, bounds(288))).toBe("bottom");
  });

  it("opens reasoning submenu to the left when menu is right-aligned with room on the left", () => {
    mockViewport(520);
    const rect = { left: 360, right: 512, top: 600, bottom: 620, width: 152, height: 20, x: 360, y: 600, toJSON: () => ({}) };
    expect(computeSubmenuSide("end", rect, bounds(488))).toBe("left");
  });

  it("resolveMenuBounds intersects overflow-hidden ancestors", () => {
    mockViewport(1200);
    const outer = document.createElement("div");
    outer.style.overflow = "hidden";
    Object.defineProperty(outer, "getBoundingClientRect", {
      value: () => ({ left: 900, right: 1180, top: 0, bottom: 800, width: 280, height: 800, x: 900, y: 0, toJSON: () => ({}) }),
    });
    const trigger = document.createElement("button");
    outer.appendChild(trigger);
    document.body.appendChild(outer);

    const resolved = resolveMenuBounds(trigger);
    expect(resolved.left).toBeGreaterThanOrEqual(900 + 16);
    expect(resolved.right).toBeLessThanOrEqual(1180 - 16);
    expect(resolved.width).toBeLessThan(400);

    document.body.removeChild(outer);
  });
});
