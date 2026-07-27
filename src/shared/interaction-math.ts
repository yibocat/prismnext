/**
 * Shared bindings parsing + sandboxed expression evaluator, originally built
 * for math.surface/math.field (retired in V4-A — see
 * docs-private/superpowers/plans/2026-07-27-interaction-plotly-v4a.md) and
 * now reused by `instrument` (interaction-instrument.ts) for its `$expr`/
 * `$exprGrid` markers and continuous-parameter sliders.
 */

export type MathBindingDef = {
  min: number;
  max: number;
  step: number;
  default: number;
  label: string;
};

/**
 * Single source of truth for safe `Math.*` members — used to (1) allow-list
 * identifiers in `isMathExpressionAllowed` and (2) bind bare names (`cos`,
 * not just `Math.cos`) as locals in `evaluateMathExpression`. These used to
 * be separate lists that drifted: bare `cos`/`sin` were allow-listed but
 * never bound at eval time, so any formula not `Math.`-prefixed — e.g. a
 * natural sphere/torus/geodesic parametrization like `cos(u)*sin(v)` —
 * crashed with `ReferenceError: cos is not defined`. Add new functions here
 * only — nowhere else needs to change.
 */
const MATH_SAFE_MEMBERS: Record<string, unknown> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  hypot: Math.hypot,
  abs: Math.abs,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  PI: Math.PI,
  E: Math.E,
};

const ALLOWED_MATH_IDENTIFIERS = new Set(["Math", "u", "v", ...Object.keys(MATH_SAFE_MEMBERS)]);

const FORBIDDEN_EXPR =
  /\b(eval|Function|import|require|window|global|this|constructor|prototype|process|fetch|XMLHttpRequest)\b/i;

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
  // A binding/param with the same name (e.g. a variable literally called
  // `E`) takes precedence — skip the math local so `varNames` supplies it.
  const localNames = Object.keys(MATH_SAFE_MEMBERS).filter((k) => !(k in variables));
  const varValues = varNames.map((k) => variables[k]!);
  const localValues = localNames.map((k) => MATH_SAFE_MEMBERS[k]);
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    ...localNames,
    ...varNames,
    "Math",
    `"use strict"; return (${expr});`,
  );
  const result = fn(...localValues, ...varValues, Math) as unknown;
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("expression did not return a finite number");
  }
  return result;
}
