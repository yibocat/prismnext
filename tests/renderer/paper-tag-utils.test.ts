import { describe, expect, it } from "vitest";
import {
  collectProjectTags,
  collectTagSuggestions,
  filterTagsByQuery,
  paperMatchesTagFilter,
  sortTagEntriesByUsage,
} from "../../src/renderer/lib/literature/paper-tag-utils";

describe("paper-tag-utils", () => {
  const papers = [
    { tags: ["Survey", "LLM"] },
    { tags: ["survey", "Writing"] },
    { tags: [] },
  ];

  it("collects project tags with counts, sorted by usage", () => {
    expect(collectProjectTags(papers)).toEqual([
      { tag: "Survey", count: 2 },
      { tag: "LLM", count: 1 },
      { tag: "Writing", count: 1 },
    ]);
  });

  it("filters suggestions and papers by canonical tag key", () => {
    expect(collectTagSuggestions(papers, ["LLM"])).toEqual([
      { tag: "Survey", count: 2 },
      { tag: "Writing", count: 1 },
    ]);
    expect(paperMatchesTagFilter({ tags: ["Survey"] }, "survey")).toBe(true);
    expect(paperMatchesTagFilter({ tags: ["1-test"] }, "1 test")).toBe(true);
    expect(paperMatchesTagFilter({ tags: ["Other"] }, "survey")).toBe(false);
  });

  it("sorts tag entries by usage then name", () => {
    expect(
      sortTagEntriesByUsage([
        { tag: "Writing", count: 1 },
        { tag: "Survey", count: 2 },
        { tag: "LLM", count: 1 },
      ]),
    ).toEqual([
      { tag: "Survey", count: 2 },
      { tag: "LLM", count: 1 },
      { tag: "Writing", count: 1 },
    ]);
  });

  it("filters tag query for autocomplete without a hard cap", () => {
    const entries = [
      { tag: "112", count: 1 },
      { tag: "123", count: 2 },
      { tag: "345", count: 1 },
    ];
    expect(filterTagsByQuery(entries, "12")).toEqual([
      { tag: "123", count: 2 },
      { tag: "112", count: 1 },
    ]);
    expect(filterTagsByQuery(entries, "345")).toEqual([{ tag: "345", count: 1 }]);
    expect(filterTagsByQuery(entries, "")).toEqual(entries.slice().sort((a, b) => b.count - a.count));
  });
});
