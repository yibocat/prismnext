/**
 * Static figure Interaction helpers (PNG/SVG display only).
 * Path resolution / disk checks live in interaction-figure-fs.ts (main).
 */

import { isImageArtifactPath } from "./artifact-path";
import type { InteractionResource, InteractionSpec } from "./interaction-spec";

export const FIGURE_STATIC_KIND = "figure.static" as const;

export function isFigureStaticKind(kind: string): boolean {
  return kind.trim() === FIGURE_STATIC_KIND;
}

/** Prefer role=figure / image, else first image-looking path. */
export function pickFigureResourcePath(spec: InteractionSpec): string | null {
  const resources = spec.resources ?? [];
  const ranked: InteractionResource[] = [];
  for (const r of resources) {
    const path = typeof r.path === "string" ? r.path.trim() : "";
    if (!path || !isImageArtifactPath(path)) continue;
    ranked.push(r);
  }
  if (ranked.length === 0) return null;
  const preferred = ranked.find((r) => {
    const role = (r.role ?? "").toLowerCase();
    return role === "figure" || role === "image" || role === "png" || role === "svg";
  });
  return (preferred ?? ranked[0])!.path!.trim();
}
