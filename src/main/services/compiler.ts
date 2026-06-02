import { spawn, execSync, spawnSync } from "node:child_process";
import { readdir, readFile, writeFile, mkdir, rm, stat, copyFile, access } from "node:fs/promises";
import { join, dirname, basename, extname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const MAX_CONCURRENT = 3;
const COMPILE_TIMEOUT_MS = 60000;

// Artifact extensions to skip during sync
const ARTIFACT_EXTENSIONS = new Set([
  "aux", "log", "toc", "lof", "lot", "out", "nav", "snm", "vrb",
  "bbl", "blg", "fls", "fdb_latexmk", "synctex", "idx", "ind",
  "ilg", "glo", "gls", "glg", "fmt", "xdv",
]);

// Directories to skip during sync
const SKIP_DIRS = new Set(["node_modules", "target", "dist", ".git", ".prism", ".prismnext"]);

interface BuildInfo {
  workDir: string;
  mainFileName: string;
}

interface CompileResult {
  success: boolean;
  pdfBytes?: Buffer;
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

type TexEngine = "pdflatex" | "xelatex" | "lualatex";
type BibTool = "biber" | "bibtex" | null;

// Global state
let activeCount = 0;
const projectLocks = new Map<string, Promise<void>>();
const lastBuilds = new Map<string, BuildInfo>();

/**
 * Persistent build directory inside the project.
 */
function persistentBuildDir(projectDir: string): string {
  return join(projectDir, ".prismnext", "compile");
}

/**
 * Extract readable error messages from a TeX log file.
 */
export function extractErrorLines(log: string): string {
  if (!log) return "";

  const lines = log.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length && blocks.length < 5) {
    const line = lines[i];
    const isErrorStart =
      line.startsWith("!") ||
      line.includes("Error:") ||
      line.includes("error:");

    if (isErrorStart) {
      const end = Math.min(i + 14, lines.length);
      blocks.push(lines.slice(i, end).join("\n"));
      i = end;
      continue;
    }
    i++;
  }

  if (blocks.length > 0) {
    let result = blocks.join("\n\n");
    result += "\n\n---- Engine output ----\n";
    const tailStart = Math.max(0, lines.length - 20);
    result += lines.slice(tailStart).join("\n");
    return result;
  }

  if (lines.some((l) => l.includes("No pages of output"))) {
    return "No pages of output. Add visible content to the document body.";
  }

  // Fallback: return tail of log
  return log.slice(-500);
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
 * Detect TeX engine from % !TEX program magic comment.
 */
export function detectTexEngine(content: string): TexEngine | null {
  for (const line of lines(content).slice(0, 20)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("%")) continue;
    const rest = trimmed.slice(1).trim();
    if (!rest.startsWith("!TEX")) continue;
    const afterTex = rest.slice(5).trim();
    if (!afterTex.startsWith("program")) continue;
    const afterProgram = afterTex.slice(7).trim();
    if (!afterProgram.startsWith("=")) continue;
    const engine = afterProgram.slice(1).trim().toLowerCase();
    if (engine === "xelatex") return "xelatex";
    if (engine === "lualatex") return "lualatex";
    if (engine === "pdflatex" || engine === "latex") return "pdflatex";
  }
  return null;
}

/**
 * Detect bibliography tool from content.
 */
export function detectBibTool(content: string): BibTool {
  for (const line of lines(content)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%")) continue;
    if (trimmed.includes("\\usepackage") && trimmed.includes("biblatex")) {
      return "biber";
    }
  }
  for (const line of lines(content)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%")) continue;
    if (trimmed.includes("\\bibliography{") || trimmed.includes("\\addbibresource{")) {
      return "bibtex";
    }
  }
  return null;
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
 * Copy directory recursively, skipping hidden directories.
 */
async function copyDirRecursive(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      await copyDirRecursive(srcPath, dstPath);
    } else {
      await copyFile(srcPath, dstPath);
    }
  }
}

/**
 * Sync source files from project to build directory.
 * Skips build artifacts and unchanged files.
 */
async function syncSourceFiles(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      await syncSourceFiles(srcPath, dstPath);
    } else {
      const ext = extname(entry.name).slice(1).toLowerCase();
      if (ARTIFACT_EXTENSIONS.has(ext)) continue;
      if (entry.name.endsWith(".synctex.gz")) continue;

      // Skip unchanged files (same size and mtime)
      try {
        const srcStat = await stat(srcPath);
        try {
          const dstStat = await stat(dstPath);
          if (srcStat.size === dstStat.size && srcStat.mtimeMs === dstStat.mtimeMs) {
            continue;
          }
        } catch {
          // dst doesn't exist
        }
        await copyFile(srcPath, dstPath);
      } catch {
        // Skip files we can't read
      }
    }
  }
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
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
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
      });
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr });
    });
  });
}

/**
 * Compile with Tectonic.
 */
async function compileWithTectonic(
  workDir: string,
  mainFile: string
): Promise<{ success: boolean; logContent: string }> {
  const args = ["--keep-logs", "--synctex", mainFile];
  const { exitCode, stdout, stderr } = await runWithTimeout(
    "tectonic",
    args,
    workDir,
    process.env,
    COMPILE_TIMEOUT_MS
  );

  // Read log file
  const mainStem = basename(mainFile, extname(mainFile));
  const logPath = join(workDir, `${mainStem}.log`);
  let logContent = "";
  try {
    logContent = await readFile(logPath, "utf-8");
  } catch {
    logContent = stdout + "\n" + stderr;
  }

  // Check if PDF was produced
  const pdfPath = join(workDir, `${mainStem}.pdf`);
  return {
    success: existsSync(pdfPath),
    logContent,
  };
}

/**
 * Compile with TeXLive (xelatex/pdflatex/lualatex).
 */
async function compileWithTexlive(
  workDir: string,
  mainFile: string,
  engine: TexEngine,
  texContent: string
): Promise<{ success: boolean; logContent: string }> {
  const enginePath = await findTexliveBinary(engine);
  if (!enginePath) {
    throw new Error(`${engine} not found. Install TeXLive or add it to your PATH.`);
  }

  const envPath = texliveEnvPath(enginePath);
  const env = { ...process.env, PATH: envPath };
  const bibTool = detectBibTool(texContent);
  const mainStem = basename(mainFile, extname(mainFile));

  console.log(`[texlive] backend: ${engine} (${enginePath})`);

  const commonArgs = [
    "-synctex=1",
    "-interaction=nonstopmode",
    "-output-directory=.",
  ];

  // Pass 1
  await runWithTimeout(enginePath, [...commonArgs, mainFile], workDir, env, COMPILE_TIMEOUT_MS);

  // Bib pass (if needed)
  if (bibTool === "biber") {
    const biberPath = await findTexliveBinary("biber");
    if (biberPath) {
      await runWithTimeout(biberPath, [mainStem], workDir, env, COMPILE_TIMEOUT_MS);
    }
  } else if (bibTool === "bibtex") {
    const bibtexPath = await findTexliveBinary("bibtex");
    if (bibtexPath) {
      await runWithTimeout(bibtexPath, [`${mainStem}.aux`], workDir, env, COMPILE_TIMEOUT_MS);
    }
  }

  // Pass 2
  await runWithTimeout(enginePath, [...commonArgs, mainFile], workDir, env, COMPILE_TIMEOUT_MS);

  // Pass 3 (if bib was used)
  if (bibTool) {
    await runWithTimeout(enginePath, [...commonArgs, mainFile], workDir, env, COMPILE_TIMEOUT_MS);
  }

  // Fallback: if xelatex produced .xdv but no .pdf, run xdvipdfmx manually
  const pdfPath = join(workDir, `${mainStem}.pdf`);
  const xdvPath = join(workDir, `${mainStem}.xdv`);
  if (!existsSync(pdfPath) && existsSync(xdvPath)) {
    console.log("[texlive] .xdv exists but no .pdf — running xdvipdfmx manually");
    const xdvipdfmxPath = await findTexliveBinary("xdvipdfmx");
    if (xdvipdfmxPath) {
      await runWithTimeout(
        xdvipdfmxPath,
        ["-o", `${mainStem}.pdf`, `${mainStem}.xdv`],
        workDir,
        env,
        COMPILE_TIMEOUT_MS
      );
    }
  }

  // Read log
  const logPath = join(workDir, `${mainStem}.log`);
  let logContent = "";
  try {
    logContent = await readFile(logPath, "utf-8");
  } catch {
    // ignore
  }

  return {
    success: existsSync(pdfPath),
    logContent,
  };
}

/**
 * Main compilation entry point.
 */
export async function compileLatex(
  projectDir: string,
  mainFile: string,
  useTexlive: boolean = false
): Promise<CompileResult> {
  const buildDir = persistentBuildDir(projectDir);

  // Check concurrency limit
  if (activeCount >= MAX_CONCURRENT) {
    return {
      success: false,
      error: "Maximum concurrent compilations reached. Please wait.",
      buildDir,
    };
  }

  // Acquire per-project lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const existingLock = projectLocks.get(projectDir);
  if (existingLock) {
    await existingLock;
  }
  projectLocks.set(projectDir, lockPromise);
  activeCount++;

  try {
    // Sync source files
    const firstBuild = !existsSync(buildDir);
    if (firstBuild) {
      await copyDirRecursive(projectDir, buildDir);
    } else {
      await syncSourceFiles(projectDir, buildDir);
    }

    // Remove stale PDF
    const mainStem = basename(mainFile, extname(mainFile));
    const pdfPath = join(buildDir, `${mainStem}.pdf`);
    try {
      await rm(pdfPath);
    } catch {
      // ignore
    }

    // Verify main file exists
    const mainFilePath = join(buildDir, mainFile);
    if (!existsSync(mainFilePath)) {
      return {
        success: false,
        error: `Main file not found: ${mainFile}`,
        buildDir,
      };
    }

    // Read content for detection
    const content = await readFile(mainFilePath, "utf-8");
    const engine = detectTexEngine(content) || "xelatex";

    // Determine backend
    let result: { success: boolean; logContent: string };
    if (useTexlive) {
      result = await compileWithTexlive(buildDir, mainFile, engine, content);
    } else {
      // Check if tectonic is available
      const tectonicAvailable = await findTexliveBinary("tectonic");
      if (tectonicAvailable) {
        result = await compileWithTectonic(buildDir, mainFile);
      } else {
        // Fallback to texlive
        console.log("[compiler] Tectonic not found, falling back to TeXLive");
        result = await compileWithTexlive(buildDir, mainFile, engine, content);
      }
    }

    // Read PDF or error
    if (result.success) {
      const pdfBytes = await readFile(pdfPath);
      lastBuilds.set(projectDir, { workDir: buildDir, mainFileName: mainFile });
      return {
        success: true,
        pdfBytes,
        logContent: result.logContent,
        buildDir,
      };
    } else {
      const error = extractErrorLines(result.logContent);
      return {
        success: false,
        error,
        logContent: result.logContent,
        buildDir,
      };
    }
  } finally {
    activeCount--;
    projectLocks.delete(projectDir);
    releaseLock!();
  }
}

/**
 * Get the last build info for a project.
 */
export function getLastBuild(projectDir: string): BuildInfo | undefined {
  return lastBuilds.get(projectDir);
}

/**
 * Parse SyncTeX data and find closest node.
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

  const mainStem = basename(build.mainFileName, extname(build.mainFileName));
  const synctexPath = join(build.workDir, `${mainStem}.synctex.gz`);

  try {
    let data: string;
    if (existsSync(synctexPath)) {
      const compressed = await readFile(synctexPath);
      const zlib = await import("node:zlib");
      data = zlib.gunzipSync(compressed).toString("utf-8");
    } else {
      const plainPath = join(build.workDir, `${mainStem}.synctex`);
      if (!existsSync(plainPath)) return null;
      data = await readFile(plainPath, "utf-8");
    }

    const result = parseSynctexData(data, page, x, y);
    if (!result) return null;

    // Normalize file path: strip build directory prefix
    let file = result.file;
    if (file.startsWith(build.workDir)) {
      file = file.slice(build.workDir.length);
      if (file.startsWith("/") || file.startsWith("\\")) {
        file = file.slice(1);
      }
    }
    // Strip ./ prefix
    if (file.startsWith("./") || file.startsWith(".\\")) {
      file = file.slice(2);
    }

    return { ...result, file };
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

  const mainStem = basename(build.mainFileName, extname(build.mainFileName));
  const synctexPath = join(build.workDir, `${mainStem}.synctex.gz`);

  try {
    let data: string;
    if (existsSync(synctexPath)) {
      const compressed = await readFile(synctexPath);
      const zlib = await import("node:zlib");
      data = zlib.gunzipSync(compressed).toString("utf-8");
    } else {
      const plainPath = join(build.workDir, `${mainStem}.synctex`);
      if (!existsSync(plainPath)) return null;
      data = await readFile(plainPath, "utf-8");
    }

    // Normalize sourceFile to match what synctex stores
    const normalizedSource = sourceFile.replace(/\\/g, "/");

    // Parse: find Input tags that match our file
    const inputTags = new Set<number>();
    const lines = data.split("\n");

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
          const rest = line.slice(6);
          const colonPos = rest.indexOf(":");
          if (colonPos > 0) {
            const tag = parseInt(rest.slice(0, colonPos), 10);
            const filePath = rest.slice(colonPos + 1);
            if (!isNaN(tag) && filePath.includes(normalizedSource)) {
              inputTags.add(tag);
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

      if (line.startsWith("Postamble:")) break;
      if (inputTags.size === 0) break;

      const firstChar = line[0];

      if (firstChar === "{") {
        // Page start
        continue;
      }

      if (firstChar === "[" || firstChar === "(") {
        // Node: [tag,line,col:h,v:width,height
        const inner = line.slice(1);
        const colonPos = inner.indexOf(":");
        if (colonPos < 0) continue;

        const tlcPart = inner.slice(0, colonPos);
        const tlc = tlcPart.split(",");
        const tag = parseInt(tlc[0], 10);
        const nodeLine = parseInt(tlc[1], 10);

        if (inputTags.has(tag) && nodeLine === sourceLine) {
          // Found matching node — extract position info
          const rest = inner.slice(colonPos + 1);
          const hvColonPos = rest.indexOf(":");
          const hvPart = hvColonPos > 0 ? rest.slice(0, hvColonPos) : rest;

          const hv = hvPart.split(",");
          if (hv.length >= 2) {
            const hRaw = parseInt(hv[0], 10);
            const vRaw = parseInt(hv[1], 10);

            // Get dimensions from remaining parts
            let wRaw = 0, hDimRaw = 0;
            if (hvColonPos > 0) {
              const dims = rest.slice(hvColonPos + 1).split(",");
              wRaw = parseInt(dims[0], 10) || 0;
              hDimRaw = parseInt(dims[1], 10) || 0;
            }

            const factor = (unit * magnification) / (1000 * 65536) * (72 / 72.27);

            // Find which page this node is on by scanning backwards
            let currentPage = 1;
            for (let j = lines.indexOf(rawLine) - 1; j >= 0; j--) {
              const prevLine = lines[j].trim();
              if (prevLine.startsWith("{")) {
                currentPage = parseInt(prevLine.slice(1), 10);
                break;
              }
            }

            return {
              page: isNaN(currentPage) ? 1 : currentPage,
              x: hRaw * factor + xOffset,
              y: vRaw * factor + yOffset,
              height: Math.max(hDimRaw * factor, 12), // minimum 12pt height
              width: Math.max(wRaw * factor, 50),     // minimum 50pt width
            };
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
