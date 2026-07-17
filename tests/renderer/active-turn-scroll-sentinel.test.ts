import { describe, expect, it } from "vitest";
import {
  captureSentinelScrollAnchor,
  restoreSentinelScrollAnchor,
} from "../../src/renderer/lib/chat/active-turn-scroll";

describe("sentinel scroll anchor (contentRoot)", () => {
  it("skips windowing chrome and restores against a turn section node", () => {
    const scroll = document.createElement("div");
    const content = document.createElement("div");
    scroll.appendChild(content);
    document.body.appendChild(scroll);

    const loadMore = document.createElement("div");
    loadMore.setAttribute("data-chat-turn-window-load-more", "");
    const section = document.createElement("section");
    section.setAttribute("data-chat-turn-index", "4");

    let sectionTop = 40;
    const stubRect = (
      el: Element,
      rect: () => { top: number; bottom: number; left: number; right: number; width: number; height: number },
    ) => {
      Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: rect });
    };
    stubRect(loadMore, () => ({ top: -10, bottom: -2, left: 0, right: 0, width: 0, height: 8 }));
    stubRect(section, () => ({
      top: sectionTop,
      bottom: sectionTop + 100,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
    }));
    stubRect(scroll, () => ({ top: 0, bottom: 200, left: 0, right: 100, width: 100, height: 200 }));
    scroll.scrollTop = 80;
    content.append(loadMore, section);

    const anchor = captureSentinelScrollAnchor(scroll, content);
    expect(anchor.sentinel).toBe(section);
    expect(anchor.turnIndex).toBe(4);
    expect(anchor.scrollTop).toBe(80);

    // Simulate prepend: section moves down in the viewport
    sectionTop = 90;
    restoreSentinelScrollAnchor(scroll, anchor, content);
    // offset delta = 90 - 40 = 50; scrollTop should increase by that
    expect(scroll.scrollTop).toBe(80 + (90 - 40));

    document.body.removeChild(scroll);
  });

  it("re-finds sentinel by data-chat-turn-index when the node was remounted", () => {
    const scroll = document.createElement("div");
    const content = document.createElement("div");
    scroll.appendChild(content);
    document.body.appendChild(scroll);

    const oldSection = document.createElement("section");
    oldSection.setAttribute("data-chat-turn-index", "4");
    let sectionTop = 20;
    const stubRect = (
      el: Element,
      rect: () => { top: number; bottom: number; left: number; right: number; width: number; height: number },
    ) => {
      Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: rect });
    };
    stubRect(oldSection, () => ({
      top: sectionTop,
      bottom: sectionTop + 80,
      left: 0,
      right: 100,
      width: 100,
      height: 80,
    }));
    stubRect(scroll, () => ({ top: 0, bottom: 200, left: 0, right: 100, width: 100, height: 200 }));
    scroll.scrollTop = 10;
    content.append(oldSection);

    const anchor = captureSentinelScrollAnchor(scroll, content);
    expect(anchor.turnIndex).toBe(4);

    // Remount: old node gone, new node same index but lower in the viewport
    content.removeChild(oldSection);
    const prepend = document.createElement("section");
    prepend.setAttribute("data-chat-turn-index", "2");
    const newSection = document.createElement("section");
    newSection.setAttribute("data-chat-turn-index", "4");
    stubRect(prepend, () => ({ top: -100, bottom: 20, left: 0, right: 100, width: 100, height: 120 }));
    sectionTop = 100;
    stubRect(newSection, () => ({
      top: sectionTop,
      bottom: sectionTop + 80,
      left: 0,
      right: 100,
      width: 100,
      height: 80,
    }));
    content.append(prepend, newSection);

    restoreSentinelScrollAnchor(scroll, anchor, content);
    expect(scroll.scrollTop).toBe(10 + (100 - 20));

    document.body.removeChild(scroll);
  });
});
