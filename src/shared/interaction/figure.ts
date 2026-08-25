/**
 * Static figure Interaction helpers (PDF / raster / SVG).
 * Path resolution / disk checks live in interaction-figure-fs.ts (main).
 */

import { isImageArtifactPath, isPdfArtifactPath } from "./artifact-path";
import type { InteractionResource, InteractionSpec } from "./spec";

export const FIGURE_STATIC_KIND = "figure.static" as const;

export function isFigureStaticKind(kind: string): boolean {
  return kind.trim() === FIGURE_STATIC_KIND;
}

export function isFigureVisualPath(path: string): boolean {
  return isImageArtifactPath(path) || isPdfArtifactPath(path);
}

function preferredFigureRole(r: InteractionResource): boolean {
  const role = (r.role ?? "").toLowerCase();
  return role === "figure" || role === "image" || role === "png" || role === "svg" || role === "pdf";
}

function pickFrom(list: InteractionResource[]): InteractionResource | undefined {
  return list.find(preferredFigureRole) ?? list[0];
}

/** Prefer a raster/SVG when both exist; otherwise the first visual (image or PDF). */
export function pickFigureResourcePath(spec: InteractionSpec): string | null {
  const visuals: InteractionResource[] = [];
  for (const r of spec.resources ?? []) {
    const path = typeof r.path === "string" ? r.path.trim() : "";
    if (!path || !isFigureVisualPath(path)) continue;
    visuals.push(r);
  }
  if (visuals.length === 0) return null;
  const images = visuals.filter((r) => isImageArtifactPath(r.path ?? ""));
  const pdfs = visuals.filter((r) => isPdfArtifactPath(r.path ?? ""));
  const chosen = pickFrom(images) ?? pickFrom(pdfs);
  return chosen?.path?.trim() || null;
}
