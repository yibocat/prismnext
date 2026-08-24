import { describe, it, expect } from "vitest";
import {
  bibliographicToPaperPatch,
  bibliographicToCslJson,
  formatCslPageRange,
  normalizeCslPageRange,
  reconstructInvertedAbstract,
} from "../../src/shared/bibliographic-metadata/helpers";
import { mergeBibliographicMetadata } from "../../src/shared/bibliographic-metadata/sources/resolver-helpers";
import { pickCrossrefPage, pickCrossrefVenue } from "../../src/shared/bibliographic-metadata/crossref-parse";
import { SOURCE_REGISTRY, listSources } from "../../src/main/literature/catalog";
import { dblpSource } from "../../src/main/literature/catalog/sources/dblp";

describe("bibliographic-metadata helpers", () => {
  it("reconstructs OpenAlex inverted abstract", () => {
    expect(reconstructInvertedAbstract({ Hello: [0], world: [1] })).toBe("Hello world");
  });

  it("maps metadata to paper patch", () => {
    const patch = bibliographicToPaperPatch({
      title: "Test",
      authors: null,
      year: 2024,
      abstract: "Abs",
      doi: "10.1/test",
      arxiv_id: null,
      venue: "Nature",
      type: "article",
      source: "openalex",
    });
    expect(patch.source).toBe("openalex");
    expect(patch.venue).toBe("Nature");
  });
});

describe("pickCrossrefVenue", () => {
  it("reads container-title from Crossref payload", () => {
    expect(
      pickCrossrefVenue({
        "container-title": ["Artificial Intelligence"],
        container: [],
      }),
    ).toBe("Artificial Intelligence");
  });

  it("falls back to event name for proceedings", () => {
    expect(pickCrossrefVenue({ event: { name: "NeurIPS" } })).toBe("NeurIPS");
  });

  it("normalizes Crossref page ranges to CSL page", () => {
    expect(pickCrossrefPage({ page: "123-456" })).toBe("123--456");
  });
});

describe("page helpers", () => {
  it("normalizes hyphenated page ranges", () => {
    expect(normalizeCslPageRange("1-12")).toBe("1--12");
    expect(normalizeCslPageRange("e12345")).toBe("e12345");
  });

  it("formats first/last page into CSL page", () => {
    expect(formatCslPageRange("1", "12")).toBe("1--12");
    expect(formatCslPageRange("5", "5")).toBe("5");
  });
});

describe("mergeBibliographicMetadata", () => {
  const base = {
    title: "Paper",
    authors: null,
    abstract: null,
    year: 2020,
    doi: "10.1/test",
    arxiv_id: null,
    venue: null,
    type: "article",
    source: "crossref" as const,
  };

  it("fills venue from supplemental provider", () => {
    const merged = mergeBibliographicMetadata(base, {
      ...base,
      venue: "IEEE TPAMI",
      source: "openalex",
    });
    expect(merged.venue).toBe("IEEE TPAMI");
    expect(merged.source).toBe("crossref");
  });

  it("prefers real journal over arXiv placeholder", () => {
    const merged = mergeBibliographicMetadata(
      { ...base, venue: "arXiv", source: "arxiv" },
      { ...base, venue: "Nature", source: "openalex" },
    );
    expect(merged.venue).toBe("Nature");
  });

  it("prefers longer title when merging", () => {
    const merged = mergeBibliographicMetadata(
      { ...base, title: "Short", source: "crossref" },
      { ...base, title: "A much longer accurate title", source: "openalex" },
    );
    expect(merged.title).toBe("A much longer accurate title");
  });

  it("prefers longer abstract when merging", () => {
    const merged = mergeBibliographicMetadata(
      { ...base, abstract: "Short.", source: "crossref" },
      { ...base, abstract: "A much longer abstract from another catalog.", source: "semantic-scholar" },
    );
    expect(merged.abstract).toBe("A much longer abstract from another catalog.");
  });

  it("fills pdfUrl from supplemental provider", () => {
    const merged = mergeBibliographicMetadata(base, {
      ...base,
      pdfUrl: "https://example.org/paper.pdf",
      source: "openalex",
    });
    expect(merged.pdfUrl).toBe("https://example.org/paper.pdf");
  });

  it("fills volume and page from supplemental provider", () => {
    const merged = mergeBibliographicMetadata(base, {
      ...base,
      volume: "42",
      page: "1--12",
      source: "semantic-scholar",
    });
    expect(merged.volume).toBe("42");
    expect(merged.page).toBe("1--12");
  });

  it("keeps primary volume when already set", () => {
    const merged = mergeBibliographicMetadata(
      { ...base, volume: "10", source: "crossref" },
      { ...base, volume: "99", source: "openalex" },
    );
    expect(merged.volume).toBe("10");
  });
});

describe("source registry", () => {
  it("includes DBLP for CS/AI conference coverage", () => {
    const ids = SOURCE_REGISTRY.map((s) => s.id);
    expect(ids).toContain("dblp");
    expect(ids).toContain("crossref");
    expect(ids).toContain("semantic-scholar");
    expect(ids).toContain("openalex");
    expect(ids).toContain("arxiv");
  });

  it("sources are ordered by priority", () => {
    const priorities = SOURCE_REGISTRY.map((s) => s.priority);
    const sorted = [...priorities].sort((a, b) => a - b);
    expect(priorities).toEqual(sorted);
  });

  it("listSources exposes id/label/enabled", () => {
    const list = listSources();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty("id");
    expect(list[0]).toHaveProperty("label");
    expect(list[0]).toHaveProperty("enabled");
  });

  it("DBLP supports DOI and title lookup", () => {
    expect(dblpSource.supports.doi).toBe(true);
    expect(dblpSource.supports.title).toBe(true);
    expect(dblpSource.priority).toBeLessThan(semanticScholarPriority());
  });
});

function semanticScholarPriority(): number {
  const s = SOURCE_REGISTRY.find((s) => s.id === "semantic-scholar");
  if (!s) throw new Error("semantic-scholar not in registry");
  return s.priority;
}
