import { describe, expect, it } from "vitest";
import {
  buildLocalDemoPlotPoints,
  csvRowsToPlotPoints,
  isInteractionPlotKind,
  parsePlotParams,
  parseSimpleCsv,
  pickCsvResourcePath,
} from "../../src/shared/interaction-plot";

describe("interaction-plot", () => {
  it("recognizes plot kinds", () => {
    expect(isInteractionPlotKind("plot.line")).toBe(true);
    expect(isInteractionPlotKind("math.surface")).toBe(false);
  });

  it("parses plot params with defaults", () => {
    expect(parsePlotParams(undefined)).toEqual({
      xCol: "epoch",
      yCols: ["train_loss", "val_loss"],
    });
    expect(parsePlotParams({ x: "step", y: "loss" })).toEqual({
      xCol: "step",
      yCols: ["loss"],
    });
    expect(parsePlotParams({ x: "t", y: ["a", "b"] })).toEqual({
      xCol: "t",
      yCols: ["a", "b"],
    });
  });

  it("builds local demo line points", () => {
    const pts = buildLocalDemoPlotPoints("plot.line");
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it("parses csv and maps columns", () => {
    const csv = "epoch,train_loss,val_loss\n0,1.2,1.5\n1,0.9,1.1\n";
    const parsed = parseSimpleCsv(csv);
    expect(parsed?.columns).toEqual(["epoch", "train_loss", "val_loss"]);
    const result = csvRowsToPlotPoints(
      parsed!.rows,
      parsed!.columns,
      "epoch",
      ["train_loss", "val_loss"],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.points).toHaveLength(4);
    }
  });

  it("reports missing columns", () => {
    const parsed = parseSimpleCsv("a,b\n1,2\n")!;
    const result = csvRowsToPlotPoints(parsed.rows, parsed.columns, "missing", ["b"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("missing x column");
  });

  it("picks csv resource path", () => {
    expect(
      pickCsvResourcePath([{ role: "data", path: "out/metrics.csv" }]),
    ).toBe("out/metrics.csv");
    expect(pickCsvResourcePath([{ path: "figures/plot.png" }, { path: "data.csv" }])).toBe(
      "data.csv",
    );
  });
});
