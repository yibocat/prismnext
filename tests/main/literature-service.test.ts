import { describe, it, expect } from "vitest";
import { parseBibTeX, authorsFromBibField, patchCslJsonBibkey } from "../../src/main/lib/bibtex-parse";

describe("bibtex-parse (via Citation.js)", () => {
  it("parses a simple article entry", () => {
    const entries = parseBibTeX(`
@article{smith2024,
  author = {Smith, John and Doe, Jane},
  title = {A Great Paper},
  year = {2024},
  doi = {10.1000/test}
}
`);
    expect(entries).toHaveLength(1);
    expect(entries[0].citekey).toBe("smith2024");
    expect(entries[0].fields.title).toBe("A Great Paper");
    expect(entries[0].fields.year).toBe("2024");
    expect(entries[0].fields.doi).toBe("10.1000/test");
  });

  it("parses multiple entries with CSL-normalized types", () => {
    const entries = parseBibTeX(`
@article{a2020, title={A}, year={2020}}
@inproceedings{b2021, title={B}, year={2021}}
`);
    expect(entries).toHaveLength(2);
    expect(entries[1].entryType).toBe("inproceedings");
  });

  it("converts author field to JSON", () => {
    const json = authorsFromBibField("Smith, John and Doe, Jane");
    expect(json).toBeTruthy();
    const parsed = JSON.parse(json!);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].family).toBe("Smith");
    expect(parsed[0].given).toBe("John");
  });

  it("handles @string macros and crossref (Citation.js handles these)", () => {
    const entries = parseBibTeX(`
@string{jch = {Journal of Cool Hacks}}
@article{macro2024, title={T}, journal=jch, year={2024}}
`);
    expect(entries).toHaveLength(1);
    expect(entries[0].citekey).toBe("macro2024");
  });

  it("captures volume/pages in cslJson from BibTeX", () => {
    const entries = parseBibTeX(`
@article{vol2024,
  title = {Volume Paper},
  author = {Smith, John},
  journal = {Nature},
  year = {2024},
  volume = {521},
  number = {7553},
  pages = {436-444}
}
`);
    expect(entries).toHaveLength(1);
    const csl = JSON.parse(entries[0].cslJson) as Record<string, unknown>;
    expect(csl.volume).toBe("521");
    expect(csl.issue).toBe("7553");
    expect(csl.page).toBeTruthy();
    expect(entries[0].fields.volume).toBe("521");
    expect(entries[0].fields.pages).toBeTruthy();
  });

  it("patches cslJson bibkey id", () => {
    const next = patchCslJsonBibkey('{"id":"old","title":"T"}', "newkey");
    expect(JSON.parse(next).id).toBe("newkey");
  });
});
