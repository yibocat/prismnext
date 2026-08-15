/** Utilities for resolving project-relative paths (including hidden `.prismnext/` / `.brief.md`). */

const PRISMNEXT_PREFIX = ".prismnext/";
const RESEARCH_BRIEF_FILE = ".brief.md";

export function normalizeProjectRoot(root: string): string {
  return root.replace(/[/\\]+$/, "");
}

/** Project-relative paths safe to resolve under the project root (no `..` segments). */
export function isSafeProjectRelativePath(relativePath: string): boolean {
  const withSlashes = relativePath.replace(/\\/g, "/");
  if (!withSlashes) return false;
  if (withSlashes.startsWith("/") || withSlashes.startsWith("//") || /^[A-Za-z]:/.test(withSlashes)) {
    return false;
  }
  const segments = withSlashes.split("/").filter((segment) => segment && segment !== ".");
  if (segments.length === 0) return false;
  if (segments.some((segment) => segment === "..")) return false;
  return true;
}

/** Hidden agent/config paths excluded from the file tree scan. */
export function isLazyProjectFilePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return (
    normalized.startsWith(PRISMNEXT_PREFIX)
    || normalized === ".prismnext"
    || normalized === RESEARCH_BRIEF_FILE
  );
}

/** Resolve a safe project-relative path to an absolute path, or null if unsafe. */
export function resolveProjectRelativePath(projectRoot: string, relativePath: string): string | null {
  if (!isSafeProjectRelativePath(relativePath)) return null;
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const root = normalizeProjectRoot(projectRoot);
  const abs = `${root}/${normalized}`;
  const rootPrefix = root.endsWith("/") ? root : `${root}/`;
  if (!abs.startsWith(rootPrefix) && abs !== root) return null;
  return abs;
}
