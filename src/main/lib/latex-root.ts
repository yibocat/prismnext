import * as fs from "node:fs";
import * as path from "node:path";
import { resolveMainTexRelativePath } from "./bib-path-resolve";
import { detectBibTool, detectTexEngine } from "../services/compiler";

/** Parse % !TEX root magic comment from content. */
export function parseTexRootMagicComment(content: string): string | null {
  for (const line of content.split("\n").slice(0, 20)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("%")) continue;
    const rest = trimmed.slice(1).trim();
    if (!rest.startsWith("!TEX")) continue;
    const afterTex = rest.slice(5).trim();
    if (!afterTex.startsWith("root")) continue;
    const afterRoot = afterTex.slice(5).trim();
    if (!afterRoot.startsWith("=")) continue;
    const rootPath = afterRoot.slice(1).trim();
    if (rootPath) return rootPath;
  }
  return null;
}

/** Check if content has a documentclass (is a root document). */
export function hasDocumentClass(content: string): boolean {
  for (const line of content.split("\n").slice(0, 50)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%")) continue;
    if (trimmed.includes("\\documentclass") || trimmed.includes("\\documentstyle")) {
      return true;
    }
  }
  return false;
}

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function readTexFile(projectRoot: string, relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(projectRoot, relPath), "utf-8");
  } catch {
    return null;
  }
}

function findTexByRelativePath(projectRoot: string, relPath: string): string | null {
  const normalized = normalizeRel(relPath);
  const abs = path.join(projectRoot, normalized);
  if (fs.existsSync(abs)) return normalized;
  const base = path.basename(normalized);
  for (const candidate of walkTexFiles(projectRoot)) {
    if (candidate === normalized || candidate.endsWith(`/${base}`) || candidate === base) {
      return candidate;
    }
  }
  return null;
}

/** Walk project tree for .tex files (skips dot dirs). */
export function walkTexFiles(projectRoot: string): string[] {
  const results: string[] = [];
  const skip = new Set([".git", ".prismnext", "node_modules", ".prismnext"]);

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
      if (entry.isFile() && entry.name.endsWith(".tex")) {
        results.push(relDir ? `${relDir}/${entry.name}` : entry.name);
      }
    }
  }

  walk(projectRoot, "");
  return results.sort();
}

export type LatexRootResolution =
  | "workspace-config"
  | "hint"
  | "magic-root"
  | "documentclass"
  | "main.tex-fallback"
  | "first-tex-fallback";

export interface ResolvedLatexRoot {
  mainFile: string;
  absolutePath: string;
  engine: string;
  bibTool: string | null;
  buildDir: string;
  manuscriptFolder: string | null;
  resolution: LatexRootResolution;
}

/**
 * Resolve the LaTeX main file on disk (main process — no renderer store).
 */
export function resolveLatexRoot(
  projectRoot: string,
  mainFileHint?: string | null,
): ResolvedLatexRoot | null {
  const buildDir = ".prismnext/compile";
  let resolution: LatexRootResolution = "workspace-config";
  let startFile: string | null = null;

  const hint = mainFileHint?.trim();
  if (hint) {
    startFile = findTexByRelativePath(projectRoot, hint);
    if (startFile) resolution = "hint";
  }

  if (!startFile) {
    startFile = resolveMainTexRelativePath(projectRoot);
    if (startFile) resolution = "workspace-config";
  }

  if (!startFile) {
    const texFiles = walkTexFiles(projectRoot);
    for (const rel of texFiles) {
      const content = readTexFile(projectRoot, rel);
      if (content && hasDocumentClass(content)) {
        startFile = rel;
        resolution = "documentclass";
        break;
      }
    }
    if (!startFile) {
      for (const candidate of ["main.tex", "document.tex"]) {
        if (fs.existsSync(path.join(projectRoot, candidate))) {
          startFile = candidate;
          resolution = "main.tex-fallback";
          break;
        }
      }
    }
    if (!startFile && texFiles.length > 0) {
      startFile = texFiles[0]!;
      resolution = "first-tex-fallback";
    }
  }

  if (!startFile) return null;

  const visited = new Set<string>();
  let current = startFile;
  for (let depth = 0; depth < 10; depth++) {
    if (visited.has(current)) break;
    visited.add(current);
    const content = readTexFile(projectRoot, current);
    if (!content) break;

    const rootPath = parseTexRootMagicComment(content);
    if (!rootPath) {
      if (hasDocumentClass(content) || current === startFile) {
        const mainDir = normalizeRel(path.dirname(current));
        const engine = detectTexEngine(content) || "xelatex";
        const bibTool = detectBibTool(content);
        return {
          mainFile: current,
          absolutePath: path.join(projectRoot, current),
          engine,
          bibTool,
          buildDir,
          manuscriptFolder: mainDir === "." ? null : mainDir,
          resolution,
        };
      }
      break;
    }

    const next = findTexByRelativePath(projectRoot, rootPath);
    if (!next) break;
    current = next;
    resolution = "magic-root";
  }

  const content = readTexFile(projectRoot, current);
  if (!content) return null;
  const mainDir = normalizeRel(path.dirname(current));
  return {
    mainFile: current,
    absolutePath: path.join(projectRoot, current),
    engine: detectTexEngine(content) || "xelatex",
    bibTool: detectBibTool(content),
    buildDir,
    manuscriptFolder: mainDir === "." ? null : mainDir,
    resolution,
  };
}
