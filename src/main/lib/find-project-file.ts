/**
 * Bounded filename search under a project root (no hardcoded folder allowlists).
 * Skips heavy/irrelevant trees; when multiple matches exist, prefers newest mtime.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DEFAULT_SKIP = new Set([
  ".git",
  ".venv",
  "venv",
  "node_modules",
  "__pycache__",
  ".prismnext",
  ".workbench",
  ".opencode",
  ".agents",
  "dist",
  "build",
  ".next",
]);

export interface FindProjectFileByBasenameOpts {
  maxDepth?: number;
  maxFiles?: number;
  skipDirNames?: ReadonlySet<string>;
}

type Hit = { rel: string; mtimeMs: number };

/**
 * Walk `projectRoot` for files whose basename matches (case-sensitive).
 * Returns all project-relative hits (capped by maxFiles walk budget).
 */
export function findAllProjectRelByBasename(
  projectRoot: string,
  basename: string,
  opts?: FindProjectFileByBasenameOpts,
): Hit[] {
  const name = (basename || "").replace(/\\/g, "/").split("/").pop() ?? "";
  if (!name || name === "." || name === "..") return [];

  const maxDepth = opts?.maxDepth ?? 8;
  const maxFiles = opts?.maxFiles ?? 4000;
  const skip = opts?.skipDirNames ?? DEFAULT_SKIP;

  let seen = 0;
  const hits: Hit[] = [];
  const stack: { abs: string; depth: number }[] = [{ abs: projectRoot, depth: 0 }];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur.depth > maxDepth) continue;

    let entries;
    try {
      entries = readdirSync(cur.abs, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      if (seen >= maxFiles) return hits;
      const abs = join(cur.abs, ent.name);
      if (ent.isDirectory()) {
        if (skip.has(ent.name) || ent.name.startsWith(".")) continue;
        stack.push({ abs, depth: cur.depth + 1 });
        continue;
      }
      if (!ent.isFile()) continue;
      seen += 1;
      if (ent.name !== name) continue;
      try {
        const st = statSync(abs);
        if (!st.isFile()) continue;
        hits.push({
          rel: relative(projectRoot, abs).replace(/\\/g, "/"),
          mtimeMs: st.mtimeMs,
        });
      } catch {
        // skip
      }
    }
  }
  return hits;
}

/**
 * Walk `projectRoot` for a file whose basename matches (case-sensitive).
 * When multiple matches exist, returns the newest by mtime (stable tie-break: path).
 */
export function findProjectRelByBasename(
  projectRoot: string,
  basename: string,
  opts?: FindProjectFileByBasenameOpts,
): string | null {
  const hits = findAllProjectRelByBasename(projectRoot, basename, opts);
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
    return a.rel.localeCompare(b.rel);
  });
  return hits[0]!.rel;
}
