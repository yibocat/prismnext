import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  csvRowsToPlotPoints,
  isInteractionPlotKind,
  parsePlotParams,
  parseSimpleCsv,
  pickCsvResourcePath,
} from "../../src/shared/interaction-plot";
import { resolvePlotAbsPath, validatePlotSpec } from "../../src/shared/interaction-plot-fs";
import type { InteractionSpec } from "../../src/shared/interaction-spec";

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
    expect(isInteractionPlotKind("figure.static")).toBe(false);
    expect(parsePlotParams({ x: "step", y: ["a", "b"] })).toEqual({
      xCol: "step",
      yCols: ["a", "b"],
    });
    expect(parsePlotParams({ y: "loss" }).yCols).toEqual(["loss"]);
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
