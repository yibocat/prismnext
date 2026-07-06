// ─── Extension → Material Icon Theme (Iconify) mapping ───
// Prefix: "material-icon-theme:"

const ICON_MAP: Record<string, string> = {
  // ── LaTeX ──
  ".tex": "material-icon-theme:tex",
  ".ltx": "material-icon-theme:tex",
  ".sty": "material-icon-theme:tex",
  ".cls": "material-icon-theme:tex",
  ".bst": "material-icon-theme:bibtex-style",

  // ── Markdown ──
  ".md": "material-icon-theme:markdown",
  ".mdx": "material-icon-theme:markdown",

  // ── Data / Config ──
  ".json": "material-icon-theme:json",
  ".yaml": "material-icon-theme:yaml",
  ".yml": "material-icon-theme:yaml",
  ".toml": "material-icon-theme:settings",

  // ── JavaScript / TypeScript ──
  ".js": "material-icon-theme:javascript",
  ".jsx": "material-icon-theme:javascript",
  ".mjs": "material-icon-theme:javascript",
  ".cjs": "material-icon-theme:javascript",
  ".ts": "material-icon-theme:typescript",
  ".tsx": "material-icon-theme:typescript",
  ".mts": "material-icon-theme:typescript",
  ".cts": "material-icon-theme:typescript",

  // ── CSS ──
  ".css": "material-icon-theme:css",

  // ── HTML ──
  ".html": "material-icon-theme:html",
  ".htm": "material-icon-theme:html",

  // ── Python ──
  ".py": "material-icon-theme:python",
  ".pyw": "material-icon-theme:python",

  // ── Shell ──
  ".sh": "material-icon-theme:console",
  ".bash": "material-icon-theme:console",
  ".zsh": "material-icon-theme:console",

  // ── XML / SVG ──
  ".xml": "material-icon-theme:xml",
  ".svg": "material-icon-theme:svg",

  // ── BibTeX ──
  ".bib": "material-icon-theme:bibliography",

  // ── Docker ──
  "Dockerfile": "material-icon-theme:docker",
  "docker-compose.yml": "material-icon-theme:docker",

  // ── Extensionless files ──
  "Makefile": "material-icon-theme:settings",
  "LICENSE": "material-icon-theme:license",
  "README": "material-icon-theme:markdown",

  // ── Package ──
  "package.json": "material-icon-theme:npm",

  // ── Images ──
  ".png": "material-icon-theme:image",
  ".jpg": "material-icon-theme:image",
  ".jpeg": "material-icon-theme:image",
  ".gif": "material-icon-theme:image",
  ".webp": "material-icon-theme:image",
  ".bmp": "material-icon-theme:image",
  ".ico": "material-icon-theme:image",

  // ── PDF ──
  ".pdf": "material-icon-theme:pdf",

  // ── Default ──
  "": "material-icon-theme:document",
};

/** Get the Iconify icon name for a filename. Returns "material-icon-theme:xxx" */
export function getFileIconName(filename: string): string {
  const exact = ICON_MAP[filename];
  if (exact) return exact;
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return ICON_MAP[ext] ?? ICON_MAP[""];
}

// ─── Folder icon mapping (material-icon-theme) ───

import type { FolderFunction } from "@/types/workspace";

const FOLDER_ICON_MAP: Record<FolderFunction, string> = {
  manuscript: "folder-docs",
  experiment: "folder-molecule",
  literature: "folder-bibliography",
  notebook: "folder-content",
  custom: "folder-custom",
} as const;

const DEFAULT_FOLDER = "folder-other";

const FOLDER_ICON_PREFIX = "material-icon-theme";

/**
 * Get the full Iconify icon name for a folder, based on its workspace function.
 * Returns "material-icon-theme:folder-xxx" or "material-icon-theme:folder-other".
 */
export function getFolderIconName(func?: FolderFunction | null): string {
  const name = (func && FOLDER_ICON_MAP[func]) ?? DEFAULT_FOLDER;
  return `${FOLDER_ICON_PREFIX}:${name}`;
}

/**
 * Get the expanded/open variant of a folder icon name.
 * Converts "material-icon-theme:folder-docs" → "material-icon-theme:folder-docs-open".
 */
export function getFolderOpenIconName(func?: FolderFunction | null): string {
  const name = (func && FOLDER_ICON_MAP[func]) ?? DEFAULT_FOLDER;
  return `${FOLDER_ICON_PREFIX}:${name}-open`;
}
