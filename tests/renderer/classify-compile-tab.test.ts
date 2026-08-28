import { describe, expect, it } from "vitest";
import { classifyCompileTab, isCompileLayoutTab, isLatexCompileTab, isTypstCompileTab } from "../../src/renderer/lib/compile/classify-compile-tab";

const STANDALONE = String.raw`\documentclass[tikz,border=8pt]{standalone}
\begin{document}
x
\end{document}`;

const ARTICLE = String.raw`\documentclass{article}
\begin{document}
Hello.
\end{document}`;

function classify(opts: {
  fileRel: string;
  content?: string;
  manuscriptDir?: string | null;
  latexRootRel?: string | null;
  typstRootRel?: string | null;
}) {
  return classifyCompileTab({
    fileRel: opts.fileRel,
    manuscriptDir: opts.manuscriptDir === undefined ? "manuscript" : opts.manuscriptDir,
    content: opts.content ?? ARTICLE,
    isStandaloneTex: (content) => {
      const head = content
        .split("\n")
        .slice(0, 50)
        .filter((line) => !line.trim().startsWith("%"))
        .join("\n");
      return /\\documentclass(?:\[[^\]]*\])?\{standalone\}/.test(head);
    },
    latexRootRel: opts.latexRootRel ?? null,
    typstRootRel: opts.typstRootRel ?? null,
  });
}

describe("classifyCompileTab", () => {
  it("maps manuscript/main.tex to latex paper-root", () => {
    expect(
      classify({
        fileRel: "manuscript/main.tex",
        latexRootRel: "manuscript/main.tex",
      }),
    ).toEqual({ engine: "latex", kind: "paper-root" });
  });

  it("maps manuscript/intro.tex to latex paper-child", () => {
    expect(
      classify({
        fileRel: "manuscript/intro.tex",
        latexRootRel: "manuscript/main.tex",
      }),
    ).toEqual({ engine: "latex", kind: "paper-child" });
  });

  it("maps a standalone figure to latex standalone", () => {
    expect(
      classify({
        fileRel: "figures/a.tex",
        content: STANDALONE,
        latexRootRel: "figures/a.tex",
      }),
    ).toEqual({ engine: "latex", kind: "standalone" });
  });

  it("maps a root document outside manuscript to latex paper-root", () => {
    expect(
      classify({
        fileRel: "draft.tex",
        latexRootRel: "draft.tex",
      }),
    ).toEqual({ engine: "latex", kind: "paper-root" });
  });

  it("returns none for non-compile files", () => {
    expect(classify({ fileRel: "notes/a.md" })).toEqual({ engine: null, kind: "none" });
  });

  it("classifies typst inside manuscript using typstRootRel", () => {
    expect(
      classify({
        fileRel: "manuscript/main.typ",
        typstRootRel: "manuscript/main.typ",
      }),
    ).toEqual({ engine: "typst", kind: "paper-root" });
    expect(
      classify({
        fileRel: "manuscript/intro.typ",
        typstRootRel: "manuscript/main.typ",
      }),
    ).toEqual({ engine: "typst", kind: "paper-child" });
  });

  it("classifies typst outside manuscript as standalone", () => {
    expect(
      classify({
        fileRel: "notes/a.typ",
        typstRootRel: "manuscript/main.typ",
      }),
    ).toEqual({ engine: "typst", kind: "standalone" });
  });

  it("puts latex and typst on the same Files compile layout", () => {
    const tex = classify({ fileRel: "manuscript/main.tex", latexRootRel: "manuscript/main.tex" });
    const typ = classify({
      fileRel: "manuscript/main.typ",
      typstRootRel: "manuscript/main.typ",
    });
    expect(isLatexCompileTab(tex)).toBe(true);
    expect(isTypstCompileTab(tex)).toBe(false);
    expect(isCompileLayoutTab(tex)).toBe(true);

    expect(isTypstCompileTab(typ)).toBe(true);
    expect(isLatexCompileTab(typ)).toBe(false);
    expect(isCompileLayoutTab(typ)).toBe(true);
    expect(isLatexCompileTab(classify({ fileRel: "notes/a.md" }))).toBe(false);
    expect(isCompileLayoutTab(classify({ fileRel: "notes/a.md" }))).toBe(false);
  });
});
