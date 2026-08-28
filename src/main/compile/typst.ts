import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { compileEngineFromRelPath, derivePaperBuildDir, derivePaperPdfRel, deriveStandalonePdfRel } from "../../shared/compile/artifact-key";
import {
  typstExportDirRel,
  typstLiveDirRel,
  typstOutputUsesPageTemplate,
  type TypstCliFormat,
} from "../../shared/compile/typst-format";
import { findManuscriptConfig } from "../../shared/workbench/workspace-folder";
import { TOOL_NAMES } from "../../shared/agent/tool-names";
import { createLogger } from "../app/logger";
import { readWorkspaceDirs } from "../lib/workspace-dirs";
import { isTypstStandaloneRel, resolveTypstRoot } from "../lib/typst-root";
import { notifyAgentCompilePreview } from "./compile-preview-notify";
import type { CompileLatexOptions } from "./types";
import { parseTypstLog } from "./typst-log";
import { resolveTypstBinary, typstUnavailableError } from "./typst-binary";

const log = createLogger("typst", "compile");

const COMPILE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.PRISM_COMPILE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 10_000 ? raw : 60_000;
})();

export interface TypstCompileResult {
  success: boolean;
  pdfBytes?: Buffer;
  pdfPath?: string;
  error?: string;
  logContent?: string;
  buildDir: string;
}

export type TypstExportFile = { name: string; bytes: Buffer };

export type TypstWireFile = { name: string; text?: string; base64?: string };

export function encodeTypstWireFiles(files: TypstExportFile[]): TypstWireFile[] {
  return files.map((file) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".png") || lower.endsWith(".pdf")) {
      return { name: file.name, base64: file.bytes.toString("base64") };
    }
    return { name: file.name, text: file.bytes.toString("utf8") };
  });
}

export function decodeTypstWireFiles(files: TypstWireFile[]): TypstExportFile[] {
  return files.map((file) => ({
    name: file.name,
    bytes: file.base64 != null
      ? Buffer.from(file.base64, "base64")
      : Buffer.from(file.text ?? "", "utf8"),
  }));
}

export interface TypstFormatCompileResult {
  success: boolean;
  files?: TypstExportFile[];
  error?: string;
  logContent?: string;
  buildDir: string;
}

export function typstCompileArgs(projectDir: string, absMain: string, absPdf: string): string[] {
  return ["compile", "--root", projectDir, absMain, absPdf];
}

/**
 * Native CLI args. Same compiler / fonts / packages as PDF compile.
 * Do not pass `--ignore-system-fonts` — live SVG must see STSong / SimSun / etc.
 */
export function typstFormatCompileArgs(
  projectDir: string,
  absMain: string,
  absOut: string,
  format: TypstCliFormat,
): string[] {
  const args = ["compile", "--root", projectDir, "--format", format];
  if (format === "html") args.push("--features", "html");
  args.push(absMain, absOut);
  return args;
}

export function typstLiveSvgArgs(projectDir: string, absMain: string, absOutTemplate: string): string[] {
  return typstFormatCompileArgs(projectDir, absMain, absOutTemplate, "svg");
}

async function flushDirtyFiles(
  projectDir: string,
  dirtyFiles: Array<{ relPath: string; content: string }> | undefined,
): Promise<void> {
  for (const { relPath, content } of dirtyFiles ?? []) {
    const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
    const abs = join(projectDir, normalized);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf-8");
  }
}

function runTypst(
  bin: string,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, COMPILE_TIMEOUT_MS);
    proc.stdout?.on("data", (data) => {
      stdout += data;
    });
    proc.stderr?.on("data", (data) => {
      stderr += data;
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: timedOut ? -1 : (code ?? 1),
        stdout,
        stderr,
        timedOut,
      });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${err.message}`.trim(),
        timedOut,
      });
    });
  });
}

function combinedLog(stdout: string, stderr: string): string {
  return [stdout, stderr].filter((part) => part.trim()).join("\n");
}

async function runTypstToPdf(
  projectDir: string,
  mainFile: string,
  absPdf: string,
  buildDir: string,
  options: CompileLatexOptions,
): Promise<TypstCompileResult> {
  const binary = await resolveTypstBinary();
  if (!binary.available) {
    return {
      success: false,
      error: typstUnavailableError(),
      buildDir,
    };
  }

  const absMain = join(projectDir, mainFile);
  if (!existsSync(absMain)) {
    return { success: false, error: `Main file not found: ${mainFile}`, buildDir };
  }

  const args = typstCompileArgs(projectDir, absMain, absPdf);
  log.info("compile.start", { mainFile, root: projectDir });
  const ran = await runTypst(binary.path, args, projectDir);
  const logContent = combinedLog(ran.stdout, ran.stderr);
  if (ran.timedOut) {
    return { success: false, error: "Typst compile timed out.", logContent, buildDir };
  }
  if (ran.exitCode !== 0 || !existsSync(absPdf)) {
    const parsed = parseTypstLog(ran.stderr || logContent);
    return {
      success: false,
      error: parsed.errorSummary || "Compilation failed",
      logContent,
      buildDir,
    };
  }

  const pdfOnDisk = options.pdfOnDisk ?? options.fast === true;
  const pdfBytes = pdfOnDisk ? undefined : await readFile(absPdf);
  return {
    success: true,
    pdfBytes,
    pdfPath: absPdf,
    logContent,
    buildDir,
  };
}

export async function compileTypst(
  projectDir: string,
  mainFile: string,
  options: CompileLatexOptions = {},
): Promise<TypstCompileResult> {
  const buildDirRel = derivePaperBuildDir("typst");
  const buildDir = join(projectDir, buildDirRel);
  await mkdir(buildDir, { recursive: true });
  await flushDirtyFiles(projectDir, options.dirtyFiles);
  const stem = basename(mainFile, extname(mainFile));
  const absPdf = join(buildDir, `${stem}.pdf`);
  return runTypstToPdf(projectDir, mainFile, absPdf, buildDirRel, options);
}

export async function compileStandaloneTypstInPlace(
  projectDir: string,
  mainFile: string,
  options: CompileLatexOptions = {},
): Promise<TypstCompileResult> {
  const normalized = mainFile.replace(/\\/g, "/").replace(/^\.\//, "");
  const absMain = join(projectDir, normalized);
  const sourceDir = dirname(absMain);
  const stem = basename(normalized, extname(normalized));
  const absPdf = join(sourceDir, `${stem}.pdf`);
  const relDir = dirname(normalized);
  const buildDir = relDir === "." ? "." : relDir;
  await flushDirtyFiles(projectDir, options.dirtyFiles);
  return runTypstToPdf(projectDir, normalized, absPdf, buildDir, options);
}

export async function compileTypstForIpc(
  projectDir: string,
  mainFile: string,
  options: CompileLatexOptions = {},
): Promise<TypstCompileResult> {
  const manuscript = findManuscriptConfig(readWorkspaceDirs(projectDir));
  const manuscriptDir = manuscript?.dir ?? null;
  if (isTypstStandaloneRel(mainFile, manuscriptDir)) {
    return compileStandaloneTypstInPlace(projectDir, mainFile, options);
  }
  return compileTypst(projectDir, mainFile, options);
}

function pageSortKey(name: string): number {
  const match = name.match(/(\d+)(?=\.[^.]+$)/);
  return match ? Number(match[1]) : 0;
}

async function emptyDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

async function readOutputFiles(dir: string): Promise<TypstExportFile[]> {
  const names = (await readdir(dir)).filter((name) => !name.startsWith("."));
  names.sort((a, b) => pageSortKey(a) - pageSortKey(b) || a.localeCompare(b));
  const files: TypstExportFile[] = [];
  for (const name of names) {
    const bytes = await readFile(join(dir, name));
    files.push({ name, bytes });
  }
  return files;
}

export async function compileTypstToFormat(
  projectDir: string,
  mainFile: string,
  format: TypstCliFormat,
  options: CompileLatexOptions = {},
  outDirRel?: string,
): Promise<TypstFormatCompileResult> {
  const binary = await resolveTypstBinary();
  const normalized = mainFile.replace(/\\/g, "/").replace(/^\.\//, "");
  const stem = basename(normalized, extname(normalized));
  const buildDirRel = outDirRel ?? typstExportDirRel(stem);
  const buildDir = join(projectDir, buildDirRel);
  if (!binary.available) {
    return { success: false, error: typstUnavailableError(), buildDir: buildDirRel };
  }

  const absMain = join(projectDir, normalized);
  if (!existsSync(absMain)) {
    return { success: false, error: `Main file not found: ${mainFile}`, buildDir: buildDirRel };
  }

  await flushDirtyFiles(projectDir, options.dirtyFiles);
  await emptyDir(buildDir);

  const absOut = typstOutputUsesPageTemplate(format)
    ? join(buildDir, `${stem}-{p}.${format}`)
    : join(buildDir, `${stem}.${format}`);
  const args = typstFormatCompileArgs(projectDir, absMain, absOut, format);
  log.info("compile.format", { mainFile: normalized, format, root: projectDir });
  const ran = await runTypst(binary.path, args, projectDir);
  const logContent = combinedLog(ran.stdout, ran.stderr);
  if (ran.timedOut) {
    return { success: false, error: "Typst compile timed out.", logContent, buildDir: buildDirRel };
  }
  const files = await readOutputFiles(buildDir);
  if (ran.exitCode !== 0 || files.length === 0) {
    const parsed = parseTypstLog(ran.stderr || logContent);
    return {
      success: false,
      error: parsed.errorSummary || "Compilation failed",
      logContent,
      buildDir: buildDirRel,
    };
  }
  return { success: true, files, logContent, buildDir: buildDirRel };
}

export async function compileTypstLiveSvg(
  projectDir: string,
  mainFile: string,
  options: CompileLatexOptions = {},
): Promise<TypstFormatCompileResult> {
  const normalized = mainFile.replace(/\\/g, "/").replace(/^\.\//, "");
  const stem = basename(normalized, extname(normalized));
  return compileTypstToFormat(projectDir, normalized, "svg", options, typstLiveDirRel(stem));
}

function withAgentNotify(
  projectRoot: string,
  mainFile: string,
  route: "paper" | "standalone",
  result: TypstCompileResult,
): TypstCompileResult {
  const parsed = parseTypstLog(result.logContent ?? "");
  const pdfRel = route === "paper"
    ? derivePaperPdfRel("typst", mainFile)
    : deriveStandalonePdfRel(mainFile);
  notifyAgentCompilePreview({
    projectDir: projectRoot,
    projectRoot,
    engine: "typst",
    route,
    compileRoot: route === "paper" ? mainFile : mainFile,
    sourceFile: route === "standalone" ? mainFile : undefined,
    pdfRel,
    success: result.success,
    pdfBytes: result.success ? result.pdfBytes : undefined,
    error: result.success ? undefined : result.error,
    errors: parsed.errors,
    logTail: (result.logContent ?? "").slice(-2000),
    source: "agent",
    mainFile,
  });
  return result;
}

export async function compileTypstForAgent(
  projectRoot: string,
  mainFileHint?: string | null,
): Promise<
  | {
      success: boolean;
      mainFile: string;
      buildDir: string;
      pdfPath?: string;
      errors: Array<{ file?: string; line?: number; message: string }>;
      errorSummary: string;
      logTail: string;
    }
  | { error: string }
> {
  const hint = mainFileHint?.trim() ?? "";
  if (hint && compileEngineFromRelPath(hint) === "latex") {
    return {
      error:
        `${hint} is a LaTeX file. Call \`${TOOL_NAMES.latexCompile}\` instead of typst-compile.`,
    };
  }
  const resolved = resolveTypstRoot(projectRoot, hint || undefined);
  if (!resolved) {
    return { error: "Could not resolve Typst main file for this project." };
  }
  if (isTypstStandaloneRel(resolved.mainFile, resolved.manuscriptFolder)) {
    return {
      error:
        `${resolved.mainFile} is a standalone Typst file. ` +
        `Call \`${TOOL_NAMES.typstCompileStandalone}\` with mainFile set to that path.`,
    };
  }
  const result = await compileTypst(projectRoot, resolved.mainFile, { source: "agent" });
  withAgentNotify(projectRoot, resolved.mainFile, "paper", result);
  const parsed = parseTypstLog(result.logContent ?? "");
  return {
    success: result.success,
    mainFile: resolved.mainFile,
    buildDir: result.buildDir,
    pdfPath: result.success ? `${result.buildDir}/${basename(resolved.mainFile, extname(resolved.mainFile))}.pdf` : undefined,
    errors: parsed.errors,
    errorSummary: result.success ? "" : (result.error || parsed.errorSummary || "Compilation failed"),
    logTail: (result.logContent ?? "").slice(-2000),
  };
}

export async function compileStandaloneTypstForAgent(
  projectRoot: string,
  mainFile: string,
): Promise<
  | {
      success: boolean;
      mainFile: string;
      buildDir: string;
      pdfPath?: string;
      errors: Array<{ file?: string; line?: number; message: string }>;
      errorSummary: string;
      logTail: string;
    }
  | { error: string }
> {
  const normalized = mainFile.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized) {
    return { error: `mainFile is required. Pass the standalone .typ path.` };
  }
  if (compileEngineFromRelPath(normalized) === "latex") {
    return {
      error:
        `${normalized} is a LaTeX file. Call \`${TOOL_NAMES.latexCompileStandalone}\` instead.`,
    };
  }
  const manuscript = findManuscriptConfig(readWorkspaceDirs(projectRoot));
  if (!isTypstStandaloneRel(normalized, manuscript?.dir ?? null)) {
    return {
      error:
        `${normalized} is part of the manuscript. Use \`${TOOL_NAMES.typstCompile}\` for the paper.`,
    };
  }
  const result = await compileStandaloneTypstInPlace(projectRoot, normalized, { source: "agent" });
  withAgentNotify(projectRoot, normalized, "standalone", result);
  const parsed = parseTypstLog(result.logContent ?? "");
  return {
    success: result.success,
    mainFile: normalized,
    buildDir: result.buildDir,
    pdfPath: result.success ? deriveStandalonePdfRel(normalized) : undefined,
    errors: parsed.errors,
    errorSummary: result.success ? "" : (result.error || parsed.errorSummary || "Compilation failed"),
    logTail: (result.logContent ?? "").slice(-2000),
  };
}
