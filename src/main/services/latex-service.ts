import * as fs from "node:fs";
import * as path from "node:path";
import { basename, extname, join } from "node:path";
import { compileLatex, compileStandaloneTexInPlace, extractErrorLines } from "./compiler";
import { parseBibTeX } from "../lib/bibtex-parse";
import {
  resolveBibliographyFromMain,
  resolveBibliographyPath,
} from "../lib/bib-path-resolve";
import { isStandaloneTexDocument, resolveLatexRoot, walkTexFiles } from "../lib/latex-root";
import { citeCheckLiterature } from "./literature-service";
import { notifyAgentCompilePreview } from "./compile-preview-notify";

export interface CompileErrorEntry {
  file?: string;
  line?: number;
  message: string;
}

export interface AgentCompileResult {
  success: boolean;
  mainFile: string;
  buildDir: string;
  pdfPath?: string;
  errors: CompileErrorEntry[];
  errorSummary: string;
  logTail: string;
}

export interface BibCheckResult {
  texFilesScanned: number;
  bibPath: string | null;
  citeKeysInTex: string[];
  keysInBib: string[];
  missingKeys: string[];
  unusedKeys: string[];
  duplicateKeys: string[];
  libraryCheck?: ReturnType<typeof citeCheckLiterature>;
}

const CITE_COMMAND_RE =
  /\\(?:[a-zA-Z@*]+)?cite(?:[a-zA-Z*]*)?(?:\*)?\{([^}]*)\}/g;

/** Extract citation keys from LaTeX source. */
export function extractCiteKeysFromTex(texContent: string): string[] {
  const keys = new Set<string>();
  for (const match of texContent.matchAll(CITE_COMMAND_RE)) {
    const inner = match[1]?.trim();
    if (!inner || inner === "*") continue;
    for (const part of inner.split(",")) {
      const key = part.trim();
      if (key) keys.add(key);
    }
  }
  return [...keys].sort();
}

function findDuplicateBibKeys(bibContent: string): string[] {
  const counts = new Map<string, number>();
  for (const match of bibContent.matchAll(/@\w+\s*\{\s*([^,\s}]+)/g)) {
    const key = match[1]?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}

/** Parse TeX log into structured error entries. */
export function parseStructuredCompileErrors(log: string): CompileErrorEntry[] {
  if (!log) return [];
  const lines = log.split("\n");
  const errors: CompileErrorEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("!")) continue;
    const message = line.slice(1).trim();
    let file: string | undefined;
    let lineNum: number | undefined;

    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const probe = lines[j]!;
      const lMatch = probe.match(/^l\.(\d+)/);
      if (lMatch) {
        lineNum = Number.parseInt(lMatch[1]!, 10);
        break;
      }
      const fMatch = probe.match(/^([^:]+):(\d+):/);
      if (fMatch) {
        file = fMatch[1]!.replace(/^\.\//, "");
        lineNum = Number.parseInt(fMatch[2]!, 10);
        break;
      }
    }

    errors.push({ file, line: lineNum, message });
    if (errors.length >= 10) break;
  }

  return errors;
}

function resolveBibPathForCheck(
  projectRoot: string,
  mainFile: string,
  bibPathHint?: string | null,
): { bibPath: string | null; bibContent: string | null } {
  const hint = bibPathHint?.trim();
  if (hint) {
    const { resolvedPath } = resolveBibliographyPath(projectRoot, mainFile, hint);
    if (resolvedPath) {
      const abs = join(projectRoot, resolvedPath);
      try {
        return { bibPath: resolvedPath, bibContent: fs.readFileSync(abs, "utf-8") };
      } catch {
        return { bibPath: resolvedPath, bibContent: null };
      }
    }
  }

  const mainContent = fs.readFileSync(join(projectRoot, mainFile), "utf-8");
  const resolved = resolveBibliographyFromMain(projectRoot, mainFile, mainContent);
  if (!resolved.resolvedPath) {
    return { bibPath: resolved.declaredInMain[0] ?? null, bibContent: null };
  }
  try {
    return {
      bibPath: resolved.resolvedPath,
      bibContent: fs.readFileSync(join(projectRoot, resolved.resolvedPath), "utf-8"),
    };
  } catch {
    return { bibPath: resolved.resolvedPath, bibContent: null };
  }
}

/** Compare \\cite keys across project .tex files vs .bib entries. */
export function checkBibConsistency(
  projectRoot: string,
  options?: { mainFile?: string | null; bibPath?: string | null; includeLibraryCheck?: boolean },
): BibCheckResult {
  const root = resolveLatexRoot(projectRoot, options?.mainFile);
  const mainFile = root?.mainFile ?? options?.mainFile?.trim() ?? "";
  if (!mainFile) {
    return {
      texFilesScanned: 0,
      bibPath: null,
      citeKeysInTex: [],
      keysInBib: [],
      missingKeys: [],
      unusedKeys: [],
      duplicateKeys: [],
    };
  }

  const texFiles = walkTexFiles(projectRoot);
  const citeKeys = new Set<string>();
  for (const rel of texFiles) {
    try {
      const content = fs.readFileSync(join(projectRoot, rel), "utf-8");
      for (const key of extractCiteKeysFromTex(content)) {
        citeKeys.add(key);
      }
    } catch {
      // skip unreadable
    }
  }

  const { bibPath, bibContent } = resolveBibPathForCheck(
    projectRoot,
    mainFile,
    options?.bibPath,
  );

  const keysInBib = bibContent
    ? parseBibTeX(bibContent).map((e) => e.citekey).sort()
    : [];
  const bibKeySet = new Set(keysInBib);
  const citeList = [...citeKeys].sort();

  const missingKeys = citeList.filter((k) => !bibKeySet.has(k));
  const unusedKeys = keysInBib.filter((k) => !citeKeys.has(k));
  const duplicateKeys = bibContent ? findDuplicateBibKeys(bibContent) : [];

  const result: BibCheckResult = {
    texFilesScanned: texFiles.length,
    bibPath,
    citeKeysInTex: citeList,
    keysInBib,
    missingKeys,
    unusedKeys,
    duplicateKeys,
  };

  if (options?.includeLibraryCheck !== false) {
    try {
      result.libraryCheck = citeCheckLiterature(projectRoot);
    } catch {
      // optional — no library.db yet
    }
  }

  return result;
}

function agentStandaloneCompileResult(
  mainFile: string,
  res: Awaited<ReturnType<typeof compileStandaloneTexInPlace>>,
): AgentCompileResult {
  const logContent = res.logContent ?? "";
  const relDir = path.dirname(mainFile).replace(/\\/g, "/");
  return {
    success: res.success,
    mainFile,
    buildDir: relDir === "." ? "" : relDir,
    pdfPath: res.success ? res.pdfPath : undefined,
    errors: parseStructuredCompileErrors(logContent),
    errorSummary: res.error?.trim() ||
      (res.success ? "" : "Compilation failed"),
    logTail: logContent.slice(-2000),
  };
}

/** Compile for agent tools — no pdf bytes in output. */
export async function compileForAgent(
  projectRoot: string,
  mainFileHint?: string | null,
  useTexlive = false,
): Promise<AgentCompileResult | { error: string }> {
  const root = resolveLatexRoot(projectRoot, mainFileHint);
  if (!root) {
    return { error: "Could not resolve LaTeX main file for this project." };
  }

  // Route by document class, not by "is this the workspace main file".
  // A `\documentclass{standalone}` figure must compile in its own folder.
  // Never sync `figures/` into `.prismnext/compile/` or push the result
  // into the TeX workspace paper preview.
  let resolvedContent: string | null = null;
  try {
    resolvedContent = fs.readFileSync(path.join(projectRoot, root.mainFile), "utf-8");
  } catch {
    resolvedContent = null;
  }
  if (resolvedContent && isStandaloneTexDocument(resolvedContent)) {
    const res = await compileStandaloneTexInPlace(projectRoot, root.mainFile);
    return agentStandaloneCompileResult(root.mainFile, res);
  }

  const result = await compileLatex(projectRoot, root.mainFile, useTexlive);
  const mainStem = basename(root.mainFile, extname(root.mainFile));
  const buildDir = ".prismnext/compile";
  const logContent = result.logContent ?? "";
  const errors = parseStructuredCompileErrors(logContent);
  const errorSummary =
    result.error?.trim() ||
    extractErrorLines(logContent).split("\n")[0]?.trim() ||
    (result.success ? "" : "Compilation failed");

  const logTail = logContent.slice(-2000);

  notifyAgentCompilePreview({
    projectDir: projectRoot,
    success: result.success,
    mainFile: root.mainFile,
    pdfBytes: result.success ? result.pdfBytes : undefined,
    error: result.success ? undefined : errorSummary,
    logTail,
  });

  return {
    success: result.success,
    mainFile: root.mainFile,
    buildDir,
    pdfPath: result.success ? `${buildDir}/${mainStem}.pdf` : undefined,
    errors,
    errorSummary,
    logTail,
  };
}
