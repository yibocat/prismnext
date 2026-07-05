import { describe, it, expect } from "vitest";
import { documentHasBibliography } from "../../src/renderer/lib/tex/prism-latex-language";

describe("documentHasBibliography", () => {
  it("detects biblatex addbibresource", () => {
    const tex = String.raw`\usepackage{biblatex}
\addbibresource{references.bib}
\begin{document}
\cite{foo}
\end{document}`;
    expect(documentHasBibliography(tex)).toBe(true);
  });

  it("detects biblatex addbibresource with optional argument", () => {
    const tex = String.raw`\addbibresource[location=remote]{refs.bib}`;
    expect(documentHasBibliography(tex)).toBe(true);
  });

  it("detects printbibliography", () => {
    expect(documentHasBibliography(String.raw`\printbibliography`)).toBe(true);
  });

  it("detects classic bibliography", () => {
    expect(documentHasBibliography(String.raw`\bibliography{refs}`)).toBe(true);
  });

  it("detects thebibliography environment", () => {
    expect(documentHasBibliography(String.raw`\begin{thebibliography}{9}`)).toBe(true);
  });

  it("returns false when only cite is present", () => {
    expect(documentHasBibliography(String.raw`\cite{foo}`)).toBe(false);
  });
});
