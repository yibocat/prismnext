import { describe, expect, it } from "vitest";
import {
  filterMarkdownByQuery,
  parsePageSpec,
  sliceMarkdownByPages,
  truncateMarkdown,
} from "../../src/shared/paper-extract-slice";

describe("paper-extract-slice", () => {
  const sample = [
    "<!-- page:1 -->",
    "",
    "Introduction on page one.",
    "",
    "<!-- page:2 -->",
    "",
    "Methods on page two with loss function.",
  ].join("\n");

  it("parses page ranges", () => {
    expect(parsePageSpec("1-2", 5)).toEqual([1, 2]);
    expect(parsePageSpec("2", 5)).toEqual([2]);
  });

  it("slices markdown by page markers", () => {
    const out = sliceMarkdownByPages(sample, [2]);
    expect(out).toContain("Methods on page two");
    expect(out).not.toContain("Introduction");
  });

  it("filters by query", () => {
    const out = filterMarkdownByQuery(sample, "loss");
    expect(out).toContain("loss function");
  });

  it("truncates long markdown", () => {
    const long = "x".repeat(30_000);
    const { truncated, text } = truncateMarkdown(long, 100);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThan(long.length);
  });
});
