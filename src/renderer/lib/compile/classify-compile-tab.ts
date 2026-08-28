import { compileEngineFromRelPath, type CompileEngine } from "@shared/compile/artifact-key";

export type CompileTabClass =
  | { engine: CompileEngine; kind: "paper-root" | "paper-child" | "standalone" }
  | { engine: null; kind: "none" };

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function inManuscriptDir(fileRel: string, manuscriptDir: string): boolean {
  const n = normalizeRel(fileRel);
  const d = normalizeRel(manuscriptDir).replace(/\/$/, "");
  return n === d || n.startsWith(`${d}/`);
}

export function classifyCompileTab(input: {
  fileRel: string;
  manuscriptDir: string | null;
  content: string;
  isStandaloneTex: (content: string) => boolean;
  latexRootRel: string | null;
  typstRootRel: string | null;
}): CompileTabClass {
  const fileRel = normalizeRel(input.fileRel);
  const engine = compileEngineFromRelPath(fileRel);
  if (!engine) return { engine: null, kind: "none" };

  if (engine === "latex") {
    if (input.isStandaloneTex(input.content)) {
      return { engine: "latex", kind: "standalone" };
    }
    const root = input.latexRootRel ? normalizeRel(input.latexRootRel) : null;
    if (root === fileRel) return { engine: "latex", kind: "paper-root" };
    return { engine: "latex", kind: "paper-child" };
  }

  const manuscriptDir = input.manuscriptDir ? normalizeRel(input.manuscriptDir) : null;
  if (!manuscriptDir || !inManuscriptDir(fileRel, manuscriptDir)) {
    return { engine: "typst", kind: "standalone" };
  }
  const typstRoot = input.typstRootRel ? normalizeRel(input.typstRootRel) : null;
  if (typstRoot === fileRel) return { engine: "typst", kind: "paper-root" };
  return { engine: "typst", kind: "paper-child" };
}

/** LaTeX Files chrome (`FileCompileLayout` + Lector). */
export function isLatexCompileTab(cls: CompileTabClass): boolean {
  return cls.engine === "latex";
}

/** Typst Files chrome (same `FileCompileLayout` + Lector as LaTeX). */
export function isTypstCompileTab(cls: CompileTabClass): boolean {
  return cls.engine === "typst";
}

/** `.tex` / `.typ` Files tabs that share editor + compile PDF preview. */
export function isCompileLayoutTab(cls: CompileTabClass): boolean {
  return cls.engine === "latex" || cls.engine === "typst";
}
