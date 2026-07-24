/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/workspace/left-nav", () => ({ pressLeftNav: vi.fn() }));
vi.mock("@/lib/workspace/left-sidebar-panel", () => ({ toggleLeftSidebarPanel: vi.fn() }));
vi.mock("@/lib/workspace/right-area-layout", () => ({ openRightArea: vi.fn(), closeRightArea: vi.fn() }));

import { fuzzyMatch } from "@/lib/search/fuzzy";
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
} from "@/lib/search/history";
import { CommandPalette } from "@/components/modules/shared/command-palette";

describe("fuzzyMatch", () => {
  it("empty query matches all", () => {
    expect(fuzzyMatch("", "anything")).toBe(true);
  });
  it("substring match", () => {
    expect(fuzzyMatch("intro", "intro.tex")).toBe(true);
  });
  it("subsequence match", () => {
    expect(fuzzyMatch("itx", "intro.tex")).toBe(true);
  });
  it("case insensitive", () => {
    expect(fuzzyMatch("INTRO", "intro.tex")).toBe(true);
  });
  it("no match returns false", () => {
    expect(fuzzyMatch("xyz", "intro.tex")).toBe(false);
  });
  it("order matters (not an anagram match)", () => {
    expect(fuzzyMatch("texintro", "intro.tex")).toBe(false);
  });
});

describe("search history", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds and retrieves history in most-recent-first order", () => {
    addSearchHistory("/proj", "intro");
    addSearchHistory("/proj", "method");
    const list = getSearchHistory("/proj");
    expect(list.map((h) => h.query)).toEqual(["method", "intro"]);
  });

  it("moves a duplicate query to the front", () => {
    addSearchHistory("/proj", "a");
    addSearchHistory("/proj", "b");
    addSearchHistory("/proj", "a");
    const list = getSearchHistory("/proj");
    expect(list.map((h) => h.query)).toEqual(["a", "b"]);
  });

  it("ignores empty / whitespace queries", () => {
    addSearchHistory("/proj", "  ");
    addSearchHistory("/proj", "");
    expect(getSearchHistory("/proj")).toEqual([]);
  });

  it("is scoped per project", () => {
    addSearchHistory("/proj1", "x");
    addSearchHistory("/proj2", "y");
    expect(getSearchHistory("/proj1").map((h) => h.query)).toEqual(["x"]);
    expect(getSearchHistory("/proj2").map((h) => h.query)).toEqual(["y"]);
  });

  it("removes a single entry", () => {
    addSearchHistory("/proj", "a");
    addSearchHistory("/proj", "b");
    removeSearchHistory("/proj", "a");
    expect(getSearchHistory("/proj").map((h) => h.query)).toEqual(["b"]);
  });

  it("clears all entries", () => {
    addSearchHistory("/proj", "a");
    addSearchHistory("/proj", "b");
    clearSearchHistory("/proj");
    expect(getSearchHistory("/proj")).toEqual([]);
  });

  it("caps at 20 entries", () => {
    for (let i = 0; i < 25; i++) addSearchHistory("/proj", `q${i}`);
    const list = getSearchHistory("/proj");
    expect(list).toHaveLength(20);
    expect(list[0].query).toBe("q24");
  });
});

describe("CommandPalette", () => {
  it("exports a renderable component (module graph loads)", () => {
    expect(typeof CommandPalette).toBe("function");
  });
});
