/**
 * Project files that must not be loaded into the text editor (binary / DB / archives).
 * PDFs and images use dedicated viewers — not listed here.
 */

export const BINARY_PROJECT_FILE_EXTENSIONS = new Set([
  ".db",
  ".sqlite",
  ".sqlite3",
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
]);

const IMAGE_OR_PDF = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".bmp",
  ".webp",
  ".ico",
]);

export function fileExtensionLower(path: string): string {
  const normalized = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const dot = normalized.lastIndexOf(".");
  if (dot <= 0) return "";
  return normalized.slice(dot).toLowerCase();
}

/** True when the file must not be opened in CodeMirror (show shell-reveal UI instead). */
export function isBinaryProjectFile(path: string): boolean {
  const ext = fileExtensionLower(path);
  if (!ext) return false;
  if (IMAGE_OR_PDF.has(ext)) return false;
  return BINARY_PROJECT_FILE_EXTENSIONS.has(ext);
}
