import { describe, it, expect } from "vitest";
import {
  resolveCompilePdfAbsolutePath,
  shouldExcludeFromManuscriptZip,
} from "../../src/main/services/manuscript-export";

describe("shouldExcludeFromManuscriptZip", () => {
  it("keeps normal source and figure PDFs", () => {
    expect(shouldExcludeFromManuscriptZip("main.tex")).toBe(false);
    expect(shouldExcludeFromManuscriptZip("refs/references.bib")).toBe(false);
    expect(shouldExcludeFromManuscriptZip("figures/plot.pdf")).toBe(false);
  });

  it("excludes VCS junk and project meta dirs", () => {
    expect(shouldExcludeFromManuscriptZip(".git/config")).toBe(true);
    expect(shouldExcludeFromManuscriptZip("sub/.DS_Store")).toBe(true);
    expect(shouldExcludeFromManuscriptZip(".prismnext/compile/main.pdf")).toBe(true);
    expect(shouldExcludeFromManuscriptZip(".workbench/compile/main.pdf")).toBe(true);
  });

  it("excludes TeX auxiliaries", () => {
    expect(shouldExcludeFromManuscriptZip("main.aux")).toBe(true);
    expect(shouldExcludeFromManuscriptZip("build/main.synctex.gz")).toBe(true);
    expect(shouldExcludeFromManuscriptZip("main.run.xml")).toBe(true);
  });
});

describe("resolveCompilePdfAbsolutePath", () => {
  it("maps main tex to .workbench/compile/<stem>.pdf", () => {
    expect(resolveCompilePdfAbsolutePath("/proj", "manuscript/main.tex")).toBe(
      "/proj/.workbench/compile/main.pdf",
    );
  });
});
