import { describe, expect, it } from "vitest";
import { restoreViewportAnchor, type ViewportAnchorCapture } from "../../src/renderer/lib/chat/preserve-viewport-anchor";

describe("restoreViewportAnchor", () => {
  it("keeps the toggle at the same viewport Y after expand/collapse (delta only)", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 800 });

    let scrollTop = 1078;
    const scrollHeight = 3600;
    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });
    Object.defineProperty(container, "scrollHeight", {
      get: () => scrollHeight,
    });

    const turn = document.createElement("section");
    const button = document.createElement("button");
    turn.appendChild(button);
    container.appendChild(turn);

    container.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });
    turn.getBoundingClientRect = () => ({ top: 315.5, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });

    const captured: ViewportAnchorCapture = {
      container,
      topBefore: 421.5,
      scrollBefore: 1078,
    };

    button.getBoundingClientRect = () => ({ top: 421.5, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });

    restoreViewportAnchor(captured, button);

    expect(scrollTop).toBe(1078);
  });

  it("adjusts scroll when collapse shifts the toggle upward in the viewport", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 800 });

    let scrollTop = 4800;
    const scrollHeight = 5500;
    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });
    Object.defineProperty(container, "scrollHeight", {
      get: () => scrollHeight,
    });

    const turn = document.createElement("section");
    const button = document.createElement("button");
    turn.appendChild(button);
    container.appendChild(turn);

    container.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });
    turn.getBoundingClientRect = () => ({ top: 200, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });

    const captured: ViewportAnchorCapture = {
      container,
      topBefore: 150,
      scrollBefore: 6000,
    };

    button.getBoundingClientRect = () => ({ top: 250, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });

    restoreViewportAnchor(captured, button);

    expect(scrollTop).toBe(4700);
  });
});
