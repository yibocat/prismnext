import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { PROJECT_COMPILE_DIRNAME, PROJECT_META_DIR } from "../../shared/workbench/paths";

const TEX_AUX_EXT = new Set([
  ".aux",
  ".log",
  ".out",
  ".toc",
  ".lof",
  ".lot",
  ".fls",
  ".fdb_latexmk",
  ".bbl",
  ".blg",
  ".bcf",
  ".nav",
  ".snm",
  ".vrb",
  ".xdv",
  ".idx",
  ".ilg",
  ".ind",
  ".glo",
  ".gls",
  ".acn",
  ".acr",
  ".alg",
]);

const SKIP_NAMES = new Set([".git", ".ds_store", "thumbs.db", ".prismnext", ".workbench"]);

/** True if this relative path should be omitted from a manuscript zip. */
export function shouldExcludeFromManuscriptZip(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  for (const part of parts) {
    if (SKIP_NAMES.has(part.toLowerCase())) return true;
  }
  const base = parts[parts.length - 1] ?? "";
  const lower = base.toLowerCase();
  if (lower.endsWith(".synctex.gz") || lower.endsWith(".run.xml")) return true;
  const ext = extname(lower);
  if (TEX_AUX_EXT.has(ext)) return true;
  return false;
}

/** Absolute path of the compile PDF for a main .tex relative path. */
export function resolveCompilePdfAbsolutePath(
  projectRoot: string,
  mainRelativePath: string,
): string {
  const stem = basename(mainRelativePath, extname(mainRelativePath));
  return join(projectRoot, PROJECT_META_DIR, PROJECT_COMPILE_DIRNAME, `${stem}.pdf`);
}

export async function fileExists(absPath: string): Promise<boolean> {
  try {
    await access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(
  rootDir: string,
  dir: string,
  out: { rel: string; abs: string }[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(rootDir, abs);
    if (shouldExcludeFromManuscriptZip(rel)) continue;
    if (entry.isDirectory()) {
      await collectFiles(rootDir, abs, out);
    } else if (entry.isFile()) {
      out.push({ rel: rel.split(sep).join("/"), abs });
    }
  }
}

/** Build a zip Buffer of `manuscriptAbsDir` (folder name as zip root). */
export async function packManuscriptDirectory(
  manuscriptAbsDir: string,
): Promise<Uint8Array> {
  const st = await stat(manuscriptAbsDir);
  if (!st.isDirectory()) {
    throw new Error(`Manuscript path is not a directory: ${manuscriptAbsDir}`);
  }

  const rootName = basename(manuscriptAbsDir);
  const files: { rel: string; abs: string }[] = [];
  await collectFiles(manuscriptAbsDir, manuscriptAbsDir, files);

  const zipTree: Record<string, Uint8Array> = {};
  for (const f of files) {
    const data = await readFile(f.abs);
    zipTree[`${rootName}/${f.rel}`] = new Uint8Array(data);
  }

  if (Object.keys(zipTree).length === 0) {
    zipTree[`${rootName}/`] = strToU8("");
  }

  return zipSync(zipTree, { level: 6 });
}

export async function writeUint8File(absPath: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, Buffer.from(data));
}
