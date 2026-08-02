/** Heuristic: inline `` `path` `` values that look like project-relative file paths. */

const FILE_EXT_RE =
  /\.(tex|md|markdown|bib|csv|json|yaml|yml|py|js|ts|tsx|jsx|mjs|cjs|pdf|png|jpg|jpeg|gif|svg|webp|txt|log|xml|html|htm|css|sh|bash|zsh|toml|cfg|ini|cls|sty|bst|bbl|aux|out|ipynb|rs|go|java|c|cpp|h|hpp|rb|php|sql|db|sqlite|wasm)$/i;

const UNSAFE_PATH_CHARS = /[|&;$`<>]/;

function normalizeProjectRelPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function looksLikeProjectFileRef(
  value: string,
  knownProjectPaths?: ReadonlySet<string>,
): boolean {
  const v = value.trim();
  if (!v || v.length > 280) return false;
  if (v.includes("\n")) return false;
  if (/^https?:\/\//i.test(v) || /^www\./i.test(v)) return false;
  if (UNSAFE_PATH_CHARS.test(v)) return false;
  if (/\s/.test(v) && !v.includes("/")) return false;

  const normalized = normalizeProjectRelPath(v);
  if (knownProjectPaths?.size) {
    if (knownProjectPaths.has(normalized)) return true;
    if (knownProjectPaths.has(`${normalized}/`)) return true;
    if (v.endsWith("/") && knownProjectPaths.has(normalized)) return true;
  }

  if (v.endsWith("/")) {
    return false;
  }

  if (FILE_EXT_RE.test(v)) return true;

  if (v.includes("/")) {
    return false;
  }

  return false;
}

export function encodeProjectFileHref(path: string): string {
  return `project-file:${encodeURIComponent(path)}`;
}

export function decodeProjectFileHref(href: string): string | null {
  if (!href.startsWith("project-file:")) return null;
  const raw = href.slice("project-file:".length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
