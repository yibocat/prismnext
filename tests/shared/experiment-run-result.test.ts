import { describe, expect, it } from "vitest";
import type {
  ExperimentRunCompleteEvent,
  ExperimentRunEntry,
  ExperimentRunResult,
} from "../../src/shared/experiment-log";

describe("ExperimentRunResult (shared)", () => {
  it("accepts the executor / IPC / store payload shape", () => {
    const run = {
      runId: "run-1",
      startedAt: "2026-07-16T00:00:00Z",
      finishedAt: "2026-07-16T00:00:01Z",
      command: "echo hi",
      cwd: "experiment/exp-a",
      exitCode: 0,
      stdoutTail: "hi\n",
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
    } satisfies ExperimentRunEntry;

    const result: ExperimentRunResult = {
      ok: true,
      run,
      exitCode: 0,
      stdoutTail: "hi\n",
      stderrTail: "",
    };

    const event: ExperimentRunCompleteEvent = {
      id: "exp-a",
      runId: "run-1",
      result,
    };

    expect(event.result.run?.runId).toBe("run-1");
    expect(event.result.ok).toBe(true);
  });
});
