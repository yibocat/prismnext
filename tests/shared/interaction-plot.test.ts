import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  csvRowsToPlotData,
  csvRowsToPlotPoints,
  isInteractionPlotKind,
  parsePlotParams,
  parseSimpleCsv,
  pickCsvResourcePath,
} from "../../src/shared/interaction/plot";
import { resolvePlotAbsPath, validatePlotSpec } from "../../src/main/lib/interaction-plot-fs";
import type { InteractionSpec } from "../../src/shared/interaction/spec";

function baseSpec(over: Partial<InteractionSpec> = {}): InteractionSpec {
  return {
    id: "plot.demo",
    title: "Demo",
    kind: "plot.series",
    compute: "bound",
    revision: 1,
    ...over,
  };
}

describe("interaction-plot", () => {
  it("recognizes plot kinds and parses params", () => {
    expect(isInteractionPlotKind("plot.line")).toBe(true);
    expect(isInteractionPlotKind("plot.density")).toBe(true);
    expect(isInteractionPlotKind("plot.heatmap")).toBe(true);
    expect(isInteractionPlotKind("plot.sankey")).toBe(false);
    expect(isInteractionPlotKind("figure.static")).toBe(false);
    expect(parsePlotParams({ x: "step", y: ["a", "b"] })).toEqual({
      xCol: "step",
      yCols: ["a", "b"],
      fillCol: null,
      bins: null,
    });
    expect(parsePlotParams({ y: "loss" }).yCols).toEqual(["loss"]);
    expect(parsePlotParams({ x: "v", bins: 40, fill: "w" })).toEqual({
      xCol: "v",
      yCols: ["train_loss", "val_loss"],
      fillCol: "w",
      bins: 40,
    });
    expect(parsePlotParams({ bins: 1 }).bins).toBeNull();
  });

  it("parses CSV and builds points without inventing data", () => {
    const parsed = parseSimpleCsv("epoch,train_loss,val_loss\n0,1.0,1.2\n1,0.8,0.9\n");
    expect(parsed?.columns).toEqual(["epoch", "train_loss", "val_loss"]);
    const points = csvRowsToPlotPoints(
      parsed!.rows,
      parsed!.columns,
      "epoch",
      ["train_loss", "val_loss"],
    );
    expect(points.ok).toBe(true);
    if (points.ok) {
      expect(points.points).toHaveLength(4);
      expect(points.points.filter((p) => p.series === "train_loss")).toHaveLength(2);
    }
  });

  it("picks role=data CSV path", () => {
    expect(
      pickCsvResourcePath([
        { role: "note", path: "readme.md" },
        { role: "data", path: "out/m.csv" },
      ]),
    ).toBe("out/m.csv");
    expect(pickCsvResourcePath([{ path: "out/m.csv" }])).toBe("out/m.csv");
    expect(pickCsvResourcePath([{ path: "out/m.png" }])).toBeNull();
  });

  it("rejects escape and missing CSV on write validation", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-plot-"));
    expect(resolvePlotAbsPath(root, "../outside.csv")).toBeNull();

    const missing = validatePlotSpec(
      root,
      baseSpec({ resources: [{ role: "data", path: "gone.csv" }] }),
      () => false,
    );
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.error).toMatch(/not found/i);

    mkdirSync(join(root, "out"), { recursive: true });
    writeFileSync(join(root, "out", "ok.csv"), "epoch,loss\n0,1\n1,0.5\n");
    const ok = validatePlotSpec(
      root,
      baseSpec({ resources: [{ role: "data", path: "out/ok.csv" }] }),
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.relPath.replace(/\\/g, "/")).toBe("out/ok.csv");

    rmSync(root, { recursive: true, force: true });
  });
});

describe("csvRowsToPlotData (extended kinds)", () => {
  const P = (over: Record<string, unknown> = {}) =>
    parsePlotParams(over as Record<string, unknown>);

  it("plot.area melts numeric x/y like plot.series", () => {
    const parsed = parseSimpleCsv("epoch,a,b\n0,1,2\n1,3,4\n")!;
    const res = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.area", P({ y: ["a", "b"] }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.points).toHaveLength(4);
      expect(res.legend).toBe(true);
    }
  });

  it("plot.histogram uses only the x column and labels y as count", () => {
    const parsed = parseSimpleCsv("residual\n0.1\n-0.2\n0.05\noops\n")!;
    const res = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.histogram", P({ x: "residual", bins: 12 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rows).toHaveLength(3); // "oops" dropped, never fabricated
      expect(res.yLabel).toBe("count");
      expect(res.bins).toBe(12);
      expect(res.legend).toBe(false);
    }
  });

  it("plot.bar melts multiple y columns into stacked series with categorical x", () => {
    const parsed = parseSimpleCsv("model,bleu,rouge\nA,30,55\nB,33,52\n")!;
    const res = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.bar", P({ x: "model", y: ["bleu", "rouge"] }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rows).toHaveLength(4);
      expect(res.rows[0]).toEqual({ x: "A", y: 30, series: "bleu" });
      expect(res.legend).toBe(true);
    }
  });

  it("plot.box keeps categorical x and rejects multiple y columns", () => {
    const parsed = parseSimpleCsv("group,score\nctl,1.1\nctl,0.9\nexp,1.4\n")!;
    const okRes = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.box", P({ x: "group", y: "score" }));
    expect(okRes.ok).toBe(true);
    if (okRes.ok) expect(okRes.rows).toHaveLength(3);

    const bad = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.box", P({ x: "group", y: ["score", "group"] }));
    expect(bad.ok).toBe(false);
  });

  it("plot.density requires exactly one y column", () => {
    const parsed = parseSimpleCsv("x,y,z\n1,2,3\n4,5,6\n")!;
    const okRes = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.density", P({ x: "x", y: "y" }));
    expect(okRes.ok).toBe(true);
    const bad = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.density", P({ x: "x", y: ["y", "z"] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/exactly one y/);
  });

  it("plot.heatmap requires params.fill and keeps categorical axes", () => {
    const parsed = parseSimpleCsv("r,c,v\na,x,0.5\na,y,0.7\n")!;
    const noFill = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.heatmap", P({ x: "r", y: "c" }));
    expect(noFill.ok).toBe(false);
    if (!noFill.ok) expect(noFill.error).toMatch(/params\.fill/);

    const okRes = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.heatmap", P({ x: "r", y: "c", fill: "v" }));
    expect(okRes.ok).toBe(true);
    if (okRes.ok) {
      expect(okRes.rows).toEqual([
        { x: "a", y: "x", fill: 0.5 },
        { x: "a", y: "y", fill: 0.7 },
      ]);
      expect(okRes.legend).toBe(true);
    }
  });

  it("reports missing columns by name and never invents data", () => {
    const parsed = parseSimpleCsv("a,b\n1,2\n")!;
    const res = csvRowsToPlotData(parsed.rows, parsed.columns, "plot.scatter", P({ x: "a", y: "nope" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('"nope"');
  });
});
