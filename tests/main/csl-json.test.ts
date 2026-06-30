import { describe, it, expect } from "vitest";
import { bibliographicToCslJson } from "../../src/shared/bibliographic-metadata/helpers";

describe("bibliographicToCslJson", () => {
  it("builds CSL-JSON with title, author, year, DOI", () => {
    const csl = JSON.parse(bibliographicToCslJson({
      title: "Attention Is All You Need",
      authors: '[{"family":"Vaswani","given":"Ashish"}]',
      year: 2017,
      abstract: null,
      doi: "10.5555/3295222.3295349",
      arxiv_id: null,
      venue: "NeurIPS",
      type: "paper-conference",
      source: "dblp",
    }));
    expect(csl.title).toBe("Attention Is All You Need");
    expect(csl.author).toHaveLength(1);
    expect(csl.author[0].family).toBe("Vaswani");
    expect(csl.issued["date-parts"]).toEqual([[2017]]);
    expect(csl.DOI).toBe("10.5555/3295222.3295349");
    expect(csl["container-title"]).toBe("NeurIPS");
  });

  it("works with no authors", () => {
    const csl = JSON.parse(bibliographicToCslJson({
      title: "Anon",
      authors: null,
      year: null,
      abstract: null,
      doi: null,
      arxiv_id: null,
      venue: null,
      type: "article",
      source: "crossref",
    }));
    expect(csl.title).toBe("Anon");
    expect(csl.author).toBeUndefined();
    expect(csl.issued).toBeUndefined();
  });

  it("includes extended publication fields", () => {
    const csl = JSON.parse(bibliographicToCslJson({
      title: "Deep Learning",
      authors: '[{"family":"LeCun","given":"Yann"}]',
      year: 2015,
      abstract: null,
      doi: "10.1038/nature14539",
      arxiv_id: null,
      venue: "Nature",
      type: "article-journal",
      source: "crossref",
      volume: "521",
      issue: "7553",
      page: "436--444",
      publisher: "Nature Publishing Group",
      containerTitleShort: "Nature",
    }));
    expect(csl.volume).toBe("521");
    expect(csl.issue).toBe("7553");
    expect(csl.page).toBe("436--444");
    expect(csl.publisher).toBe("Nature Publishing Group");
    expect(csl["container-title-short"]).toBe("Nature");
  });
});
