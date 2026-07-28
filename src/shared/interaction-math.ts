/**
 * Shared bindings parsing + sandboxed expression evaluator.
 * Used by the Interaction compute layer (`$expr` / `$exprGrid` / `$exprSeries`)
 * and by `instrument` step recurrence.
 */

export type MathBindingDef = {
  min: number;
  max: number;
  step: number;
  default: number;
  label: string;
};

/**
 * Safe `Math.*` members — single source for allow-list + eval locals.
 * Add new functions here only.
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
  // Lowercase aliases — agents write `pi`/`e` more often than `PI`/`E`.
  pi: Math.PI,
  e: Math.E,
};

const BUILTIN_IDENTIFIERS = new Set(["Math", ...Object.keys(MATH_SAFE_MEMBERS)]);

const FORBIDDEN_EXPR =
  /\b(eval|Function|import|require|window|global|this|constructor|prototype|process|fetch|XMLHttpRequest)\b/i;

/** Operators / punctuation allowed in expressions (`^` = power, rewritten to `**` before eval). */
const ALLOWED_OPS = new Set(["+", "-", "*", "/", "^", "(", ")", ",", "**"]);

const TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*|\d+\.\d+|\d+|\*\*|[^\s\w.]/g;

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

/**
 * Why an expression would be rejected, or `null` if it is allowed.
 * Messages are actionable (unknown name → declare in bindings/params) —
 * not opaque "not allowed".
 */
export function diagnoseMathExpression(expr: string, extraVars: string[] = []): string | null {
  const trimmed = expr.trim();
  if (!trimmed) return "expression is empty";
  if (trimmed.length > 500) return "expression too long (max 500 chars)";
  if (FORBIDDEN_EXPR.test(trimmed)) {
    return `expression contains a forbidden identifier (eval/Function/import/…): ${trimmed}`;
  }

  const allowed = new Set([...BUILTIN_IDENTIFIERS, ...extraVars]);
  const tokens = trimmed.match(TOKEN_RE);
  if (!tokens) return `expression has no recognizable tokens: ${trimmed}`;

  const unknownIds: string[] = [];
  const badOps: string[] = [];

  for (const token of tokens) {
    if (/^\d/.test(token) || token === ".") continue;
    if (ALLOWED_OPS.has(token)) continue;
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token)) {
      if (!allowed.has(token)) unknownIds.push(token);
      continue;
    }
    badOps.push(token);
  }

  if (unknownIds.length > 0) {
    const uniq = [...new Set(unknownIds)];
    return (
      `unknown identifier(s) ${uniq.map((n) => JSON.stringify(n)).join(", ")} — ` +
      `declare as a number in model.params, or as a live slider in spec.bindings ` +
      `(min/max/step/default). expression: ${trimmed}`
    );
  }
  if (badOps.length > 0) {
    const uniq = [...new Set(badOps)];
    return (
      `unsupported token(s) ${uniq.map((t) => JSON.stringify(t)).join(", ")} — ` +
      `allowed ops: + - * / ^ ** ( ) , . expression: ${trimmed}`
    );
  }
  return null;
}

/** Whitelist identifiers + safe chars before sandboxed eval. */
export function isMathExpressionAllowed(expr: string, extraVars: string[] = []): boolean {
  return diagnoseMathExpression(expr, extraVars) === null;
}

/** `^` is power in this dialect (not JS bitwise XOR) — rewrite before `new Function`. */
function rewritePowerOps(expr: string): string {
  return expr.replace(/\^/g, "**");
}

export function evaluateMathExpression(
  expr: string,
  variables: Record<string, number>,
): number {
  const varNames = Object.keys(variables);
  const diagnosis = diagnoseMathExpression(expr, varNames);
  if (diagnosis) {
    throw new Error(diagnosis);
  }
  const jsExpr = rewritePowerOps(expr.trim());
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
    `"use strict"; return (${jsExpr});`,
  );
  const result = fn(...localValues, ...varValues, Math) as unknown;
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("expression did not return a finite number");
  }
  return result;
}
