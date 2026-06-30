import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { formatBibliography, CSL_STYLES, createPaper, listPapers } from "../../src/main/services/literature-service";

const roots: string[] = [];

function tempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-csl-test-"));
  fs.mkdirSync(path.join(dir, ".prismnext", "library"), { recursive: true });
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

describe("formatBibliography (CSL)", () => {
  beforeEach(() => tempProject());

  it("formats papers with csl_json volume/pages in IEEE style", () => {
    const root = roots[roots.length - 1] ?? tempProject();
    const { paper } = createPaper(root, {
      title: "Attention Is All You Need",
      authors: '[{"family":"Vaswani","given":"Ashish"}]',
      year: 2017,
      venue: "NeurIPS",
      doi: "10.5555/3295222.3295349",
      csl_json: JSON.stringify({
        type: "paper-conference",
        volume: "30",
        page: "5998--6008",
        publisher: "Curran Associates",
      }),
    });
    const out = formatBibliography(root, [paper.id], "ieee");
    expect(out).toContain("5998");
    expect(out.toLowerCase()).toContain("vaswani");
  });

  it("formats papers in IEEE style", () => {
    const root = roots[roots.length - 1] ?? tempProject();
    const { paper } = createPaper(root, {
      title: "Attention Is All You Need",
      authors: '[{"family":"Vaswani","given":"Ashish"},{"family":"Shazeer","given":"Noam"}]',
      year: 2017,
      venue: "NeurIPS",
      doi: "10.5555/3295222.3295349",
    });
    const out = formatBibliography(root, [paper.id], "ieee");
    expect(out).toBeTruthy();
    expect(out.toLowerCase()).toContain("vaswani");
    expect(out.toLowerCase()).toContain("attention");
  });

  it("formats in APA style", () => {
    const root = roots[roots.length - 1] ?? tempProject();
    const { paper } = createPaper(root, {
      title: "Deep Learning",
      authors: '[{"family":"LeCun","given":"Yann"}]',
      year: 2015,
      venue: "Nature",
    });
    const out = formatBibliography(root, [paper.id], "apa");
    expect(out).toContain("LeCun");
    expect(out).toContain("2015");
  });

  it("returns empty for no papers", () => {
    const root = roots[roots.length - 1] ?? tempProject();
    expect(formatBibliography(root, ["nonexistent"], "ieee")).toBe("");
  });

  it("CSL_STYLES includes common styles", () => {
    expect(CSL_STYLES).toContain("apa");
    expect(CSL_STYLES).toContain("ieee");
    expect(CSL_STYLES).toContain("chicago");
    expect(CSL_STYLES).toContain("mla");
  });
});
