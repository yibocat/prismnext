import * as fs from "node:fs";
import * as path from "node:path";
import { derivePaperBuildDir } from "../../shared/compile/artifact-key";
import { manuscriptMainFile } from "../../shared/workbench/workspace-folder";
import { readWorkspaceDirs } from "./workspace-dirs";

export type TypstRootResolution =
  | "hint"
  | "magic-root"
  | "workspace-config"
  | "main.typ"
  | "paper.typ"
  | "first-typ-in-manuscript"
  | "root-main.typ";

export interface ResolvedTypstRoot {
  mainFile: string;
  absolutePath: string;
  buildDir: string;
  manuscriptFolder: string | null;
  resolution: TypstRootResolution;
}

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Parse `// !typst root = rel.typ` from the first 20 lines. */
export function parseTypstRootMagicComment(content: string): string | null {
  for (const line of content.split("\n").slice(0, 20)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("//")) continue;
    const rest = trimmed.slice(2).trim();
    const match = rest.match(/^!typst\s+root\s*=\s*(.+)$/i);
    const rootPath = match?.[1]?.trim();
    if (rootPath) return rootPath;
  }
  return null;
}

/**
 * Standalone when the file is not the paper tree.
 * No manuscript folder: only project-root `main.typ` / `paper.typ` are paper.
 * With manuscript: anything not under that prefix is standalone.
 */
export function isTypstStandaloneRel(
  fileRel: string,
  manuscriptDir: string | null | undefined,
): boolean {
  const n = normalizeRel(fileRel);
  const d = manuscriptDir ? normalizeRel(manuscriptDir).replace(/\/$/, "") : "";
  if (!d) return n !== "main.typ" && n !== "paper.typ";
  return n !== d && !n.startsWith(`${d}/`);
}

function readTypFile(projectRoot: string, relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(projectRoot, relPath), "utf-8");
  } catch {
    return null;
  }
}

export function walkTypFiles(projectRoot: string): string[] {
  const results: string[] = [];
  const skip = new Set([".git", ".workbench", ".prismnext", "node_modules"]);

  function walk(absDir: string, relDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue;
        walk(path.join(absDir, entry.name), relDir ? `${relDir}/${entry.name}` : entry.name);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".typ")) {
        results.push(relDir ? `${relDir}/${entry.name}` : entry.name);
      }
    }
  }

  walk(projectRoot, "");
  return results.sort();
}

function findTypByRelativePath(
  projectRoot: string,
  relPath: string,
  fromFile?: string,
): string | null {
  const normalized = normalizeRel(relPath);
  if (!normalized.toLowerCase().endsWith(".typ")) return null;
  const abs = path.join(projectRoot, normalized);
  if (fs.existsSync(abs)) return normalized;
  if (fromFile) {
    const sibling = normalizeRel(path.join(path.dirname(fromFile), normalized));
    if (fs.existsSync(path.join(projectRoot, sibling))) return sibling;
  }
  const base = path.basename(normalized);
  for (const candidate of walkTypFiles(projectRoot)) {
    if (candidate === normalized || candidate.endsWith(`/${base}`) || candidate === base) {
      return candidate;
    }
  }
  return null;
}

function manuscriptMeta(projectRoot: string): { dir: string | null; pin: string | null } {
  const dirs = readWorkspaceDirs(projectRoot);
  const manuscript = dirs.find((d) => d.function === "manuscript");
  if (!manuscript) return { dir: null, pin: null };
  const pin = manuscriptMainFile(manuscript) ?? null;
  return { dir: manuscript.name, pin };
}

function finished(
  projectRoot: string,
  mainFile: string,
  resolution: TypstRootResolution,
  manuscriptFolder: string | null,
): ResolvedTypstRoot {
  const mainDir = normalizeRel(path.dirname(mainFile));
  return {
    mainFile,
    absolutePath: path.join(projectRoot, mainFile),
    buildDir: derivePaperBuildDir("typst"),
    manuscriptFolder: manuscriptFolder ?? (mainDir === "." ? null : mainDir),
    resolution,
  };
}

function followMagic(
  projectRoot: string,
  startFile: string,
  resolution: TypstRootResolution,
): { file: string; resolution: TypstRootResolution } {
  const visited = new Set<string>();
  let current = startFile;
  let currentResolution = resolution;
  for (let depth = 0; depth < 10; depth++) {
    if (visited.has(current)) break;
    visited.add(current);
    const content = readTypFile(projectRoot, current);
    if (!content) break;
    const rootPath = parseTypstRootMagicComment(content);
    if (!rootPath) break;
    const next = findTypByRelativePath(projectRoot, rootPath, current);
    if (!next || next === current) break;
    current = next;
    currentResolution = "magic-root";
  }
  return { file: current, resolution: currentResolution };
}

/**
 * Resolve the Typst paper root on disk (main process — no renderer store).
 * Does not scan LaTeX `\documentclass`.
 */
export function resolveTypstRoot(
  projectRoot: string,
  mainFileHint?: string | null,
): ResolvedTypstRoot | null {
  const { dir: manuscriptDir, pin } = manuscriptMeta(projectRoot);

  const hint = mainFileHint?.trim();
  if (hint) {
    const found = findTypByRelativePath(projectRoot, hint);
    if (found) {
      const followed = followMagic(projectRoot, found, "hint");
      return finished(projectRoot, followed.file, followed.resolution, manuscriptDir);
    }
  }

  if (pin && pin.toLowerCase().endsWith(".typ") && manuscriptDir) {
    const rel = normalizeRel(path.join(manuscriptDir, pin));
    if (fs.existsSync(path.join(projectRoot, rel))) {
      const followed = followMagic(projectRoot, rel, "workspace-config");
      return finished(projectRoot, followed.file, followed.resolution, manuscriptDir);
    }
  }

  if (manuscriptDir) {
    const mainTyp = `${normalizeRel(manuscriptDir)}/main.typ`;
    if (fs.existsSync(path.join(projectRoot, mainTyp))) {
      return finished(projectRoot, mainTyp, "main.typ", manuscriptDir);
    }
    const paperTyp = `${normalizeRel(manuscriptDir)}/paper.typ`;
    if (fs.existsSync(path.join(projectRoot, paperTyp))) {
      return finished(projectRoot, paperTyp, "paper.typ", manuscriptDir);
    }
    const inManuscript = walkTypFiles(projectRoot).filter((rel) => {
      const d = normalizeRel(manuscriptDir);
      return rel === d || rel.startsWith(`${d}/`);
    });
    if (inManuscript[0]) {
      return finished(projectRoot, inManuscript[0], "first-typ-in-manuscript", manuscriptDir);
    }
  }

  if (fs.existsSync(path.join(projectRoot, "main.typ"))) {
    return finished(projectRoot, "main.typ", "root-main.typ", manuscriptDir);
  }

  return null;
}
