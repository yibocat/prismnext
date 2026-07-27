/**
 * instrument — Agent authors a real Plotly figure template (data/layout JSON),
 * with a handful of evaluation markers ($grid/$exprGrid/$expr/$state/$stateTrail)
 * that Prism resolves via the existing math sandbox before handing the result to
 * `Plotly.react`. Not a new trace vocabulary — the template *is* Plotly JSON.
 *
 * See docs-private/superpowers/specs/2026-07-27-interaction-plotly-runtime-design.md
 * §9 (D22–D24) for the full design rationale.
 */

import { evaluateMathExpression, isMathExpressionAllowed } from "./interaction-math";
import { validatePlotlyFigure, type PlotlyFigure } from "./interaction-plotly";
import type { InteractionSpec } from "./interaction-spec";
import { parseMathBindings, initialBindingValues } from "./interaction-math";

export const INTERACTION_INSTRUMENT_KIND = "instrument" as const;

/** Hard ceiling on `model.step.max` — rejected outright at validation, never silently clamped. */
export const INSTRUMENT_STEP_HARD_CEILING = 2000;

export function isInteractionInstrumentKind(kind: string): boolean {
  return kind.trim() === INTERACTION_INSTRUMENT_KIND;
}

export type InstrumentDomain = {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  resolution: number;
};

export type InstrumentStepModel = {
  /** state var name -> initial-value expression (sees bindings only). */
  init: Record<string, string>;
  /** state var name -> recurrence expression (sees bindings + prior state + loop index `step`). */
  next: Record<string, string>;
  max: number;
};

export type InstrumentModel = {
  runtimeVersion: 1;
  domain?: InstrumentDomain;
  step?: InstrumentStepModel;
  figureTemplate: Record<string, unknown>;
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function parseInstrumentDomain(raw: unknown): InstrumentDomain | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const resolutionRaw = num(o.resolution, 48);
  const resolution = Math.min(128, Math.max(4, Math.floor(resolutionRaw)));
  return {
    uMin: num(o.uMin, -2),
    uMax: num(o.uMax, 2),
    vMin: num(o.vMin, -2),
    vMax: num(o.vMax, 2),
    resolution,
  };
}

function parseExprMap(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v !== "string" || !v.trim()) return null;
    out[k] = v.trim();
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

function parseInstrumentStep(raw: unknown): InstrumentStepModel | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const init = parseExprMap(o.init);
  const next = parseExprMap(o.next);
  if (!init || !next) return null;
  const max = typeof o.max === "number" && Number.isFinite(o.max) ? Math.floor(o.max) : null;
  if (max === null || max < 0) return null;
  return { init, next, max };
}

export function parseInstrumentModel(raw: unknown): InstrumentModel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.runtimeVersion !== 1) return null;
  if (!o.figureTemplate || typeof o.figureTemplate !== "object" || Array.isArray(o.figureTemplate)) {
    return null;
  }

  const domain = parseInstrumentDomain(o.domain);
  if (domain === null) return null;
  const step = parseInstrumentStep(o.step);
  if (step === null) return null;

  const model: InstrumentModel = {
    runtimeVersion: 1,
    figureTemplate: o.figureTemplate as Record<string, unknown>,
  };
  if (domain !== undefined) model.domain = domain;
  if (step !== undefined) model.step = step;
  return model;
}

/**
 * Replay `init` then `next` exactly `uptoStep` times (clamped to `step.max` and
 * a hard safety ceiling). Pure — always recomputes from 0, never caches across
 * calls, so any step is independently reproducible (D20).
 */
export function computeStepStates(
  step: InstrumentStepModel,
  bindingValues: Record<string, number>,
  uptoStep: number,
): Record<string, number>[] {
  const cap = Math.max(0, Math.min(uptoStep, step.max, INSTRUMENT_STEP_HARD_CEILING));
  const stateNames = Object.keys(step.init);

  let state: Record<string, number> = {};
  for (const name of stateNames) {
    state[name] = evaluateMathExpression(step.init[name]!, bindingValues);
  }
  const trail: Record<string, number>[] = [{ ...state }];

  for (let i = 1; i <= cap; i++) {
    const vars = { ...bindingValues, ...state, step: i };
    const nextState: Record<string, number> = {};
    for (const name of stateNames) {
      const expr = step.next[name];
      nextState[name] = expr ? evaluateMathExpression(expr, vars) : state[name]!;
    }
    state = nextState;
    trail.push({ ...state });
  }
  return trail;
}

function buildDomainGrids(domain: InstrumentDomain): { u: number[]; v: number[] } {
  const { uMin, uMax, vMin, vMax, resolution } = domain;
  const n = Math.max(1, resolution);
  const axis = (min: number, max: number) =>
    Array.from({ length: n }, (_, i) => min + ((max - min) * i) / Math.max(1, n - 1));
  return { u: axis(uMin, uMax), v: axis(vMin, vMax) };
}

function isMarkerCandidate(node: unknown): node is Record<string, unknown> {
  return Boolean(node) && typeof node === "object" && !Array.isArray(node);
}

const MARKER_KEYS = ["$grid", "$exprGrid", "$expr", "$state", "$stateTrail"] as const;

export type InstrumentFigureResult =
  | { ok: true; figure: PlotlyFigure }
  | { ok: false; error: string };

/**
 * Resolve every marker in `model.figureTemplate` against the current bindings
 * and step, then validate the result as a Plotly figure. Does not mutate the
 * input template (Agent-authored JSON must stay reusable across re-renders).
 */
export function resolveInstrumentFigure(
  model: InstrumentModel,
  bindingValues: Record<string, number>,
  currentStep: number,
): InstrumentFigureResult {
  let trail: Record<string, number>[] = [];
  let stateContext: Record<string, number> = {};
  if (model.step) {
    const clampedStep = Math.max(0, Math.min(currentStep, model.step.max));
    trail = computeStepStates(model.step, bindingValues, clampedStep);
    stateContext = trail[trail.length - 1] ?? {};
  }
  const varContext: Record<string, number> = { ...bindingValues, ...stateContext };
  const domainGrids = model.domain ? buildDomainGrids(model.domain) : null;

  function resolveNode(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(resolveNode);
    if (isMarkerCandidate(node)) {
      const keys = Object.keys(node);
      const markerKeys = keys.filter((k) => (MARKER_KEYS as readonly string[]).includes(k));
      if (markerKeys.length > 1) {
        throw new Error(`ambiguous marker object with keys: ${markerKeys.join(", ")}`);
      }
      if (markerKeys.length === 1) {
        const mk = markerKeys[0] as (typeof MARKER_KEYS)[number];
        const raw = node[mk];
        if (mk === "$grid") {
          if (!domainGrids) throw new Error("$grid requires model.domain");
          if (raw === "u") return [...domainGrids.u];
          if (raw === "v") return [...domainGrids.v];
          throw new Error(`$grid must be "u" or "v", got ${JSON.stringify(raw)}`);
        }
        if (mk === "$exprGrid") {
          if (!domainGrids) throw new Error("$exprGrid requires model.domain");
          if (typeof raw !== "string") throw new Error("$exprGrid value must be a string expression");
          const vars = [...Object.keys(varContext), "u", "v"];
          if (!isMathExpressionAllowed(raw, vars)) throw new Error(`expression not allowed: ${raw}`);
          return domainGrids.v.map((v) =>
            domainGrids.u.map((u) => evaluateMathExpression(raw, { ...varContext, u, v })),
          );
        }
        if (mk === "$expr") {
          if (typeof raw !== "string") throw new Error("$expr value must be a string expression");
          const vars = Object.keys(varContext);
          if (!isMathExpressionAllowed(raw, vars)) throw new Error(`expression not allowed: ${raw}`);
          return evaluateMathExpression(raw, varContext);
        }
        if (mk === "$state") {
          if (!model.step) throw new Error("$state requires model.step");
          if (typeof raw !== "string" || !(raw in stateContext)) {
            throw new Error(`unknown state variable: ${JSON.stringify(raw)}`);
          }
          return stateContext[raw];
        }
        // $stateTrail
        if (!model.step) throw new Error("$stateTrail requires model.step");
        if (typeof raw !== "string") throw new Error("$stateTrail value must be a string");
        return trail.map((s) => {
          if (!(raw in s)) throw new Error(`unknown state variable: ${JSON.stringify(raw)}`);
          return s[raw];
        });
      }
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = resolveNode(node[k]);
      return out;
    }
    return node;
  }

  try {
    const resolved = resolveNode(model.figureTemplate);
    const validated = validatePlotlyFigure(resolved);
    if (!validated.ok) return { ok: false, error: validated.error };
    return { ok: true, figure: validated.figure };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "instrument resolution failed" };
  }
}

export function validateInstrumentSpec(
  spec: InteractionSpec,
): { ok: true; model: InstrumentModel } | { ok: false; error: string } {
  if (!isInteractionInstrumentKind(spec.kind)) {
    return { ok: false, error: `expected kind ${INTERACTION_INSTRUMENT_KIND}` };
  }
  if (spec.compute === "bound") {
    return { ok: false, error: "instrument does not support bound compute yet (local only)" };
  }
  const model = parseInstrumentModel(spec.model);
  if (!model) {
    return {
      ok: false,
      error: "invalid instrument model — require model.runtimeVersion=1 and model.figureTemplate",
    };
  }
  if (model.step && model.step.max > INSTRUMENT_STEP_HARD_CEILING) {
    return {
      ok: false,
      error: `model.step.max too large (max ${INSTRUMENT_STEP_HARD_CEILING})`,
    };
  }
  const initialBindings = initialBindingValues(parseMathBindings(spec.bindings));
  const preview = resolveInstrumentFigure(model, initialBindings, 0);
  if (!preview.ok) return { ok: false, error: preview.error };
  return { ok: true, model };
}

/** Minimal legal instrument model (saddle-like surface with a live `R` binding). */
export const INSTRUMENT_SAMPLE_MODEL: InstrumentModel = {
  runtimeVersion: 1,
  domain: { uMin: -2, uMax: 2, vMin: -2, vMax: 2, resolution: 48 },
  figureTemplate: {
    data: [
      {
        type: "surface",
        x: { $grid: "u" },
        y: { $grid: "v" },
        z: { $exprGrid: "sin(u) * cos(v) * R" },
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
  },
};
