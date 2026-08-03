import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileLatex } from "../../src/main/services/compiler";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir(),
    getAppPath: () => process.cwd(),
  },
}));

describe("compileLatex bibliography integration", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-compile-bib-"));
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeFileSync(
      join(root, "manuscript", "references.bib"),
      [
        "@article{christiano2017deep, title={Deep}, author={C}, year={2017}}",
        "@article{zhang2025landscape, title={Z}, author={Z}, year={2025}}",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(root, "manuscript", "main.tex"),
      String.raw`\documentclass{article}
\usepackage[style=nature,backend=bibtex,sorting=none]{biblatex}
\addbibresource{references.bib}
\begin{document}
Test \cite{christiano2017deep,zhang2025landscape}.
\printbibliography
\end{document}
`,
      "utf-8",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("resolves citations with TeX Live when bib is under manuscript/", async () => {
    const result = await compileLatex(root, "manuscript/main.tex", true);
    expect(result.success).toBe(true);

    const buildDir = result.buildDir ?? join(root, ".prismnext", "compile");
    expect(existsSync(join(buildDir, "references.bib"))).toBe(true);
    expect(existsSync(join(buildDir, "main.bbl"))).toBe(true);

    const log = result.logContent ?? "";
    expect(log).not.toContain("Cannot find 'references.bib'");
    expect(log).not.toMatch(/Citation 'zhang2025landscape' undefined/);
  }, 120_000);
});
