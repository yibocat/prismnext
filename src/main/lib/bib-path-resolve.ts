import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "../services/logger";
import { readWorkspaceDirs } from "../services/workspace-config";

const log = createLogger("bib-path", "fs");

export interface ResolvedBibliography {
  /** Paths as written in the main .tex (e.g. references.bib) */
  declaredInMain: string[];
  /** First existing .bib relative to project root, if any */
  resolvedPath: string | null;
  /** Per-declaration resolve attempts for diagnostics */
  attempts: Array<{
    declared: string;
    resolvedPath: string | null;
    tried: string[];
  }>;
}

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Parse \\addbibresource and \\bibliography declarations from tex source. */
export function parseBibliographyResources(texContent: string): string[] {
  const paths: string[] = [];
  for (const match of texContent.matchAll(/\\addbibresource(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
    const raw = match[1]?.trim();
    if (raw) paths.push(raw);
  }
  for (const match of texContent.matchAll(/\\bibliography\{([^}]+)\}/g)) {
    for (const stem of match[1].split(",")) {
      const s = stem.trim();
      if (!s) continue;
      paths.push(s.endsWith(".bib") ? s : `${s}.bib`);
    }
  }
  return [...new Set(paths)];
}

function withBibExtension(declared: string): string[] {
  const n = normalizeRel(declared);
  if (n.endsWith(".bib")) return [n];
  return [n, `${n}.bib`];
}

/** Resolve one declared bib path relative to main tex directory (LaTeX semantics). */
export function resolveBibliographyPath(
  projectRoot: string,
  mainFile: string,
  declared: string,
): { resolvedPath: string | null; tried: string[] } {
  const tried: string[] = [];
  const mainDir = normalizeRel(path.dirname(mainFile));
  const normalized = normalizeRel(declared);

  for (const variant of withBibExtension(normalized)) {
    let rel: string;
    if (variant.includes("/") && !variant.startsWith("../")) {
      rel = variant;
    } else if (variant.startsWith("../")) {
      rel = normalizeRel(path.join(mainDir === "." ? "" : mainDir, variant));
    } else if (mainDir && mainDir !== ".") {
      rel = normalizeRel(path.join(mainDir, variant));
    } else {
      rel = variant;
    }
    tried.push(rel);
    const abs = path.join(projectRoot, rel);
    if (fs.existsSync(abs)) {
      return { resolvedPath: rel, tried };
    }
  }
  return { resolvedPath: null, tried };
}

/** Resolve all bibliography paths declared in the main tex file. */
export function resolveBibliographyFromMain(
  projectRoot: string,
  mainFile: string,
  texContent?: string,
): ResolvedBibliography {
  const mainPath = path.join(projectRoot, mainFile);
  const content = texContent ?? fs.readFileSync(mainPath, "utf-8");
  const declaredInMain = parseBibliographyResources(content);
  const attempts = declaredInMain.map((declared) => {
    const { resolvedPath, tried } = resolveBibliographyPath(projectRoot, mainFile, declared);
    return { declared, resolvedPath, tried };
  });
  const resolvedPath = attempts.find((a) => a.resolvedPath)?.resolvedPath ?? null;
  return { declaredInMain, resolvedPath, attempts };
}

/** Intended write path when the declared bib file does not exist yet. */
export function intendedBibliographyPath(
  projectRoot: string,
  mainFile: string,
  declared: string,
): string {
  const mainDir = normalizeRel(path.dirname(mainFile));
  const normalized = normalizeRel(declared);
  const withExt = normalized.endsWith(".bib") ? normalized : `${normalized}.bib`;
  const rel =
    withExt.includes("/") || mainDir === "."
      ? withExt
      : normalizeRel(path.join(mainDir, withExt));
  return path.join(projectRoot, rel);
}

/** Project-relative path to the manuscript main .tex (workspace config + common fallbacks). */
export function resolveMainTexRelativePath(projectRoot: string): string | null {
  const dirs = readWorkspaceDirs(path.join(projectRoot, ".prismnext"));
  const manuscript = dirs.find((d) => d.function === "manuscript");
  if (manuscript && "mainTex" in manuscript) {
    const rel = normalizeRel(path.join(manuscript.name, manuscript.mainTex));
    if (fs.existsSync(path.join(projectRoot, rel))) return rel;
  }
  for (const candidate of ["main.tex"]) {
    if (fs.existsSync(path.join(projectRoot, candidate))) return candidate;
  }
  return null;
}

/**
 * Directories biber/bibtex should search when aux/bcf live in a separate output dir.
 * Uses kpathsea `//` recursive suffix.
 */
export function buildBibInputSearchPaths(
  projectRoot: string,
  mainFile: string,
  texContent: string,
): string[] {
  const sep = path.sep;
  const dirs = new Set<string>();

  const addDir = (absDir: string) => {
    if (fs.existsSync(absDir)) dirs.add(`${absDir}${sep}${sep}`);
  };

  addDir(projectRoot);
  const mainDir = path.dirname(mainFile);
  if (mainDir && mainDir !== ".") {
    addDir(path.join(projectRoot, mainDir));
  }

  for (const attempt of resolveBibliographyFromMain(projectRoot, mainFile, texContent).attempts) {
    if (!attempt.resolvedPath) continue;
    addDir(path.dirname(path.join(projectRoot, attempt.resolvedPath)));
  }

  return [...dirs];
}

/** Merge BIBINPUTS into a process env for TeXLive/biber/bibtex. */
export function withBibInputsEnv(
  baseEnv: NodeJS.ProcessEnv,
  searchPaths: string[],
): NodeJS.ProcessEnv {
  if (searchPaths.length === 0) return baseEnv;
  const delim = path.delimiter;
  // Setting BIBINPUTS replaces kpathsea defaults (which include `.`). bibtex often
  // runs with cwd = output dir where main-blx.bib and staged .bib files live.
  const prefix = `.${delim}${searchPaths.join(delim)}`;
  const existing = baseEnv.BIBINPUTS?.trim();
  return {
    ...baseEnv,
    BIBINPUTS: existing ? `${prefix}${delim}${existing}` : prefix,
  };
}

/**
 * Mirror the main .tex directory into the build dir before compile.
 * Keeps .tex / .bib / figures together so bibtex and \\input paths work without hacks.
 */
export async function syncTexSourceToBuildDir(
  projectRoot: string,
  mainFile: string,
  buildDir: string,
): Promise<{ buildMain: string; sourceDirRel: string }> {
  const normalizedMain = normalizeRel(mainFile);
  const buildMain = path.basename(normalizedMain);
  const mainDirRel = path.dirname(normalizedMain);
  const sourceDirRel = mainDirRel === "." ? "" : normalizeRel(mainDirRel);
  const srcRoot = sourceDirRel ? path.join(projectRoot, sourceDirRel) : projectRoot;

  await fs.promises.mkdir(buildDir, { recursive: true });

  if (sourceDirRel) {
    for (const entry of await fs.promises.readdir(srcRoot, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      await fs.promises.cp(
        path.join(srcRoot, entry.name),
        path.join(buildDir, entry.name),
        { recursive: true, force: true },
      );
    }
  } else {
    await fs.promises.cp(
      path.join(projectRoot, normalizedMain),
      path.join(buildDir, buildMain),
      { force: true },
    );
    for (const entry of await fs.promises.readdir(projectRoot, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || !entry.isFile()) continue;
      if (/\.(bib|sty|cls|bst|def|tex)$/i.test(entry.name) && entry.name !== buildMain) {
        await fs.promises.cp(
          path.join(projectRoot, entry.name),
          path.join(buildDir, entry.name),
          { force: true },
        );
      }
    }
  }

  log.info(`Synced tex sources (${sourceDirRel || "."}) → ${buildDir}`);
  return { buildMain, sourceDirRel };
}

function mapProjectRelToBuildRel(
  relPath: string,
  sourceDirRel: string,
): string | null {
  const n = normalizeRel(relPath);
  if (sourceDirRel) {
    const prefix = `${sourceDirRel}/`;
    if (n.startsWith(prefix)) return n.slice(prefix.length);
    if (!n.includes("/") && /\.(bib|sty|cls|bst|def|tex)$/i.test(n)) return n;
    return null;
  }
  return n;
}

/**
 * Incrementally copy only dirty project files into the build dir.
 * Falls back to a full sync when the build tree is missing.
 */
export async function syncTexSourceIncremental(
  projectRoot: string,
  mainFile: string,
  buildDir: string,
  dirtyRelPaths: string[],
): Promise<{ buildMain: string; sourceDirRel: string; fullSync: boolean }> {
  const normalizedMain = normalizeRel(mainFile);
  const buildMain = path.basename(normalizedMain);
  const mainDirRel = path.dirname(normalizedMain);
  const sourceDirRel = mainDirRel === "." ? "" : normalizeRel(mainDirRel);

  await fs.promises.mkdir(buildDir, { recursive: true });

  const buildMainPath = path.join(buildDir, buildMain);
  if (!fs.existsSync(buildMainPath)) {
    await syncTexSourceToBuildDir(projectRoot, mainFile, buildDir);
    return { buildMain, sourceDirRel, fullSync: true };
  }

  if (dirtyRelPaths.length === 0) {
    return { buildMain, sourceDirRel, fullSync: false };
  }

  const copied = new Set<string>();
  for (const rel of dirtyRelPaths) {
    const destRel = mapProjectRelToBuildRel(rel, sourceDirRel);
    if (!destRel || copied.has(destRel)) continue;

    const srcAbs = path.join(projectRoot, normalizeRel(rel));
    if (!fs.existsSync(srcAbs)) continue;

    const destAbs = path.join(buildDir, destRel);
    await fs.promises.mkdir(path.dirname(destAbs), { recursive: true });
    const stat = await fs.promises.stat(srcAbs);
    if (stat.isDirectory()) {
      await fs.promises.cp(srcAbs, destAbs, { recursive: true, force: true });
    } else {
      await fs.promises.copyFile(srcAbs, destAbs);
    }
    copied.add(destRel);
  }

  if (copied.size > 0) {
    log.info(`Incremental sync (${copied.size} file(s)) → ${buildDir}`);
  }
  return { buildMain, sourceDirRel, fullSync: false };
}

/** Copy declared .bib files into the build dir (biber/bibtex cwd) under their declared basenames. */
export async function stageBibliographyForBuild(
  projectRoot: string,
  mainFile: string,
  texContent: string,
  outDir: string,
): Promise<void> {
  const { declaredInMain, attempts } = resolveBibliographyFromMain(projectRoot, mainFile, texContent);
  const copied = new Set<string>();

  const copyIntoBuild = async (srcAbs: string, declared: string) => {
    const destName = path.basename(
      declared.endsWith(".bib") ? declared : `${declared}.bib`,
    );
    if (copied.has(destName) || !fs.existsSync(srcAbs)) return;
    await fs.promises.copyFile(srcAbs, path.join(outDir, destName));
    copied.add(destName);
  };

  for (const { declared, resolvedPath } of attempts) {
    if (!resolvedPath) continue;
    await copyIntoBuild(path.join(projectRoot, resolvedPath), declared);
  }

  const mainDir = path.dirname(mainFile);
  for (const declared of declaredInMain) {
    const destName = path.basename(
      declared.endsWith(".bib") ? declared : `${declared}.bib`,
    );
    if (copied.has(destName)) continue;
    const rel = mainDir && mainDir !== "."
      ? path.join(mainDir, destName)
      : destName;
    await copyIntoBuild(path.join(projectRoot, rel), declared);
  }

  const mainDirAbs = mainDir && mainDir !== "."
    ? path.join(projectRoot, mainDir)
    : projectRoot;
  if (fs.existsSync(mainDirAbs)) {
    for (const entry of fs.readdirSync(mainDirAbs)) {
      if (!entry.endsWith(".bib")) continue;
      await copyIntoBuild(path.join(mainDirAbs, entry), entry);
    }
  }

  if (copied.size > 0) {
    log.info(`Staged ${copied.size} bibliography file(s) to ${outDir}: ${[...copied].join(", ")}`);
  } else {
    log.warn(`No bibliography files staged for ${mainFile} — biber/bibtex may fail`);
  }
}
