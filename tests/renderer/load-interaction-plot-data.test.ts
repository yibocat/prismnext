import { describe, expect, it, vi, beforeEach } from "vitest";
import type { InteractionSpec } from "../../src/shared/interaction-spec";

const fsRead = vi.fn();

vi.stubGlobal("window", {
  electronAPI: { fsRead },
});

const { loadInteractionPlotData } = await import(
  "../../src/renderer/lib/interaction/plot/load-interaction-plot-data"
);

const PROJECT = "/tmp/prism-project";

function baseSpec(overrides: Partial<InteractionSpec> = {}): InteractionSpec {
  return {
    id: "demo.loss",
    title: "Demo loss curve",
    kind: "plot.line",
    compute: "local",
    revision: 1,
    ...overrides,
  };
}

describe("loadInteractionPlotData (P1)", () => {
  beforeEach(() => {
    fsRead.mockReset();
  });

  it("local plot.line returns sketch points", async () => {
    const result = await loadInteractionPlotData(baseSpec(), PROJECT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points.some((p) => p.series === "train_loss")).toBe(true);
    expect(fsRead).not.toHaveBeenCalled();
  });

  it("local plot.scatter returns dot series", async () => {
    const result = await loadInteractionPlotData(
      baseSpec({ kind: "plot.scatter", params: { y: "samples" } }),
      PROJECT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points.every((p) => p.series === "samples")).toBe(true);
  });

  it("bound reads csv via fsRead and maps columns", async () => {
    fsRead.mockResolvedValueOnce({
      content: "epoch,train_loss,val_loss\n0,1.2,1.5\n1,0.9,1.1\n",
    });
    const result = await loadInteractionPlotData(
      baseSpec({
        compute: "bound",
        params: { x: "epoch", y: ["train_loss", "val_loss"] },
        resources: [{ role: "data", path: "out/metrics.csv" }],
      }),
      PROJECT,
    );
    expect(result.ok).toBe(true);
    expect(fsRead).toHaveBeenCalledWith(`${PROJECT}/out/metrics.csv`);
    if (!result.ok) return;
    expect(result.points).toHaveLength(4);
    expect(result.xLabel).toBe("epoch");
  });

  it("bound without resources fails clearly", async () => {
    const result = await loadInteractionPlotData(
      baseSpec({ compute: "bound" }),
      PROJECT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("csv resource");
  });

  it("bound fs read failure fails clearly", async () => {
    fsRead.mockRejectedValueOnce(new Error("ENOENT"));
    const result = await loadInteractionPlotData(
      baseSpec({
        compute: "bound",
        resources: [{ path: "out/missing.csv" }],
      }),
      PROJECT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("out/missing.csv");
  });

  it("bound missing y column fails clearly", async () => {
    fsRead.mockResolvedValueOnce({ content: "epoch,loss\n0,1.0\n" });
    const result = await loadInteractionPlotData(
      baseSpec({
        compute: "bound",
        params: { x: "epoch", y: ["train_loss"] },
        resources: [{ path: "out/metrics.csv" }],
      }),
      PROJECT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("train_loss");
  });

  it("rejects unsupported kind", async () => {
    const result = await loadInteractionPlotData(
      baseSpec({ kind: "math.surface" }),
      PROJECT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unsupported kind");
  });
});
