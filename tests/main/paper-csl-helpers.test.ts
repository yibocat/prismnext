import { describe, expect, it } from "vitest";
import {
  cslEntryFromPaperRow,
  publicationDetailsFromPaperRow,
} from "../../src/shared/bibliographic-metadata/helpers";

const baseRow = {
  bibkey: "smith2020",
  title: "Deep Learning",
  authors: '[{"family":"Smith","given":"John"}]',
  year: 2020,
  doi: "10.1234/example",
  venue: "Nature",
  type: "article",
  abstract: "An overview.",
  csl_json: JSON.stringify({
    type: "article-journal",
    volume: "5",
    issue: "3",
    page: "1--12",
    publisher: "Springer Nature",
    "container-title-short": "Nature",
  }),
};

describe("cslEntryFromPaperRow", () => {
  it("merges stored csl_json with flat columns", () => {
    const entry = cslEntryFromPaperRow(baseRow);
    expect(entry.id).toBe("smith2020");
    expect(entry.volume).toBe("5");
    expect(entry.issue).toBe("3");
    expect(entry.page).toBe("1--12");
    expect(entry.publisher).toBe("Springer Nature");
    expect(entry["container-title"]).toBe("Nature");
    expect(entry.title).toBe("Deep Learning");
  });

  it("falls back to flat columns when csl_json is empty", () => {
    const entry = cslEntryFromPaperRow({ ...baseRow, csl_json: null });
    expect(entry.title).toBe("Deep Learning");
    expect(entry["container-title"]).toBe("Nature");
    expect(entry.DOI).toBe("10.1234/example");
    expect(entry.volume).toBeUndefined();
  });
});

describe("publicationDetailsFromPaperRow", () => {
  it("returns structured publication fields", () => {
    const details = publicationDetailsFromPaperRow(baseRow);
    expect(details).toEqual({
      volume: "5",
      issue: "3",
      pages: "1–12",
      publisher: "Springer Nature",
    });
  });

  it("returns null when no extended fields exist", () => {
    expect(publicationDetailsFromPaperRow({ ...baseRow, csl_json: null })).toBeNull();
  });
});
