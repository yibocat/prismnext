/**
 * Scene IR v1 — declarative 3D scenes (no arbitrary JS).
 * Lives in spec.model when kind is scene.ir.
 */

import type { InteractionSpec } from "./interaction-spec";
import {
  evaluateMathExpression,
  isMathExpressionAllowed,
  type SurfaceMeshData,
} from "./interaction-math";

export const SCENE_IR_RUNTIME_VERSION = 1;

export const INTERACTION_SCENE_IR_KIND = "scene.ir" as const;

export function isInteractionSceneIrKind(kind: string): boolean {
  return kind.trim() === INTERACTION_SCENE_IR_KIND;
}

export type SceneIrDomain = {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  resolution: number;
};

export type SceneIrParametricSurface = {
  type: "parametric";
  domain: SceneIrDomain;
  x: string;
  y: string;
  z: string;
};

export type SceneIrProbe = {
  uKey: string;
  vKey: string;
};

export type SceneIrMetric = {
  modeKey?: string;
  modes: string[];
  /** g11/g12/g22 when mode is conformal (uses binding lambda if present) */
  conformalLambdaKey?: string;
};

export type SceneIrLayers = {
  wireframe?: boolean;
  tangent?: boolean;
  axes?: boolean;
};

/**
 * Canvas framing — Spec-driven so the host does not silently rewrite math coords.
 * Defaults keep the mathematical origin (0,0,0) as world origin / orbit pivot.
 */
export type SceneIrView = {
  /** `origin` = mesh stays in math coords (default). `bbox` = shift so AABB center is at world 0. */
  frame?: "origin" | "bbox";
  /** OrbitControls look-at. Default `origin`. */
  orbitTarget?: "origin" | "probe";
  /** Initial camera eye [x,y,z]. Applied once per mount / when value changes. */
  camera?: [number, number, number];
  /** Length of AxesHelper when layers.axes. Default 1.6. */
  axesSize?: number;
};

export type SceneIrModel = {
  runtimeVersion: typeof SCENE_IR_RUNTIME_VERSION;
  surface: SceneIrParametricSurface;
  probe?: SceneIrProbe;
  metric?: SceneIrMetric;
  layers?: SceneIrLayers;
  view?: SceneIrView;
};

export const SCENE_IR_VIEW_DEFAULTS: Required<
  Pick<SceneIrView, "frame" | "orbitTarget" | "axesSize">
> & { camera: [number, number, number] } = {
  frame: "origin",
  orbitTarget: "origin",
  camera: [3.5, 2.8, 3.5],
  axesSize: 1.6,
};

export function resolveSceneIrView(view?: SceneIrView): {
  frame: "origin" | "bbox";
  orbitTarget: "origin" | "probe";
  camera: [number, number, number];
  axesSize: number;
} {
  const cam = view?.camera;
  const camera: [number, number, number] =
    Array.isArray(cam) &&
    cam.length === 3 &&
    cam.every((n) => typeof n === "number" && Number.isFinite(n))
      ? [cam[0]!, cam[1]!, cam[2]!]
      : [...SCENE_IR_VIEW_DEFAULTS.camera];
  const axesSize =
    typeof view?.axesSize === "number" && Number.isFinite(view.axesSize) && view.axesSize > 0
      ? view.axesSize
      : SCENE_IR_VIEW_DEFAULTS.axesSize;
  return {
    frame: view?.frame === "bbox" ? "bbox" : SCENE_IR_VIEW_DEFAULTS.frame,
    orbitTarget: view?.orbitTarget === "probe" ? "probe" : SCENE_IR_VIEW_DEFAULTS.orbitTarget,
    camera,
    axesSize,
  };
}

export type SceneIrMetricValues = {
  mode: string;
  E: number;
  F: number;
  G: number;
  u: number;
  v: number;
  position: [number, number, number];
};

export type SceneIrBuildResult =
  | {
      ok: true;
      mesh: SurfaceMeshData;
      metric: SceneIrMetricValues;
      tangent: {
        pu: [number, number, number];
        pv: [number, number, number];
        p: [number, number, number];
      };
      status: string;
    }
  | { ok: false; error: string };

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function parseSceneIrDomain(raw: unknown): SceneIrDomain | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const resolutionRaw = num(o.resolution, 48);
  const resolution = Math.min(128, Math.max(8, Math.floor(resolutionRaw)));
  return {
    uMin: num(o.uMin, -1.4),
    uMax: num(o.uMax, 1.4),
    vMin: num(o.vMin, -1.4),
    vMax: num(o.vMax, 1.4),
    resolution,
  };
}

export function parseSceneIrModel(raw: unknown): SceneIrModel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.runtimeVersion !== SCENE_IR_RUNTIME_VERSION) return null;

  const surfaceRaw = o.surface;
  if (!surfaceRaw || typeof surfaceRaw !== "object" || Array.isArray(surfaceRaw)) return null;
  const s = surfaceRaw as Record<string, unknown>;
  if (s.type !== "parametric") return null;
  const domain = parseSceneIrDomain(s.domain);
  const x = str(s.x);
  const y = str(s.y);
  const z = str(s.z);
  if (!domain || !x || !y || !z) return null;

  const model: SceneIrModel = {
    runtimeVersion: SCENE_IR_RUNTIME_VERSION,
    surface: { type: "parametric", domain, x, y, z },
  };

  if (o.probe && typeof o.probe === "object" && !Array.isArray(o.probe)) {
    const p = o.probe as Record<string, unknown>;
    model.probe = {
      uKey: str(p.uKey) ?? "sampleU",
      vKey: str(p.vKey) ?? "sampleV",
    };
  }

  if (o.metric && typeof o.metric === "object" && !Array.isArray(o.metric)) {
    const m = o.metric as Record<string, unknown>;
    const modes = Array.isArray(m.modes)
      ? m.modes.filter((x): x is string => typeof x === "string" && x.trim()).map((x) => x.trim())
      : ["induced"];
    model.metric = {
      modeKey: str(m.modeKey) ?? undefined,
      modes: modes.length ? modes : ["induced"],
      conformalLambdaKey: str(m.conformalLambdaKey) ?? "lambda",
    };
  }

  if (o.layers && typeof o.layers === "object" && !Array.isArray(o.layers)) {
    const l = o.layers as Record<string, unknown>;
    model.layers = {
      wireframe: l.wireframe === true,
      tangent: l.tangent !== false,
      axes: l.axes === true,
    };
  } else {
    model.layers = { wireframe: true, tangent: true, axes: true };
  }

  if (o.view && typeof o.view === "object" && !Array.isArray(o.view)) {
    const v = o.view as Record<string, unknown>;
    const view: SceneIrView = {};
    if (v.frame === "origin" || v.frame === "bbox") view.frame = v.frame;
    if (v.orbitTarget === "origin" || v.orbitTarget === "probe") view.orbitTarget = v.orbitTarget;
    if (
      Array.isArray(v.camera) &&
      v.camera.length === 3 &&
      v.camera.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      view.camera = [v.camera[0] as number, v.camera[1] as number, v.camera[2] as number];
    }
    if (typeof v.axesSize === "number" && Number.isFinite(v.axesSize) && v.axesSize > 0) {
      view.axesSize = v.axesSize;
    }
    if (Object.keys(view).length > 0) model.view = view;
  }

  return model;
}

export function validateSceneIrSpec(spec: InteractionSpec): { ok: true; model: SceneIrModel } | { ok: false; error: string } {
  if (!isInteractionSceneIrKind(spec.kind)) {
    return { ok: false, error: `expected kind ${INTERACTION_SCENE_IR_KIND}` };
  }
  if (spec.compute === "bound") {
    return { ok: false, error: "scene.ir does not support bound compute yet" };
  }
  const model = parseSceneIrModel(spec.model);
  if (!model) {
    return {
      ok: false,
      error:
        "invalid scene.ir model — require model.runtimeVersion=1, surface.type=parametric, domain, x/y/z expressions",
    };
  }
  const vars = ["u", "v", ...Object.keys(spec.bindings ?? {})];
  for (const expr of [model.surface.x, model.surface.y, model.surface.z]) {
    if (!isMathExpressionAllowed(expr, vars)) {
      return { ok: false, error: `surface expression not allowed: ${expr}` };
    }
  }
  return { ok: true, model };
}

export function evalParametricPoint(
  xExpr: string,
  yExpr: string,
  zExpr: string,
  u: number,
  v: number,
  bindings: Record<string, number>,
): [number, number, number] {
  const vars = { u, v, ...bindings };
  return [
    evaluateMathExpression(xExpr, vars),
    evaluateMathExpression(yExpr, vars),
    evaluateMathExpression(zExpr, vars),
  ];
}

export function buildParametricSurfaceMesh(
  surface: SceneIrParametricSurface,
  bindings: Record<string, number>,
): SurfaceMeshData {
  const { uMin, uMax, vMin, vMax, resolution } = surface.domain;
  const n = resolution;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const heights: number[] = [];
  let yMin = Infinity;
  let yMax = -Infinity;

  for (let j = 0; j < n; j++) {
    const v = vMin + ((vMax - vMin) * j) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const u = uMin + ((uMax - uMin) * i) / Math.max(1, n - 1);
      const [x, y, z] = evalParametricPoint(surface.x, surface.y, surface.z, u, v, bindings);
      heights.push(y);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      const idx = (j * n + i) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }
  }

  const span = yMax - yMin || 1;
  for (let k = 0; k < heights.length; k++) {
    const t = (heights[k]! - yMin) / span;
    const r = 0.35 + 0.45 * t;
    const g = 0.55 + 0.25 * (1 - Math.abs(t - 0.5) * 2);
    const b = 0.95 - 0.35 * t;
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

  return { positions, colors, indices: new Uint32Array(indices) };
}

export function computeInducedMetric(
  surface: SceneIrParametricSurface,
  u: number,
  v: number,
  bindings: Record<string, number>,
  h = 1e-4,
): { E: number; F: number; G: number; pu: [number, number, number]; pv: [number, number, number]; p: [number, number, number] } {
  const p = evalParametricPoint(surface.x, surface.y, surface.z, u, v, bindings);
  const pu = evalParametricPoint(surface.x, surface.y, surface.z, u + h, v, bindings);
  const pv = evalParametricPoint(surface.x, surface.y, surface.z, u, v + h, bindings);
  const du: [number, number, number] = [
    (pu[0] - p[0]) / h,
    (pu[1] - p[1]) / h,
    (pu[2] - p[2]) / h,
  ];
  const dv: [number, number, number] = [
    (pv[0] - p[0]) / h,
    (pv[1] - p[1]) / h,
    (pv[2] - p[2]) / h,
  ];
  const E = du[0] * du[0] + du[1] * du[1] + du[2] * du[2];
  const F = du[0] * dv[0] + du[1] * dv[1] + du[2] * dv[2];
  const G = dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2];
  return { E, F, G, pu: du, pv: dv, p };
}

export function resolveMetricMode(
  metric: SceneIrMetric | undefined,
  bindings: Record<string, number>,
): { mode: string; index: number } {
  const modes = metric?.modes?.length ? metric.modes : ["induced"];
  if (!metric?.modeKey) return { mode: modes[0]!, index: 0 };
  const idx = Math.floor(bindings[metric.modeKey] ?? 0);
  const clamped = Math.min(modes.length - 1, Math.max(0, idx));
  return { mode: modes[clamped]!, index: clamped };
}

export function computeSceneIrMetric(
  model: SceneIrModel,
  u: number,
  v: number,
  bindings: Record<string, number>,
): SceneIrMetricValues {
  const { mode } = resolveMetricMode(model.metric, bindings);
  const induced = computeInducedMetric(model.surface, u, v, bindings);

  if (mode === "conformal") {
    const lambdaKey = model.metric?.conformalLambdaKey ?? "lambda";
    const lam = bindings[lambdaKey] ?? 1;
    const s = lam * lam;
    return {
      mode,
      E: s,
      F: 0,
      G: s,
      u,
      v,
      position: induced.p,
    };
  }

  if (mode === "spherical") {
    // Flattened spherical chart on the surface patch — host uses induced as fallback for display
    return {
      mode,
      E: induced.E,
      F: induced.F,
      G: induced.G,
      u,
      v,
      position: induced.p,
    };
  }

  return {
    mode: mode === "induced" ? "induced" : mode,
    E: induced.E,
    F: induced.F,
    G: induced.G,
    u,
    v,
    position: induced.p,
  };
}

export function formatSceneIrStatus(
  model: SceneIrModel,
  metric: SceneIrMetricValues,
  bindings: Record<string, number>,
): string {
  const det = metric.E * metric.G - metric.F * metric.F;
  const lines = [
    `metric: ${metric.mode}  u=${metric.u.toFixed(3)}  v=${metric.v.toFixed(3)}`,
    `g = [[${metric.E.toFixed(4)}, ${metric.F.toFixed(4)}], [${metric.F.toFixed(4)}, ${metric.G.toFixed(4)}]]`,
    `det(g)=${det.toFixed(4)}  sqrt(det)=${Math.sqrt(Math.max(0, det)).toFixed(4)}`,
    `p=(${metric.position.map((c) => c.toFixed(3)).join(", ")})`,
  ];
  if (bindings.R != null) lines.push(`R=${bindings.R.toFixed(3)}`);
  if (bindings.lambda != null) lines.push(`λ=${bindings.lambda.toFixed(3)}`);
  void model;
  return lines.join("\n");
}

export function buildSceneIr(
  spec: InteractionSpec,
  bindings: Record<string, number>,
): SceneIrBuildResult {
  const validated = validateSceneIrSpec(spec);
  if (!validated.ok) return validated;
  const model = validated.model;
  const probe = model.probe ?? { uKey: "sampleU", vKey: "sampleV" };
  const u = bindings[probe.uKey] ?? 0;
  const v = bindings[probe.vKey] ?? 0;

  try {
    const mesh = buildParametricSurfaceMesh(model.surface, bindings);
    const metric = computeSceneIrMetric(model, u, v, bindings);
    const induced = computeInducedMetric(model.surface, u, v, bindings);
    const status = formatSceneIrStatus(model, metric, bindings);
    return {
      ok: true,
      mesh,
      metric,
      tangent: { pu: induced.pu, pv: induced.pv, p: induced.p },
      status,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "scene.ir build failed",
    };
  }
}

/** Minimal legal scene.ir model sample (paraboloid). */
export const SCENE_IR_SAMPLE_MODEL: SceneIrModel = {
  runtimeVersion: SCENE_IR_RUNTIME_VERSION,
  surface: {
    type: "parametric",
    domain: { uMin: -1.4, uMax: 1.4, vMin: -1.4, vMax: 1.4, resolution: 64 },
    x: "u",
    y: "(u*u + v*v) / R",
    z: "v",
  },
  probe: { uKey: "sampleU", vKey: "sampleV" },
  metric: { modeKey: "metricType", modes: ["induced", "conformal", "spherical"] },
  layers: { wireframe: true, tangent: true, axes: true },
  view: { frame: "origin", orbitTarget: "origin" },
};
