/**
 * Cross-platform path helpers safe for main and renderer (no node:path).
 */

export function normalizeFsSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isAbsoluteFsPath(path: string): boolean {
  const normalized = normalizeFsSeparators(path.trim());
  if (!normalized) return false;
  if (normalized.startsWith("/")) return true;
  return /^[A-Za-z]:\//.test(normalized);
}

function normalizeResolved(path: string): string {
  const normalized = normalizeFsSeparators(path);
  const winAbs = /^([A-Za-z]:)(\/.*)?$/.exec(normalized);
  const posixAbs = normalized.startsWith("/");
  const rawParts = normalized.split("/").filter(Boolean);
  const stack: string[] = [];

  for (const part of rawParts) {
    if (part === ".") continue;
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
      } else if (!posixAbs && !winAbs) {
        stack.push("..");
      }
      continue;
    }
    stack.push(part);
  }

  let out = stack.join("/");
  if (posixAbs) out = `/${out}`;
  if (winAbs) out = `${winAbs[1]}/${out}`;
  if (!out) return posixAbs ? "/" : winAbs ? `${winAbs[1]}/` : ".";
  return out;
}

/** Resolve path segments like Node path.resolve (output uses `/`). */
export function resolveFsPath(...segments: string[]): string {
  let resolved = "";
  for (const segment of segments) {
    if (!segment?.trim()) continue;
    const part = normalizeFsSeparators(segment.trim());
    if (isAbsoluteFsPath(part)) {
      resolved = part;
      continue;
    }
    if (!resolved) {
      resolved = part;
      continue;
    }
    resolved = `${resolved.replace(/\/+$/, "")}/${part.replace(/^\/+/, "")}`;
  }
  return normalizeResolved(resolved || ".");
}

export function normalizeAbsPath(path: string): string {
  return resolveFsPath(path).replace(/\/$/, "");
}

/** True when `child` is the same as or nested under `parent`. */
export function isPathNestedInside(parent: string, child: string): boolean {
  const parentAbs = normalizeAbsPath(parent);
  const childAbs = normalizeAbsPath(child);
  return childAbs === parentAbs || childAbs.startsWith(`${parentAbs}/`);
}
