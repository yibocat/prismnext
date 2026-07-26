/**
 * Interaction math.* runtime — grid sampling + sandboxed expressions (P2).
 */

import type { InteractionSpec } from "./interaction-spec";

export const INTERACTION_MATH_KINDS = ["math.surface", "math.field"] as const;

export type InteractionMathKind = (typeof INTERACTION_MATH_KINDS)[number];

export type MathGridParams = {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  resolution: number;
};

export type MathBindingDef = {
  min: number;
  max: number;
  step: number;
  default: number;
  label: string;
};

export type SurfaceMeshData = {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
};

export type FieldArrow = {
  origin: [number, number, number];
  direction: [number, number, number];
};

const ALLOWED_MATH_IDENTIFIERS = new Set([
  "Math",
  "sin",
  "cos",
  "tan",
  "exp",
  "sqrt",
  "abs",
  "pow",
  "min",
  "max",
  "PI",
  "E",
  "u",
  "v",
]);

const FORBIDDEN_EXPR =
  /\b(eval|Function|import|require|window|global|this|constructor|prototype|process|fetch|XMLHttpRequest)\b/i;

export function isInteractionMathKind(kind: string): boolean {
  return (INTERACTION_MATH_KINDS as readonly string[]).includes(kind.trim());
}

export function parseMathGridParams(params?: Record<string, unknown>): MathGridParams {
  const num = (key: string, fallback: number) => {
    const v = params?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const resolutionRaw = num("resolution", 48);
  const resolution = Math.min(128, Math.max(8, Math.floor(resolutionRaw)));
  return {
    uMin: num("uMin", -2),
    uMax: num("uMax", 2),
    vMin: num("vMin", -2),
    vMax: num("vMax", 2),
    resolution,
  };
}

export function parseMathBindings(
  bindings?: Record<string, Record<string, unknown>>,
): Record<string, MathBindingDef> {
  if (!bindings) return {};
  const out: Record<string, MathBindingDef> = {};
  for (const [key, raw] of Object.entries(bindings)) {
    if (!raw || typeof raw !== "object") continue;
    const min = typeof raw.min === "number" && Number.isFinite(raw.min) ? raw.min : 0;
    const max = typeof raw.max === "number" && Number.isFinite(raw.max) ? raw.max : 1;
    const step =
      typeof raw.step === "number" && Number.isFinite(raw.step) && raw.step > 0 ? raw.step : 0.01;
    const def =
      typeof raw.default === "number" && Number.isFinite(raw.default)
        ? raw.default
        : typeof raw.default === "undefined"
          ? (min + max) / 2
          : min;
    const clampedDefault = Math.min(max, Math.max(min, def));
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : key;
    out[key] = { min, max, step, default: clampedDefault, label };
  }
  return out;
}

export function initialBindingValues(
  bindings: Record<string, MathBindingDef>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, b] of Object.entries(bindings)) {
    out[k] = b.default;
  }
  return out;
}

export function resolveSurfaceExpression(spec: InteractionSpec): string {
  const model = spec.model;
  if (model && typeof model === "object" && typeof model.z === "string" && model.z.trim()) {
    return model.z.trim();
  }
  return "Math.sin(u) * Math.cos(v)";
}

export function resolveFieldExpressions(spec: InteractionSpec): {
  fx: string;
  fy: string;
  fz: string;
} {
  const model = spec.model;
  if (model && typeof model === "object") {
    const fx = typeof model.fx === "string" && model.fx.trim() ? model.fx.trim() : "-v";
    const fy = typeof model.fy === "string" && model.fy.trim() ? model.fy.trim() : "u";
    const fz = typeof model.fz === "string" && model.fz.trim() ? model.fz.trim() : "0";
    return { fx, fy, fz };
  }
  return { fx: "-v", fy: "u", fz: "0" };
}

/** Whitelist identifiers + safe chars before sandboxed eval. */
export function isMathExpressionAllowed(expr: string, extraVars: string[] = []): boolean {
  const trimmed = expr.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (FORBIDDEN_EXPR.test(trimmed)) return false;

  const allowed = new Set([...ALLOWED_MATH_IDENTIFIERS, ...extraVars]);
  const tokens = trimmed.match(/[A-Za-z_][A-Za-z0-9_]*|\d+\.\d+|\d+|[^\s\w.]/g);
  if (!tokens) return false;

  for (const token of tokens) {
    if (/^\d/.test(token) || token === "." ) continue;
    if (/^[+\-*/(),]$/.test(token)) continue;
    if (token === "Math") continue;
    if (/^Math\.(sin|cos|tan|exp|sqrt|abs|pow|min|max|PI|E)$/.test(token)) continue;
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token) && allowed.has(token)) continue;
    return false;
  }
  return true;
}

export function evaluateMathExpression(
  expr: string,
  variables: Record<string, number>,
): number {
  const varNames = Object.keys(variables);
  if (!isMathExpressionAllowed(expr, varNames)) {
    throw new Error("expression not allowed");
  }
  const varValues = varNames.map((k) => variables[k]!);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...varNames, "Math", `"use strict"; return (${expr});`);
  const result = fn(...varValues, Math) as unknown;
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("expression did not return a finite number");
  }
  return result;
}

function heightToColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  // simple blue → cyan → green (fixed categorical-style ramp, not theme brand)
  const r = 0.15 + 0.55 * x;
  const g = 0.35 + 0.45 * (1 - Math.abs(x - 0.5) * 2);
  const b = 0.85 - 0.55 * x;
  return [r, g, b];
}

export function buildSurfaceMesh(
  grid: MathGridParams,
  zExpr: string,
  bindingValues: Record<string, number>,
): SurfaceMeshData {
  const { uMin, uMax, vMin, vMax, resolution } = grid;
  const n = resolution;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const heights: number[] = [];
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let j = 0; j < n; j++) {
    const v = vMin + ((vMax - vMin) * j) / (n - 1);
    for (let i = 0; i < n; i++) {
      const u = uMin + ((uMax - uMin) * i) / (n - 1);
      const vars = { u, v, ...bindingValues };
      const z = evaluateMathExpression(zExpr, vars);
      heights.push(z);
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
      const idx = (j * n + i) * 3;
      positions[idx] = u;
      positions[idx + 1] = z;
      positions[idx + 2] = v;
    }
  }

  const zSpan = zMax - zMin || 1;
  for (let k = 0; k < heights.length; k++) {
    const [r, g, b] = heightToColor((heights[k]! - zMin) / zSpan);
    colors[k * 3] = r;
    colors[k * 3 + 1] = g;
    colors[k * 3 + 2] = b;
  }

  const indices: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    positions,
    colors,
    indices: new Uint32Array(indices),
  };
}

export function buildFieldArrows(
  grid: MathGridParams,
  fxExpr: string,
  fyExpr: string,
  fzExpr: string,
  bindingValues: Record<string, number>,
  samples = 12,
): FieldArrow[] {
  const { uMin, uMax, vMin, vMax } = grid;
  const n = Math.min(samples, grid.resolution);
  const arrows: FieldArrow[] = [];
  let maxMag = 0;

  const raw: FieldArrow[] = [];
  for (let j = 0; j < n; j++) {
    const v = vMin + ((vMax - vMin) * j) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const u = uMin + ((uMax - uMin) * i) / Math.max(1, n - 1);
      const vars = { u, v, ...bindingValues };
      const dx = evaluateMathExpression(fxExpr, vars);
      const dy = evaluateMathExpression(fyExpr, vars);
      const dz = evaluateMathExpression(fzExpr, vars);
      const mag = Math.hypot(dx, dy, dz);
      maxMag = Math.max(maxMag, mag);
      raw.push({
        origin: [u, 0, v],
        direction: [dx, dy, dz],
      });
    }
  }

  const scale = maxMag > 0 ? 0.35 / maxMag : 1;
  for (const a of raw) {
    arrows.push({
      origin: a.origin,
      direction: [a.direction[0] * scale, a.direction[1] * scale, a.direction[2] * scale],
    });
  }
  return arrows;
}

export function buildMathScene(
  spec: InteractionSpec,
  bindingValues: Record<string, number>,
):
  | { ok: true; kind: "math.surface"; mesh: SurfaceMeshData }
  | { ok: true; kind: "math.field"; arrows: FieldArrow[] }
  | { ok: false; error: string } {
  if (!isInteractionMathKind(spec.kind)) {
    return { ok: false, error: `unsupported kind "${spec.kind}"` };
  }
  if (spec.compute === "bound") {
    return { ok: false, error: "bound math rendering is not available yet (P2 local only)" };
  }

  const grid = parseMathGridParams(spec.params);
  try {
    if (spec.kind === "math.surface") {
      const zExpr = resolveSurfaceExpression(spec);
      if (!isMathExpressionAllowed(zExpr, [...Object.keys(bindingValues), "u", "v"])) {
        return { ok: false, error: "surface expression not allowed" };
      }
      const mesh = buildSurfaceMesh(grid, zExpr, bindingValues);
      return { ok: true, kind: "math.surface", mesh };
    }
    const { fx, fy, fz } = resolveFieldExpressions(spec);
    for (const [label, expr] of [
      ["fx", fx],
      ["fy", fy],
      ["fz", fz],
    ] as const) {
      if (!isMathExpressionAllowed(expr, [...Object.keys(bindingValues), "u", "v"])) {
        return { ok: false, error: `${label} expression not allowed` };
      }
    }
    const arrows = buildFieldArrows(grid, fx, fy, fz, bindingValues);
    return { ok: true, kind: "math.field", arrows };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "math evaluation failed",
    };
  }
}
