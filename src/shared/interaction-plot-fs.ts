/**
 * Main-process plot.* path checks for interaction-write.
 * Requires a real CSV under the project root — no synthetic series.
 */

import { existsSync, statSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import {
  isCsvArtifactPath,
  isInteractionPlotKind,
  MAX_PLOT_CSV_BYTES,
  pickCsvResourcePath,
} from "./interaction-plot";
import type { InteractionSpec } from "./interaction-spec";

export function resolvePlotAbsPath(
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

export function validatePlotSpec(
  projectRoot: string,
  spec: InteractionSpec,
  fileExists: (absPath: string) => boolean = existsSync,
  fileSizeBytes: (absPath: string) => number = (abs) => {
    try {
      return statSync(abs).size;
    } catch {
      return -1;
    }
  },
): { ok: true; absPath: string; relPath: string } | { ok: false; error: string } {
  if (!isInteractionPlotKind(spec.kind)) {
    return { ok: false, error: "not a plot.* spec" };
  }
  const relPath = pickCsvResourcePath(spec.resources);
  if (!relPath) {
    return {
      ok: false,
      error:
        "plot.* requires resources[] with a CSV path (role data/csv), e.g. {\"role\":\"data\",\"path\":\"experiments/foo/results/metrics.csv\"}. Do not invent numeric series — use a real file.",
    };
  }
  if (!isCsvArtifactPath(relPath)) {
    return {
      ok: false,
      error: `plot.* path must be a .csv file: ${relPath}`,
    };
  }
  const absPath = resolvePlotAbsPath(projectRoot, relPath);
  if (!absPath) {
    return { ok: false, error: `plot CSV path escapes project root: ${relPath}` };
  }
  if (!fileExists(absPath)) {
    return {
      ok: false,
      error: `plot CSV not found on disk (write the CSV first, then interaction-write): ${relPath}`,
    };
  }
  const size = fileSizeBytes(absPath);
  if (size < 0) {
    return { ok: false, error: `could not stat plot CSV: ${relPath}` };
  }
  if (size > MAX_PLOT_CSV_BYTES) {
    return {
      ok: false,
      error: `plot CSV exceeds ${MAX_PLOT_CSV_BYTES} bytes: ${relPath}`,
    };
  }
  const relForUi = relative(resolve(projectRoot), absPath).split(sep).join("/");
  return { ok: true, absPath, relPath: relForUi };
}
