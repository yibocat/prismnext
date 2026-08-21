import { describe, expect, it } from "vitest";
import {
  classifyDeclaredArtifacts,
  classifyDeclaredPath,
  collectDeclaredArtifacts,
  groupDeclaredArtifactsByRun,
} from "../../src/renderer/modes/experiments-mode/experiments-results-panel";
import type { ExperimentRunEntry } from "../../src/shared/experiment-log";

function run(partial: Partial<ExperimentRunEntry> & { runId: string }): ExperimentRunEntry {
  return {
    runId: partial.runId,
    startedAt: partial.startedAt ?? "2026-07-26T00:00:00.000Z",
    finishedAt: partial.finishedAt ?? "2026-07-26T00:00:01.000Z",
    command: partial.command ?? "echo",
    cwd: partial.cwd ?? "experiment/demo",
    exitCode: partial.exitCode ?? 0,
    stdoutTail: partial.stdoutTail ?? "",
    stderrTail: partial.stderrTail ?? "",
    artifacts: partial.artifacts ?? [],
    env: partial.env ?? {},
    ...partial,
  };
}

describe("collectDeclaredArtifacts", () => {
  it("returns newest-first unique paths from run records", () => {
    const paths = collectDeclaredArtifacts([
      run({ runId: "r1", artifacts: ["plots/a.png", "out.csv"] }),
      run({ runId: "r2", artifacts: ["plots/a.png", "metrics.json"] }),
    ]);
    expect(paths).toEqual(["plots/a.png", "metrics.json", "out.csv"]);
  });

  it("ignores empty paths", () => {
    expect(collectDeclaredArtifacts([run({ runId: "r1", artifacts: ["", "  ", "x.png"] })])).toEqual([
      "x.png",
    ]);
  });
});

describe("classifyDeclaredPath", () => {
  it("buckets images and pdfs as figures", () => {
    expect(classifyDeclaredPath("plots/a.png")).toBe("figures");
    expect(classifyDeclaredPath("fig.pdf")).toBe("figures");
  });

  it("buckets tabular extensions as tables", () => {
    expect(classifyDeclaredPath("out.csv")).toBe("tables");
    expect(classifyDeclaredPath("data/x.tsv")).toBe("tables");
    expect(classifyDeclaredPath("sheet.xlsx")).toBe("tables");
  });

  it("buckets *metric*.json as metrics; other json as other", () => {
    expect(classifyDeclaredPath("metrics.json")).toBe("metrics");
    expect(classifyDeclaredPath("run_metrics.json")).toBe("metrics");
    expect(classifyDeclaredPath("config.json")).toBe("other");
  });

  it("buckets scripts and misc as other", () => {
    expect(classifyDeclaredPath("train.py")).toBe("other");
    expect(classifyDeclaredPath("notes.md")).toBe("other");
  });
});

describe("classifyDeclaredArtifacts", () => {
  it("groups newest-first unique paths by type", () => {
    const buckets = classifyDeclaredArtifacts([
      run({
        runId: "r1",
        artifacts: ["plots/a.png", "out.csv", "train.py", "config.json"],
      }),
      run({
        runId: "r2",
        artifacts: ["plots/a.png", "metrics.json", "fig.pdf"],
      }),
    ]);
    expect(buckets.figures).toEqual(["plots/a.png", "fig.pdf"]);
    expect(buckets.tables).toEqual(["out.csv"]);
    expect(buckets.metrics).toEqual(["metrics.json"]);
    expect(buckets.other).toEqual(["train.py", "config.json"]);
    expect(buckets.total).toBe(6);
  });
});

describe("groupDeclaredArtifactsByRun", () => {
  it("groups by run newest-first and skips empty runs", () => {
    const groups = groupDeclaredArtifactsByRun([
      run({ runId: "r1", artifacts: ["plots/a.png", "out.csv"] }),
      run({ runId: "r-empty", artifacts: [] }),
      run({
        runId: "r2",
        artifacts: ["metrics.json", "train.py"],
        notes: "baseline",
      }),
    ]);
    expect(groups.map((g) => g.runId)).toEqual(["r2", "r1"]);
    expect(groups[0]!.buckets.metrics).toEqual(["metrics.json"]);
    expect(groups[0]!.buckets.other).toEqual(["train.py"]);
    expect(groups[1]!.buckets.figures).toEqual(["plots/a.png"]);
    expect(groups[1]!.buckets.tables).toEqual(["out.csv"]);
  });

  it("assigns shared working paths to the newest declaring run only", () => {
    const groups = groupDeclaredArtifactsByRun([
      run({
        runId: "r1",
        artifacts: ["results.json", "env.json"],
        notes: "Phase 1",
      }),
      run({
        runId: "r2",
        artifacts: ["results.json", "env.json"],
        notes: "Phase 1.1",
      }),
    ]);
    expect(groups.map((g) => g.runId)).toEqual(["r2", "r1"]);
    expect(groups[0]!.buckets.other).toEqual(["results.json", "env.json"]);
    expect(groups[0]!.supersededCount).toBe(0);
    expect(groups[1]!.buckets.total).toBe(0);
    expect(groups[1]!.supersededCount).toBe(2);
  });

  it("shows frozen snapshots on older runs even when working path is shared", () => {
    const groups = groupDeclaredArtifactsByRun(
      [
        run({
          runId: "r1",
          artifacts: ["ws/plot.png"],
          artifactSnapshots: [".workbench/experiments/e1/artifacts/r1/plot.png"],
          notes: "first plot",
        }),
        run({
          runId: "r2",
          artifacts: ["ws/plot.png"],
          artifactSnapshots: [".workbench/experiments/e1/artifacts/r2/plot.png"],
          notes: "replot",
        }),
      ],
      "ws",
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.buckets.figures).toEqual([
      ".workbench/experiments/e1/artifacts/r2/plot.png",
    ]);
    expect(groups[1]!.buckets.figures).toEqual([
      ".workbench/experiments/e1/artifacts/r1/plot.png",
    ]);
    expect(groups[0]!.supersededCount).toBe(0);
    expect(groups[1]!.supersededCount).toBe(0);
  });

  it("newest-wins for working images when neither run has snapshots", () => {
    const groups = groupDeclaredArtifactsByRun([
      run({ runId: "r1", artifacts: ["shared.png"] }),
      run({ runId: "r2", artifacts: ["shared.png"] }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.buckets.figures).toEqual(["shared.png"]);
    expect(groups[1]!.buckets.total).toBe(0);
    expect(groups[1]!.supersededCount).toBe(1);
  });

  it("still skips runs that never declared artifacts", () => {
    const groups = groupDeclaredArtifactsByRun([
      run({ runId: "r-empty", artifacts: [] }),
      run({ runId: "r2", artifacts: ["only.json"] }),
    ]);
    expect(groups.map((g) => g.runId)).toEqual(["r2"]);
  });
});
