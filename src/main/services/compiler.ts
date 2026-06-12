import { spawn, execSync, spawnSync } from "node:child_process";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join, dirname, basename, extname } from "node:path";
import { existsSync } from "node:fs";

const MAX_CONCURRENT = 3;
const COMPILE_TIMEOUT_MS = 60000;

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
 * Compile with Tectonic. Compiles in `cwd` and outputs artifacts to `outDir`.
 */
async function compileWithTectonic(
  cwd: string,
  mainFile: string,
  outDir: string,
): Promise<{ success: boolean; logContent: string }> {
  const args = ["--keep-logs", "--synctex", "--outdir", outDir, mainFile];
  await runWithTimeout("tectonic", args, cwd, process.env, COMPILE_TIMEOUT_MS);

  const mainStem = basename(mainFile, extname(mainFile));
  const logPath = join(outDir, `${mainStem}.log`);
  let logContent = "";
  try {
    logContent = await readFile(logPath, "utf-8");
  } catch {
    logContent = "";
  }

  const pdfPath = join(outDir, `${mainStem}.pdf`);
  return {
    success: existsSync(pdfPath),
    logContent,
  };
}

/**
 * Compile with TeXLive (xelatex/pdflatex/lualatex).
 * Compiles in `cwd` and outputs artifacts to `outDir`.
 */
async function compileWithTexlive(
  cwd: string,
  mainFile: string,
  engine: TexEngine,
  texContent: string,
  outDir: string,
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
    "-output-directory",
    outDir,
  ];

  // Pass 1
  await runWithTimeout(enginePath, [...commonArgs, mainFile], cwd, env, COMPILE_TIMEOUT_MS);

  // Bib pass (if needed) — aux files are in outDir
  if (bibTool === "biber") {
    const biberPath = await findTexliveBinary("biber");
    if (biberPath) {
      await runWithTimeout(biberPath, [mainStem], outDir, env, COMPILE_TIMEOUT_MS);
    }
  } else if (bibTool === "bibtex") {
    const bibtexPath = await findTexliveBinary("bibtex");
    if (bibtexPath) {
      await runWithTimeout(bibtexPath, [`${mainStem}.aux`], outDir, env, COMPILE_TIMEOUT_MS);
    }
  }

  // Pass 2
  await runWithTimeout(enginePath, [...commonArgs, mainFile], cwd, env, COMPILE_TIMEOUT_MS);

  // Pass 3 (if bib was used)
  if (bibTool) {
    await runWithTimeout(enginePath, [...commonArgs, mainFile], cwd, env, COMPILE_TIMEOUT_MS);
  }

  // Fallback: if xelatex produced .xdv but no .pdf, run xdvipdfmx manually
  const pdfPath = join(outDir, `${mainStem}.pdf`);
  const xdvPath = join(outDir, `${mainStem}.xdv`);
  if (!existsSync(pdfPath) && existsSync(xdvPath)) {
    console.log("[texlive] .xdv exists but no .pdf — running xdvipdfmx manually");
    const xdvipdfmxPath = await findTexliveBinary("xdvipdfmx");
    if (xdvipdfmxPath) {
      await runWithTimeout(
        xdvipdfmxPath,
        ["-o", join(outDir, `${mainStem}.pdf`), join(outDir, `${mainStem}.xdv`)],
        outDir,
        env,
        COMPILE_TIMEOUT_MS
      );
    }
  }

  // Read log from outDir
  const logPath = join(outDir, `${mainStem}.log`);
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
 *
 * Compiles in the project root directory (so LaTeX can access all files via
 * relative paths naturally) and outputs build artifacts to `.prismnext/compile/`.
 * No file copying — the project is compiled in-place.
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
    // Ensure output directory exists
    await mkdir(buildDir, { recursive: true });

    const mainStem = basename(mainFile, extname(mainFile));
    const pdfPath = join(buildDir, `${mainStem}.pdf`);

    // Remove stale PDF so a broken compile doesn't show old output
    try {
      await rm(pdfPath);
    } catch {
      // ignore
    }

    // Verify main file exists in the project (not the build dir)
    const mainFilePath = join(projectDir, mainFile);
    if (!existsSync(mainFilePath)) {
      return {
        success: false,
        error: `Main file not found: ${mainFile}`,
        buildDir,
      };
    }

    // Read content for engine / bib detection
    const content = await readFile(mainFilePath, "utf-8");
    const engine = detectTexEngine(content) || "xelatex";

    // Determine backend — compile in projectDir, output to buildDir
    let result: { success: boolean; logContent: string };
    if (useTexlive) {
      result = await compileWithTexlive(projectDir, mainFile, engine, content, buildDir);
    } else {
      const tectonicAvailable = await findTexliveBinary("tectonic");
      if (tectonicAvailable) {
        result = await compileWithTectonic(projectDir, mainFile, buildDir);
      } else {
        console.log("[compiler] Tectonic not found, falling back to TeXLive");
        result = await compileWithTexlive(projectDir, mainFile, engine, content, buildDir);
      }
    }

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

    // Normalize file path: strip build directory prefix
    let file = closest.file;
    if (file.startsWith(build.workDir)) {
      file = file.slice(build.workDir.length);
      if (file.startsWith("/") || file.startsWith("\\")) {
        file = file.slice(1);
      }
    }
    if (file.startsWith("./") || file.startsWith(".\\")) {
      file = file.slice(2);
    }

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

    // Find matching input tags
    const matchingTags = new Set<number>();
    for (const [tag, filePath] of entry.inputs) {
      if (filePath.includes(normalizedSource)) {
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
