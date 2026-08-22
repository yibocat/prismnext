import { describe, it, expect } from "vitest";
import {
  parseAuthorsInput,
  formatLiteratureAuthors,
  formatLiteratureAuthorsShort,
  formatLiteratureListDate,
  formatEntryType,
  formatPaperProvenance,
  paperHasReadablePdf,
  sortLiteraturePapers,
} from "../../src/renderer/lib/literature/literature-format";
import type { LiteraturePaper } from "../../src/renderer/types/electron.d";

describe("literature-format", () => {
  it("parses comma-separated authors into JSON", () => {
    const json = parseAuthorsInput("John Smith, Jane Doe");
    expect(json).toBeTruthy();
    const parsed = JSON.parse(json!);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].family).toBe("Smith");
    expect(parsed[0].given).toBe("John");
  });

  it("formats authors JSON for display", () => {
    const json = parseAuthorsInput("Ada Lovelace, Charles Babbage");
    expect(formatLiteratureAuthors(json)).toBe("Ada Lovelace, Charles Babbage");
  });

  it("formats short author list for table column", () => {
    const one = parseAuthorsInput("Ada Lovelace");
    expect(formatLiteratureAuthorsShort(one)).toBe("Ada Lovelace");

    const two = parseAuthorsInput("Ada Lovelace, Charles Babbage");
    expect(formatLiteratureAuthorsShort(two)).toBe("Ada Lovelace and Charles Babbage");

    const three = parseAuthorsInput("Ada Lovelace, Charles Babbage, Alan Turing");
    expect(formatLiteratureAuthorsShort(three)).toBe("Ada Lovelace et al.");
  });

  it("sorts by year descending by default helper", () => {
    const sorted = sortLiteraturePapers(
      [
        { id: "a", bibkey: "a", title: "A", year: 2020 } as never,
        { id: "b", bibkey: "b", title: "B", year: 2024 } as never,
      ],
      "year",
      "desc",
    );
    expect(sorted[0].year).toBe(2024);
  });

  it("sorts by updated_at with title tie-break", () => {
    const sorted = sortLiteraturePapers(
      [
        { id: "a", bibkey: "a", title: "B", updated_at: 100 } as never,
        { id: "b", bibkey: "b", title: "A", updated_at: 200 } as never,
      ],
      "updated_at",
      "desc",
    );
    expect(sorted[0].id).toBe("b");
  });

  it("formats list dates as YYYY-MM-DD", () => {
    expect(formatLiteratureListDate(0)).toBe("—");
    expect(formatLiteratureListDate(undefined)).toBe("—");
    expect(formatLiteratureListDate(new Date(2024, 6, 2).getTime())).toBe("2024-07-02");
  });

  it("formats entry type labels", () => {
    expect(formatEntryType("inproceedings")).toBe("Conference paper");
    expect(formatEntryType("unknown-type")).toBe("unknown-type");
    expect(formatEntryType(null)).toBeNull();
  });

  it("formats paper provenance from origin and metadata source", () => {
    const local: LiteraturePaper = {
      id: "1",
      bibkey: "a",
      title: "T",
      authors: null,
      year: null,
      abstract: null,
      doi: null,
      arxiv_id: null,
      isbn: null,
      venue: null,
      type: null,
      pdf_path: null,
      pdf_sha: null,
      origin: "doi",
      metadata_source: "crossref",
      csl_json: null,
      source: null,
      raw_bibtex: null,
      tags: [],
      created_at: 0,
      updated_at: 0,
    };
    expect(formatPaperProvenance(local)).toEqual({
      primary: "Added by DOI",
      secondary: "Enriched from Crossref",
    });

    const zotero = { ...local, origin: "zotero", zotero_key: "ABC12345" };
    expect(formatPaperProvenance(zotero).primary).toBe("Zotero");
  });

  it("paperHasReadablePdf accepts local path or zotero key", () => {
    expect(
      paperHasReadablePdf({
        id: "1",
        bibkey: "a",
        title: "T",
        pdf_path: "attachments/x.pdf",
        zotero_key: null,
      } as never),
    ).toBe(true);
    expect(
      paperHasReadablePdf({
        id: "2",
        bibkey: "b",
        title: "T",
        pdf_path: null,
        zotero_key: "ABC12345",
      } as never),
    ).toBe(true);
    expect(
      paperHasReadablePdf({
        id: "3",
        bibkey: "c",
        title: "T",
        pdf_path: null,
        zotero_key: null,
      } as never),
    ).toBe(false);
  });
});
