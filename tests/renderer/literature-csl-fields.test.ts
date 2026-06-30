import { describe, it, expect } from "vitest";
import {
  cslFieldsForEntryType,
  formatCslPageDisplay,
  parseCslJson,
  publicationDetailRows,
} from "../../src/renderer/modes/literature-mode/literature-csl-fields";
import type { LiteraturePaper } from "../../src/renderer/types/electron.d";

function paper(overrides: Partial<LiteraturePaper> = {}): LiteraturePaper {
  return {
    id: "p1",
    bibkey: "smith2024",
    title: "Test Paper",
    authors: null,
    year: 2024,
    abstract: null,
    doi: null,
    arxiv_id: null,
    isbn: null,
    venue: "Nature",
    type: "article",
    pdf_path: null,
    pdf_sha: null,
    origin: "manual",
    metadata_source: null,
    csl_json: null,
    source: null,
    raw_bibtex: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("literature-csl-fields", () => {
  it("parseCslJson extracts extended publication fields", () => {
    const csl = parseCslJson(
      JSON.stringify({
        type: "article-journal",
        volume: "521",
        issue: "7553",
        page: "436--444",
        publisher: "Nature Publishing Group",
        "container-title-short": "Nature",
      }),
    );
    expect(csl?.volume).toBe("521");
    expect(csl?.issue).toBe("7553");
    expect(csl?.page).toBe("436--444");
    expect(csl?.publisher).toBe("Nature Publishing Group");
    expect(csl?.containerTitleShort).toBe("Nature");
  });

  it("formatCslPageDisplay uses en dash", () => {
    expect(formatCslPageDisplay("436--444")).toBe("436–444");
    expect(formatCslPageDisplay("e12345")).toBe("e12345");
  });

  it("cslFieldsForEntryType orders journal vs conference fields", () => {
    const journal = cslFieldsForEntryType("article");
    expect(journal.map((f) => f.key)).toEqual([
      "volume",
      "issue",
      "page",
      "publisher",
      "containerTitleShort",
    ]);

    const conf = cslFieldsForEntryType("inproceedings");
    expect(conf.map((f) => f.key)).toContain("event");
    expect(conf.map((f) => f.key)).toContain("containerTitle");
  });

  it("publicationDetailRows hides empty fields and venue duplicates", () => {
    const rows = publicationDetailRows(
      paper({
        venue: "Nature",
        csl_json: JSON.stringify({
          volume: "521",
          issue: "7553",
          page: "1--12",
          publisher: "Nature Publishing Group",
          "container-title-short": "Nature",
        }),
      }),
    );
    expect(rows.map((r) => r.label)).toEqual(["Volume", "Issue", "Pages", "Publisher"]);
    expect(rows.find((r) => r.label === "Pages")?.value).toBe("1–12");
  });

  it("publicationDetailRows returns empty when csl_json is missing", () => {
    expect(publicationDetailRows(paper())).toEqual([]);
  });

  it("publicationDetailRows includes URL link for generic entries", () => {
    const rows = publicationDetailRows(
      paper({
        type: "misc",
        csl_json: JSON.stringify({ URL: "https://example.org/paper" }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.href).toBe("https://example.org/paper");
  });
});
