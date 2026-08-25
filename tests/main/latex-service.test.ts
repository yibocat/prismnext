import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveLatexRoot } from "../../src/main/lib/latex-root";

describe("resolveLatexRoot", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-latex-root-"));
    mkdirSync(join(root, "manuscript"), { recursive: true });
    mkdirSync(join(root, ".workbench"), { recursive: true });
    writeFileSync(
      join(root, ".workbench", "workbench.json"),
      JSON.stringify({
        id: "p_test",
        workspace: {
          folders: [{ name: "manuscript", function: "manuscript", mainTex: "main.tex" }],
        },
      }),
      "utf-8",
    );
    writeFileSync(
      join(root, "manuscript", "main.tex"),
      String.raw`\documentclass{article}
\usepackage[style=nature,backend=bibtex]{biblatex}
\addbibresource{references.bib}
\begin{document}
Hello \cite{foo}.
\end{document}`,
      "utf-8",
    );
    writeFileSync(
      join(root, "manuscript", "references.bib"),
      "@article{foo, title={Foo}, author={A}, year={2024}}",
      "utf-8",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("resolves manuscript main from workspace config", () => {
    const resolved = resolveLatexRoot(root);
    expect(resolved).not.toBeNull();
    expect(resolved!.mainFile).toBe("manuscript/main.tex");
    expect(resolved!.engine).toBe("xelatex");
    expect(resolved!.bibTool).toBe("bibtex");
    expect(resolved!.buildDir).toBe(".workbench/compile");
    expect(resolved!.manuscriptFolder).toBe("manuscript");
  });

  it("follows % !TEX root chain", () => {
    writeFileSync(
      join(root, "manuscript", "chapter.tex"),
      String.raw`% !TEX root = main.tex
\section{Ch}
\cite{foo}`,
      "utf-8",
    );
    const resolved = resolveLatexRoot(root, "manuscript/chapter.tex");
    expect(resolved?.mainFile).toBe("manuscript/main.tex");
    expect(resolved?.resolution).toBe("magic-root");
  });

  it("reports the figure folder as buildDir for standalone documents", () => {
    mkdirSync(join(root, "figures"), { recursive: true });
    writeFileSync(
      join(root, "figures", "lstm-cell.tex"),
      String.raw`\documentclass[tikz,border=8pt]{standalone}
\begin{document}
\begin{tikzpicture}\node {x};\end{tikzpicture}
\end{document}`,
      "utf-8",
    );
    const resolved = resolveLatexRoot(root, "figures/lstm-cell.tex");
    expect(resolved?.mainFile).toBe("figures/lstm-cell.tex");
    expect(resolved?.buildDir).toBe("figures");
  });
});
