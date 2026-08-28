export type CompileEngine = "latex" | "typst";
export type CompileRoute = "paper" | "standalone";

export type CompileArtifactKey =
  | {
      projectRoot: string;
      engine: CompileEngine;
      route: "paper";
      compileRoot: string; // POSIX 相对路径，如 manuscript/main.tex
    }
  | {
      projectRoot: string;
      engine: CompileEngine;
      route: "standalone";
      sourceFile: string;
    };

export function compileEngineFromRelPath(relPath: string): CompileEngine | null {
  const n = relPath.replace(/\\/g, "/").toLowerCase();
  if (n.endsWith(".tex") || n.endsWith(".ltx")) return "latex";
  if (n.endsWith(".typ")) return "typst";
  return null;
}

/** Sources whose editor buffers flush into auto-compile (LaTeX + Typst). */
export function isLiveCompileSourceRel(relPath: string): boolean {
  return /\.(tex|ltx|typ|bib|sty|cls|bst)$/i.test(relPath);
}

export function compileArtifactFileId(key: CompileArtifactKey): string {
  return key.route === "paper" ? key.compileRoot : key.sourceFile;
}

/** Stable cache / event id. Never use raw projectRoot alone. */
export function compileArtifactCacheKey(key: CompileArtifactKey): string {
  if (key.route === "paper") {
    return `paper::${key.engine}::${key.projectRoot}::${normalizeRel(key.compileRoot)}`;
  }
  return `standalone::${key.engine}::${key.projectRoot}::${normalizeRel(key.sourceFile)}`;
}

export function derivePaperPdfRel(engine: CompileEngine, compileRoot: string): string {
  const stem = texStem(compileRoot);
  if (engine === "typst") return `.workbench/compile/typst/${stem}.pdf`;
  return `.workbench/compile/${stem}.pdf`;
}

export function deriveStandalonePdfRel(sourceFile: string): string {
  const n = normalizeRel(sourceFile);
  const dir = n.includes("/") ? n.slice(0, n.lastIndexOf("/")) : ".";
  const stem = texStem(n);
  return dir === "." ? `${stem}.pdf` : `${dir}/${stem}.pdf`;
}

export function derivePaperBuildDir(engine: CompileEngine): string {
  return engine === "typst" ? ".workbench/compile/typst" : ".workbench/compile";
}

/** Main → renderer `compile:agentComplete`. Legacy aliases: projectDir, mainFile. */
export type CompileAgentCompleteEvent = {
  projectDir: string;
  projectRoot: string;
  engine: CompileEngine;
  route: CompileRoute;
  compileRoot: string;
  sourceFile?: string;
  pdfRel: string;
  success: boolean;
  pdfBytes?: ArrayBuffer;
  error?: string;
  errors?: Array<{ file?: string; line?: number; message: string }>;
  logTail?: string;
  source: "ui" | "agent";
  mainFile?: string;
};

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function texStem(rel: string): string {
  const base = rel.split("/").pop() ?? rel;
  return base.replace(/\.(tex|ltx|typ)$/i, "");
}
