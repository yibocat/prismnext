import * as fs from "node:fs";
import * as path from "node:path";
import { basename, extname, join } from "node:path";
import { compileLatex, compileStandaloneTexInPlace, extractErrorLines } from "./facade";
import { parseBibTeX } from "../lib/bibtex-parse";
import {
  resolveBibliographyFromMain,
  resolveBibliographyPath,
} from "../lib/bib-path-resolve";
import { isStandaloneTexDocument, resolveLatexRoot } from "../lib/latex-root";
import { resolveTypstRoot } from "../lib/typst-root";
import { citeCheckLiterature } from "../literature/facade";
import { scanManuscriptCiteKeys } from "../literature/manuscript-cite-scan";
import { notifyAgentCompilePreview } from "./compile-preview-notify";
import { TOOL_NAMES } from "../../shared/agent/tool-names";
import { projectCompileRel } from "../../shared/workbench/paths";
import { derivePaperPdfRel } from "../../shared/compile/artifact-key";
import { extractCiteKeysFromTex } from "../../shared/literature/tex-cite-keys";
import { extractTypstBibliographyRel } from "../../shared/literature/typst-cite-keys";

export { extractCiteKeysFromTex };

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
  typFilesScanned: number;
  bibPath: string | null;
  citeKeysInTex: string[];
  keysInBib: string[];
  missingKeys: string[];
  unusedKeys: string[];
  duplicateKeys: string[];
  libraryCheck?: ReturnType<typeof citeCheckLiterature>;
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

function readBibRel(
  projectRoot: string,
  rel: string,
): { bibPath: string; bibContent: string | null } {
  try {
    return { bibPath: rel, bibContent: fs.readFileSync(join(projectRoot, rel), "utf-8") };
  } catch {
    return { bibPath: rel, bibContent: null };
  }
}

function resolveTypstBibPath(
  projectRoot: string,
  mainFile: string,
): { bibPath: string | null; bibContent: string | null } {
  try {
    const content = fs.readFileSync(join(projectRoot, mainFile), "utf-8");
    const declared = extractTypstBibliographyRel(content);
    if (!declared) return { bibPath: null, bibContent: null };
    const dir = path.dirname(mainFile).replace(/\\/g, "/");
    const rel = (dir === "." ? declared : `${dir}/${declared}`).replace(/\/+/g, "/");
    return readBibRel(projectRoot, rel);
  } catch {
    return { bibPath: null, bibContent: null };
  }
}

function resolveBibPathForCheck(
  projectRoot: string,
  mainFile: string,
  bibPathHint?: string | null,
): { bibPath: string | null; bibContent: string | null } {
  const hint = bibPathHint?.trim();
  if (hint) {
    const { resolvedPath } = resolveBibliographyPath(projectRoot, mainFile, hint);
    if (resolvedPath) return readBibRel(projectRoot, resolvedPath);
  }

  if (mainFile.toLowerCase().endsWith(".typ")) {
    return resolveTypstBibPath(projectRoot, mainFile);
  }

  const mainContent = fs.readFileSync(join(projectRoot, mainFile), "utf-8");
  const resolved = resolveBibliographyFromMain(projectRoot, mainFile, mainContent);
  if (!resolved.resolvedPath) {
    return { bibPath: resolved.declaredInMain[0] ?? null, bibContent: null };
  }
  return readBibRel(projectRoot, resolved.resolvedPath);
}

/** Compare cite keys across project `.tex` / `.typ` vs `.bib` entries. */
export function checkBibConsistency(
  projectRoot: string,
  options?: { mainFile?: string | null; bibPath?: string | null; includeLibraryCheck?: boolean },
): BibCheckResult {
  const scan = scanManuscriptCiteKeys(projectRoot);
  const latexMain = resolveLatexRoot(projectRoot, options?.mainFile)?.mainFile;
  const typstMain = resolveTypstRoot(projectRoot, options?.mainFile)?.mainFile;
  const hint = options?.mainFile?.trim() ?? "";
  const mainFile = hint || latexMain || typstMain || "";
  if (!mainFile && scan.citeKeys.length === 0) {
    return {
      texFilesScanned: scan.texFilesScanned,
      typFilesScanned: scan.typFilesScanned,
      bibPath: null,
      citeKeysInTex: [],
      keysInBib: [],
      missingKeys: [],
      unusedKeys: [],
      duplicateKeys: [],
    };
  }

  const { bibPath, bibContent } = mainFile
    ? resolveBibPathForCheck(projectRoot, mainFile, options?.bibPath)
    : { bibPath: null, bibContent: null };

  const citeKeys = new Set(scan.citeKeys);
  const keysInBib = bibContent
    ? parseBibTeX(bibContent).map((e) => e.citekey).sort()
    : [];
  const bibKeySet = new Set(keysInBib);
  const citeList = [...citeKeys].sort();

  const missingKeys = citeList.filter((k) => !bibKeySet.has(k));
  const unusedKeys = keysInBib.filter((k) => !citeKeys.has(k));
  const duplicateKeys = bibContent ? findDuplicateBibKeys(bibContent) : [];

  const result: BibCheckResult = {
    texFilesScanned: scan.texFilesScanned,
    typFilesScanned: scan.typFilesScanned,
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

function readResolvedTex(projectRoot: string, relFile: string): string | null {
  try {
    return fs.readFileSync(path.join(projectRoot, relFile), "utf-8");
  } catch {
    return null;
  }
}

async function compileResolvedManuscript(
  projectRoot: string,
  root: NonNullable<ReturnType<typeof resolveLatexRoot>>,
  useTexlive: boolean,
): Promise<AgentCompileResult> {
  const result = await compileLatex(projectRoot, root.mainFile, useTexlive, { source: "agent" });
  const mainStem = basename(root.mainFile, extname(root.mainFile));
  const buildDir = projectCompileRel();
  const logContent = result.logContent ?? "";
  const errors = parseStructuredCompileErrors(logContent);
  const errorSummary =
    result.error?.trim() ||
    extractErrorLines(logContent).split("\n")[0]?.trim() ||
    (result.success ? "" : "Compilation failed");

  const logTail = logContent.slice(-2000);

  notifyAgentCompilePreview({
    projectDir: projectRoot,
    projectRoot,
    engine: "latex",
    route: "paper",
    compileRoot: root.mainFile,
    pdfRel: derivePaperPdfRel("latex", root.mainFile),
    success: result.success,
    pdfBytes: result.success ? result.pdfBytes : undefined,
    error: result.success ? undefined : errorSummary,
    errors,
    logTail,
    source: "agent",
    mainFile: root.mainFile,
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

/** Paper pipeline only — refuses `\documentclass{standalone}` figures. */
export async function compileManuscriptForAgent(
  projectRoot: string,
  mainFileHint?: string | null,
  useTexlive = false,
): Promise<AgentCompileResult | { error: string }> {
  const root = resolveLatexRoot(projectRoot, mainFileHint);
  if (!root) {
    return { error: "Could not resolve LaTeX main file for this project." };
  }

  const content = readResolvedTex(projectRoot, root.mainFile);
  if (content && isStandaloneTexDocument(content)) {
    return {
      error:
        `${root.mainFile} is a standalone figure. ` +
        `Call \`${TOOL_NAMES.latexCompileStandalone}\` with mainFile set to that path. ` +
        `\`${TOOL_NAMES.latexCompile}\` only compiles the paper into \`.workbench/compile/\`.`,
    };
  }

  return compileResolvedManuscript(projectRoot, root, useTexlive);
}

/** Standalone / TikZ figure — compiles in place next to the source. */
export async function compileStandaloneForAgent(
  projectRoot: string,
  mainFile: string,
): Promise<AgentCompileResult | { error: string }> {
  const normalized = mainFile.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized) {
    return {
      error:
        `mainFile is required. Pass the standalone .tex path. ` +
        `Do not use \`${TOOL_NAMES.latexCompile}\` for figures.`,
    };
  }

  const content = readResolvedTex(projectRoot, normalized);
  if (!content) {
    return { error: `Main file not found: ${normalized}` };
  }
  if (!isStandaloneTexDocument(content)) {
    return {
      error:
        `${normalized} is not \\documentclass{standalone}. ` +
        `Use \`${TOOL_NAMES.latexCompile}\` for the paper. ` +
        `\`${TOOL_NAMES.latexCompileStandalone}\` is for standalone figures only.`,
    };
  }

  const res = await compileStandaloneTexInPlace(projectRoot, normalized, { source: "agent" });
  return agentStandaloneCompileResult(normalized, res);
}

/**
 * Legacy / bridge router: manuscript → paper cache, standalone → in place.
 * Native agent tools call the specific functions above — do not send figures
 * through `latex-compile`.
 */
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
  // Never sync `figures/` into `.workbench/compile/` or push the result
  // into the TeX workspace paper preview.
  const resolvedContent = readResolvedTex(projectRoot, root.mainFile);
  if (resolvedContent && isStandaloneTexDocument(resolvedContent)) {
    return compileStandaloneForAgent(projectRoot, root.mainFile);
  }

  return compileResolvedManuscript(projectRoot, root, useTexlive);
}
