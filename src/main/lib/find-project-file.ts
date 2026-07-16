/**
 * Bounded filename search under a project root (no hardcoded folder allowlists).
 * Skips heavy/irrelevant trees; returns the first project-relative match.
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

/**
 * Walk `projectRoot` for a file whose basename matches (case-sensitive).
 * Returns a forward-slash project-relative path, or null.
 */
export function findProjectRelByBasename(
  projectRoot: string,
  basename: string,
  opts?: FindProjectFileByBasenameOpts,
): string | null {
  const name = (basename || "").replace(/\\/g, "/").split("/").pop() ?? "";
  if (!name || name === "." || name === "..") return null;

  const maxDepth = opts?.maxDepth ?? 8;
  const maxFiles = opts?.maxFiles ?? 4000;
  const skip = opts?.skipDirNames ?? DEFAULT_SKIP;

  let seen = 0;
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
      if (seen >= maxFiles) return null;
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
        if (!statSync(abs).isFile()) continue;
      } catch {
        continue;
      }
      return relative(projectRoot, abs).replace(/\\/g, "/");
    }
  }
  return null;
}
