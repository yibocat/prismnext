/**
 * Interaction compute layer — the ONLY legitimate way a numeric value that
 * represents a mathematical formula enters an Interaction spec.
 *
 * Design principle (see docs-private/superpowers/specs — Interaction runtime):
 * every number in a spec is either (a) computed by this module from an
 * agent-authored expression, (b) read from a real file (Python/experiment
 * output via `resources`), or (c) a small literal/categorical value with no
 * formula concept (bar/pie labels, discrete counts). An agent hand-typing a
 * numeric array that samples a continuous function is never legitimate —
 * `checkNoLiteralGridArrays` rejects that structurally, regardless of size.
 *
 * Shared by `instrument` (live bindings/step) and `figure.plotly` (static,
 * resolved once at write time — see interaction-plotly.ts).
 */

import { diagnoseMathExpression, evaluateMathExpression } from "./interaction-math";

export type ComputeDomain = {
  /** Explicit expression variables sampled by compute markers. */
  axes?: ComputeAxis[];
  /** @deprecated Legacy compatibility fields; new specs use `axes`. */
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  resolution: number;
};

export type ComputeAxis = {
  name: string;
  min: number;
  max: number;
  resolution: number;
};

const AXIS_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Parse `model.domain`. Returns `undefined` when absent, `null` when malformed. */
export function parseComputeDomain(raw: unknown): ComputeDomain | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const resolutionRaw = num(o.resolution, 48);
  const resolution = Math.min(128, Math.max(4, Math.floor(resolutionRaw)));
  const legacy = {
    uMin: num(o.uMin, -2),
    uMax: num(o.uMax, 2),
    vMin: num(o.vMin, -2),
    vMax: num(o.vMax, 2),
    resolution,
  };

  if (o.axes === undefined) {
    return {
      ...legacy,
      axes: [
        { name: "u", min: legacy.uMin, max: legacy.uMax, resolution },
        { name: "v", min: legacy.vMin, max: legacy.vMax, resolution },
      ],
    };
  }
  if (!Array.isArray(o.axes) || o.axes.length === 0) return null;
  const axes: ComputeAxis[] = [];
  const names = new Set<string>();
  for (const rawAxis of o.axes) {
    if (!rawAxis || typeof rawAxis !== "object" || Array.isArray(rawAxis)) return null;
    const axis = rawAxis as Record<string, unknown>;
    const name = typeof axis.name === "string" ? axis.name.trim() : "";
    if (!AXIS_NAME_RE.test(name) || names.has(name)) return null;
    names.add(name);
    axes.push({
      name,
      min: num(axis.min, -2),
      max: num(axis.max, 2),
      resolution: Math.min(128, Math.max(4, Math.floor(num(axis.resolution, resolution)))),
    });
  }
  const first = axes[0]!;
  const second = axes[1] ?? first;
  return {
    axes,
    uMin: first.min,
    uMax: first.max,
    vMin: second.min,
    vMax: second.max,
    resolution: first.resolution,
  };
}

export type DomainGrids = Record<string, number[]>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function axesFor(domain: ComputeDomain): ComputeAxis[] {
  if (domain.axes?.length) return domain.axes;
  return [
    { name: "u", min: domain.uMin, max: domain.uMax, resolution: domain.resolution },
    { name: "v", min: domain.vMin, max: domain.vMax, resolution: domain.resolution },
  ];
}

/** Parse `model.params` — numeric constants available in compute expressions. */
export function parseModelParams(raw: unknown): Record<string, number> | null {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out[k] = v;
  }
  return out;
}

export function buildDomainGrids(domain: ComputeDomain): DomainGrids {
  const axis = (min: number, max: number, resolution: number) =>
    Array.from(
      { length: Math.max(1, resolution) },
      (_, i) => min + ((max - min) * i) / Math.max(1, resolution - 1),
    );
  return Object.fromEntries(axesFor(domain).map((item) => [item.name, axis(item.min, item.max, item.resolution)]));
}

/** Base markers available everywhere the compute layer is wired up. */
export const BASE_MARKER_KEYS = ["$grid", "$exprGrid", "$exprSeries", "$expr"] as const;
export type BaseMarkerKey = (typeof BASE_MARKER_KEYS)[number];

export type ComputeContext = {
  /** Raw domain (bounds + default resolution) — needed for `$exprSeries.resolution` overrides. */
  domain?: ComputeDomain | null;
  domainGrids: DomainGrids | null;
  varContext: Record<string, number>;
};

function buildAxis(min: number, max: number, resolution: number): number[] {
  const n = Math.max(1, Math.floor(resolution));
  return Array.from({ length: n }, (_, i) => min + ((max - min) * i) / Math.max(1, n - 1));
}

function markerAxisName(raw: unknown, marker: "$grid" | "$exprSeries"): string {
  if (typeof raw === "string") return raw;
  if (isPlainObject(raw) && typeof raw.axis === "string") return raw.axis;
  throw new Error(`${marker} requires an axis name`);
}

function domainAxis(domain: ComputeDomain, name: string): ComputeAxis {
  const axis = axesFor(domain).find((item) => item.name === name);
  if (!axis) throw new Error(`unknown domain axis ${JSON.stringify(name)}`);
  return axis;
}

/** True when `node` is a single-key marker object using one of `markerKeys`. */
export function isMarkerObject(node: unknown, markerKeys: readonly string[]): boolean {
  if (!isPlainObject(node)) return false;
  const keys = Object.keys(node).filter((k) => markerKeys.includes(k));
  return keys.length === 1 && Object.keys(node).length === 1;
}

/**
 * Resolve one of the base markers (`$grid`/`$exprGrid`/`$exprSeries`/`$expr`)
 * against the current domain grids + variable context. Throws on misuse —
 * callers surface the message as a validation error.
 */
export function resolveBaseMarker(
  key: BaseMarkerKey,
  raw: unknown,
  ctx: ComputeContext,
): unknown {
  const { domainGrids, varContext } = ctx;
  if (key === "$grid") {
    if (!domainGrids) throw new Error("$grid requires model.domain");
    const axis = markerAxisName(raw, "$grid");
    const values = domainGrids[axis];
    if (!values) throw new Error(`unknown domain axis ${JSON.stringify(axis)}`);
    return [...values];
  }
  if (key === "$exprGrid") {
    if (!domainGrids) throw new Error("$exprGrid requires model.domain");
    const legacy = typeof raw === "string";
    const over = legacy ? ["u", "v"] : isPlainObject(raw) ? raw.over : undefined;
    const expr = legacy ? raw : isPlainObject(raw) ? raw.expr : undefined;
    if (
      !Array.isArray(over) ||
      over.length !== 2 ||
      !over.every((axis): axis is string => typeof axis === "string") ||
      typeof expr !== "string" ||
      !expr.trim()
    ) {
      throw new Error('$exprGrid requires { over: ["axisX", "axisY"], expr: "<expression>" }');
    }
    const xAxis = over[0]!;
    const yAxis = over[1]!;
    const xValues = domainGrids[xAxis];
    const yValues = domainGrids[yAxis];
    if (!xValues || !yValues) throw new Error(`$exprGrid names an unknown domain axis`);
    const vars = [...Object.keys(varContext), xAxis, yAxis];
    const diagnosis = diagnoseMathExpression(expr, vars);
    if (diagnosis) throw new Error(diagnosis);
    return yValues.map((y) =>
      xValues.map((x) => evaluateMathExpression(expr, { ...varContext, [xAxis]: x, [yAxis]: y })),
    );
  }
  if (key === "$exprSeries") {
    if (!domainGrids) throw new Error("$exprSeries requires model.domain");
    if (!isPlainObject(raw)) {
      throw new Error(
        '$exprSeries value must be { over: "<declared-axis>", expr: "<expression>", resolution?: <int> }',
      );
    }
    const over = raw.over;
    const expr = raw.expr;
    if (typeof over !== "string" || !domainGrids[over]) {
      throw new Error(`$exprSeries.over must name a declared domain axis, got ${JSON.stringify(over)}`);
    }
    if (typeof expr !== "string" || !expr.trim()) {
      throw new Error("$exprSeries.expr must be a non-empty string expression");
    }
    let axis = domainGrids[over];
    if (raw.resolution !== undefined) {
      const { domain } = ctx;
      if (!domain) throw new Error("$exprSeries.resolution requires model.domain");
      if (typeof raw.resolution !== "number" || !Number.isFinite(raw.resolution) || raw.resolution < 1) {
        throw new Error("$exprSeries.resolution must be a positive integer");
      }
      const definition = domainAxis(domain, over);
      axis = buildAxis(definition.min, definition.max, raw.resolution);
    }
    const vars = [...Object.keys(varContext), over];
    const diagnosis = diagnoseMathExpression(expr, vars);
    if (diagnosis) throw new Error(diagnosis);
    return axis.map((val) => evaluateMathExpression(expr, { ...varContext, [over]: val }));
  }
  // $expr
  if (typeof raw !== "string") throw new Error("$expr value must be a string expression");
  const vars = Object.keys(varContext);
  const diagnosis = diagnoseMathExpression(raw, vars);
  if (diagnosis) throw new Error(diagnosis);
  return evaluateMathExpression(raw, varContext);
}

/**
 * Recursively resolve marker objects in `node`. Base markers are handled
 * internally; `extraMarkerKeys` + `resolveExtra` let callers (e.g.
 * `instrument`'s `$state`/`$stateTrail`) plug in kind-specific markers
 * without duplicating the tree-walk.
 */
export function walkResolveMarkers(
  node: unknown,
  ctx: ComputeContext,
  extraMarkerKeys: readonly string[] = [],
  resolveExtra?: (key: string, raw: unknown, node: Record<string, unknown>) => unknown,
): unknown {
  if (Array.isArray(node)) {
    return node.map((child) => walkResolveMarkers(child, ctx, extraMarkerKeys, resolveExtra));
  }
  if (isPlainObject(node)) {
    const allKeys = [...BASE_MARKER_KEYS, ...extraMarkerKeys];
    const keys = Object.keys(node);
    const markerKeys = keys.filter((k) => allKeys.includes(k));
    if (markerKeys.length > 1) {
      throw new Error(`ambiguous marker object with keys: ${markerKeys.join(", ")}`);
    }
    if (markerKeys.length === 1) {
      const mk = markerKeys[0]!;
      const raw = node[mk];
      if ((BASE_MARKER_KEYS as readonly string[]).includes(mk)) {
        return resolveBaseMarker(mk as BaseMarkerKey, raw, ctx);
      }
      if (!resolveExtra) throw new Error(`marker not supported here: ${mk}`);
      return resolveExtra(mk, raw, node);
    }
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = walkResolveMarkers(node[k], ctx, extraMarkerKeys, resolveExtra);
    return out;
  }
  return node;
}

/**
 * Trace types that are inherently continuous-domain samples (surfaces,
 * meshes, dense grids, volumetric fields) — there is no legitimate "small
 * literal" case for these; a hand-typed coordinate array is always suspect
 * regardless of length.
 */
export const GRID_TRACE_TYPES = [
  "surface",
  "mesh3d",
  "contour",
  "contourcarpet",
  "heatmap",
  "cone",
  "streamtube",
  "isosurface",
  "volume",
] as const;

const GRID_COORD_FIELDS = ["x", "y", "z", "value", "i", "j", "k", "u", "v", "w"] as const;

function traceIsGuarded(trace: Record<string, unknown>): boolean {
  const type = typeof trace.type === "string" ? trace.type : "";
  if ((GRID_TRACE_TYPES as readonly string[]).includes(type)) return true;
  if (type === "scatter" || type === "scatter3d" || type === "scattergl") {
    const mode = typeof trace.mode === "string" ? trace.mode : "";
    return mode.includes("lines");
  }
  return false;
}

export type FieldSourceCheckResult = { ok: true } | { ok: false; error: string };

/**
 * Hard structural gate: for trace types that inherently represent a
 * continuous mathematical object, coordinate/value fields must be either a
 * compute marker (resolved by this module) or absent — never a literal
 * array typed directly into the spec. Run this on the RAW (pre-resolve)
 * figure-like object; no size threshold — any literal array is a violation.
 */
export function checkNoLiteralGridArrays(
  figureLike: unknown,
  extraMarkerKeys: readonly string[] = [],
): FieldSourceCheckResult {
  if (!isPlainObject(figureLike)) return { ok: true };
  const allMarkerKeys = [...BASE_MARKER_KEYS, ...extraMarkerKeys];

  function checkTraces(
    traces: unknown,
    where: string,
    baseTraces?: unknown[],
  ): FieldSourceCheckResult {
    if (!Array.isArray(traces)) return { ok: true };
    for (let i = 0; i < traces.length; i++) {
      const trace = traces[i];
      if (!isPlainObject(trace)) continue;
      // Plotly `frames[].data[]` entries often omit `type`/`mode` (inherited
      // from the base trace at the same index) — merge for the guard check,
      // but only inspect fields literally present on this entry.
      const base = baseTraces?.[i];
      const merged = isPlainObject(base) ? { ...base, ...trace } : trace;
      if (!traceIsGuarded(merged)) continue;
      const type = typeof merged.type === "string" ? merged.type : "trace";
      for (const field of GRID_COORD_FIELDS) {
        const value = trace[field];
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          return {
            ok: false,
            error:
              `${where}[${i}] (type "${type}") uses a literal array for "${field}" — this looks ` +
              "like hand-authored numeric data for a mathematical surface/curve, which cannot be " +
              "verified accurate (no size is safe — a small array can be just as wrong as a large " +
              "one). Use $grid/$exprGrid/$exprSeries/$expr compute markers (host evaluates exactly), " +
              "or provide real data via resources (Python-generated figure.json / experiment output).",
          };
        }
        if (isPlainObject(value) && !isMarkerObject(value, allMarkerKeys)) {
          return {
            ok: false,
            error:
              `${where}[${i}] (type "${type}") field "${field}" is an object but not a recognized ` +
              `compute marker (${allMarkerKeys.join(", ")}).`,
          };
        }
      }
    }
    return { ok: true };
  }

  const dataResult = checkTraces(figureLike.data, "data");
  if (!dataResult.ok) return dataResult;

  if (Array.isArray(figureLike.frames)) {
    for (let f = 0; f < figureLike.frames.length; f++) {
      const frame = figureLike.frames[f];
      if (!isPlainObject(frame)) continue;
      const frameResult = checkTraces(
        frame.data,
        `frames[${f}].data`,
        Array.isArray(figureLike.data) ? figureLike.data : undefined,
      );
      if (!frameResult.ok) return frameResult;
    }
  }

  return { ok: true };
}
