import { describe, expect, it } from "vitest";
import {
  isDirectLatexCompileBashCommand,
  latexCompileBashBlockMessage,
  latexCompileBashRedirectNote,
} from "../../src/shared/latex-compile-bash";

describe("isDirectLatexCompileBashCommand", () => {
  it("detects common engines", () => {
    expect(isDirectLatexCompileBashCommand("pdflatex main.tex")).toBe(true);
    expect(isDirectLatexCompileBashCommand("xelatex -interaction=nonstopmode main.tex")).toBe(true);
    expect(isDirectLatexCompileBashCommand("lualatex paper.tex")).toBe(true);
    expect(isDirectLatexCompileBashCommand("latexmk -pdf main.tex")).toBe(true);
    expect(isDirectLatexCompileBashCommand("tectonic manuscript/main.tex")).toBe(true);
  });

  it("detects chained / path-qualified / sudo", () => {
    expect(isDirectLatexCompileBashCommand("cd manuscript && pdflatex main.tex")).toBe(true);
    expect(isDirectLatexCompileBashCommand("/usr/bin/pdflatex main.tex")).toBe(true);
    expect(isDirectLatexCompileBashCommand("sudo latexmk -c")).toBe(true);
  });

  it("does not match mention-only or unrelated commands", () => {
    expect(isDirectLatexCompileBashCommand("which pdflatex")).toBe(false);
    expect(isDirectLatexCompileBashCommand("echo pdflatex")).toBe(false);
    expect(isDirectLatexCompileBashCommand("grep pdflatex Makefile")).toBe(false);
    expect(isDirectLatexCompileBashCommand("ls")).toBe(false);
    expect(isDirectLatexCompileBashCommand("")).toBe(false);
  });
});

describe("latex compile bash messages", () => {
  it("point at paper vs standalone tools", () => {
    expect(latexCompileBashBlockMessage()).toContain("latex-compile");
    expect(latexCompileBashBlockMessage()).toContain("latex-compile-standalone");
    expect(latexCompileBashBlockMessage()).toContain(".prismnext/compile/");
    expect(latexCompileBashRedirectNote()).toContain("latex-compile");
    expect(latexCompileBashRedirectNote()).toContain("latex-compile-standalone");
  });
});
