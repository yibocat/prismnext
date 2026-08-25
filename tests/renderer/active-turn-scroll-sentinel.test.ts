import { describe, expect, it } from "vitest";
import {
  captureSentinelScrollAnchor,
  isFollowingStreamTurn,
  pinOrFollowActiveTurn,
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

  it("skips the shrinking turn runway when capturing a sentinel", () => {
    const scroll = document.createElement("div");
    const content = document.createElement("div");
    scroll.appendChild(content);
    document.body.appendChild(scroll);

    const section = document.createElement("section");
    section.setAttribute("data-chat-turn-index", "1");
    const runway = document.createElement("div");
    runway.setAttribute("data-chat-turn-runway", "");
    const stubRect = (
      el: Element,
      rect: () => { top: number; bottom: number; left: number; right: number; width: number; height: number },
    ) => {
      Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: rect });
    };
    stubRect(scroll, () => ({ top: 0, bottom: 200, left: 0, right: 100, width: 100, height: 200 }));
    stubRect(section, () => ({ top: -20, bottom: 80, left: 0, right: 100, width: 100, height: 100 }));
    stubRect(runway, () => ({ top: 80, bottom: 200, left: 0, right: 100, width: 100, height: 120 }));
    content.append(section, runway);

    const anchor = captureSentinelScrollAnchor(scroll, content);
    expect(anchor.sentinel).toBe(section);
    expect(anchor.turnIndex).toBe(1);

    document.body.removeChild(scroll);
  });
});

describe("isFollowingStreamTurn", () => {
  const stubRect = (
    el: Element,
    rect: () => { top: number; bottom: number; left: number; right: number; width: number; height: number },
  ) => {
    Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: rect });
  };

  it("treats a turn pinned to the viewport top as following", () => {
    const container = document.createElement("div");
    const turn = document.createElement("section");
    Object.defineProperty(container, "clientHeight", { value: 400 });
    Object.defineProperty(container, "scrollHeight", { value: 2000 });
    Object.defineProperty(turn, "offsetHeight", { value: 180 });
    container.scrollTop = 500;
    stubRect(container, () => ({ top: 0, bottom: 400, left: 0, right: 100, width: 100, height: 400 }));
    stubRect(turn, () => ({ top: 0, bottom: 180, left: 0, right: 100, width: 100, height: 180 }));
    expect(isFollowingStreamTurn(container, turn)).toBe(true);
  });

  it("does not treat reading the top of an overflowing turn as following", () => {
    const container = document.createElement("div");
    const turn = document.createElement("section");
    Object.defineProperty(container, "clientHeight", { value: 400 });
    Object.defineProperty(container, "scrollHeight", { value: 2000 });
    Object.defineProperty(turn, "offsetHeight", { value: 1200 });
    container.scrollTop = 100;
    stubRect(container, () => ({ top: 0, bottom: 400, left: 0, right: 100, width: 100, height: 400 }));
    stubRect(turn, () => ({ top: 0, bottom: 1200, left: 0, right: 100, width: 100, height: 1200 }));
    expect(isFollowingStreamTurn(container, turn)).toBe(false);
  });

  it("treats the tail of an overflowing turn as following", () => {
    const container = document.createElement("div");
    const turn = document.createElement("section");
    Object.defineProperty(container, "clientHeight", { value: 400 });
    Object.defineProperty(container, "scrollHeight", { value: 2000 });
    Object.defineProperty(turn, "offsetHeight", { value: 1200 });
    container.scrollTop = 900;
    stubRect(container, () => ({ top: 0, bottom: 400, left: 0, right: 100, width: 100, height: 400 }));
    stubRect(turn, () => ({ top: -800, bottom: 400, left: 0, right: 100, width: 100, height: 1200 }));
    expect(isFollowingStreamTurn(container, turn)).toBe(true);
  });

  it("does not treat a turn far below the viewport as following", () => {
    const container = document.createElement("div");
    const turn = document.createElement("section");
    Object.defineProperty(container, "clientHeight", { value: 400 });
    Object.defineProperty(container, "scrollHeight", { value: 2000 });
    Object.defineProperty(turn, "offsetHeight", { value: 180 });
    container.scrollTop = 80;
    stubRect(container, () => ({ top: 0, bottom: 400, left: 0, right: 100, width: 100, height: 400 }));
    stubRect(turn, () => ({ top: 420, bottom: 600, left: 0, right: 100, width: 100, height: 180 }));
    expect(isFollowingStreamTurn(container, turn)).toBe(false);
  });
});

describe("pinOrFollowActiveTurn", () => {
  it("pins a short turn to the top instead of following a missing tail", () => {
    const container = document.createElement("div");
    const turn = document.createElement("section");
    Object.defineProperty(container, "clientHeight", { value: 400 });
    Object.defineProperty(container, "scrollHeight", { value: 900 });
    Object.defineProperty(turn, "offsetHeight", { value: 180 });
    container.scrollTop = 0;
    const stubRect = (
      el: Element,
      rect: () => { top: number; bottom: number; left: number; right: number; width: number; height: number },
    ) => {
      Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: rect });
    };
    stubRect(container, () => ({ top: 0, bottom: 400, left: 0, right: 100, width: 100, height: 400 }));
    stubRect(turn, () => ({ top: 200, bottom: 380, left: 0, right: 100, width: 100, height: 180 }));
    const scrolled: number[] = [];
    container.scrollTo = ((opts: ScrollToOptions | number) => {
      scrolled.push(typeof opts === "number" ? opts : opts.top ?? 0);
    }) as typeof container.scrollTo;
    pinOrFollowActiveTurn(container, turn, false);
    expect(scrolled[0]).toBe(200);
  });
});
