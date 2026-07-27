import { describe, expect, it } from "vitest";
import {
  buildSceneIr,
  parseSceneIrModel,
  resolveSceneIrView,
  SCENE_IR_SAMPLE_MODEL,
  validateSceneIrSpec,
} from "../../src/shared/interaction-scene-ir";
import type { InteractionSpec } from "../../src/shared/interaction-spec";

function paraboloidSpec(overrides: Partial<InteractionSpec> = {}): InteractionSpec {
  return {
    id: "demo.paraboloid",
    title: "Paraboloid metric",
    kind: "scene.ir",
    compute: "local",
    revision: 1,
    params: { R: 2, sampleU: 0.5, sampleV: 0.5, metricType: 0, lambda: 1.5 },
    bindings: {
      R: { min: 0.5, max: 5, step: 0.1, default: 2, label: "R" },
      sampleU: { min: -1.4, max: 1.4, step: 0.05, default: 0.5, label: "u" },
      sampleV: { min: -1.4, max: 1.4, step: 0.05, default: 0.5, label: "v" },
      metricType: { min: 0, max: 2, step: 1, default: 0, label: "metric" },
      lambda: { min: 0.1, max: 5, step: 0.1, default: 1.5, label: "lambda" },
    },
    model: SCENE_IR_SAMPLE_MODEL,
    ...overrides,
  };
}

describe("scene.ir schema", () => {
  it("parses and validates sample paraboloid model", () => {
    const model = parseSceneIrModel(SCENE_IR_SAMPLE_MODEL);
    expect(model?.surface.x).toBe("u");
    const v = validateSceneIrSpec(paraboloidSpec());
    expect(v.ok).toBe(true);
  });

  it("rejects missing runtimeVersion", () => {
    const v = validateSceneIrSpec(
      paraboloidSpec({ model: { surface: SCENE_IR_SAMPLE_MODEL.surface } as never }),
    );
    expect(v.ok).toBe(false);
  });

  it("builds mesh and induced metric", () => {
    const built = buildSceneIr(paraboloidSpec(), {
      R: 2,
      sampleU: 0.5,
      sampleV: 0.5,
      metricType: 0,
      lambda: 1.5,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.mesh.positions.length).toBeGreaterThan(0);
    expect(built.metric.mode).toBe("induced");
    expect(built.metric.E).toBeGreaterThan(0);
    expect(built.status).toMatch(/det\(g\)/);
  });

  it("supports conformal metric mode via binding", () => {
    const built = buildSceneIr(paraboloidSpec(), {
      R: 2,
      sampleU: 0,
      sampleV: 0,
      metricType: 1,
      lambda: 2,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.metric.mode).toBe("conformal");
    expect(built.metric.E).toBe(4);
    expect(built.metric.G).toBe(4);
  });

  it("defaults view framing to mathematical origin (not bbox)", () => {
    const model = parseSceneIrModel(SCENE_IR_SAMPLE_MODEL);
    expect(model?.view?.frame).toBe("origin");
    expect(resolveSceneIrView(undefined).frame).toBe("origin");
    expect(resolveSceneIrView(undefined).orbitTarget).toBe("origin");
    expect(resolveSceneIrView({ frame: "bbox", orbitTarget: "probe" })).toEqual({
      frame: "bbox",
      orbitTarget: "probe",
      camera: [3.5, 2.8, 3.5],
      axesSize: 1.6,
    });
  });

  it("parses model.view camera and axesSize", () => {
    const model = parseSceneIrModel({
      ...SCENE_IR_SAMPLE_MODEL,
      view: { frame: "bbox", orbitTarget: "probe", camera: [1, 2, 3], axesSize: 2.5 },
    });
    expect(model?.view).toEqual({
      frame: "bbox",
      orbitTarget: "probe",
      camera: [1, 2, 3],
      axesSize: 2.5,
    });
  });
});
