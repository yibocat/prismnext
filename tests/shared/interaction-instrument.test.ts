import { describe, expect, it } from "vitest";
import {
  INTERACTION_INSTRUMENT_KIND,
  INSTRUMENT_SAMPLE_MODEL,
  isInteractionInstrumentKind,
  parseInstrumentModel,
  computeStepStates,
  resolveInstrumentFigure,
  validateInstrumentSpec,
  type InstrumentModel,
} from "../../src/shared/interaction-instrument";
import { validatePlotlyFigure } from "../../src/shared/interaction-plotly";
import type { InteractionSpec } from "../../src/shared/interaction-spec";

function baseSpec(overrides: Partial<InteractionSpec> = {}): InteractionSpec {
  return {
    id: "demo.instrument",
    title: "Demo instrument",
    kind: INTERACTION_INSTRUMENT_KIND,
    compute: "local",
    revision: 1,
    ...overrides,
  };
}

describe("validateInstrumentSpec rejects hand-typed literal grid arrays", () => {
  it("rejects a literal surface z array even with model.domain present", () => {
    const spec = baseSpec({
      model: {
        runtimeVersion: 1,
        domain: { uMin: -2, uMax: 2, vMin: -2, vMax: 2, resolution: 8 },
        figureTemplate: {
          data: [
            {
              type: "surface",
              x: { $grid: "u" },
              y: { $grid: "v" },
              z: [
                [1, 0, 1],
                [0, -1, 0],
                [1, 0, 1],
              ],
            },
          ],
        },
      } as unknown as Record<string, unknown>,
    });
    const result = validateInstrumentSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/literal array/);
  });

  it("accepts an all-markers surface (no literal coordinate arrays)", () => {
    const result = validateInstrumentSpec(
      baseSpec({
        model: INSTRUMENT_SAMPLE_MODEL as unknown as Record<string, unknown>,
        bindings: { R: { min: 0.2, max: 3, default: 1, label: "R" } },
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("isInteractionInstrumentKind", () => {
  it("matches only 'instrument' (trimmed)", () => {
    expect(isInteractionInstrumentKind("instrument")).toBe(true);
    expect(isInteractionInstrumentKind(" instrument ")).toBe(true);
    expect(isInteractionInstrumentKind("instrument.x")).toBe(false);
    expect(isInteractionInstrumentKind("figure.plotly")).toBe(false);
  });
});

describe("parseInstrumentModel", () => {
  it("rejects missing runtimeVersion or figureTemplate", () => {
    expect(parseInstrumentModel(null)).toBeNull();
    expect(parseInstrumentModel({})).toBeNull();
    expect(parseInstrumentModel({ runtimeVersion: 1 })).toBeNull();
    expect(parseInstrumentModel({ figureTemplate: { data: [] } })).toBeNull();
  });

  it("accepts a minimal model with no domain/step", () => {
    const model = parseInstrumentModel({
      runtimeVersion: 1,
      figureTemplate: { data: [{ type: "scatter", x: [1], y: [1] }] },
    });
    expect(model).toBeTruthy();
    expect(model?.domain).toBeUndefined();
    expect(model?.step).toBeUndefined();
  });

  it("rejects a present-but-malformed domain", () => {
    expect(
      parseInstrumentModel({
        runtimeVersion: 1,
        figureTemplate: { data: [] },
        domain: "not-an-object",
      }),
    ).toBeNull();
  });
});

describe("$grid / $exprGrid resolution", () => {
  const domain = { uMin: 0, uMax: 1, vMin: 0, vMax: 1, resolution: 3 };

  it("resolves $grid u to the sampled coordinate array", () => {
    const model: InstrumentModel = {
      runtimeVersion: 1,
      domain,
      figureTemplate: { data: [{ type: "scatter3d", x: { $grid: "u" } }] },
    };
    const result = resolveInstrumentFigure(model, {}, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.figure.data[0]!.x).toEqual([0, 0.5, 1]);
    }
  });

  it("resolves $exprGrid into a 2D array (row=v, col=u)", () => {
    const model: InstrumentModel = {
      runtimeVersion: 1,
      domain: { uMin: 0, uMax: 1, vMin: 0, vMax: 1, resolution: 2 },
      figureTemplate: { data: [{ type: "surface", z: { $exprGrid: "u + v" } }] },
    };
    const result = resolveInstrumentFigure(model, {}, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const z = result.figure.data[0]!.z as number[][];
      expect(z[0]![0]).toBe(0); // u=0,v=0
      expect(z[0]![1]).toBe(1); // u=1,v=0
      expect(z[1]![0]).toBe(1); // u=0,v=1
      expect(z[1]![1]).toBe(2); // u=1,v=1
    }
  });
});

describe("$expr resolution (scalar, bindings only)", () => {
  it("resolves a scalar expression against bindings", () => {
    const model: InstrumentModel = {
      runtimeVersion: 1,
      figureTemplate: { data: [{ type: "scatter", x: [{ $expr: "R*2" }] }] },
    };
    const result = resolveInstrumentFigure(model, { R: 3 }, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.figure.data[0]!.x as unknown[])[0]).toBe(6);
    }
  });

  it("rejects $expr referencing u/v (no domain context for scalar markers)", () => {
    const model: InstrumentModel = {
      runtimeVersion: 1,
      domain: { uMin: 0, uMax: 1, vMin: 0, vMax: 1, resolution: 4 },
      figureTemplate: { data: [{ type: "scatter", x: [{ $expr: "u + 1" }] }] },
    };
    const result = resolveInstrumentFigure(model, {}, 0);
    expect(result.ok).toBe(false);
  });
});

describe("computeStepStates", () => {
  it("iterates next exactly uptoStep times from init", () => {
    const step = { init: { x: "0" }, next: { x: "x + 1" }, max: 5 };
    const states = computeStepStates(step, {}, 3);
    expect(states).toEqual([{ x: 0 }, { x: 1 }, { x: 2 }, { x: 3 }]);
  });

  it("next can read the loop index variable `step` and bindings", () => {
    const step = { init: { x: "0" }, next: { x: "x + step" }, max: 5 };
    expect(computeStepStates(step, {}, 3).map((s) => s.x)).toEqual([0, 1, 3, 6]);

    const step2 = { init: { x: "0" }, next: { x: "x + rate" }, max: 5 };
    expect(computeStepStates(step2, { rate: 2 }, 3).map((s) => s.x)).toEqual([0, 2, 4, 6]);
  });

  it("clamps uptoStep to step.max", () => {
    const step = { init: { x: "0" }, next: { x: "x + 1" }, max: 2 };
    expect(computeStepStates(step, {}, 100)).toEqual([{ x: 0 }, { x: 1 }, { x: 2 }]);
  });
});

describe("$state / $stateTrail resolution", () => {
  const model: InstrumentModel = {
    runtimeVersion: 1,
    step: { init: { x: "0" }, next: { x: "x + 1" }, max: 10 },
    figureTemplate: {
      data: [
        {
          type: "scatter",
          x: [{ $state: "x" }],
          y: { $stateTrail: "x" },
        },
      ],
    },
  };

  it("resolves $state to the current step's value", () => {
    const result = resolveInstrumentFigure(model, {}, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.figure.data[0]!.x as unknown[])[0]).toBe(2);
    }
  });

  it("resolves $stateTrail to the full 0..currentStep array", () => {
    const result = resolveInstrumentFigure(model, {}, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.figure.data[0]!.y).toEqual([0, 1, 2]);
    }
  });

  it("fails clearly when $state/$stateTrail used without model.step", () => {
    const noStep: InstrumentModel = {
      runtimeVersion: 1,
      figureTemplate: { data: [{ type: "scatter", x: [{ $state: "x" }] }] },
    };
    const result = resolveInstrumentFigure(noStep, {}, 0);
    expect(result.ok).toBe(false);
  });
});

describe("nested marker resolution", () => {
  it("resolves markers at any depth and preserves plain values", () => {
    const model: InstrumentModel = {
      runtimeVersion: 1,
      figureTemplate: {
        data: [{ type: "scatter", x: [1, 2, 3], y: [{ $expr: "R" }] }],
        layout: { scene: { xaxis: { title: { text: "u" } } }, showlegend: false },
      },
    };
    const result = resolveInstrumentFigure(model, { R: 9 }, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.figure.data[0]!.x).toEqual([1, 2, 3]);
      expect((result.figure.data[0]!.y as unknown[])[0]).toBe(9);
      expect(result.figure.layout?.showlegend).toBe(false);
    }
  });

  it("rejects ambiguous marker objects with more than one marker key", () => {
    const model: InstrumentModel = {
      runtimeVersion: 1,
      figureTemplate: { data: [{ type: "scatter", x: [{ $expr: "1", $grid: "u" }] }] },
    };
    const result = resolveInstrumentFigure(model, {}, 0);
    expect(result.ok).toBe(false);
  });
});

describe("INSTRUMENT_SAMPLE_MODEL", () => {
  it("resolves and passes validatePlotlyFigure", () => {
    expect(INSTRUMENT_SAMPLE_MODEL.domain?.axes?.map((axis) => axis.name)).toEqual(["x", "y"]);
    const result = resolveInstrumentFigure(INSTRUMENT_SAMPLE_MODEL, { R: 1 }, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(validatePlotlyFigure(result.figure).ok).toBe(true);
    }
  });
});

describe("validateInstrumentSpec", () => {
  it("accepts model.params constants in $exprGrid (same as bindings)", () => {
    const spec = baseSpec({
      model: {
        runtimeVersion: 1,
        domain: { uMin: 0, uMax: Math.PI, vMin: 0, vMax: Math.PI, resolution: 8 },
        params: { R: 2 },
        figureTemplate: {
          data: [
            {
              type: "surface",
              x: { $grid: "u" },
              y: { $grid: "v" },
              z: { $exprGrid: "sin(u) * cos(v) * R" },
            },
          ],
        },
      } as unknown as Record<string, unknown>,
      bindings: { phase: { min: 0, max: 1, default: 0, label: "phase" } },
    });
    const result = validateInstrumentSpec(spec);
    expect(result.ok).toBe(true);
  });

  it("rejects an instrument with no spec.bindings (no adjustable parameters)", () => {
    const spec = baseSpec({
      model: INSTRUMENT_SAMPLE_MODEL as unknown as Record<string, unknown>,
    });
    const result = validateInstrumentSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/spec\.bindings/);
  });

  it("rejects bound compute", () => {
    const spec = baseSpec({ compute: "bound", model: INSTRUMENT_SAMPLE_MODEL as unknown as Record<string, unknown> });
    const result = validateInstrumentSpec(spec);
    expect(result.ok).toBe(false);
  });

  it("rejects a model with a disallowed expression", () => {
    const spec = baseSpec({
      model: {
        runtimeVersion: 1,
        figureTemplate: { data: [{ type: "scatter", x: [{ $expr: "eval('1')" }] }] },
      },
    });
    const result = validateInstrumentSpec(spec);
    expect(result.ok).toBe(false);
  });

  it("rejects model.step.max above the hard ceiling", () => {
    const spec = baseSpec({
      model: {
        runtimeVersion: 1,
        step: { init: { x: "0" }, next: { x: "x+1" }, max: 100000 },
        figureTemplate: { data: [{ type: "scatter", x: [{ $state: "x" }] }] },
      },
    });
    const result = validateInstrumentSpec(spec);
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed spec matching INSTRUMENT_SAMPLE_MODEL", () => {
    const spec = baseSpec({
      model: INSTRUMENT_SAMPLE_MODEL as unknown as Record<string, unknown>,
      bindings: { R: { min: 0.2, max: 3, default: 1, label: "R" } },
    });
    const result = validateInstrumentSpec(spec);
    expect(result.ok).toBe(true);
  });
});
