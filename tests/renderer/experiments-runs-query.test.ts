import { describe, expect, it } from "vitest";
import type { ExperimentRunEntry } from "../../src/shared/experiment-log";
import {
  experimentRunListTitle,
  queryExperimentRuns,
  shortExperimentCommandTitle,
  stepFocusIndex,
  type RunsQuery,
} from "../../src/renderer/modes/experiments-mode/experiments-runs-query";

function run(partial: Partial<ExperimentRunEntry> & { runId: string }): ExperimentRunEntry {
  return {
    startedAt: "2026-07-16T10:00:00Z",
    finishedAt: "2026-07-16T10:00:01Z",
    command: "echo hi",
    cwd: "experiment/exp-a",
    exitCode: 0,
    stdoutTail: "",
    stderrTail: "",
    artifacts: [],
    env: {
      python: null,
      pythonVersion: null,
      rscript: null,
      rVersion: null,
      platform: "darwin",
      gitCommit: null,
      venvPath: null,
    },
    ...partial,
  };
}

const base: RunsQuery = { status: "all", text: "", sort: "newest", kind: "all" };

describe("queryExperimentRuns", () => {
  const runs = [
    run({
      runId: "r1",
      command: "python train.py",
      exitCode: 0,
      finishedAt: "2026-07-16T12:00:00Z",
      kind: "train",
    }),
    run({
      runId: "r2",
      command: "python eval.py",
      exitCode: 1,
      notes: "oom",
      finishedAt: "2026-07-16T13:00:00Z",
      kind: "eval",
    }),
    run({
      runId: "r3",
      command: "echo done",
      exitCode: 0,
      finishedAt: "2026-07-16T11:00:00Z",
    }),
  ];

  it("sorts newest-first by default", () => {
    const out = queryExperimentRuns(runs, base);
    expect(out.map((r) => r.runId)).toEqual(["r2", "r1", "r3"]);
  });

  it("sorts oldest-first", () => {
    const out = queryExperimentRuns(runs, { ...base, sort: "oldest" });
    expect(out.map((r) => r.runId)).toEqual(["r3", "r1", "r2"]);
  });

  it("filters by success / failed", () => {
    expect(queryExperimentRuns(runs, { ...base, status: "success" }).map((r) => r.runId)).toEqual([
      "r1",
      "r3",
    ]);
    expect(queryExperimentRuns(runs, { ...base, status: "failed" }).map((r) => r.runId)).toEqual([
      "r2",
    ]);
  });

  it("treats cancelled runs separately from failed (Bug #21)", () => {
    const withCancel = [
      ...runs,
      run({
        runId: "r-cxl",
        command: "python train.py --long",
        exitCode: 130,
        cancelled: true,
        finishedAt: "2026-07-16T14:00:00Z",
      }),
    ];
    expect(
      queryExperimentRuns(withCancel, { ...base, status: "cancelled" }).map((r) => r.runId),
    ).toEqual(["r-cxl"]);
    expect(
      queryExperimentRuns(withCancel, { ...base, status: "failed" }).map((r) => r.runId),
    ).toEqual(["r2"]);
  });

  it("filters by command / notes / runId text", () => {
    expect(queryExperimentRuns(runs, { ...base, text: "train" }).map((r) => r.runId)).toEqual([
      "r1",
    ]);
    expect(queryExperimentRuns(runs, { ...base, text: "OOM" }).map((r) => r.runId)).toEqual([
      "r2",
    ]);
    expect(queryExperimentRuns(runs, { ...base, text: "r3" }).map((r) => r.runId)).toEqual([
      "r3",
    ]);
  });

  it("filters by kind / untagged", () => {
    expect(queryExperimentRuns(runs, { ...base, kind: "train" }).map((r) => r.runId)).toEqual([
      "r1",
    ]);
    expect(queryExperimentRuns(runs, { ...base, kind: "eval" }).map((r) => r.runId)).toEqual([
      "r2",
    ]);
    expect(queryExperimentRuns(runs, { ...base, kind: "untagged" }).map((r) => r.runId)).toEqual([
      "r3",
    ]);
  });
});

describe("stepFocusIndex", () => {
  it("clamps within bounds", () => {
    expect(stepFocusIndex(0, -1, 5)).toBe(0);
    expect(stepFocusIndex(4, 1, 5)).toBe(4);
    expect(stepFocusIndex(2, 1, 5)).toBe(3);
  });

  it("enters the list from -1", () => {
    expect(stepFocusIndex(-1, 1, 5)).toBe(0);
    expect(stepFocusIndex(-1, -1, 5)).toBe(4);
  });

  it("returns -1 for empty lists", () => {
    expect(stepFocusIndex(0, 1, 0)).toBe(-1);
  });
});

describe("experimentRunListTitle", () => {
  it("prefers the note first line", () => {
    expect(
      experimentRunListTitle({
        notes: "Phase 1 — Full benchmark\nmore detail",
        command: "python3 benchmark.py",
      }),
    ).toBe("Phase 1 — Full benchmark");
  });

  it("falls back to script basename from the command", () => {
    expect(shortExperimentCommandTitle("python3 benchmark.py 2>&1")).toBe("benchmark.py");
    expect(
      shortExperimentCommandTitle(".venv/bin/python3 scripts/train.py --epochs 50"),
    ).toBe("train.py");
    expect(shortExperimentCommandTitle('python3 -c "print(1)"')).toBe("python3 -c");
  });
});
