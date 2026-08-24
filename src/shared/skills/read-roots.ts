/**
 * Enabled team skill folders are host resources, not project-escape.
 * Agents may read them (catalog, templates, scripts). Writes stay gated.
 */

import { isAbsoluteFsPath, isPathNestedInside, normalizeAbsPath, resolveFsPath } from "../platform/fs-path";

/** Bash verbs that only inspect files — never rewrite a skill folder. */
export const SKILL_READ_BASH_VERBS = new Set([
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "find",
  "ls",
  "tree",
  "stat",
  "file",
  "du",
  "wc",
  "diff",
  "xxd",
  "strings",
]);

export function isSkillReadBashVerb(verb: string): boolean {
  return SKILL_READ_BASH_VERBS.has(verb.trim().toLowerCase());
}

export function skillReadRootsFromDirs(
  dirs: readonly { dir?: string | null }[] | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of dirs ?? []) {
    const raw = item.dir?.trim();
    if (!raw) continue;
    const abs = normalizeAbsPath(raw);
    if (seen.has(abs)) continue;
    // Leftover paper hangars are not host-readable skill roots (S10.6).
    if (abs.replace(/\\/g, "/").includes("/.prismnext/agent/")) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

export function isPathUnderSkillReadRoots(
  filePath: string | null | undefined,
  roots: readonly string[] | null | undefined,
): boolean {
  if (!filePath?.trim() || !roots?.length) return false;
  const abs = normalizeAbsPath(filePath);
  return roots.some((root) => isPathNestedInside(root, abs));
}

export type SkillRelativeResolve =
  | { action: "keep" }
  | { action: "rewrite"; abs: string }
  | { action: "ambiguous"; candidates: string[] };

/**
 * Map a project-relative skill path (`library/catalog.json`) onto the unique
 * enabled skill folder that actually contains it. Absolute paths and paths
 * that already exist in the project are left alone. `..` is never rewritten
 * into a skill folder.
 */
export function resolveSkillRelativePath(
  raw: string,
  projectRoot: string,
  skillReadRoots: readonly string[],
  exists: (abs: string) => boolean,
): SkillRelativeResolve {
  const trimmed = raw.trim();
  if (!trimmed || !projectRoot.trim() || skillReadRoots.length === 0) {
    return { action: "keep" };
  }
  if (isAbsoluteFsPath(trimmed)) return { action: "keep" };
  const parts = trimmed.replace(/\\/g, "/").split("/");
  if (parts.includes("..")) return { action: "keep" };

  const inProject = resolveFsPath(projectRoot, trimmed);
  if (exists(inProject)) return { action: "keep" };

  const candidates: string[] = [];
  for (const root of skillReadRoots) {
    const abs = resolveFsPath(root, trimmed);
    if (!isPathNestedInside(root, abs)) continue;
    if (exists(abs)) candidates.push(abs);
  }
  if (candidates.length === 1) return { action: "rewrite", abs: candidates[0]! };
  if (candidates.length > 1) return { action: "ambiguous", candidates };
  return { action: "keep" };
}

export function formatAmbiguousSkillPath(raw: string, candidates: readonly string[]): string {
  return [
    `ambiguous_skill_path:${raw}`,
    "That relative path exists in more than one enabled skill. Use one absolute path:",
    ...candidates.map((c) => `- ${c}`),
  ].join("\n");
}
