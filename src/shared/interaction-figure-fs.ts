/**
 * Main-process figure path checks for interaction-write.
 */

import { existsSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import {
  isFigureStaticKind,
  pickFigureResourcePath,
} from "./interaction-figure";
import type { InteractionSpec } from "./interaction-spec";

/**
 * Resolve a project-relative (or absolute-under-root) image path.
 * Returns null if outside projectRoot or empty.
 */
export function resolveFigureAbsPath(
  projectRoot: string,
  relOrAbs: string,
): string | null {
  const root = resolve(projectRoot);
  const raw = (relOrAbs || "").trim();
  if (!raw) return null;
  const abs = resolve(isAbsolute(raw) ? raw : joinUnderRoot(root, raw));
  const rel = relative(root, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return normalize(abs);
}

function joinUnderRoot(root: string, rel: string): string {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  return resolve(root, ...cleaned.split("/").filter(Boolean));
}

export function validateFigureStaticSpec(
  projectRoot: string,
  spec: InteractionSpec,
  fileExists: (absPath: string) => boolean = existsSync,
): { ok: true; absPath: string; relPath: string } | { ok: false; error: string } {
  if (!isFigureStaticKind(spec.kind)) {
    return { ok: false, error: "not a figure.static spec" };
  }
  const relPath = pickFigureResourcePath(spec);
  if (!relPath) {
    return {
      ok: false,
      error:
        "figure.static requires resources[] with a visual path (png/svg/jpg/webp/gif/pdf), e.g. {\"role\":\"figure\",\"path\":\"figures/foo.pdf\"}",
    };
  }
  const absPath = resolveFigureAbsPath(projectRoot, relPath);
  if (!absPath) {
    return { ok: false, error: `figure path escapes project root: ${relPath}` };
  }
  if (!fileExists(absPath)) {
    return {
      ok: false,
      error: `figure file not found on disk (write the image first, then interaction-write): ${relPath}`,
    };
  }
  const relForUi = relative(resolve(projectRoot), absPath).split(sep).join("/");
  return { ok: true, absPath, relPath: relForUi };
}
