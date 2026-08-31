import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** POSIX rel under project root, no leading slash. */
export function normalizeTypstRel(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function typstFileUri(projectRoot: string, relPath: string): string {
  return pathToFileURL(join(projectRoot, normalizeTypstRel(relPath))).href;
}

export function typstRelFromUri(projectRoot: string, uri: string): string | null {
  let abs: string;
  try {
    abs = fileURLToPath(uri);
  } catch {
    return null;
  }
  const rel = relative(projectRoot, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}
