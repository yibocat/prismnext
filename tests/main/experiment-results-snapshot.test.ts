import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildExperimentStorageContext,
  createExperiment,
} from "../../src/main/services/experiment-log-service";
import { snapshotExperiment } from "../../src/main/services/experiment-results-snapshot";

describe("snapshotExperiment", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function setup() {
    root = mkdtempSync(join(tmpdir(), "prism-snap-"));
    const experimentRoot = join(root, "experiment");
    mkdirSync(experimentRoot, { recursive: true });
    return buildExperimentStorageContext(root, "experiment");
  }

  it("classifies figures, csv tables, and json metrics under results/", () => {
    const ctx = setup();
    const created = createExperiment(ctx, { title: "Snap" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const island = join(root, created.path);
    mkdirSync(join(island, "results"), { recursive: true });
    writeFileSync(join(island, "results", "loss.png"), "fakepng");
    writeFileSync(join(island, "results", "scores.csv"), "acc,loss\n0.9,0.1\n0.91,0.09\n");
    writeFileSync(
      join(island, "results", "metrics.json"),
      JSON.stringify({ accuracy: 0.91, note: "ok" }),
    );
    writeFileSync(join(island, "results", "raw.bin"), "\x00\x01");

    const snap = snapshotExperiment(ctx, created.id);
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.snapshot.figures.some((f) => f.path === "results/loss.png")).toBe(true);
    expect(snap.snapshot.tables[0]?.path).toBe("results/scores.csv");
    expect(snap.snapshot.tables[0]?.rowCount).toBe(2);
    expect(snap.snapshot.tables[0]?.columns).toEqual(["acc", "loss"]);
    expect(snap.snapshot.metrics[0]?.values.accuracy).toBe(0.91);
    expect(snap.snapshot.unparsed).toContain("results/raw.bin");
    expect(snap.snapshot.textSummary).toContain(`${created.path}/results/loss.png`);
  });

  it("finds figures outside the old results/output/figures dirs", () => {
    const ctx = setup();
    const created = createExperiment(ctx, { title: "Anywhere" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const island = join(root, created.path);
    mkdirSync(join(island, "analysis", "v2"), { recursive: true });
    writeFileSync(join(island, "analysis", "v2", "chart.png"), "fakepng");

    const snap = snapshotExperiment(ctx, created.id);
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.snapshot.figures.some((f) => f.path === "analysis/v2/chart.png")).toBe(true);
    expect(snap.snapshot.textSummary).toContain(`${created.path}/analysis/v2/chart.png`);
  });

  it("skips venv / node_modules trees", () => {
    const ctx = setup();
    const created = createExperiment(ctx, { title: "Skip" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const island = join(root, created.path);
    mkdirSync(join(island, "results", "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(island, "results", "node_modules", "pkg", "x.png"), "x");
    writeFileSync(join(island, "results", "keep.png"), "y");

    const snap = snapshotExperiment(ctx, created.id);
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.snapshot.figures.map((f) => f.path)).toEqual(["results/keep.png"]);
  });
});
