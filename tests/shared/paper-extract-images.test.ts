import { describe, expect, it } from "vitest";
import {
  markdownHasExtractFigures,
  rewritePaperExtractImageSrcs,
  listExtractFigurePaths,
  encodeLibraryFigureHref,
  decodeLibraryFigureHref,
  resolveLibraryFigurePath,
} from "../../src/shared/paper-extract-images";

describe("paper-extract-images", () => {
  it("rewrites MinerU images/ refs to project extract paths", () => {
    expect(rewritePaperExtractImageSrcs("![Fig 1](images/fig-0.png)", "paper-1")).toBe(
      "![Fig 1](.prismnext/library/extract/paper-1/images/fig-0.png)",
    );
  });

  it("leaves already-rewritten and remote images alone", () => {
    const abs = "![x](.prismnext/library/extract/paper-1/images/a.png)";
    expect(rewritePaperExtractImageSrcs(abs, "paper-1")).toBe(abs);
    expect(rewritePaperExtractImageSrcs("![x](https://example.com/a.png)", "paper-1")).toBe(
      "![x](https://example.com/a.png)",
    );
  });

  it("detects extract figure markdown", () => {
    const md = "![Fig](.prismnext/library/extract/p1/images/fig-0.png)";
    expect(markdownHasExtractFigures(md)).toBe(true);
    expect(listExtractFigurePaths(md)).toEqual([
      ".prismnext/library/extract/p1/images/fig-0.png",
    ]);
  });

  it("encodes and decodes library figure hrefs", () => {
    const href = encodeLibraryFigureHref("smith2024", "images/fig-0.png");
    expect(decodeLibraryFigureHref(href)).toEqual({
      bibkey: "smith2024",
      imageRel: "images/fig-0.png",
    });
  });

  it("resolves library figure paths", () => {
    expect(resolveLibraryFigurePath("p1", "images/fig-0.png")).toBe(
      ".prismnext/library/extract/p1/images/fig-0.png",
    );
  });
});
