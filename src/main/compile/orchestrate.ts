import { spawn, execSync, spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname, basename, extname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { syncTexSourceToBuildDir, syncTexSourceIncremental } from "../lib/bib-path-resolve";
import { detectBibTool, detectTexEngine, type TexEngine } from "../lib/tex-detect";
import { isHostRuntimeProcess, resolveTectonicBinary, tectonicUnavailableError } from "./tectonic-binary";
import { getTectonicDaemonSession } from "./tectonic-daemon";

import { createLogger } from "../app/logger";
import { derivePaperBuildDir, derivePaperPdfRel } from "../../shared/compile/artifact-key";
import { extractErrorLines, oneLineError, tectonicEngineId } from "./log";
import type {
  CompileLatexOptions,
  CompileRoute,
  CompileSource,
  StandaloneCompileOptions,
  StandaloneCompileResult,
} from "./types";

const log = createLogger("compiler", "compile");

const PROJECT_LOCK_BUSY_MS = 3_000;

type EngineCompileResult = {
  success: boolean;
  logContent: string;
  superseded?: boolean;
  timedOut?: boolean;
  extraPasses?: number;
};

const MAX_CONCURRENT = 3;
const COMPILE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.PRISM_COMPILE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 10_000 ? raw : 60_000;
})();

interface BuildInfo {
  workDir: string;
  /** Project-relative main file (e.g. manuscript/main.tex) */
  mainFileName: string;
  /** Source tree mirrored into workDir (e.g. manuscript) */
  sourceDirRel: string;
}

interface CompileResult {
  success: boolean;
  pdfBytes?: Buffer;
  pdfPath?: string;
  error?: string;
  logContent?: string;
  buildDir: string;
}

interface SynctexResult {
  file: string;
  line: number;
  column: number;
}

interface SynctexForwardResult {
  page: number;
  x: number;
  y: number;
  height: number;
  width: number;
}

// Global state
let activeCount = 0;
const projectLocks = new Map<string, Promise<void>>();
const lastBuilds = new Map<string, BuildInfo>();

/**
 * Persistent build directory inside the project.
 */
function persistentBuildDir(projectDir: string): string {
  return join(projectDir, derivePaperBuildDir("latex"));
}

/**
 * Check if the log contains real TeX errors.
 */
function hasRealErrors(log: string): boolean {
  return lines(log).some((l) => l.startsWith("!") || l.includes("Error:"));
}

function lines(text: string): string[] {
  return text.split("\n");
}

/**
 * Resolve a TeXLive engine binary to its full path.
 * GUI apps on macOS lack the user's shell PATH.
 */
export async function findTexliveBinary(name: string): Promise<string | null> {
  // 1. Try PATH (works when launched from terminal)
  try {
    const result = execSync(`which ${name}`, { encoding: "utf-8", timeout: 5000 });
    const path = result.trim();
    if (path && existsSync(path)) return path;
  } catch {
    // Ignore
  }

  // 2. Check standard TeXLive locations
  const standardPaths: string[] = [];

  if (process.platform === "darwin") {
    standardPaths.push(
      `/Library/TeX/texbin/${name}`,
      `/usr/local/texlive/2025/bin/universal-darwin/${name}`,
      `/usr/local/texlive/2024/bin/universal-darwin/${name}`,
      `/opt/homebrew/bin/${name}`,
      `/usr/bin/${name}`
    );
  } else if (process.platform === "linux") {
    standardPaths.push(
      `/usr/local/texlive/2025/bin/x86_64-linux/${name}`,
      `/usr/local/texlive/2024/bin/x86_64-linux/${name}`,
      `/usr/bin/${name}`
    );
  } else if (process.platform === "win32") {
    standardPaths.push(
      `C:\\texlive\\2025\\bin\\windows\\${name}.exe`,
      `C:\\texlive\\2024\\bin\\windows\\${name}.exe`
    );
  }

  for (const p of standardPaths) {
    if (existsSync(p)) return p;
  }

  // 3. macOS: ask login shell for PATH
  if (process.platform === "darwin") {
    try {
      const result = execSync(`/bin/zsh -l -c "which ${name}"`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      const path = result.trim();
      if (path && existsSync(path)) return path;
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Get the PATH that includes TeXLive bin directory.
 */
function texliveEnvPath(enginePath: string): string {
  const texbin = dirname(enginePath);
  const currentPath = process.env.PATH || "";
  if (currentPath.includes(texbin)) {
    return currentPath;
  }
  return process.platform === "win32"
    ? `${texbin};${currentPath}`
    : `${texbin}:${currentPath}`;
}


/**
 * Run a command with timeout.
 */
function runWithTimeout(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeoutMs);

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
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr, timedOut: false });
    });
  });
}

function logTail(log: string): string {
  const idx = log.lastIndexOf("Output written on");
  return idx >= 0 ? log.slice(idx) : log;
}

/** True when in-text \\cite{} keys are still missing from the .bbl. */
function logHasUndefinedCitations(log: string): boolean {
  // Warnings appear before "Output written on" — scan the whole log.
  return /Citation '[^']+' on page \d+ undefined/i.test(log)
    || /Citation '[^']+' undefined/i.test(log)
    || /There were undefined citations/i.test(log);
}

function logNeedsBibliographyRerun(log: string): boolean {
  const tail = logTail(log);
  return /Rerun to get (cross-references|bibliography)/i.test(tail)
    || /Citation '[^']+' undefined/i.test(tail);
}

function logNeedsBibtexRerun(log: string): boolean {
  return /Please \(re\)run BibTeX/i.test(log);
}

function logNeedsBiberRerun(log: string): boolean {
  return /Please \(re\)run Biber/i.test(log);
}

/**
 * Whether the bibliography pass finished in a usable state.
 *
 * An empty bibliography (document uses biblatex/`\\printbibliography` but has
 * no `\\cite{...}` yet) is **resolved** — biber writes a stub `.bbl` without
 * `\\entry{...}`. Only undefined citation keys are a real failure.
 */
export function bibliographyLooksResolved(
  buildDir: string,
  mainStem: string,
  logContent: string,
): boolean {
  if (logHasUndefinedCitations(logContent)) return false;
  const bblPath = join(buildDir, `${mainStem}.bbl`);
  return existsSync(bblPath);
}

/**
 * Compile with Tectonic. Compiles in `cwd` and outputs artifacts to `outDir`.
 *
 * Accepts the resolved tectonic binary path so that compilation works even
 * when the Electron process doesn't have TeX bin directories on its PATH
 * (common on macOS when launched from Finder/Dock).
 */
async function compileWithTectonic(
  cwd: string,
  mainFile: string,
  outDir: string,
  tectonicPath: string,
  opts?: { synctex?: boolean; fast?: boolean },
): Promise<EngineCompileResult> {
  const mainStem = basename(mainFile, extname(mainFile));
  const logPath = join(outDir, `${mainStem}.log`);
  const pdfPath = join(outDir, `${mainStem}.pdf`);

  let exitCode: number;
  let timedOut = false;

  // Live fast path: reuse a warm daemon session (Node worker + hot build dir).
  if (opts?.fast) {
    try {
      const session = getTectonicDaemonSession(tectonicPath, cwd, mainFile);
      ({ exitCode } = await session.compile(true));
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code === "SUPERSEDED") {
        return {
          success: existsSync(pdfPath),
          logContent: "",
          superseded: true,
        };
      }
      log.warn("compile.daemon_fallback", {
        error: oneLineError(err instanceof Error ? err.message : String(err)),
      });
      const once = await runTectonicOnce(tectonicPath, cwd, outDir, mainFile, opts);
      exitCode = once.exitCode;
      timedOut = once.timedOut;
    }
  } else {
    const once = await runTectonicOnce(tectonicPath, cwd, outDir, mainFile, opts);
    exitCode = once.exitCode;
    timedOut = once.timedOut;
  }

  let logContent = "";
  try {
    logContent = await readFile(logPath, "utf-8");
  } catch {
    logContent = "";
  }

  if (exitCode !== 0 && !logContent) {
    logContent = `Tectonic exited with code ${exitCode}. See stderr output above (if any).`;
  }

  return {
    success: existsSync(pdfPath),
    logContent,
    timedOut,
  };
}

async function runTectonicOnce(
  tectonicPath: string,
  cwd: string,
  outDir: string,
  mainFile: string,
  opts?: { synctex?: boolean; fast?: boolean },
): Promise<{ exitCode: number; timedOut: boolean }> {
  const args = ["--keep-logs", "--keep-intermediates", "--outdir", outDir];
  if (opts?.synctex !== false) args.push("--synctex");
  if (opts?.fast) args.push("-r", "0");
  args.push(mainFile);
  const { exitCode, timedOut } = await runWithTimeout(tectonicPath, args, cwd, process.env, COMPILE_TIMEOUT_MS);
  return { exitCode, timedOut };
}

/**
 * Compile with TeXLive (xelatex/pdflatex/lualatex).
 * Expects `cwd === outDir` with sources already synced into the build dir.
 */
async function compileWithTexlive(
  cwd: string,
  mainFile: string,
  engine: TexEngine,
  texContent: string,
  outDir: string,
  opts?: { synctex?: boolean; fast?: boolean },
): Promise<EngineCompileResult> {
  const enginePath = await findTexliveBinary(engine);
  if (!enginePath) {
    throw new Error(`${engine} not found. Install TeXLive or add it to your PATH.`);
  }

  const envPath = texliveEnvPath(enginePath);
  const env = { ...process.env, PATH: envPath };
  const bibTool = detectBibTool(texContent);
  const mainStem = basename(mainFile, extname(mainFile));
  const synctexArg = opts?.synctex === false ? "-synctex=0" : "-synctex=1";

  const commonArgs = [synctexArg, "-interaction=nonstopmode"];
  const logPath = join(outDir, `${mainStem}.log`);

  let logContent = "";
  let timedOut = false;
  let extraPasses = 0;

  const runLatex = async () => {
    const r = await runWithTimeout(enginePath, [...commonArgs, mainFile], cwd, env, COMPILE_TIMEOUT_MS);
    if (r.timedOut) timedOut = true;
    return r;
  };

  const readCompileLog = async (): Promise<string> => {
    try {
      return await readFile(logPath, "utf-8");
    } catch {
      return "";
    }
  };

  // Pass 1
  await runLatex();
  if (timedOut) {
    return {
      success: existsSync(join(outDir, `${mainStem}.pdf`)),
      logContent: await readCompileLog(),
      timedOut: true,
    };
  }

  // Live preview: one latex pass is enough to refresh body text.
  if (opts?.fast) {
    logContent = await readCompileLog();
    const pdfPath = join(outDir, `${mainStem}.pdf`);
    return {
      success: existsSync(pdfPath),
      logContent,
      timedOut,
    };
  }

  if (bibTool) {
    const runBibtex = async (): Promise<void> => {
      const bibtexPath = await findTexliveBinary("bibtex");
      if (!bibtexPath) {
        throw new Error("bibtex not found. Install TeX Live bibtex.");
      }
      const bibtexResult = await runWithTimeout(
        bibtexPath,
        [mainStem],
        outDir,
        env,
        COMPILE_TIMEOUT_MS,
      );
      if (bibtexResult.timedOut) timedOut = true;
      if (bibtexResult.exitCode !== 0) {
        logContent += `\n\n=== bibtex failed (exit ${bibtexResult.exitCode}) ===\n`
          + `${bibtexResult.stdout}\n${bibtexResult.stderr}`.trim();
      }
    };

    const runBiber = async (): Promise<void> => {
      const biberPath = await findTexliveBinary("biber");
      if (!biberPath) {
        throw new Error("biber not found. Install TeX Live biber.");
      }
      const biberResult = await runWithTimeout(
        biberPath,
        [mainStem],
        outDir,
        env,
        COMPILE_TIMEOUT_MS,
      );
      if (biberResult.timedOut) timedOut = true;
      if (biberResult.exitCode !== 0) {
        logContent += `\n\n=== biber failed (exit ${biberResult.exitCode}) ===\n`
          + `${biberResult.stdout}\n${biberResult.stderr}`.trim();
      }
    };

    const runBib = bibTool === "biber" ? runBiber : runBibtex;

    try {
      // biblatex+backend=bibtex often needs two bibtex passes before citations settle.
      const initialBibPasses = bibTool === "bibtex" ? 2 : 1;
      for (let i = 0; i < initialBibPasses; i++) {
        await runBib();
        await runLatex();
        if (timedOut) break;
      }
      if (!timedOut) await runLatex();

      for (let round = 0; round < 6 && !timedOut; round++) {
        const passLog = await readCompileLog();
        const rerunBib =
          bibTool === "bibtex" ? logNeedsBibtexRerun(passLog) : logNeedsBiberRerun(passLog);
        const rerunLatex = logNeedsBibliographyRerun(passLog);
        if (!rerunBib && !rerunLatex) break;

        extraPasses += 1;
        if (rerunBib) {
          log.debug(`Extra ${bibTool} pass ${round + 1}`);
          await runBib();
        }
        if (rerunBib || rerunLatex) {
          log.debug(`Extra LaTeX pass ${round + 1} — bibliography/cross-refs`);
          await runLatex();
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, logContent: message, extraPasses };
    }
  } else {
    await runLatex();
  }

  // Fallback: if xelatex produced .xdv but no .pdf, run xdvipdfmx manually
  const pdfPath = join(outDir, `${mainStem}.pdf`);
  const xdvPath = join(outDir, `${mainStem}.xdv`);
  if (!existsSync(pdfPath) && existsSync(xdvPath)) {
    log.debug("compile.xdvipdfmx");
    const xdvipdfmxPath = await findTexliveBinary("xdvipdfmx");
    if (xdvipdfmxPath) {
      const xdv = await runWithTimeout(
        xdvipdfmxPath,
        ["-o", join(outDir, `${mainStem}.pdf`), join(outDir, `${mainStem}.xdv`)],
        outDir,
        env,
        COMPILE_TIMEOUT_MS,
      );
      if (xdv.timedOut) timedOut = true;
    }
  }

  // Read log from outDir
  try {
    const engineLog = await readFile(logPath, "utf-8");
    logContent = logContent ? `${engineLog}\n${logContent}` : engineLog;
  } catch {
    // ignore
  }

  const bblPath = join(outDir, `${mainStem}.bbl`);
  if (bibTool && !existsSync(bblPath)) {
    logContent += "\n\n=== bibliography ===\n.bbl file was not generated — bibtex/biber did not produce output.";
  }

  return {
    success: existsSync(pdfPath),
    logContent,
    timedOut,
    extraPasses,
  };
}

/**
 * Main compilation entry point.
 *
 * Syncs the main .tex directory into `.workbench/compile/latex/`, compiles there
 * (source + aux + PDF colocated), then returns the PDF bytes for preview.
 */
export async function compileLatex(
  projectDir: string,
  mainFile: string,
  _legacyUseTexlive: boolean = false,
  options: CompileLatexOptions = {},
): Promise<CompileResult> {
  const buildDir = persistentBuildDir(projectDir);
  const dirtyRelPaths = options.dirtyRelPaths ?? [];
  const source: CompileSource = options.source ?? "ui";
  const route: CompileRoute = "manuscript";
  const fast = options.fast === true;
  const job = {
    source,
    route,
    mainFile,
    project: basename(projectDir),
    fast,
    dirtyCount: dirtyRelPaths.length,
  };
  const startedAt = Date.now();
  const startLevel = fast ? "debug" : "info";

  if (activeCount >= MAX_CONCURRENT) {
    log.warn("compile.busy", { ...job, reason: "max_concurrent" });
    return {
      success: false,
      error: "Maximum concurrent compilations reached. Please wait.",
      buildDir,
    };
  }

  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const existingLock = projectLocks.get(projectDir);
  if (existingLock) {
    const waitStarted = Date.now();
    await existingLock;
    const waitMs = Date.now() - waitStarted;
    if (waitMs >= PROJECT_LOCK_BUSY_MS) {
      log.warn("compile.busy", { ...job, reason: "project_lock", waitMs });
    }
  }
  projectLocks.set(projectDir, lockPromise);
  activeCount++;

  try {
    log[startLevel]("compile.start", job);

    await mkdir(buildDir, { recursive: true });

    for (const { relPath, content: fileContent } of options.dirtyFiles ?? []) {
      const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
      const abs = join(projectDir, normalized);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, fileContent, "utf-8");
    }

    const mainStem = basename(mainFile, extname(mainFile));
    const pdfPath = join(buildDir, `${mainStem}.pdf`);
    const pdfRel = derivePaperPdfRel("latex", mainFile);

    const mainFilePath = join(projectDir, mainFile);
    if (!existsSync(mainFilePath)) {
      log.error("compile.error", { ...job, code: "main_missing" });
      return {
        success: false,
        error: `Main file not found: ${mainFile}`,
        buildDir,
      };
    }

    const normalizedMainPath = mainFile.replace(/\\/g, "/").replace(/^\.\//, "");
    const flushedMain = options.dirtyFiles?.find(
      (f) => f.relPath.replace(/\\/g, "/").replace(/^\.\//, "") === normalizedMainPath,
    );
    const content = flushedMain?.content ?? await readFile(mainFilePath, "utf-8");
    const engine = detectTexEngine(content) || "xelatex";

    const normalizedMain = mainFile.replace(/\\/g, "/").replace(/^\.\//, "");
    const expectedBuildMain = basename(normalizedMain);

    let buildMain: string;
    let sourceDirRel: string;
    if (dirtyRelPaths.length > 0) {
      ({ buildMain, sourceDirRel } = await syncTexSourceIncremental(
        projectDir,
        mainFile,
        buildDir,
        dirtyRelPaths,
      ));
    } else if (existsSync(join(buildDir, expectedBuildMain))) {
      buildMain = expectedBuildMain;
      const mainDirRel = dirname(normalizedMain);
      sourceDirRel = mainDirRel === "." ? "" : mainDirRel.replace(/\\/g, "/");
    } else {
      ({ buildMain, sourceDirRel } = await syncTexSourceToBuildDir(projectDir, mainFile, buildDir));
    }

    const wantSynctex = false;
    let result: EngineCompileResult;
    const tectonic = await resolveTectonicBinary();
    if (tectonic.available) {
      const engineId = tectonicEngineId(tectonic.bundled);
      log[startLevel]("compile.engine", { ...job, engine: engineId, bundled: tectonic.bundled });
      result = await compileWithTectonic(buildDir, buildMain, buildDir, tectonic.path, {
        synctex: wantSynctex,
        fast,
      });
    } else if (isHostRuntimeProcess()) {
      log.error("compile.error", { ...job, code: "missing_binary", engine: "tectonic" });
      return {
        success: false,
        error: tectonicUnavailableError(),
        buildDir,
      };
    } else {
      log.warn("compile.engine", { ...job, engine: "texlive", bundled: false });
      result = await compileWithTexlive(buildDir, buildMain, engine, content, buildDir, {
        synctex: wantSynctex,
        fast,
      });
    }

    const durationMs = Date.now() - startedAt;
    const extraPasses = result.extraPasses;

    if (result.superseded) {
      log.debug("compile.superseded", { ...job, durationMs });
      return {
        success: result.success,
        pdfPath: result.success ? pdfPath : undefined,
        logContent: result.logContent,
        buildDir,
      };
    }

    if (result.timedOut) {
      log.error("compile.error", { ...job, code: "timeout", durationMs, extraPasses });
      return {
        success: false,
        error: "Compilation timed out",
        logContent: result.logContent,
        buildDir,
      };
    }

    if (result.success) {
      const bibTool = detectBibTool(content);
      if (
        !fast
        && bibTool
        && !bibliographyLooksResolved(buildDir, mainStem, result.logContent ?? "")
      ) {
        const error =
          "Citations unresolved — keys in \\cite{...} may be missing from references.bib. "
          + "See compile log (Problems).";
        log.warn("compile.fail", {
          ...job,
          durationMs,
          extraPasses,
          errorSummary: oneLineError(error),
        });
        return {
          success: false,
          error,
          logContent: result.logContent,
          buildDir,
        };
      }
      const pdfOnDisk = options.pdfOnDisk ?? options.fast === true;
      const pdfBytes = pdfOnDisk ? undefined : await readFile(pdfPath);
      lastBuilds.set(projectDir, { workDir: buildDir, mainFileName: mainFile, sourceDirRel });
      log[fast ? "debug" : "info"]("compile.done", { ...job, durationMs, pdfPath: pdfRel });
      return {
        success: true,
        pdfBytes,
        pdfPath,
        logContent: result.logContent,
        buildDir,
      };
    }

    const error = extractErrorLines(result.logContent);
    const citeUndefined = logHasUndefinedCitations(result.logContent ?? "");
    const failError = citeUndefined
      ? (error || "Citations unresolved — check manuscript/references.bib keys match \\cite{...} and recompile.")
      : (error || "Compilation failed");
    const missingBinary = /not found/i.test(result.logContent ?? "") || /not found/i.test(failError);
    if (missingBinary) {
      log.error("compile.error", {
        ...job,
        code: "missing_binary",
        durationMs,
        extraPasses,
        error: oneLineError(failError),
      });
    } else {
      log.warn("compile.fail", {
        ...job,
        durationMs,
        extraPasses,
        errorSummary: oneLineError(failError),
      });
    }
    return {
      success: false,
      error: failError,
      logContent: result.logContent,
      buildDir,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /not found/i.test(message) ? "missing_binary" : "uncaught";
    log.error("compile.error", {
      ...job,
      code,
      durationMs: Date.now() - startedAt,
      error: oneLineError(message),
    });
    return {
      success: false,
      error: message,
      buildDir,
    };
  } finally {
    activeCount--;
    projectLocks.delete(projectDir);
    releaseLock!();
  }
}

/**
 * Compile a standalone `.tex` (e.g. a `\documentclass{standalone}` TikZ
 * figure) IN PLACE: the engine runs in the figure's own folder and all
 * artifacts (PDF/aux/log) stay there. Never touches the shared manuscript
 * build dir (`.workbench/compile/latex/`), so figure builds cannot clobber the
 * paper PDF. No bib passes, no SyncTeX — standalone graphics have neither.
 */
export async function compileStandaloneTexInPlace(
  projectDir: string,
  mainFile: string,
  options: StandaloneCompileOptions = {},
): Promise<StandaloneCompileResult> {
  const source: CompileSource = options.source ?? "ui";
  const route: CompileRoute = "standalone";
  const job = {
    source,
    route,
    mainFile,
    project: basename(projectDir),
  };
  const startedAt = Date.now();

  const normalized = mainFile.replace(/\\/g, "/").replace(/^\.\//, "");
  const absMain = join(projectDir, normalized);
  if (!existsSync(absMain)) {
    log.error("compile.error", { ...job, code: "main_missing" });
    return { success: false, error: `Main file not found: ${mainFile}` };
  }
  if (activeCount >= MAX_CONCURRENT) {
    log.warn("compile.busy", { ...job, reason: "max_concurrent" });
    return { success: false, error: "Maximum concurrent compilations reached. Please wait." };
  }

  const sourceDir = dirname(absMain);
  const baseName = basename(normalized);
  const mainStem = basename(normalized, extname(normalized));
  const pdfAbs = join(sourceDir, `${mainStem}.pdf`);
  const relDir = dirname(normalized);
  const pdfRel = relDir === "." ? `${mainStem}.pdf` : `${relDir}/${mainStem}.pdf`;

  activeCount++;
  try {
    log.info("compile.start", job);

    const content = await readFile(absMain, "utf-8");
    const engine = detectTexEngine(content) || "xelatex";

    const tectonic = await resolveTectonicBinary();
    let success: boolean;
    let logContent: string;
    let timedOut = false;
    if (tectonic.available) {
      const engineId = tectonicEngineId(tectonic.bundled);
      log.info("compile.engine", { ...job, engine: engineId, bundled: tectonic.bundled });
      const result = await compileWithTectonic(
        sourceDir,
        baseName,
        sourceDir,
        tectonic.path,
        { synctex: false },
      );
      success = result.success;
      logContent = result.logContent;
      timedOut = result.timedOut === true;
    } else if (isHostRuntimeProcess()) {
      log.error("compile.error", { ...job, code: "missing_binary", engine: "tectonic" });
      return { success: false, error: tectonicUnavailableError() };
    } else {
      log.warn("compile.engine", { ...job, engine: "texlive", bundled: false });
      const enginePath = await findTexliveBinary(engine);
      if (!enginePath) {
        log.error("compile.error", { ...job, code: "missing_binary", engine: "tectonic" });
        return {
          success: false,
          error: tectonicUnavailableError(),
        };
      }
      const env = { ...process.env, PATH: texliveEnvPath(enginePath) };
      const args = [
        "-synctex=0",
        "-interaction=nonstopmode",
        `-output-directory=${sourceDir}`,
        baseName,
      ];
      // Two passes: TikZ `remember picture` / positioning needs a rerun to settle.
      const pass1 = await runWithTimeout(enginePath, args, sourceDir, env, COMPILE_TIMEOUT_MS);
      const pass2 = await runWithTimeout(enginePath, args, sourceDir, env, COMPILE_TIMEOUT_MS);
      timedOut = pass1.timedOut || pass2.timedOut;
      success = existsSync(pdfAbs);
      try {
        logContent = await readFile(join(sourceDir, `${mainStem}.log`), "utf-8");
      } catch {
        logContent = "";
      }
    }

    const durationMs = Date.now() - startedAt;
    if (timedOut) {
      log.error("compile.error", { ...job, code: "timeout", durationMs });
      return {
        success: false,
        error: "Compilation timed out",
        logContent,
      };
    }
    if (!success) {
      const error = extractErrorLines(logContent ?? "") || "Compilation failed";
      log.warn("compile.fail", { ...job, durationMs, errorSummary: oneLineError(error) });
      return {
        success: false,
        error,
        logContent,
      };
    }
    log.info("compile.done", { ...job, durationMs, pdfPath: pdfRel });
    return { success: true, pdfPath: pdfRel, logContent };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("compile.error", {
      ...job,
      code: "uncaught",
      durationMs: Date.now() - startedAt,
      error: oneLineError(message),
    });
    return { success: false, error: message };
  } finally {
    activeCount--;
  }
}

/**
 * Get the last build info for a project.
 */
export function getLastBuild(projectDir: string): BuildInfo | undefined {
  return lastBuilds.get(projectDir);
}

// ─── SyncTeX parse cache ───

interface SynctexCacheEntry {
  mtimeMs: number;
  /** Parsed lines of the synctex file, one array element per line */
  lines: string[];
  /** Tag → resolved input filename */
  inputs: Map<number, string>;
  magnification: number;
  unit: number;
  xOffset: number;
  yOffset: number;
  /** Pre-built: page → list of nodes on that page (for reverse search) */
  pageNodes: Map<number, Array<{ tag: number; line: number; h: number; v: number; filename: string }>>;
  /** Pre-built: (tag,line) key → forward-search results (page, box coords) */
  forwardIndex: Map<string, Array<{ page: number; h: number; v: number; height: number; width: number }>>;
}

const synctexCache = new Map<string, SynctexCacheEntry>();

/** Read, decompress, and pre-parse a synctex file. Results are cached by
 *  (projectDir, mtime) so subsequent forward/reverse searches on the same
 *  compilation output are O(1) instead of re-parsing the entire file. */
async function getOrParseSynctex(
  projectDir: string,
  build: BuildInfo,
): Promise<SynctexCacheEntry | null> {
  const mainStem = basename(build.mainFileName, extname(build.mainFileName));
  const synctexPath = join(build.workDir, `${mainStem}.synctex.gz`);
  const plainPath = join(build.workDir, `${mainStem}.synctex`);

  // Check mtime for cache invalidation
  let mtimeMs = 0;
  try {
    const { stat } = await import("node:fs/promises");
    if (existsSync(synctexPath)) {
      mtimeMs = (await stat(synctexPath)).mtimeMs;
    } else if (existsSync(plainPath)) {
      mtimeMs = (await stat(plainPath)).mtimeMs;
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const cacheKey = `${projectDir}:${mainStem}`;
  const cached = synctexCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs) return cached;

  // Read + decompress
  let data: string;
  try {
    if (existsSync(synctexPath)) {
      const compressed = await readFile(synctexPath);
      const zlib = await import("node:zlib");
      data = zlib.gunzipSync(compressed).toString("utf-8");
    } else if (existsSync(plainPath)) {
      data = await readFile(plainPath, "utf-8");
    } else {
      return null;
    }
  } catch {
    return null;
  }

  // Parse once and pre-build indexes
  const lines = data.split("\n");
  const inputs = new Map<number, string>();
  const pageNodes = new Map<number, Array<{ tag: number; line: number; h: number; v: number; filename: string }>>();
  const forwardIndex = new Map<string, Array<{ page: number; h: number; v: number; height: number; width: number }>>();

  let magnification = 1000;
  let unit = 1;
  let xOffset = 0;
  let yOffset = 0;
  let inContent = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!inContent) {
      if (line.startsWith("Input:")) {
        const parts = line.slice(6).trim().split(":");
        if (parts.length >= 2) {
          inputs.set(parseInt(parts[0], 10), parts.slice(1).join(":"));
        }
      } else if (line.startsWith("Magnification:")) {
        magnification = parseInt(line.slice(14).trim(), 10) || 1000;
      } else if (line.startsWith("Unit:")) {
        unit = parseInt(line.slice(5).trim(), 10) || 1;
      } else if (line.startsWith("X Offset:")) {
        xOffset = parseInt(line.slice(9).trim(), 10) || 0;
      } else if (line.startsWith("Y Offset:")) {
        yOffset = parseInt(line.slice(9).trim(), 10) || 0;
      } else if (line === "Content:") {
        inContent = true;
      }
    } else {
      // Content node: tag,line,column,page,h,v,height,width[,depth]
      const parts = line.split(",");
      if (parts.length < 8) continue;

      if (parts[0].startsWith("{")) {
        // Page delimiter: "{page}"
        continue;
      }

      const tag = parseInt(parts[0], 10);
      const nodeLine = parseInt(parts[1], 10);
      const page = parseInt(parts[3], 10);
      const h = parseFloat(parts[4]);
      const v = parseFloat(parts[5]);
      const height = parseFloat(parts[6]);
      const width = parseFloat(parts[7]);
      const filename = inputs.get(tag) || "";

      // Reverse-search index: page → nodes
      if (!pageNodes.has(page)) pageNodes.set(page, []);
      pageNodes.get(page)!.push({ tag, line: nodeLine, h, v, filename });

      // Forward-search index: (tag,line) → results
      if (tag > 0 && nodeLine > 0) {
        const key = `${tag}:${nodeLine}`;
        if (!forwardIndex.has(key)) forwardIndex.set(key, []);
        forwardIndex.get(key)!.push({ page, h, v, height, width });
      }
    }
  }

  const entry: SynctexCacheEntry = {
    mtimeMs, lines, inputs, magnification, unit, xOffset, yOffset,
    pageNodes, forwardIndex,
  };
  synctexCache.set(cacheKey, entry);
  return entry;
}

/**
 * Parse SyncTeX data and find closest node (legacy — used via cache now).
 */
function parseSynctexData(
  data: string,
  targetPage: number,
  targetX: number,
  targetY: number
): { file: string; line: number; column: number } | null {
  const inputs = new Map<number, string>();
  let magnification = 1000;
  let unit = 1;
  let xOffset = 0;
  let yOffset = 0;

  let inContent = false;
  let onTargetPage = false;
  const nodes: { tag: number; line: number; h: number; v: number }[] = [];

  for (const rawLine of data.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!inContent) {
      if (line.startsWith("Input:")) {
        const rest = line.slice(6);
        const colonPos = rest.indexOf(":");
        if (colonPos > 0) {
          const tag = parseInt(rest.slice(0, colonPos), 10);
          if (!isNaN(tag)) {
            inputs.set(tag, rest.slice(colonPos + 1));
          }
        }
      } else if (line.startsWith("Magnification:")) {
        magnification = parseFloat(line.slice(14).trim()) || 1000;
      } else if (line.startsWith("Unit:")) {
        unit = parseFloat(line.slice(5).trim()) || 1;
      } else if (line.startsWith("X Offset:")) {
        xOffset = parseFloat(line.slice(9).trim()) || 0;
      } else if (line.startsWith("Y Offset:")) {
        yOffset = parseFloat(line.slice(9).trim()) || 0;
      } else if (line === "Content:") {
        inContent = true;
      }
      continue;
    }

    // Content section
    if (line.startsWith("Postamble:")) break;

    const firstChar = line[0];
    if (firstChar === "{") {
      const page = parseInt(line.slice(1), 10);
      onTargetPage = page === targetPage;
    } else if (firstChar === "}") {
      onTargetPage = false;
    } else if (["[", "(", "h", "v", "k", "x", "g", "$"].includes(firstChar) && onTargetPage) {
      // Convert synctex internal units to PDF points
      const factor = (unit * magnification) / (1000 * 65536) * (72 / 72.27);
      const node = parseSynctexNode(line.slice(1), factor, xOffset, yOffset);
      if (node) nodes.push(node);
    }
  }

  if (nodes.length === 0) return null;

  // Find closest node
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const dx = nodes[i].h - targetX;
    const dy = nodes[i].v - targetY;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  const best = nodes[bestIdx];
  const filename = inputs.get(best.tag);
  if (!filename) return null;

  return { file: filename, line: best.line, column: 0 };
}

/**
 * Parse a synctex node record.
 */
function parseSynctexNode(
  s: string,
  factor: number,
  xOffset: number,
  yOffset: number
): { tag: number; line: number; h: number; v: number } | null {
  const colonParts = s.split(":").slice(0, 4);
  if (colonParts.length < 2) return null;

  const firstPart = colonParts[0];
  const tlc = firstPart.split(",").slice(0, 3);
  if (tlc.length < 2) return null;

  const tag = parseInt(tlc[0], 10);
  const line = parseInt(tlc[1], 10);
  if (isNaN(tag) || isNaN(line)) return null;

  const secondPart = colonParts[1];
  const hv = secondPart.split(",").slice(0, 2);
  if (hv.length < 2) return null;

  const hRaw = parseInt(hv[0], 10);
  const vRaw = parseInt(hv[1], 10);
  if (isNaN(hRaw) || isNaN(vRaw)) return null;

  return {
    tag,
    line,
    h: hRaw * factor + xOffset,
    v: vRaw * factor + yOffset,
  };
}

/** Map a SyncTeX path from the build dir back to the project source tree. */
function mapSynctexPathToSource(build: BuildInfo, file: string): string {
  let normalized = file.replace(/\\/g, "/");
  if (normalized.startsWith(build.workDir.replace(/\\/g, "/"))) {
    normalized = normalized.slice(build.workDir.length).replace(/^[/\\]+/, "");
  }
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (build.sourceDirRel && !normalized.startsWith(`${build.sourceDirRel}/`)) {
    normalized = `${build.sourceDirRel}/${normalized}`.replace(/\\/g, "/");
  }
  return normalized;
}

/**
 * Perform SyncTeX reverse search.
 */
export async function synctexEdit(
  projectDir: string,
  page: number,
  x: number,
  y: number
): Promise<SynctexResult | null> {
  const build = lastBuilds.get(projectDir);
  if (!build) return null;

  try {
    const entry = await getOrParseSynctex(projectDir, build);
    if (!entry) return null;

    // Use pre-built page node index for O(1) lookup
    const nodes = entry.pageNodes.get(page);
    if (!nodes || nodes.length === 0) return null;

    // Find the closest node to the click position
    const physX = (x * entry.unit) / entry.magnification - entry.xOffset;
    const physY = (y * entry.unit) / entry.magnification - entry.yOffset;

    let closestDist = Infinity;
    let closest: { file: string; line: number; column: number } | null = null;

    for (const node of nodes) {
      const dx = node.h - physX;
      const dy = node.v - physY;
      const dist = dx * dx + dy * dy;
      if (dist < closestDist) {
        closestDist = dist;
        closest = {
          file: node.filename,
          line: node.line,
          column: 0,
        };
      }
    }

    if (!closest) return null;

    const file = mapSynctexPathToSource(build, closest.file);
    return { ...closest, file };
  } catch {
    return null;
  }
}

/**
 * Perform SyncTeX forward search: given a source file and line, find
 * the corresponding position in the PDF for highlighting.
 */
export async function synctexForward(
  projectDir: string,
  sourceFile: string,
  sourceLine: number
): Promise<SynctexForwardResult | null> {
  const build = lastBuilds.get(projectDir);
  if (!build) return null;

  try {
    const entry = await getOrParseSynctex(projectDir, build);
    if (!entry) return null;

    const normalizedSource = sourceFile.replace(/\\/g, "/");
    const sourceBase = basename(normalizedSource);

    // Find matching input tags (build dir paths vs project-relative editor paths)
    const matchingTags = new Set<number>();
    for (const [tag, filePath] of entry.inputs) {
      const fp = filePath.replace(/\\/g, "/");
      if (
        fp.includes(normalizedSource)
        || fp.endsWith(`/${sourceBase}`)
        || basename(fp) === sourceBase
      ) {
        matchingTags.add(tag);
      }
    }

    // Look up results in pre-built forward index
    for (const [tag, line] of [[...matchingTags].map(t => [t, sourceLine] as const)]) {
      for (const resultTag of matchingTags) {
        const key = `${resultTag}:${sourceLine}`;
        const positions = entry.forwardIndex.get(key);
        if (positions && positions.length > 0) {
          const pos = positions[0];
          const factor = (entry.unit * entry.magnification) / (1000 * 65536) * (72 / 72.27);
          return {
            page: pos.page,
            x: pos.h * factor + entry.xOffset,
            y: pos.v * factor + entry.yOffset,
            height: Math.max(pos.height * factor, 12),
            width: Math.max(pos.width * factor, 50),
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
