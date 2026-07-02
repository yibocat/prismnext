import { describe, expect, it } from "vitest";
import {
  clampFloatingMenuPosition,
  pageNumberFromPageEl,
} from "@/lib/literature/literature-block-hit-test";

describe("literature-block-hit-test", () => {
  it("reads page number from nested text layer", () => {
    const page = document.createElement("div");
    page.className = "prism-pdf-page";
    const textLayer = document.createElement("div");
    textLayer.setAttribute("data-page-number", "3");
    page.appendChild(textLayer);
    document.body.appendChild(page);

    expect(pageNumberFromPageEl(page)).toBe(3);
    page.remove();
  });

  it("flips menu above anchor when near bottom edge", () => {
    const anchor = new DOMRect(100, 900, 200, 40);
    const pos = clampFloatingMenuPosition(anchor, 180, 160);
    expect(pos.top).toBeLessThan(anchor.top);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });
});
