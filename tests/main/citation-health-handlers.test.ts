import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getCitationHealth } from "../../src/main/services/citation-health";
import { checkBibConsistency } from "../../src/main/services/latex-service";

describe("citation health handlers", () => {
  it("reports cite keys from .tex via library and bib checks", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-audit-"));
    const ms = join(root, "manuscript");
    mkdirSync(ms, { recursive: true });
    writeFileSync(
      join(ms, "main.tex"),
      "\\documentclass{article}\\begin{document}\\cite{foo2024}\\end{document}",
    );
    writeFileSync(join(ms, "references.bib"), "@article{foo2024, title={Foo}}");

    expect(getCitationHealth(root).libraryCheck.citeKeysInTex).toContain("foo2024");
    expect(checkBibConsistency(root).citeKeysInTex).toContain("foo2024");
  });
});
