import { describe, expect, it } from "vitest";
import {
  isInteractionPlotlyKind,
  PLOTLY_MAX_JSON_BYTES,
  PLOTLY_SAMPLE_FIGURE,
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
      expect(src.figure.data[0]?.type).toBe("surface");
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
});
