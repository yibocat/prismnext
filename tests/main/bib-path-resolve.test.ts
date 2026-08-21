import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseBibliographyResources,
  resolveBibliographyPath,
  resolveBibliographyFromMain,
  resolveMainTexRelativePath,
  intendedBibliographyPath,
  buildBibInputSearchPaths,
  stageBibliographyForBuild,
  syncTexSourceToBuildDir,
  syncTexSourceIncremental,
  withBibInputsEnv,
} from "../../src/main/lib/bib-path-resolve";
import { detectBibTool } from "../../src/main/services/compiler";

describe("bib-path-resolve", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-bib-path-"));
    mkdirSync(join(root, ".workbench"), { recursive: true });
    writeFileSync(
      join(root, ".workbench", "workbench.json"),
      JSON.stringify({
        id: "p_test",
        workspace: {
          folders: [{ function: "manuscript", name: "manuscript", mainTex: "main.tex" }],
        },
      }),
      "utf-8",
    );
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeFileSync(
      join(root, "manuscript", "main.tex"),
      String.raw`\documentclass{article}
\usepackage[backend=bibtex]{biblatex}
\addbibresource{references.bib}
\begin{document}
Hello \cite{smith2024}.
\end{document}
`,
      "utf-8",
    );
    writeFileSync(
      join(root, "manuscript", "references.bib"),
      "@article{smith2024, title={Test}, author={Smith}, year={2024}}\n",
      "utf-8",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("parses addbibresource from main tex", () => {
    const content = readFileSync(join(root, "manuscript", "main.tex"), "utf-8");
    expect(parseBibliographyResources(content)).toEqual(["references.bib"]);
  });

  it("resolves references.bib relative to manuscript/main.tex", () => {
    const { resolvedPath } = resolveBibliographyPath(root, "manuscript/main.tex", "references.bib");
    expect(resolvedPath).toBe("manuscript/references.bib");
  });

  it("does not fall back to project-root references.bib when only manuscript bib exists", () => {
    writeFileSync(join(root, "references.bib"), "@article{rootOnly, title={Root}}\n", "utf-8");
    const resolved = resolveBibliographyFromMain(root, "manuscript/main.tex");
    expect(resolved.resolvedPath).toBe("manuscript/references.bib");
  });

  it("resolves main tex from workspace config", () => {
    expect(resolveMainTexRelativePath(root)).toBe("manuscript/main.tex");
  });

  it("intended path for new bib is next to main tex", () => {
    expect(intendedBibliographyPath(root, "manuscript/main.tex", "references.bib")).toBe(
      join(root, "manuscript", "references.bib"),
    );
  });

  it("builds bib search paths for separate output directory compiles", () => {
    const tex = readFileSync(join(root, "manuscript", "main.tex"), "utf-8");
    const paths = buildBibInputSearchPaths(root, "manuscript/main.tex", tex);
    expect(paths.some((p) => p.includes("manuscript"))).toBe(true);
    expect(paths.some((p) => p.startsWith(root))).toBe(true);
  });

  it("stages bibliography into build dir for biber/bibtex", async () => {
    const tex = readFileSync(join(root, "manuscript", "main.tex"), "utf-8");
    const outDir = join(root, ".workbench", "compile");
    mkdirSync(outDir, { recursive: true });
    await stageBibliographyForBuild(root, "manuscript/main.tex", tex, outDir);
    expect(existsSync(join(outDir, "references.bib"))).toBe(true);
  });

  it("syncs manuscript tree into build dir before compile", async () => {
    const outDir = join(root, ".workbench", "compile");
    const { buildMain, sourceDirRel } = await syncTexSourceToBuildDir(
      root,
      "manuscript/main.tex",
      outDir,
    );
    expect(buildMain).toBe("main.tex");
    expect(sourceDirRel).toBe("manuscript");
    expect(existsSync(join(outDir, "main.tex"))).toBe(true);
    expect(existsSync(join(outDir, "references.bib"))).toBe(true);
  });

  it("incremental sync copies only dirty files when build tree exists", async () => {
    const outDir = join(root, ".workbench", "compile");
    await syncTexSourceToBuildDir(root, "manuscript/main.tex", outDir);

    writeFileSync(
      join(root, "manuscript", "chapter.tex"),
      "\\section{Ch}\n",
      "utf-8",
    );

    await syncTexSourceIncremental(root, "manuscript/main.tex", outDir, [
      "manuscript/chapter.tex",
    ]);

    expect(existsSync(join(outDir, "chapter.tex"))).toBe(true);
    expect(readFileSync(join(outDir, "chapter.tex"), "utf-8")).toContain("Ch");
  });

  it("BIBINPUTS keeps current directory first for bibtex in output dir", () => {
    const paths = buildBibInputSearchPaths(root, "manuscript/main.tex", readFileSync(join(root, "manuscript", "main.tex"), "utf-8"));
    const env = withBibInputsEnv({}, paths);
    expect(env.BIBINPUTS?.startsWith(".")).toBe(true);
  });
});

describe("detectBibTool", () => {
  it("uses bibtex when biblatex backend=bibtex", () => {
    const tex = String.raw`\usepackage[backend=bibtex]{biblatex}
\addbibresource{references.bib}`;
    expect(detectBibTool(tex)).toBe("bibtex");
  });

  it("uses biber for biblatex without explicit bibtex backend", () => {
    const tex = String.raw`\usepackage{biblatex}
\addbibresource{references.bib}`;
    expect(detectBibTool(tex)).toBe("biber");
  });
});
