import { describe, expect, it } from "vitest";
import {
  isOpaqueBibkey,
  patchRawBibtexKey,
  resolveIncomingBibkey,
  resolveStoredBibkey,
  suggestBibkey,
} from "../../src/shared/bibkey-utils";

describe("isOpaqueBibkey", () => {
  it("flags Zotero random keys", () => {
    expect(isOpaqueBibkey("N98JPVKU")).toBe(true);
    expect(isOpaqueBibkey("ABCD1234")).toBe(true);
    expect(isOpaqueBibkey("abcdef12")).toBe(true);
  });

  it("accepts readable author-year keys", () => {
    expect(isOpaqueBibkey("vaswani2017attention")).toBe(false);
    expect(isOpaqueBibkey("smith_2024")).toBe(false);
    expect(isOpaqueBibkey("li2023graph")).toBe(false);
  });
});

describe("suggestBibkey", () => {
  it("builds author + year + title word", () => {
    const authors = JSON.stringify([{ family: "Vaswani", given: "Ashish" }]);
    expect(suggestBibkey("Attention Is All You Need", 2017, authors)).toBe("vaswani2017attention");
  });

  it("falls back to title slug when authors missing", () => {
    expect(suggestBibkey("Deep Learning Survey", 2024, null)).toBe("deep_learning_survey_2024");
  });
});

describe("resolveIncomingBibkey", () => {
  it("keeps readable incoming keys", () => {
    expect(resolveIncomingBibkey("vaswani2017attention", "Attention", 2017, null)).toBe(
      "vaswani2017attention",
    );
  });

  it("replaces opaque incoming keys", () => {
    const authors = JSON.stringify([{ family: "Smith", given: "John" }]);
    expect(resolveIncomingBibkey("N98JPVKU", "Graph Networks", 2023, authors)).toBe(
      "smith2023graph",
    );
  });
});

describe("resolveStoredBibkey", () => {
  it("preserves existing readable bibkey", () => {
    expect(
      resolveStoredBibkey("myCustomKey", "N98JPVKU", "Title", 2020, null),
    ).toBe("myCustomKey");
  });

  it("upgrades opaque stored bibkey", () => {
    expect(resolveStoredBibkey("N98JPVKU", "N98JPVKU", "Graph Networks", 2023, null)).toBe(
      "graph_networks_2023",
    );
  });
});

describe("patchRawBibtexKey", () => {
  it("rewrites the entry header cite key", () => {
    const raw = `@article{N98JPVKU,\n  title={Test}\n}`;
    expect(patchRawBibtexKey(raw, "smith2023graph")).toBe(
      `@article{smith2023graph,\n  title={Test}\n}`,
    );
  });
});
