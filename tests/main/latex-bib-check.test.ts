import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkBibConsistency, extractCiteKeysFromTex } from "../../src/main/compile/latex-service";

describe("latex bib check", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-latex-bib-"));
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeFileSync(
      join(root, "manuscript", "main.tex"),
      String.raw`\documentclass{article}
\addbibresource{references.bib}
\begin{document}
See \cite{used, missing}.
\end{document}`,
      "utf-8",
    );
    writeFileSync(
      join(root, "manuscript", "references.bib"),
      [
        "@article{used, title={Used}, author={A}, year={2024}}",
        "@article{orphan, title={Orphan}, author={B}, year={2023}}",
        "@article{dup, title={One}, author={C}, year={2022}}",
        "@article{dup, title={Two}, author={D}, year={2021}}",
      ].join("\n"),
      "utf-8",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("extracts cite keys from tex", () => {
    const keys = extractCiteKeysFromTex("\\cite{foo, bar} and \\parencite{baz}");
    expect(keys).toEqual(["bar", "baz", "foo"]);
  });

  it("reports missing, unused, and duplicate bib keys", () => {
    const result = checkBibConsistency(root);
    expect(result.texFilesScanned).toBeGreaterThan(0);
    expect(result.bibPath).toBe("manuscript/references.bib");
    expect(result.citeKeysInTex).toEqual(["missing", "used"]);
    expect(result.missingKeys).toEqual(["missing"]);
    expect(result.unusedKeys).toContain("orphan");
    expect(result.duplicateKeys).toEqual(["dup"]);
  });
});
