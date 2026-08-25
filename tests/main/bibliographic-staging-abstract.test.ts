import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasAdequateAbstract,
  mergeBibliographicMetadata,
  STAGING_ABSTRACT_MIN_LENGTH,
} from "../../src/shared/bibliographic-metadata/sources/resolver-helpers";
import { resolveByDoi, resolveByArxiv } from "../../src/main/literature/catalog";

describe("staging abstract enrichment", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("hasAdequateAbstract requires minimum length", () => {
    expect(STAGING_ABSTRACT_MIN_LENGTH).toBeGreaterThan(50);
    expect(hasAdequateAbstract(null)).toBe(false);
    expect(hasAdequateAbstract("short")).toBe(false);
    expect(hasAdequateAbstract("x".repeat(STAGING_ABSTRACT_MIN_LENGTH))).toBe(true);
  });

  it("mergeBibliographicMetadata keeps longer abstract", () => {
    const short = "Brief.";
    const long = "x".repeat(STAGING_ABSTRACT_MIN_LENGTH + 20);
    const merged = mergeBibliographicMetadata(
      {
        title: "Paper",
        authors: null,
        abstract: short,
        year: 2024,
        doi: "10.5555/test",
        arxiv_id: null,
        venue: null,
        type: "article",
        source: "crossref",
      },
      {
        title: "Paper",
        authors: null,
        abstract: long,
        year: 2024,
        doi: "10.5555/test",
        arxiv_id: null,
        venue: null,
        type: "article",
        source: "openalex",
      },
    );
    expect(merged.abstract).toBe(long);
  });

  it("fast DOI resolve skips OpenAlex when Crossref has a short abstract", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.crossref.org")) {
        return new Response(
          JSON.stringify({
            message: {
              title: ["Crossref Title"],
              type: "journal-article",
              abstract: "Too short.",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { metadata, sourcesAttempted } = await resolveByDoi("10.5555/staging.2024", {
      fast: true,
    });
    expect(sourcesAttempted).toEqual(["crossref"]);
    expect(metadata.title).toBe("Crossref Title");
    expect(metadata.abstract).toBe("Too short.");
  });

  it("fast DOI resolve supplements abstract from OpenAlex when Crossref has none", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.crossref.org")) {
        return new Response(
          JSON.stringify({
            message: {
              title: ["Crossref Title"],
              type: "journal-article",
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("openalex.org")) {
        return new Response(
          JSON.stringify({
            title: "OpenAlex Title",
            publication_year: 2023,
            abstract_inverted_index: Object.fromEntries(
              "OpenAlex abstract for staging when Crossref omits abstract entirely."
                .split(/\s+/)
                .map((word, i) => [word, [i]]),
            ),
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { metadata, sourcesAttempted } = await resolveByDoi("10.5555/staging.2024", {
      fast: true,
    });
    expect(sourcesAttempted).toContain("crossref");
    expect(sourcesAttempted).toContain("openalex");
    expect(metadata.abstract).toMatch(/OpenAlex/);
  });

  it("fast arXiv resolve reports attempted source when fetch fails", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as typeof fetch;

    await expect(resolveByArxiv("2604.16592", { fast: true })).rejects.toThrow(
      /tried: arxiv, openalex.*arxiv: fetch failed/s,
    );
  });

  it("fast arXiv resolve uses arXiv summary as abstract", async () => {
    const longSummary = "x".repeat(STAGING_ABSTRACT_MIN_LENGTH + 10);
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("export.arxiv.org")) {
        return new Response(
          `<?xml version="1.0"?>
          <feed>
            <entry>
              <title>ArXiv Paper Title</title>
              <summary>${longSummary}</summary>
              <published>2024-01-01T00:00:00Z</published>
              <author><name>Alice</name></author>
            </entry>
          </feed>`,
          { status: 200, headers: { "Content-Type": "application/xml" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { metadata, sourcesAttempted } = await resolveByArxiv("2401.00001", { fast: true });
    expect(sourcesAttempted).toEqual(["arxiv"]);
    expect(metadata.abstract).toBe(longSummary);
    expect(hasAdequateAbstract(metadata.abstract)).toBe(true);
  });
});
