/**
 * figure.plotly — Plotly figure JSON is the contract.
 * Prism validates structure only; plotly.js owns rendering.
 */

import { normalizeFigureResourceProjectPath } from "./interaction-figure";
import type { InteractionResource, InteractionSpec } from "./interaction-spec";
import {
  buildDomainGrids,
  checkNoLiteralGridArrays,
  parseComputeDomain,
  parseModelParams,
  walkResolveMarkers,
} from "./interaction-compute";

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

export function jsonResourcePath(resources?: InteractionResource[]): string | null {
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

export type PlotlyInlineBakeResult =
  | { ok: true; figure: PlotlyFigure }
  | { ok: false; error: string };

/**
 * Write-time only: gate hand-typed literal arrays on continuous-domain trace
 * types and resolve compute markers (`$grid`/`$exprGrid`/`$exprSeries`/`$expr`)
 * in `model.figure` against `model.domain` + `model.params`.
 *
 * Must run on the AUTHOR-WRITTEN model, before the result is persisted
 * (baked) into `spec.model.figure`. Never re-run this on an already-baked
 * spec — the persisted figure legitimately contains literal numbers computed
 * by this function, and re-gating it would reject its own output.
 */
export function resolveInlinePlotlyModel(model: unknown): PlotlyInlineBakeResult {
  const wrapped = isPlainObject(model) && model.figure !== undefined;
  const figureLike = wrapped ? (model as Record<string, unknown>).figure : model;

  const gate = checkNoLiteralGridArrays(figureLike);
  if (!gate.ok) return { ok: false, error: gate.error };

  const domainRaw = isPlainObject(model) ? model.domain : undefined;
  const domain = parseComputeDomain(domainRaw);
  if (domain === null) {
    return {
      ok: false,
      error: "model.domain must be an object like { uMin, uMax, vMin, vMax, resolution }",
    };
  }
  const domainGrids = domain ? buildDomainGrids(domain) : null;

  const paramsRaw = isPlainObject(model) ? model.params : undefined;
  const varContext = parseModelParams(paramsRaw);
  if (varContext === null) {
    return { ok: false, error: "model.params must be an object of { name: number }" };
  }

  try {
    const resolved = walkResolveMarkers(figureLike, { domain, domainGrids, varContext });
    return validatePlotlyFigure(resolved);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "figure.plotly marker resolution failed",
    };
  }
}

/** Minimal legal figure (unit sphere, computed via markers — not hand-typed). */
export const PLOTLY_SAMPLE_FIGURE_MODEL = {
  domain: {
    axes: [
      { name: "theta", min: 0, max: Math.PI, resolution: 40 },
      { name: "phi", min: 0, max: 2 * Math.PI, resolution: 40 },
    ],
  },
  figure: {
    data: [
      {
        type: "surface",
        x: { $exprGrid: { over: ["theta", "phi"], expr: "sin(theta) * cos(phi)" } },
        y: { $exprGrid: { over: ["theta", "phi"], expr: "sin(theta) * sin(phi)" } },
        z: { $exprGrid: { over: ["theta", "phi"], expr: "cos(theta)" } },
        colorbar: { title: { text: "z" } },
      },
    ],
    layout: {
      scene: {
        xaxis: { title: { text: "x" } },
        yaxis: { title: { text: "y" } },
        zaxis: { title: { text: "z" } },
        aspectmode: "cube",
      },
      margin: { l: 0, r: 0, t: 32, b: 0 },
    },
  },
};

/**
 * Sample step-through animation (x^2 on [-2,2], 5 frames coarse -> fine),
 * computed via `$exprSeries` with a per-frame `resolution` override —
 * demonstrates figure.plotly frames + slider without any hand-typed arrays.
 */
export const PLOTLY_SAMPLE_CURVE_ANIMATION_MODEL = {
  domain: {
    axes: [{ name: "x", min: -2, max: 2, resolution: 200 }],
  },
  figure: {
    data: [
      {
        type: "scatter",
        mode: "lines+markers",
        x: { $exprSeries: { over: "x", expr: "x", resolution: 3 } },
        y: { $exprSeries: { over: "x", expr: "x*x", resolution: 3 } },
        name: "3 points",
      },
    ],
    layout: {
      xaxis: { title: { text: "x" }, range: [-2, 2] },
      yaxis: { title: { text: "y = x^2" } },
      margin: { l: 40, r: 0, t: 32, b: 32 },
      sliders: [
        {
          active: 0,
          steps: [3, 6, 12, 25, 50].map((n, i) => ({
            label: `${n} pts`,
            method: "animate",
            args: [[`f${i}`], { mode: "immediate", frame: { duration: 0, redraw: true } }],
          })),
        },
      ],
      updatemenus: [
        {
          type: "buttons",
          buttons: [
            {
              label: "Play",
              method: "animate",
              args: [null, { fromcurrent: true, frame: { duration: 500, redraw: true } }],
            },
          ],
        },
      ],
    },
    frames: [3, 6, 12, 25, 50].map((n, i) => ({
      name: `f${i}`,
      data: [
        {
          x: { $exprSeries: { over: "x", expr: "x", resolution: n } },
          y: { $exprSeries: { over: "x", expr: "x*x", resolution: n } },
        },
      ],
    })),
  },
};

/** Legacy alias kept for existing structural-validation tests (literal, not marker-based). */
export const PLOTLY_SAMPLE_FIGURE: PlotlyFigure = {
  data: [
    {
      type: "scatter",
      mode: "markers",
      x: [-1, 0, 1],
      y: [1, 0, 1],
    },
  ],
  layout: {
    xaxis: { title: { text: "u" } },
    yaxis: { title: { text: "z" } },
    margin: { l: 0, r: 0, t: 32, b: 0 },
  },
};
