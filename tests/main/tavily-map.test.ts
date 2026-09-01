import { describe, expect, it } from "vitest";
import {
  FETCH_CONTENT_MAX,
  SEARCH_SNIPPET_MAX,
  mapExtractContent,
  mapSearchResults,
  validateFetchUrl,
} from "../../src/main/lib/tavily/map";
import { mapTavilyError } from "../../src/main/lib/tavily/errors";

describe("validateFetchUrl", () => {
  it("allows public https URLs", () => {
    const result = validateFetchUrl("https://example.com/docs");
    expect(result).toEqual({ ok: true, url: "https://example.com/docs" });
  });

  it("rejects localhost and loopback", () => {
    expect(validateFetchUrl("http://127.0.0.1/secret").ok).toBe(false);
    expect(validateFetchUrl("http://localhost:8080").ok).toBe(false);
  });

  it("rejects non-http schemes", () => {
    const result = validateFetchUrl("file:///etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_url");
  });
});

describe("mapSearchResults", () => {
  it("maps Tavily search JSON to title/url/snippet and caps snippet length", () => {
    const long = "x".repeat(SEARCH_SNIPPET_MAX + 80);
    const mapped = mapSearchResults("tavily pricing", {
      results: [
        { title: "Pricing", url: "https://tavily.com/pricing", content: long, score: 0.91 },
        { title: "Docs", url: "https://docs.tavily.com", content: "Search and extract APIs." },
      ],
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.query).toBe("tavily pricing");
    expect(mapped.provider).toBe("tavily");
    expect(mapped.answer).toBeNull();
    expect(mapped.results).toHaveLength(2);
    expect(mapped.results[0]?.snippet).toHaveLength(SEARCH_SNIPPET_MAX);
    expect(mapped.results[1]).toMatchObject({
      title: "Docs",
      url: "https://docs.tavily.com",
      snippet: "Search and extract APIs.",
    });
  });
});

describe("mapExtractContent", () => {
  it("marks oversize extract bodies as truncated", () => {
    const huge = "a".repeat(FETCH_CONTENT_MAX + 4_000);
    const mapped = mapExtractContent("https://example.com/paper", "markdown", {
      results: [{ url: "https://example.com/paper", rawContent: huge }],
      failedResults: [],
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.truncated).toBe(true);
    expect(mapped.contentLength).toBe(FETCH_CONTENT_MAX);
    expect(mapped.content.includes("[...content trimmed...]")).toBe(true);
    expect(mapped.format).toBe("markdown");
  });
});

describe("mapTavilyError", () => {
  it("maps 401 / 429 / 432 to product error codes", () => {
    expect(mapTavilyError({ status: 401, message: "Unauthorized" }).error).toBe("tavily_unauthorized");
    expect(mapTavilyError({ status: 429, message: "Too many requests" }).error).toBe("tavily_rate_limit");
    expect(mapTavilyError({ status: 432, message: "plan limit" }).error).toBe("tavily_quota");
  });
});
