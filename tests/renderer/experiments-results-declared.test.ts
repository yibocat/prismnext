import { describe, expect, it } from "vitest";
import { collectDeclaredArtifacts } from "../../src/renderer/modes/experiments-mode/experiments-results-panel";
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
