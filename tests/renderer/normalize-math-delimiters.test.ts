import { describe, expect, it } from "vitest";
import {
  normalizeMathDelimiters,
  prepareMarkdownMath,
  scrubLatexForKatex,
  isScientificExtractPath,
} from "../../src/renderer/lib/markdown/markdown-config";

describe("normalizeMathDelimiters", () => {
  it("does not double-wrap \\begin{array} already inside $$ blocks", () => {
    const input = [
      "Intro",
      "",
      "$$",
      "\\begin{array}{c}",
      "a & b \\\\",
      "c & d",
      "\\end{array}",
      "$$",
      "",
      "Outro",
    ].join("\n");

    const out = normalizeMathDelimiters(input);
    expect(out).toContain("$$");
    expect(out.match(/\$\$/g)?.length).toBe(2);
    expect(out).toContain("\\begin{array}{c}");
  });

  it("wraps bare \\begin{equation} blocks not already in $$", () => {
    const input = ["\\begin{equation}", "E=mc^2", "\\end{equation}"].join("\n");
    const out = normalizeMathDelimiters(input);
    expect(out).toMatch(/\$\$\s*\\begin\{equation\}/);
    expect(out).toMatch(/\\end\{equation\}\s*\$\$/);
  });
});

describe("prepareMarkdownMath", () => {
  it("chains delimiter normalization and latex scrubbing", () => {
    const input = "\\label{eq:1}\n$$\\begin{array}{c}a\\end{array}$$";
    const out = prepareMarkdownMath(input);
    expect(out).not.toContain("\\label");
    expect(out).toContain("\\begin{array}");
  });
});

describe("scrubLatexForKatex", () => {
  it("removes labels and citation macros", () => {
    const out = scrubLatexForKatex("\\label{eq:1} \\cite{foo2020} x");
    expect(out).not.toContain("\\label");
    expect(out).not.toContain("\\cite");
    expect(out).toContain("x");
  });

  it("fixes \\begin{\\align} typos", () => {
    expect(scrubLatexForKatex("\\begin{\\align}")).toBe("\\begin{align}");
  });
});

describe("isScientificExtractPath", () => {
  it("detects library extract markdown", () => {
    expect(
      isScientificExtractPath(".prismnext/library/extract/abc123/mineru.md"),
    ).toBe(true);
    expect(isScientificExtractPath("notes/readme.md")).toBe(false);
  });
});
