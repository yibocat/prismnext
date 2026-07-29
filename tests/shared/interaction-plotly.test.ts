import { describe, expect, it } from "vitest";
import {
  isInteractionPlotlyKind,
  PLOTLY_MAX_JSON_BYTES,
  PLOTLY_SAMPLE_CURVE_ANIMATION_MODEL,
  PLOTLY_SAMPLE_FIGURE,
  PLOTLY_SAMPLE_FIGURE_MODEL,
  resolveInlinePlotlyModel,
  resolvePlotlyFigureSource,
  validatePlotlyFigure,
} from "../../src/shared/interaction-plotly";
import type { InteractionSpec } from "../../src/shared/interaction-spec";

function plotlySpec(overrides: Partial<InteractionSpec> = {}): InteractionSpec {
  return {
    id: "demo.saddle",
    title: "Saddle",
    kind: "figure.plotly",
    compute: "local",
    revision: 1,
    model: { figure: PLOTLY_SAMPLE_FIGURE as unknown as Record<string, unknown> },
    ...overrides,
  };
}

describe("figure.plotly contract", () => {
  it("recognises the kind", () => {
    expect(isInteractionPlotlyKind("figure.plotly")).toBe(true);
    expect(isInteractionPlotlyKind("figure.static")).toBe(false);
  });

  it("accepts a minimal figure and rejects empty data", () => {
    expect(validatePlotlyFigure({ data: [{ type: "surface", z: [[0, 1]] }] }).ok).toBe(true);
    const bad = validatePlotlyFigure({ data: [] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/non-empty array/);
  });

  it("rejects non-object traces and bad layout", () => {
    const t = validatePlotlyFigure({ data: ["nope"] });
    expect(t.ok).toBe(false);
    const l = validatePlotlyFigure({ data: [{ type: "scatter" }], layout: [] });
    expect(l.ok).toBe(false);
  });

  it("resolves inline model.figure", () => {
    const src = resolvePlotlyFigureSource(plotlySpec());
    expect(src.ok).toBe(true);
    if (src.ok && src.mode === "inline") {
      expect(src.figure.data[0]?.type).toBe("scatter");
    }
  });

  it("resolves bare model as figure (no .figure wrapper)", () => {
    const src = resolvePlotlyFigureSource(
      plotlySpec({ model: { data: [{ type: "scatter3d" }] } }),
    );
    expect(src.ok && src.mode === "inline").toBe(true);
  });

  it("prefers a json resource and normalises artifact-relative paths", () => {
    const src = resolvePlotlyFigureSource(
      plotlySpec({ model: undefined, resources: [{ role: "figure-json", path: "field.json" }] }),
    );
    expect(src).toEqual({ ok: true, mode: "file", path: ".prismnext/artifacts/demo.saddle/field.json" });
  });

  it("passes experiment paths through untouched", () => {
    const src = resolvePlotlyFigureSource(
      plotlySpec({
        model: undefined,
        compute: "bound",
        resources: [{ role: "figure-json", path: "experiment/exp-1/results/field.json" }],
      }),
    );
    expect(src).toEqual({ ok: true, mode: "file", path: "experiment/exp-1/results/field.json" });
  });

  it("errors with a copyable hint when nothing is provided", () => {
    const src = resolvePlotlyFigureSource(plotlySpec({ model: undefined }));
    expect(src.ok).toBe(false);
    if (!src.ok) expect(src.error).toMatch(/spec\.model\.figure|figure-json/);
  });

  it("caps figure JSON size at 8MB", () => {
    expect(PLOTLY_MAX_JSON_BYTES).toBe(8 * 1024 * 1024);
  });

  it("round-trips a realistic Python-exported figure (frames + sliders + unicode)", () => {
    const pyShaped = {
      data: [
        {
          type: "surface",
          x: [0, 1, 2],
          y: [0, 1, 2],
          z: [
            [0, 1, null],
            [1, 2, 3],
            [null, 3, 4],
          ],
          colorbar: { title: { text: "损失 (loss)" } },
        },
      ],
      layout: {
        title: { text: "Training landscape — step {frame}" },
        scene: {
          xaxis: { title: { text: "w1" } },
          yaxis: { title: { text: "w2" } },
        },
        sliders: [
          {
            steps: [0, 1, 2].map((i) => ({
              method: "animate",
              args: [[`f${i}`]],
              label: String(i),
            })),
          },
        ],
        updatemenus: [
          { type: "buttons", buttons: [{ method: "animate", args: [null], label: "Play" }] },
        ],
      },
      frames: [
        {
          name: "f0",
          data: [
            {
              z: [
                [0, 1, 0],
                [1, 2, 3],
                [0, 3, 4],
              ],
            },
          ],
        },
        {
          name: "f1",
          data: [
            {
              z: [
                [0, 2, 0],
                [2, 4, 6],
                [0, 6, 8],
              ],
            },
          ],
        },
      ],
    };
    const result = validatePlotlyFigure(pyShaped);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.figure.frames?.length).toBe(2);
      expect(result.figure.layout?.sliders).toBeTruthy();
      expect(result.figure.layout?.updatemenus).toBeTruthy();
    }
  });
});

describe("resolveInlinePlotlyModel — sample models used in tool description", () => {
  it("resolves the unit-sphere sample (all coordinates computed, none guessed)", () => {
    expect(PLOTLY_SAMPLE_FIGURE_MODEL.domain.axes?.map((axis) => axis.name)).toEqual([
      "theta",
      "phi",
    ]);
    const result = resolveInlinePlotlyModel(PLOTLY_SAMPLE_FIGURE_MODEL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const trace = result.figure.data[0]!;
    expect(trace.type).toBe("surface");
    const x = trace.x as number[][];
    const y = trace.y as number[][];
    const z = trace.z as number[][];
    // Every point must sit on the unit sphere: x^2 + y^2 + z^2 == 1.
    for (let i = 0; i < x.length; i++) {
      for (let j = 0; j < x[i]!.length; j++) {
        const r2 = x[i]![j]! ** 2 + y[i]![j]! ** 2 + z[i]![j]! ** 2;
        expect(r2).toBeCloseTo(1, 6);
      }
    }
  });

  it("resolves the x^2 coarse->fine animation sample with per-frame resolution", () => {
    const result = resolveInlinePlotlyModel(PLOTLY_SAMPLE_CURVE_ANIMATION_MODEL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.figure.data[0]!.x).toHaveLength(3);
    expect(result.figure.frames).toHaveLength(5);
    const pointCounts = result.figure.frames!.map((f) => (f.data as { x: unknown[] }[])[0]!.x.length);
    expect(pointCounts).toEqual([3, 6, 12, 25, 50]);
    // Spot-check the finest frame actually satisfies y = x^2.
    const last = result.figure.frames![4]!.data as { x: number[]; y: number[] }[];
    for (let i = 0; i < last[0]!.x.length; i++) {
      expect(last[0]!.y[i]).toBeCloseTo(last[0]!.x[i]! ** 2, 6);
    }
  });
});
