import { readdir, readFile, writeFile, unlink, rm, rename, mkdir, stat } from "node:fs/promises";
import { join, extname, dirname, basename } from "node:path";
import { FSWatcher, watch } from "chokidar";
import { getHostEvents } from "../app/event-sink";
import { createLogger } from "../app/logger";

const log = createLogger("fs-watch", "fs");

export type ProjectFileType = "tex" | "image" | "pdf" | "bib" | "style" | "other";

export interface FsProjectFile {
  relativePath: string;
  absolutePath: string;
  type: ProjectFileType;
  fileSize: number;
}

export interface ScanResult {
  files: FsProjectFile[];
  folders: string[];
}

export { LARGE_FILE_THRESHOLD, TEXT_FILE_SIZE_LIMIT } from "./file-constants";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".bmp",
  ".webp",
]);

const STYLE_EXTENSIONS = new Set([
  ".sty",
  ".cls",
  ".bst",
  ".def",
  ".cfg",
  ".fd",
  ".dtx",
  ".ins",
  ".clo",
  ".ldf",
]);

/** Directories hidden from the project file tree. */
export const HIDDEN_DIRECTORY_NAMES = new Set([
  ".git",
  ".prismnext",
  ".workbench",
  "node_modules",
  "__pycache__",
  "venv",
  "env",
]);

/** @deprecated Use HIDDEN_DIRECTORY_NAMES */
export const IGNORED_DIRECTORY_NAMES = HIDDEN_DIRECTORY_NAMES;

/** Files that should never appear in the tree. */
const HIDDEN_FILE_NAMES = new Set([
  ".ds_store",
  "thumbs.db",
  // Git worktree checkout uses a .git *file* (not directory) at the worktree root.
  ".git",
  ".prism-worktree-meta",
  // Living research brief — open via Settings / agent tools / openResearchBrief, not the tree.
  ".brief.md",
]);

export const IGNORED_EXTENSIONS = new Set([
  // LaTeX build artifacts
  ".aux",
  ".log",
  ".out",
  ".toc",
  ".lof",
  ".lot",
  ".fls",
  ".fdb_latexmk",
  ".synctex.gz",
  ".synctex",
  ".blg",
  ".bbl",
  ".nav",
  ".snm",
  ".vrb",
  ".run.xml",
  ".bcf",
  // Binary / non-text files
  ".hwp",
  ".hwpx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".ppt",
  ".pptx",
  ".accdb",
  ".mdb",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".exe",
  ".dll",
  ".pyd",
  ".so",
  ".dylib",
  ".o",
  ".obj",
  ".bin",
  ".pyc",
  ".pyo",
  ".dat",
  ".iso",
  ".dmg",
  ".msi",
  ".mp3",
  ".mp4",
  ".avi",
  ".mov",
  ".mkv",
  ".wav",
  ".flac",
  ".psd",
  ".ai",
  ".sketch",
  ".fig",
  ".sqlite",
  ".db",
]);

// ─── File watcher ───

const WATCH_IGNORED_EXTENSIONS = [
  ".aux",
  ".log",
  ".out",
  ".toc",
  ".lof",
  ".lot",
  ".fls",
  ".fdb_latexmk",
  ".synctex.gz",
  ".synctex",
  ".blg",
  ".bbl",
  ".nav",
  ".snm",
  ".vrb",
  ".run.xml",
  ".bcf",
];

function normalizeWatchPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

/** Root-project watcher: `.workbench` / leftover `.prismnext` stay hidden. */
export function isWatchIgnored(filePath: string): boolean {
  const n = normalizeWatchPath(filePath);
  if (n.endsWith("/.prismnext") || n.includes("/.prismnext/")) return true;
  if (n.endsWith("/.workbench") || n.includes("/.workbench/")) return true;
  if (n.includes("/node_modules/")) return true;
  // Project-root living research brief (hidden from tree, still watch for open editors).
  if (n.endsWith("/.brief.md") || /(^|\/)\.brief\.md$/.test(n)) return false;

  if (/(^|\/)\.[^\/]/.test(n)) return true;
  if (n.includes("/__pycache__/")) return true;
  if (n.includes("/.prismnext/compile/") || n.includes("/.workbench/compile/")) return true;

  for (const ext of WATCH_IGNORED_EXTENSIONS) {
    if (n.endsWith(ext)) return true;
  }
  return false;
}

/**
 * Dedicated Agent-content watcher: its root is `.workbench/agent`, and it
 * only traverses user-editable content homes. Every hidden or dependency
 * segment remains excluded even under an allowed Team.
 */
export function isAgentContentWatchIgnored(filePath: string): boolean {
  const n = normalizeWatchPath(filePath);
  const agentRoot = "/.workbench/agent";
  const index = n.lastIndexOf(agentRoot);
  if (index < 0) return true;
  const relative = n.slice(index + agentRoot.length).replace(/^\/+/, "");
  if (!relative) return false;
  const segments = relative.split("/").filter(Boolean);
  if (segments.includes("node_modules") || segments.some((segment) => segment.startsWith("."))) {
    return true;
  }
  return !["skills", "local", "teams"].includes(segments[0]);
}

function pathsEqualOrNested(child: string, parent: string): boolean {
  const c = normalizeWatchPath(child).replace(/\/$/, "");
  const p = normalizeWatchPath(parent).replace(/\/$/, "");
  return c === p || c.startsWith(`${p}/`);
}

let activeWatcher: FSWatcher | null = null;
let activeAgentWatcher: FSWatcher | null = null;
let activeWatcherReady: Promise<void> | null = null;
let settleWatcherReadiness: Array<() => void> = [];
let watcherDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by `stopWatching` so in-flight `startWatching` cannot assign after close. */
let watcherEpoch = 0;
/** Serializes startWatching so concurrent calls cannot leak a watcher. */
let startWatchingChain: Promise<unknown> = Promise.resolve();
/** Accumulates changed paths during a debounce window so the renderer can
 *  do incremental updates instead of a full project reload. */
let changedPaths: Set<string> = new Set();
const WATCHER_DEBOUNCE_MS = 500;

export interface ProjectWatcherOptions {
  /** Test-only fallback for environments with exhausted native watch handles. */
  usePolling?: boolean;
}

/** Watcher startup I/O. Kept as an object so tests can intercept `mkdir`. */
export const projectWatcherFs = { mkdir };

export function shouldSkipProjectDirectory(name: string): boolean {
  return HIDDEN_DIRECTORY_NAMES.has(name) || HIDDEN_DIRECTORY_NAMES.has(name.toLowerCase());
}

export function getProjectFileType(name: string): ProjectFileType | null {
  const lower = name.toLowerCase();

  if (HIDDEN_FILE_NAMES.has(lower)) return null;

  // Skip ignored file extensions (build artifacts, binary/non-text files)
  for (const ext of IGNORED_EXTENSIONS) {
    if (lower.endsWith(ext)) return null;
  }

  if (lower.endsWith(".tex") || lower.endsWith(".ltx")) return "tex";
  if (lower.endsWith(".bib")) return "bib";
  if (lower.endsWith(".pdf")) return "pdf";

  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return "image";
  }

  for (const ext of STYLE_EXTENSIONS) {
    if (lower.endsWith(ext)) return "style";
  }

  // Show all other files (txt, md, etc.)
  return "other";
}

export async function scanProjectFolder(rootPath: string): Promise<ScanResult> {
  const files: FsProjectFile[] = [];
  const folders: string[] = [];

  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip hidden directories and common non-project dirs
        if (shouldSkipProjectDirectory(entry.name)) {
          continue;
        }
        folders.push(relativePath);
        await walk(entryPath, relativePath);
      } else {
        const type = getProjectFileType(entry.name);
        if (type) {
          // Always stat every file so the renderer can apply size-based
          // loading decisions (text-file limit, image-file limit, etc.).
          let fileSize = 0;
          try {
            const info = await stat(entryPath);
            fileSize = info.size;
          } catch {
            // stat failed — treat as 0
          }
          files.push({
            relativePath,
            absolutePath: entryPath,
            type,
            fileSize,
          });
        }
      }
    }
  }

  await walk(rootPath, "");
  return { files, folders };
}

/** Lightweight version of scanProjectFolder — returns file metadata only
 *  (relativePath, absolutePath, type) without reading any file contents
 *  and WITHOUT calling stat() on every file. fileSize is always 0 here;
 *  size-based decisions happen during lazy load (openFile).
 *  Used for initial file tree display, worktree pre-scanning, and
 *  metadata reloads after git operations. */
export async function scanMetadata(rootPath: string): Promise<ScanResult> {
  const files: FsProjectFile[] = [];
  const folders: string[] = [];

  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (shouldSkipProjectDirectory(entry.name)) {
          continue;
        }
        folders.push(relativePath);
        await walk(entryPath, relativePath);
      } else {
        const type = getProjectFileType(entry.name);
        if (type) {
          // Intentionally skip stat() — fileSize is only needed for
          // size-threshold decisions in openFile(), which uses
          // readFile() directly and handles errors there.
          files.push({
            relativePath,
            absolutePath: entryPath,
            type,
            fileSize: 0,
          });
        }
      }
    }
  }

  await walk(rootPath, "");
  return { files, folders };
}

export async function readTexFileContent(absolutePath: string): Promise<string> {
  return readFile(absolutePath, "utf-8");
}

export async function readImageAsDataUrl(absolutePath: string): Promise<string> {
  const { dataUrl } = await readImageAsDataUrlWithMeta(absolutePath);
  return dataUrl;
}

/** Image data URL plus mtime so the renderer can refresh when the file is overwritten. */
export async function readImageAsDataUrlWithMeta(
  absolutePath: string,
): Promise<{ dataUrl: string; mtimeMs: number }> {
  const [data, st] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  const ext = extname(absolutePath).toLowerCase().slice(1) || "png";

  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    webp: "image/webp",
    pdf: "application/pdf",
  };

  const mime = mimeMap[ext] || "image/png";
  const base64 = data.toString("base64");
  return {
    dataUrl: `data:${mime};base64,${base64}`,
    mtimeMs: st.mtimeMs,
  };
}

/** Raw file bytes for binary viewers (PDF preview — same path as compile cache). */
export async function readFileBytes(absolutePath: string): Promise<Uint8Array> {
  const data = await readFile(absolutePath);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export async function writeTexFileContent(
  absolutePath: string,
  content: string,
): Promise<void> {
  await writeFile(absolutePath, content, "utf-8");
}

export async function createFileOnDisk(
  rootPath: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const fullPath = join(rootPath, relativePath);

  // Ensure parent directory exists
  const parentDir = dirname(fullPath);
  await mkdir(parentDir, { recursive: true });

  await writeFile(fullPath, content, "utf-8");
  return fullPath;
}

export async function deleteFileFromDisk(absolutePath: string): Promise<void> {
  await unlink(absolutePath);
}

export async function deleteFolderFromDisk(absolutePath: string): Promise<void> {
  await rm(absolutePath, { recursive: true, force: true });
}

export async function renameFileOnDisk(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await rename(oldPath, newPath);
}

export async function createDirectory(absolutePath: string): Promise<void> {
  await mkdir(absolutePath, { recursive: true });
}

/**
 * Start watching a project directory for file changes.
 * Debounces changes by 500ms, then sends `fs:fileChanged` to all renderer windows.
 * Returns a lifecycle object whose `ready` promise resolves only after chokidar
 * has discovered the allowed tree. Existing callers may ignore it and retain
 * the same `stopWatching()` cleanup contract.
 */
export async function startWatching(
  rootPath: string,
  options: ProjectWatcherOptions = {},
): Promise<{ ready: Promise<void> }> {
  const pending = startWatchingChain.then(() => startWatchingExclusive(rootPath, options));
  startWatchingChain = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

async function startWatchingExclusive(
  rootPath: string,
  options: ProjectWatcherOptions,
): Promise<{ ready: Promise<void> }> {
  // If already watching the exact same path or a parent, skip
  if (activeWatcher) {
    const watched = activeWatcher.getWatched();
    const watchedRoots = Object.keys(watched);
    // rootPath is already covered if it IS a watched root or is a CHILD of one
    if (watchedRoots.some((r) => pathsEqualOrNested(rootPath, r))) {
      return { ready: activeWatcherReady ?? Promise.resolve() };
    }
    // Different path or broader scope — stop old watcher first
    await stopWatching();
  }

  const epoch = watcherEpoch;
  const agentRoot = join(rootPath, ".workbench", "agent");
  // The dedicated watcher cannot discover a root created after chokidar starts.
  // This is the app-owned Agent metadata location derived from `rootPath`, not
  // an arbitrary external path, so create only this empty lifecycle directory.
  await projectWatcherFs.mkdir(agentRoot, { recursive: true });
  if (epoch !== watcherEpoch) {
    return { ready: Promise.resolve() };
  }

  const rootWatcher = watch(rootPath, {
    ignored: isWatchIgnored,
    ignoreInitial: true,
    depth: 50,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
    ...(options.usePolling ? { usePolling: true } : {}),
  });
  const agentWatcher = watch(agentRoot, {
    ignored: isAgentContentWatchIgnored,
    ignoreInitial: true,
    depth: 50,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
    ...(options.usePolling ? { usePolling: true } : {}),
  });
  if (epoch !== watcherEpoch) {
    await Promise.all([rootWatcher.close(), agentWatcher.close()]);
    return { ready: Promise.resolve() };
  }

  const readinessFor = (watcher: FSWatcher): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      settleWatcherReadiness.push(settle);
      watcher.once("ready", settle);
      watcher.on("error", (err) => {
        log.error("fs-watch chokidar error", {
          error: err instanceof Error ? err.message : String(err),
        });
        if (settled) return;
        settled = true;
        reject(err);
      });
    });

  activeWatcher = rootWatcher;
  activeAgentWatcher = agentWatcher;
  const rootWatcherReady = readinessFor(activeWatcher);
  const agentWatcherReady = readinessFor(activeAgentWatcher);

  // Reset changed paths on each new watcher start
  changedPaths = new Set();

  const trackAndNotify = (filePath: string) => {
    changedPaths.add(filePath);
    if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = setTimeout(() => {
      const paths = changedPaths.size > 0 ? Array.from(changedPaths) : undefined;
      changedPaths = new Set();
      if (paths?.length) {
        import("../skills/project-skills-refresh").then(({ scheduleSkillsRefreshFromPaths }) => {
          scheduleSkillsRefreshFromPaths(rootPath, paths);
        }).catch((err) => {
          log.error("fs-watch skills refresh scheduling failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
        import("../services/project-subagents-refresh").then(({ scheduleExpertsRefreshFromPaths }) => {
          scheduleExpertsRefreshFromPaths(rootPath, paths);
        }).catch((err) => {
          log.error("fs-watch experts refresh scheduling failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      getHostEvents().broadcast("fs:fileChanged", {
        projectRoot: rootPath,
        changedPaths: paths,
      });
    }, WATCHER_DEBOUNCE_MS);
  };

  const attachEvents = (watcher: FSWatcher) => {
    watcher.on("add", trackAndNotify);
    watcher.on("change", trackAndNotify);
    watcher.on("unlink", trackAndNotify);
    watcher.on("addDir", trackAndNotify);
    watcher.on("unlinkDir", trackAndNotify);
  };
  attachEvents(activeWatcher);
  attachEvents(activeAgentWatcher);

  activeWatcherReady = Promise.all([rootWatcherReady, agentWatcherReady]).then(
    () => undefined,
  );
  // Existing IPC callers do not await `ready`; avoid unhandled rejections while
  // preserving the rejection for lifecycle-aware callers.
  void activeWatcherReady.catch(() => {});
  return { ready: activeWatcherReady };
}

/**
 * Stop the active file watcher and clean up state.
 * Safe to call when no watcher is active (no-op).
 */
export async function stopWatching(): Promise<void> {
  watcherEpoch += 1;
  if (watcherDebounceTimer) {
    clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = null;
  }
  for (const settle of settleWatcherReadiness.splice(0)) settle();
  await Promise.all([
    activeWatcher?.close(),
    activeAgentWatcher?.close(),
  ]);
  activeWatcher = null;
  activeAgentWatcher = null;
  activeWatcherReady = null;
}
