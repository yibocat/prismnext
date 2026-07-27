/**
 * Offscreen render + thumbnail (V4-B) — after a successful `figure.plotly`/
 * `instrument` write, render the real figure once in a hidden window and
 * capture a PNG. This doubles as the render self-check for file-backed
 * figures (previously only existence-checked, never actually parsed) and
 * feeds the Chat fence card's thumbnail image.
 *
 * See docs-private/superpowers/specs/2026-07-27-interaction-plotly-runtime-design.md
 * §10 (D25–D28) for the full design rationale.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isInteractionInstrumentKind,
  parseInstrumentModel,
  resolveInstrumentFigure,
} from "../../shared/interaction-instrument";
import { initialBindingValues, parseMathBindings } from "../../shared/interaction-math";
import {
  PLOTLY_MAX_JSON_BYTES,
  isInteractionPlotlyKind,
  resolvePlotlyFigureSource,
  validatePlotlyFigure,
  type PlotlyFigure,
} from "../../shared/interaction-plotly";
import type { InteractionSpec } from "../../shared/interaction-spec";

export const THUMBNAIL_WIDTH = 480;
export const THUMBNAIL_HEIGHT = 360;

export type ThumbnailFigureResult = { ok: true; figure: PlotlyFigure } | { ok: false; error: string };

function resolveProjectAbsPath(projectRoot: string, relPath: string): string {
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p)) return p;
  return join(projectRoot, p);
}

function resolvePlotlyFileFigure(projectRoot: string, path: string): ThumbnailFigureResult {
  const abs = resolveProjectAbsPath(projectRoot, path);
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return { ok: false, error: `could not read figure resource "${path}"` };
  }
  if (text.length > PLOTLY_MAX_JSON_BYTES) {
    return { ok: false, error: `figure json too large (> ${PLOTLY_MAX_JSON_BYTES} bytes): ${path}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: `invalid JSON in figure resource "${path}"` };
  }
  const validated = validatePlotlyFigure(parsed);
  if (!validated.ok) return { ok: false, error: `${path}: ${validated.error}` };
  return { ok: true, figure: validated.figure };
}

/**
 * Resolve the actual Plotly figure a `figure.plotly`/`instrument` spec would
 * render, for offscreen capture. Pure (no Electron) — reads file-mode figure
 * resources synchronously since this always runs in the main process.
 */
export function resolveFigureForThumbnail(
  projectRoot: string,
  spec: InteractionSpec,
): ThumbnailFigureResult {
  if (isInteractionPlotlyKind(spec.kind)) {
    const src = resolvePlotlyFigureSource(spec);
    if (!src.ok) return { ok: false, error: src.error };
    if (src.mode === "inline") return { ok: true, figure: src.figure };
    return resolvePlotlyFileFigure(projectRoot, src.path);
  }
  if (isInteractionInstrumentKind(spec.kind)) {
    const model = parseInstrumentModel(spec.model);
    if (!model) return { ok: false, error: "invalid instrument model" };
    const bindingValues = initialBindingValues(parseMathBindings(spec.bindings));
    const resolved = resolveInstrumentFigure(model, bindingValues, 0);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    return { ok: true, figure: resolved.figure };
  }
  return { ok: false, error: `unsupported kind "${spec.kind}" for thumbnail capture` };
}
