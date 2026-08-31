import { parseLatexLog } from "@/lib/compile/parse-latex-log";
import { isTypstStandaloneRel } from "@/lib/typst/resolve-typst-root";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import {
  compileEngineFromRelPath,
  type CompileArtifactKey,
} from "@shared/compile/artifact-key";
import { parseTypstLog } from "@shared/compile/typst-log";
import type { TypstDiagnosticItem } from "@shared/typst/session";

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

/** LSP publishDiagnostics → Files toolbar / CompileErrorPane. Warnings do not light the red badge. */
export function diagnosticsFromTypstLspItems(items: TypstDiagnosticItem[]): CompileDiagnostics {
  const errors = items.filter((item) => item.severity === "error");
  if (errors.length === 0) {
    return { error: null, log: null, structuredErrors: [] };
  }
  return {
    error: errors[0]?.message ?? "Typst error",
    log: null,
    structuredErrors: errors.map((item) => ({
      file: item.relPath,
      line: item.line,
      message: item.message,
      severity: "error" as const,
    })),
  };
}

/**
 * Artifact keys for a diagnostics event.
 * `didChange` used to rebind the IPC callback with an empty compileRoot — never trust that.
 */
export function compileRootsForTypstDiagnostics(args: {
  compileRootFromEvent: string;
  previewCompileRoots: string[];
  itemRelPaths: string[];
}): string[] {
  const fromEvent = args.compileRootFromEvent.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (fromEvent) return [fromEvent];
  const previews = uniqueRels(args.previewCompileRoots);
  if (previews.length > 0) return previews;
  return uniqueRels(args.itemRelPaths);
}

function uniqueRels(rels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rels) {
    const rel = raw.replace(/\\/g, "/").replace(/^\/+/, "").trim();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  return out;
}
