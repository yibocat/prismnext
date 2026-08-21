import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { bibTeXEntryFromPaperRow, createPaper } from "../../src/main/services/literature-service";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

const roots: string[] = [];

function tempProject(): string {
  const dir = tempLiteratureProject();
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

describe("bibTeXEntryFromPaperRow", () => {
  beforeEach(() => tempProject());

  it("generates BibTeX with volume/pages from csl_json when raw_bibtex is absent", () => {
    const root = roots[roots.length - 1] ?? tempProject();
    const { paper } = createPaper(root, {
      title: "Sample Article",
      authors: '[{"family":"Doe","given":"Jane"}]',
      year: 2021,
      venue: "Journal of Examples",
      type: "article",
      csl_json: JSON.stringify({
        volume: "12",
        issue: "4",
        page: "100--110",
        publisher: "Example Press",
      }),
    });
    const bib = bibTeXEntryFromPaperRow(paper);
    expect(bib).toMatch(new RegExp(`@\\w+\\{${paper.bibkey},`));
    expect(bib).toContain("volume = {12}");
    expect(bib.toLowerCase()).toContain("number = {4}");
    expect(bib).toMatch(/pages = \{100/);
    expect(bib.toLowerCase()).toContain("publisher = {example press}");
  });

  it("prefers raw_bibtex when present", () => {
    const root = roots[roots.length - 1] ?? tempProject();
    const raw = "@article{customKey,\n  title={Raw Entry},\n  year={2019}\n}";
    const { paper } = createPaper(root, {
      title: "Ignored",
      raw_bibtex: raw,
      csl_json: JSON.stringify({ volume: "99" }),
    });
    expect(bibTeXEntryFromPaperRow({ ...paper, raw_bibtex: raw })).toBe(raw);
  });
});
