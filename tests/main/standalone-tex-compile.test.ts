import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const compileLatex = vi.fn();
const compileStandaloneTexInPlace = vi.fn();

vi.mock("../../src/main/services/compiler", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/main/services/compiler")>();
  return {
    ...actual,
    compileLatex: (...args: unknown[]) => compileLatex(...args),
    compileStandaloneTexInPlace: (...args: unknown[]) =>
      compileStandaloneTexInPlace(...args),
  };
});

import { isStandaloneTexDocument } from "../../src/main/lib/latex-root";
import { compileForAgent } from "../../src/main/services/latex-service";

const STANDALONE_FIGURE = String.raw`\documentclass[tikz,border=2mm]{standalone}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
\node {x};
\end{tikzpicture}
\end{document}`;

const MANUSCRIPT_MAIN = String.raw`\documentclass{article}
\begin{document}
Hello.
\end{document}`;

describe("isStandaloneTexDocument", () => {
  it("matches the standalone class, with and without options", () => {
    expect(isStandaloneTexDocument(STANDALONE_FIGURE)).toBe(true);
    expect(
      isStandaloneTexDocument(
        "\\documentclass{standalone}\n\\begin{document}x\\end{document}",
      ),
    ).toBe(true);
  });

  it("rejects regular document classes", () => {
    expect(isStandaloneTexDocument(MANUSCRIPT_MAIN)).toBe(false);
    expect(isStandaloneTexDocument("\\documentclass[11pt]{article}")).toBe(false);
  });

  it("ignores commented-out documentclass lines", () => {
    expect(
      isStandaloneTexDocument(
        "% \\documentclass{standalone}\n\\documentclass{article}",
      ),
    ).toBe(false);
  });
});

describe("compileForAgent standalone routing", () => {
  let root: string;

  beforeEach(() => {
    compileLatex.mockReset();
    compileStandaloneTexInPlace.mockReset();
    compileLatex.mockResolvedValue({
      success: true,
      buildDir: ".prismnext/compile",
      logContent: "",
    });
    compileStandaloneTexInPlace.mockResolvedValue({
      success: true,
      pdfPath: "figures/arch.pdf",
      logContent: "",
    });

    root = mkdtempSync(join(tmpdir(), "prism-standalone-compile-"));
    mkdirSync(join(root, "manuscript"), { recursive: true });
    mkdirSync(join(root, "figures"), { recursive: true });
    mkdirSync(join(root, ".prismnext"), { recursive: true });
    writeFileSync(
      join(root, ".prismnext", "settings.json"),
      JSON.stringify({
        workspaceDirs: [
          { name: "manuscript", function: "manuscript", mainTex: "main.tex" },
        ],
      }),
      "utf-8",
    );
    writeFileSync(join(root, "manuscript", "main.tex"), MANUSCRIPT_MAIN, "utf-8");
    writeFileSync(join(root, "figures", "arch.tex"), STANDALONE_FIGURE, "utf-8");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("compiles a standalone figure in place — never via the manuscript pipeline", async () => {
    const result = await compileForAgent(root, "figures/arch.tex");
    expect(compileStandaloneTexInPlace).toHaveBeenCalledWith(root, "figures/arch.tex", { source: "agent" });
    expect(compileLatex).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      mainFile: "figures/arch.tex",
      buildDir: "figures",
      pdfPath: "figures/arch.pdf",
    });
  });

  it("still compiles in place when the standalone figure is the workspace main tex", async () => {
    writeFileSync(
      join(root, ".prismnext", "settings.json"),
      JSON.stringify({
        workspaceDirs: [
          { name: "figures", function: "manuscript", mainTex: "arch.tex" },
        ],
      }),
      "utf-8",
    );
    const result = await compileForAgent(root, "figures/arch.tex");
    expect(compileStandaloneTexInPlace).toHaveBeenCalledWith(root, "figures/arch.tex", { source: "agent" });
    expect(compileLatex).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      mainFile: "figures/arch.tex",
      buildDir: "figures",
    });
  });

  it("auto-detect of a standalone-only project compiles in place, not the article cache", async () => {
    rmSync(join(root, "manuscript"), { recursive: true, force: true });
    writeFileSync(
      join(root, ".prismnext", "settings.json"),
      JSON.stringify({ workspaceDirs: [] }),
      "utf-8",
    );
    await compileForAgent(root);
    expect(compileStandaloneTexInPlace).toHaveBeenCalledWith(root, "figures/arch.tex", { source: "agent" });
    expect(compileLatex).not.toHaveBeenCalled();
  });

  it("keeps the manuscript on the shared build-dir pipeline", async () => {
    await compileForAgent(root, "manuscript/main.tex");
    expect(compileLatex).toHaveBeenCalledWith(root, "manuscript/main.tex", false, { source: "agent" });
    expect(compileStandaloneTexInPlace).not.toHaveBeenCalled();
  });

  it("keeps non-standalone hints on the shared build-dir pipeline", async () => {
    writeFileSync(
      join(root, "manuscript", "supplementary.tex"),
      MANUSCRIPT_MAIN,
      "utf-8",
    );
    await compileForAgent(root, "manuscript/supplementary.tex");
    expect(compileLatex).toHaveBeenCalled();
    expect(compileStandaloneTexInPlace).not.toHaveBeenCalled();
  });

  it("auto-detect (no hint) always uses the manuscript pipeline", async () => {
    await compileForAgent(root);
    expect(compileLatex).toHaveBeenCalled();
    expect(compileStandaloneTexInPlace).not.toHaveBeenCalled();
  });

  it("surfaces in-place compile errors", async () => {
    compileStandaloneTexInPlace.mockResolvedValue({
      success: false,
      error: "! Undefined control sequence.",
      logContent: "log",
    });
    const result = await compileForAgent(root, "figures/arch.tex");
    expect(result).toMatchObject({ success: false, mainFile: "figures/arch.tex" });
    expect((result as { errorSummary: string }).errorSummary).toContain(
      "Undefined control sequence",
    );
  });
});
