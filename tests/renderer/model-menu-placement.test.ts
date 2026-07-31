import { describe, expect, it, vi, afterEach } from "vitest";
import {
  computeSubmenuSide,
  estimateContentWidthFromLabels,
  estimateModelMenuWidth,
  estimateModelMenuWidthForBounds,
  MODEL_MENU_MIN_WIDTH,
  MODEL_MENU_MAX_WIDTH,
  MODEL_MENU_ROW_CHROME_PX,
  MODEL_MENU_WIDTH_SLACK_PX,
  modelMenuLeftEdge,
  resolveMenuBounds,
  shouldWrapModelMenuNames,
  placeModelHoverInfoStyle,
  placeModelEditPanelStyle,
  MODEL_INFO_PANEL_WIDTH,
  MODEL_INFO_PANEL_GAP,
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
  it("estimateContentWidthFromLabels grows with the longest label", () => {
    const width = estimateContentWidthFromLabels(
      ["Short", "OpenAI: GPT-5.6 Sol Pro Max"],
      (text) => text.length * 7,
    );
    expect(width).toBe(
      Math.ceil(
        "OpenAI: GPT-5.6 Sol Pro Max".length * 7
          + MODEL_MENU_ROW_CHROME_PX
          + MODEL_MENU_WIDTH_SLACK_PX,
      ),
    );
  });

  it("estimateModelMenuWidthForBounds uses content when room allows", () => {
    expect(estimateModelMenuWidthForBounds(bounds(500), 260)).toBe(260);
    expect(estimateModelMenuWidthForBounds(bounds(500), 180)).toBe(MODEL_MENU_MIN_WIDTH);
  });

  it("estimateModelMenuWidthForBounds respects narrow panel over content", () => {
    expect(estimateModelMenuWidthForBounds(bounds(240), 320)).toBe(240);
  });

  it("estimateModelMenuWidth respects viewport and content", () => {
    mockViewport(400);
    const rect = {
      left: 8,
      right: 392,
      top: 0,
      bottom: 0,
      width: 384,
      height: 0,
      x: 8,
      y: 0,
      toJSON: () => ({}),
    };
    expect(estimateModelMenuWidth(rect, 250)).toBe(250);
    expect(estimateModelMenuWidth(rect, 500)).toBe(
      Math.min(500, 400 - 32, MODEL_MENU_MAX_WIDTH),
    );
  });

  it("wraps names only when content was clamped narrower than needed", () => {
    expect(shouldWrapModelMenuNames(300, 280)).toBe(false);
    expect(shouldWrapModelMenuNames(260, 320)).toBe(true);
    expect(shouldWrapModelMenuNames(272, 272)).toBe(false);
  });

  it("places hover info to the right of the row when there is room", () => {
    const row = {
      left: 40,
      right: 280,
      top: 400,
      bottom: 424,
      width: 240,
      height: 24,
      x: 40,
      y: 400,
      toJSON: () => ({}),
    } as DOMRect;
    const menu = {
      left: 40,
      right: 280,
      top: 200,
      bottom: 520,
      width: 240,
      height: 320,
      x: 40,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect;
    const style = placeModelHoverInfoStyle(row, menu, { width: 900, height: 800 });
    expect(style.left).toBe(row.right + MODEL_INFO_PANEL_GAP);
    expect(style.top).toBe(row.top);
    expect(style.width).toBe(MODEL_INFO_PANEL_WIDTH);
    expect(style.bottom).toBeUndefined();
  });

  it("stacks hover info flush above the menu when narrow", () => {
    const row = {
      left: 16,
      right: 300,
      top: 420,
      bottom: 444,
      width: 284,
      height: 24,
      x: 16,
      y: 420,
      toJSON: () => ({}),
    } as DOMRect;
    const menu = {
      left: 16,
      right: 300,
      top: 280,
      bottom: 560,
      width: 284,
      height: 280,
      x: 16,
      y: 280,
      toJSON: () => ({}),
    } as DOMRect;
    const vh = 800;
    const style = placeModelHoverInfoStyle(row, menu, { width: 320, height: vh });
    expect(style.bottom).toBe(vh - menu.top + MODEL_INFO_PANEL_GAP);
    expect(style.left).toBe(menu.left);
    expect(style.width).toBe(menu.width);
    expect(style.top).toBeUndefined();
  });

  it("stacks edit panel flush above the menu when narrow", () => {
    const row = {
      left: 16,
      right: 300,
      top: 420,
      bottom: 444,
      width: 284,
      height: 24,
      x: 16,
      y: 420,
      toJSON: () => ({}),
    } as DOMRect;
    const menu = {
      left: 16,
      right: 300,
      top: 280,
      bottom: 560,
      width: 284,
      height: 280,
      x: 16,
      y: 280,
      toJSON: () => ({}),
    } as DOMRect;
    const vh = 800;
    const style = placeModelEditPanelStyle(row, menu, { width: 320, height: vh });
    expect(style.bottom).toBe(vh - menu.top + MODEL_INFO_PANEL_GAP);
    expect(style.left).toBe(menu.left);
  });

  it("opens reasoning submenu to the right when there is room", () => {
    mockViewport(900);
    const rect = {
      left: 400,
      right: 520,
      top: 600,
      bottom: 620,
      width: 120,
      height: 20,
      x: 400,
      y: 600,
      toJSON: () => ({}),
    };
    expect(computeSubmenuSide("start", rect, bounds(868), 260)).toBe("right");
  });

  it("opens reasoning submenu upward when narrow and composer sits at bottom", () => {
    mockViewport(320, 760);
    const rect = {
      left: 8,
      right: 312,
      top: 700,
      bottom: 720,
      width: 304,
      height: 20,
      x: 8,
      y: 700,
      toJSON: () => ({}),
    };
    const b = bounds(288);
    expect(modelMenuLeftEdge("start", rect, estimateModelMenuWidthForBounds(b, 260))).toBe(8);
    expect(computeSubmenuSide("start", rect, b, 260)).toBe("top");
  });

  it("opens reasoning submenu downward when narrow but row is mid-screen", () => {
    mockViewport(320, 760);
    const rect = {
      left: 8,
      right: 312,
      top: 400,
      bottom: 420,
      width: 304,
      height: 20,
      x: 8,
      y: 400,
      toJSON: () => ({}),
    };
    expect(computeSubmenuSide("start", rect, bounds(288), 260)).toBe("bottom");
  });

  it("opens reasoning submenu to the left when menu is right-aligned with room on the left", () => {
    mockViewport(520);
    const rect = {
      left: 360,
      right: 512,
      top: 600,
      bottom: 620,
      width: 152,
      height: 20,
      x: 360,
      y: 600,
      toJSON: () => ({}),
    };
    expect(computeSubmenuSide("end", rect, bounds(488), 260)).toBe("left");
  });

  it("resolveMenuBounds intersects overflow-hidden ancestors", () => {
    mockViewport(1200);
    const outer = document.createElement("div");
    outer.style.overflow = "hidden";
    Object.defineProperty(outer, "getBoundingClientRect", {
      value: () => ({
        left: 900,
        right: 1180,
        top: 0,
        bottom: 800,
        width: 280,
        height: 800,
        x: 900,
        y: 0,
        toJSON: () => ({}),
      }),
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
