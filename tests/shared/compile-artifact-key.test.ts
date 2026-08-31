import { describe, expect, it } from "vitest";
import {
  compileEngineFromRelPath,
  compileArtifactCacheKey,
  deriveLegacyLatexPaperPdfRel,
  derivePaperPdfRel,
  deriveStandalonePdfRel,
  isLiveCompileSourceRel,
} from "../../src/shared/compile/artifact-key";

describe("compileEngineFromRelPath", () => {
  it("maps tex/ltx to latex and typ to typst", () => {
    expect(compileEngineFromRelPath("manuscript/main.tex")).toBe("latex");
    expect(compileEngineFromRelPath("a/b.LTX")).toBe("latex");
    expect(compileEngineFromRelPath("manuscript/main.typ")).toBe("typst");
    expect(compileEngineFromRelPath("notes/a.md")).toBeNull();
  });
});

describe("isLiveCompileSourceRel", () => {
  it("includes Typst sources so live SVG can flush dirty buffers", () => {
    expect(isLiveCompileSourceRel("manuscript/main.typ")).toBe(true);
    expect(isLiveCompileSourceRel("drafts/a.TYP")).toBe(true);
    expect(isLiveCompileSourceRel("manuscript/main.tex")).toBe(true);
    expect(isLiveCompileSourceRel("refs.bib")).toBe(true);
    expect(isLiveCompileSourceRel("notes.md")).toBe(false);
  });
});

describe("derivePaperPdfRel", () => {
  it("namespaces latex paper pdf under compile/latex", () => {
    expect(derivePaperPdfRel("latex", "manuscript/main.tex")).toBe(
      ".workbench/compile/latex/main.pdf",
    );
  });
  it("namespaces typst paper pdf", () => {
    expect(derivePaperPdfRel("typst", "manuscript/main.typ")).toBe(
      ".workbench/compile/typst/main.pdf",
    );
  });
  it("does not let latex and typst share a disk path when stems match", () => {
    expect(derivePaperPdfRel("latex", "manuscript/main.tex")).not.toBe(
      derivePaperPdfRel("typst", "manuscript/main.typ"),
    );
  });
});

describe("deriveLegacyLatexPaperPdfRel", () => {
  it("maps pre-0.9.1 flat latex cache path", () => {
    expect(deriveLegacyLatexPaperPdfRel("manuscript/main.tex")).toBe(
      ".workbench/compile/main.pdf",
    );
  });
});

describe("deriveStandalonePdfRel", () => {
  it("writes next to source", () => {
    expect(deriveStandalonePdfRel("figures/foo.tex")).toBe("figures/foo.pdf");
    expect(deriveStandalonePdfRel("figures/foo.typ")).toBe("figures/foo.pdf");
  });
});

describe("compileArtifactCacheKey", () => {
  it("distinguishes engine even when stems match", () => {
    const a = compileArtifactCacheKey({
      projectRoot: "/p",
      engine: "latex",
      route: "paper",
      compileRoot: "manuscript/main.tex",
    });
    const b = compileArtifactCacheKey({
      projectRoot: "/p",
      engine: "typst",
      route: "paper",
      compileRoot: "manuscript/main.typ",
    });
    expect(a).not.toBe(b);
  });
});
