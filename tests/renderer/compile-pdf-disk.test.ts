import { afterEach, describe, expect, it } from "vitest";
import { derivePaperPdfRel } from "../../src/shared/compile/artifact-key";
import {
  clearPdfCache,
  ensureCompilePdfForKey,
  getPdfBytesForKey,
  resolveCompilePdfDiskPath,
  setPdfBytesForKey,
} from "../../src/renderer/stores/compile-store";

describe("resolveCompilePdfDiskPath", () => {
  it("maps manuscript main.tex to .workbench/compile/main.pdf", () => {
    expect(resolveCompilePdfDiskPath("/proj", "manuscript/main.tex")).toBe(
      "/proj/.workbench/compile/main.pdf",
    );
  });

  it("uses basename stem for nested paths", () => {
    expect(resolveCompilePdfDiskPath("/proj", "paper/sections/root.tex")).toBe(
      "/proj/.workbench/compile/root.pdf",
    );
  });

  it("preserves Windows separators when project root uses them", () => {
    expect(resolveCompilePdfDiskPath("C:\\proj", "manuscript\\main.tex")).toBe(
      "C:\\proj\\.workbench\\compile\\main.pdf",
    );
  });
});

describe("derivePaperPdfRel", () => {
  it("typst paper pdf is namespaced", () => {
    expect(derivePaperPdfRel("typst", "manuscript/main.typ")).toBe(
      ".workbench/compile/typst/main.pdf",
    );
  });
});

describe("compile pdf cache by artifact key", () => {
  afterEach(() => {
    clearPdfCache();
  });

  it("keeps latex and typst paper PDFs separate for the same project", () => {
    const latex = {
      projectRoot: "/p",
      engine: "latex" as const,
      route: "paper" as const,
      compileRoot: "manuscript/main.tex",
    };
    const typst = {
      projectRoot: "/p",
      engine: "typst" as const,
      route: "paper" as const,
      compileRoot: "manuscript/main.typ",
    };
    setPdfBytesForKey(latex, new Uint8Array([1, 2, 3]));
    setPdfBytesForKey(typst, new Uint8Array([4, 5, 6]));
    expect(Array.from(getPdfBytesForKey(latex)!)).toEqual([1, 2, 3]);
    expect(Array.from(getPdfBytesForKey(typst)!)).toEqual([4, 5, 6]);
  });

  it("does not hydrate remote projects from the local compile dir", async () => {
    const ok = await ensureCompilePdfForKey({
      projectRoot: "remote://lab/home/ubuntu/paper",
      engine: "latex",
      route: "paper",
      compileRoot: "manuscript/main.tex",
    });
    expect(ok).toBe(false);
  });
});
