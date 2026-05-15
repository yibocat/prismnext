import { readdir, readFile, writeFile, unlink, rm, rename, mkdir, stat } from "node:fs/promises";
import { join, extname, dirname, basename } from "node:path";

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

/** Files larger than this (5 MB) are not auto-loaded into memory during project open. */
export const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

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

const IGNORED_DIRECTORY_NAMES = new Set([
  "node_modules",
  "__pycache__",
  "venv",
  "env",
]);

const IGNORED_EXTENSIONS = new Set([
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

export function shouldSkipProjectDirectory(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRECTORY_NAMES.has(name.toLowerCase());
}

export function getProjectFileType(name: string): ProjectFileType | null {
  const lower = name.toLowerCase();

  // Skip hidden files (starting with .) like .DS_Store, .gitignore, etc.
  if (name.startsWith(".")) return null;

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
          // Only stat files that may be skipped by the large-file threshold
          let fileSize = 0;
          if (type === "image" || type === "other") {
            try {
              const info = await stat(entryPath);
              fileSize = info.size;
            } catch {
              // stat failed — treat as 0
            }
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
