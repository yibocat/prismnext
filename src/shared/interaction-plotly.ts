/**
 * figure.plotly — Plotly figure JSON is the contract.
 * Prism validates structure only; plotly.js owns rendering.
 */

import { normalizeFigureResourceProjectPath } from "./interaction-figure";
import type { InteractionResource, InteractionSpec } from "./interaction-spec";

export const INTERACTION_PLOTLY_KIND = "figure.plotly" as const;

/** Hard cap on figure JSON read from disk. */
export const PLOTLY_MAX_JSON_BYTES = 8 * 1024 * 1024;

export type PlotlyFigure = {
  data: Record<string, unknown>[];
  layout?: Record<string, unknown>;
  frames?: Record<string, unknown>[];
  config?: Record<string, unknown>;
};

export function isInteractionPlotlyKind(kind: string): boolean {
  return kind.trim() === INTERACTION_PLOTLY_KIND;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export type PlotlyFigureResult = { ok: true; figure: PlotlyFigure } | { ok: false; error: string };

export function validatePlotlyFigure(raw: unknown): PlotlyFigureResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "figure must be an object like { data: [...], layout: {...} }" };
  }
  if (!Array.isArray(raw.data) || raw.data.length === 0) {
    return { ok: false, error: "figure.data must be a non-empty array of traces" };
  }
  const data: Record<string, unknown>[] = [];
  for (let i = 0; i < raw.data.length; i++) {
    const trace = raw.data[i];
    if (!isPlainObject(trace)) {
      return { ok: false, error: `figure.data[${i}] must be a trace object` };
    }
    data.push(trace);
  }
  if (raw.layout !== undefined && !isPlainObject(raw.layout)) {
    return { ok: false, error: "figure.layout must be an object" };
  }
  if (raw.frames !== undefined && !Array.isArray(raw.frames)) {
    return { ok: false, error: "figure.frames must be an array" };
  }
  if (raw.config !== undefined && !isPlainObject(raw.config)) {
    return { ok: false, error: "figure.config must be an object" };
  }

  const figure: PlotlyFigure = { data };
  if (isPlainObject(raw.layout)) figure.layout = raw.layout;
  if (Array.isArray(raw.frames)) figure.frames = raw.frames.filter(isPlainObject);
  if (isPlainObject(raw.config)) figure.config = raw.config;
  return { ok: true, figure };
}

function jsonResourcePath(resources?: InteractionResource[]): string | null {
  if (!resources?.length) return null;
  for (const r of resources) {
    const p = (r.path ?? r.artifactPath)?.trim();
    if (!p) continue;
    if (r.role === "figure-json" || p.toLowerCase().endsWith(".json")) return p;
  }
  return null;
}

export type PlotlyFigureSource =
  | { ok: true; mode: "inline"; figure: PlotlyFigure }
  | { ok: true; mode: "file"; path: string }
  | { ok: false; error: string };

export function resolvePlotlyFigureSource(spec: InteractionSpec): PlotlyFigureSource {
  if (!isInteractionPlotlyKind(spec.kind)) {
    return { ok: false, error: `unsupported kind "${spec.kind}"` };
  }
  const filePath = jsonResourcePath(spec.resources);
  if (filePath) {
    return { ok: true, mode: "file", path: normalizeFigureResourceProjectPath(spec, filePath) };
  }
  const model = spec.model;
  const inline = isPlainObject(model) && model.figure !== undefined ? model.figure : model;
  const validated = validatePlotlyFigure(inline);
  if (validated.ok) return { ok: true, mode: "inline", figure: validated.figure };
  return {
    ok: false,
    error:
      "figure.plotly needs spec.model.figure { data, layout } or a json resource " +
      '(resources: [{ role: "figure-json", path: "figure.json" }]) — ' +
      validated.error,
  };
}

/** Minimal legal figure — returned as a copyable hint on validation failure. */
export const PLOTLY_SAMPLE_FIGURE: PlotlyFigure = {
  data: [
    {
      type: "surface",
      x: [-1, 0, 1],
      y: [-1, 0, 1],
      z: [
        [1, 0, 1],
        [0, -1, 0],
        [1, 0, 1],
      ],
      colorbar: { title: { text: "z" } },
    },
  ],
  layout: {
    scene: {
      xaxis: { title: { text: "u" } },
      yaxis: { title: { text: "v" } },
      zaxis: { title: { text: "z" } },
    },
    margin: { l: 0, r: 0, t: 32, b: 0 },
  },
};
