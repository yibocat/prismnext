import { parseLatexLog } from "@/lib/compile/parse-latex-log";
import { isTypstStandaloneRel } from "@/lib/typst/resolve-typst-root";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import {
  compileEngineFromRelPath,
  type CompileArtifactKey,
} from "@shared/compile/artifact-key";
import { parseTypstLog } from "@shared/compile/typst-log";

export type CompileProblemEntry = {
  file?: string;
  line?: number;
  message: string;
  severity?: "error" | "warning";
};

export type CompileDiagnostics = {
  error: string | null;
  log: string | null;
  structuredErrors: CompileProblemEntry[];
};

/** Cache / problems-strip key for a compile root. Used by LaTeX PDF and Typst live/PDF. */
export function paperKeyFromMainFile(projectRoot: string, mainFile: string): CompileArtifactKey {
  const engine = compileEngineFromRelPath(mainFile) ?? "latex";
  const manuscriptDir = useWorkspaceConfigStore.getState().manuscriptConfig?.dir ?? null;
  if (engine === "typst" && isTypstStandaloneRel(mainFile, manuscriptDir)) {
    return {
      projectRoot,
      engine,
      route: "standalone",
      sourceFile: mainFile.replace(/\\/g, "/"),
    };
  }
  return {
    projectRoot,
    engine,
    route: "paper",
    compileRoot: mainFile.replace(/\\/g, "/"),
  };
}

export function diagnosticsFromCompileLog(
  mainFile: string,
  error: string | null,
  log: string | null,
): CompileDiagnostics {
  const engine = compileEngineFromRelPath(mainFile);
  let structuredErrors: CompileProblemEntry[] = [];
  if (engine === "typst") {
    structuredErrors = parseTypstLog(log ?? "").errors.map((e) => ({
      file: e.file,
      line: e.line,
      message: e.message,
      severity: "error" as const,
    }));
  } else {
    structuredErrors = parseLatexLog(log).map((p) => ({
      file: p.file,
      line: p.line,
      message: p.message,
      severity: p.severity,
    }));
  }
  if (error) {
    if (structuredErrors.length === 0) {
      structuredErrors = [{ message: error, severity: "error" }];
    }
  } else {
    structuredErrors = structuredErrors.filter((e) => e.severity === "warning");
  }
  return { error, log, structuredErrors };
}
