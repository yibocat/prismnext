import { readdir, readFile, writeFile, unlink, rm, rename, mkdir, stat } from "node:fs/promises";
import { join, extname, dirname, basename } from "node:path";
import { FSWatcher, watch } from "chokidar";
import { BrowserWindow } from "electron";

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

/** Patterns excluded from the chokidar watcher. */
const WATCH_IGNORED = [
  /(^|[\/\\])\.[^\/\\]/,
  "**/node_modules/**",
  "**/__pycache__/**",
  "**/.prismnext/compile/**",
  "**/*.aux",
  "**/*.log",
  "**/*.out",
  "**/*.toc",
  "**/*.lof",
  "**/*.lot",
  "**/*.fls",
  "**/*.fdb_latexmk",
  "**/*.synctex.gz",
  "**/*.synctex",
  "**/*.blg",
  "**/*.bbl",
  "**/*.nav",
  "**/*.snm",
  "**/*.vrb",
  "**/*.run.xml",
  "**/*.bcf",
];

let activeWatcher: FSWatcher | null = null;
let watcherDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Accumulates changed paths during a debounce window so the renderer can
 *  do incremental updates instead of a full project reload. */
let changedPaths: Set<string> = new Set();
const WATCHER_DEBOUNCE_MS = 500;

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
  const data = await readFile(absolutePath);
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
  return `data:${mime};base64,${base64}`;
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
 * Returns immediately if a watcher is already active for the same root.
 */
export async function startWatching(rootPath: string): Promise<void> {
  // If already watching the exact same path or a parent, skip
  if (activeWatcher) {
    const watched = activeWatcher.getWatched();
    const watchedRoots = Object.keys(watched);
    // rootPath is already covered if it IS a watched root or is a CHILD of one
    if (watchedRoots.some((r) => rootPath === r || rootPath.startsWith(r + "/"))) {
      return;
    }
    // Different path or broader scope — stop old watcher first
    await stopWatching();
  }

  activeWatcher = watch(rootPath, {
    ignored: WATCH_IGNORED,
    ignoreInitial: true,
    depth: 50,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });

  // Reset changed paths on each new watcher start
  changedPaths = new Set();

  const trackAndNotify = (filePath: string) => {
    changedPaths.add(filePath);
    if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = setTimeout(() => {
      const paths = changedPaths.size > 0 ? Array.from(changedPaths) : undefined;
      changedPaths = new Set();
      const wins = BrowserWindow.getAllWindows();
      for (const win of wins) {
        if (!win.isDestroyed()) {
          win.webContents.send("fs:fileChanged", {
            projectRoot: rootPath,
            changedPaths: paths,
          });
        }
      }
    }, WATCHER_DEBOUNCE_MS);
  };

  activeWatcher.on("add", trackAndNotify);
  activeWatcher.on("change", trackAndNotify);
  activeWatcher.on("unlink", trackAndNotify);
  activeWatcher.on("addDir", trackAndNotify);
  activeWatcher.on("unlinkDir", trackAndNotify);

  activeWatcher.on("error", (err) => {
    console.error("[fs-watch] chokidar error:", err);
  });
}

/**
 * Stop the active file watcher and clean up state.
 * Safe to call when no watcher is active (no-op).
 */
export async function stopWatching(): Promise<void> {
  if (watcherDebounceTimer) {
    clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = null;
  }
  if (activeWatcher) {
    await activeWatcher.close();
    activeWatcher = null;
  }
}
