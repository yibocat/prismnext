import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileStandaloneTexInPlace } from "../../src/main/compile/facade";
import { resetTectonicBinaryCacheForTests } from "../../src/main/compile/tectonic-binary";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir(),
    getAppPath: () => process.cwd(),
  },
}));

/**
 * Real end-to-end in-place compile (bundled Tectonic / TeX Live).
 * Mirrors compile-bib-integration.test.ts conventions — needs a working
 * engine on the machine.
 */
describe("compileStandaloneTexInPlace (real engine)", () => {
  let root: string;

  beforeEach(() => {
    resetTectonicBinaryCacheForTests();
    root = mkdtempSync(join(tmpdir(), "prism-standalone-real-"));
    mkdirSync(join(root, "figures"), { recursive: true });
    writeFileSync(
      join(root, "figures", "box.tex"),
      String.raw`\documentclass[tikz,border=2mm]{standalone}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
\node[draw, rounded corners] {prism};
\end{tikzpicture}
\end{document}`,
      "utf-8",
    );
  }, 120_000);

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("produces the PDF next to the source and never touches .prismnext/compile", async () => {
    const result = await compileStandaloneTexInPlace(root, "figures/box.tex");
    expect(result.success, result.error || result.logContent || "compile failed").toBe(true);
    expect(result.pdfPath).toBe("figures/box.pdf");
    // In place: PDF + log + aux live next to the source…
    expect(existsSync(join(root, "figures", "box.pdf"))).toBe(true);
    // …and the shared manuscript build dir was never created.
    expect(existsSync(join(root, ".workbench", "compile"))).toBe(false);
    expect(existsSync(join(root, ".prismnext", "compile"))).toBe(false);
  }, 120_000);
});
