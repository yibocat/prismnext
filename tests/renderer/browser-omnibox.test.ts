import { describe, expect, it } from "vitest";
import {
  canonicalizeOmniboxUrl,
  matchOmniboxSuggestions,
  pickOmniboxNavigation,
  webviewOmniboxClipPath,
} from "../../src/renderer/lib/browser/omnibox";

const bookmarks = [
  { id: "seed-1", title: "Google Scholar", url: "https://scholar.google.com" },
  { id: "seed-2", title: "arXiv", url: "https://arxiv.org" },
  { id: "seed-3", title: "Semantic Scholar", url: "https://www.semanticscholar.org" },
];

const recentVisits = [
  { title: "Sign in to GitHub", url: "https://github.com/login" },
  { title: "How to sandbox AI agents", url: "https://example.com/sandbox" },
  { title: "Google Scholar", url: "https://scholar.google.com/" },
];

describe("canonicalizeOmniboxUrl", () => {
  it("strips www, hash, and a trailing slash", () => {
    expect(canonicalizeOmniboxUrl("https://www.scholar.google.com/#top")).toBe(
      "https://scholar.google.com",
    );
  });
});

describe("matchOmniboxSuggestions", () => {
  it("lists recent visits then leftover bookmarks when the query is empty", () => {
    const rows = matchOmniboxSuggestions({
      query: "",
      bookmarks,
      recentVisits,
      searchEngineId: "google",
    });
    expect(rows[0]?.kind).toBe("history");
    expect(rows[0]?.url).toBe("https://github.com/login");
    expect(rows.some((row) => row.kind === "bookmark" && row.title === "arXiv")).toBe(true);
    expect(rows.filter((row) => canonicalizeOmniboxUrl(row.url) === "https://scholar.google.com")).toHaveLength(1);
    expect(rows.some((row) => row.kind === "search")).toBe(false);
  });

  it("matches bookmarks and history by title or host", () => {
    const rows = matchOmniboxSuggestions({
      query: "s",
      bookmarks,
      recentVisits,
      searchEngineId: "google",
    });
    expect(rows.some((row) => row.title === "Google Scholar")).toBe(true);
    expect(rows.some((row) => row.title === "Semantic Scholar")).toBe(true);
    expect(rows.some((row) => row.title === "How to sandbox AI agents")).toBe(true);
    expect(rows.some((row) => row.kind === "search" && row.title === "s")).toBe(true);
  });

  it("prefers the bookmark when history visited the same URL", () => {
    const rows = matchOmniboxSuggestions({
      query: "scholar",
      bookmarks,
      recentVisits,
      searchEngineId: "duckduckgo",
    });
    const scholar = rows.filter((row) => canonicalizeOmniboxUrl(row.url) === "https://scholar.google.com");
    expect(scholar).toHaveLength(1);
    expect(scholar[0]?.kind).toBe("bookmark");
  });

  it("adds a go-to row when the input looks like a URL", () => {
    const rows = matchOmniboxSuggestions({
      query: "arxiv.org",
      bookmarks,
      recentVisits,
      searchEngineId: "duckduckgo",
    });
    expect(rows[0]).toMatchObject({
      kind: "url",
      url: "https://arxiv.org",
    });
    expect(rows.some((row) => row.kind === "search")).toBe(true);
  });

  it("builds a search URL for a plain query", () => {
    const rows = matchOmniboxSuggestions({
      query: "attention is all you need",
      bookmarks: [],
      recentVisits: [],
      searchEngineId: "google",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("search");
    expect(rows[0]?.url).toContain("google.com/search");
    expect(rows[0]?.url).toContain("attention");
  });
});

describe("webviewOmniboxClipPath", () => {
  it("cuts a hole under the address bar", () => {
    const clip = webviewOmniboxClipPath(
      { left: 100, top: 80, width: 800, height: 600 },
      { left: 220, bottom: 80, width: 360 },
      200,
    );
    expect(clip).toContain("evenodd");
    expect(clip).toContain("120px 4px");
    expect(clip).toContain("480px 204px");
  });

  it("returns null when the hole misses the guest", () => {
    expect(
      webviewOmniboxClipPath(
        { left: 0, top: 200, width: 400, height: 200 },
        { left: 0, bottom: 40, width: 200 },
        80,
      ),
    ).toBeNull();
  });
});

describe("pickOmniboxNavigation", () => {
  it("uses the highlighted suggestion, or the typed query when none exist", () => {
    const rows = matchOmniboxSuggestions({
      query: "arxiv",
      bookmarks,
      recentVisits: [],
      searchEngineId: "duckduckgo",
    });
    expect(pickOmniboxNavigation("arxiv", rows, 0)).toBe(rows[0]?.url);
    expect(pickOmniboxNavigation("https://arxiv.org", rows, -1)).toBe("https://arxiv.org");
    expect(pickOmniboxNavigation("arxiv", [], 0)).toBe("arxiv");
  });
});
