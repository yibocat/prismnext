import { describe, expect, it } from "vitest";
import {
  resolveDocumentMarkdownImageRel,
  resolveExtractRelativeAssetPath,
} from "../../src/renderer/lib/markdown/extract-markdown-images";
import { rewritePaperExtractImageSrcs } from "../../src/renderer/lib/literature/insert-paper-quote";

describe("resolveDocumentMarkdownImageRel", () => {
  it("keeps extract-relative images next to the extract markdown", () => {
    expect(
      resolveExtractRelativeAssetPath(
        "library/extract/abc/full.md",
        "images/fig-0.png",
      ),
    ).toBe("library/extract/abc/images/fig-0.png");
  });

  it("does not resolve leftover .prismnext extract paths (D-30)", () => {
    expect(
      resolveDocumentMarkdownImageRel(
        "notes/vaswani2017/2026-07-23-note.md",
        ".prismnext/library/extract/abc/images/fig-0.png",
      ),
    ).toBeNull();
  });

  it("keeps library/extract display paths", () => {
    expect(
      resolveDocumentMarkdownImageRel(
        "notes/vaswani2017/note.md",
        "library/extract/abc/images/fig-0.png",
      ),
    ).toBe("library/extract/abc/images/fig-0.png");
  });

  it("still resolves plain relative assets against the note directory", () => {
    expect(
      resolveDocumentMarkdownImageRel("notes/vaswani2017/note.md", "assets/x.png"),
    ).toBe("notes/vaswani2017/assets/x.png");
  });
});

describe("rewritePaperExtractImageSrcs", () => {
  it("rewrites MinerU images/ refs to project extract paths", () => {
    expect(rewritePaperExtractImageSrcs("![Fig 1](images/fig-0.png)", "paper-1")).toBe(
      "![Fig 1](library/extract/paper-1/images/fig-0.png)",
    );
  });

  it("leaves already-rewritten and remote images alone", () => {
    const abs = "![x](library/extract/paper-1/images/a.png)";
    expect(rewritePaperExtractImageSrcs(abs, "paper-1")).toBe(abs);
    expect(rewritePaperExtractImageSrcs("![x](https://example.com/a.png)", "paper-1")).toBe(
      "![x](https://example.com/a.png)",
    );
  });
});
