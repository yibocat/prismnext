import { describe, expect, it } from "vitest";
import {
  experimentRunFigurePaths,
  formatExperimentRunAgentContext,
} from "../../src/renderer/lib/chat/experiment-run-paper-context";

describe("experimentRunFigurePaths", () => {
  it("keeps only image artifacts as project-relative paths", () => {
    const paths = experimentRunFigurePaths({
      runId: "run-1",
      command: "python plot.py",
      exitCode: 0,
      startedAt: "2026-07-07T12:00:00.000Z",
      finishedAt: "2026-07-07T12:00:05.000Z",
      workspacePath: "experiment/exp-test",
      artifacts: ["results/loss.png", "metrics.csv", "fig.jpg"],
    });
    expect(paths).toEqual([
      "experiment/exp-test/results/loss.png",
      "experiment/exp-test/fig.jpg",
    ]);
  });
});

describe("formatExperimentRunAgentContext", () => {
  const base = {
    runId: "run-20260707-120000-a1b2",
    label: "cite:run-20260707-120000",
    experimentId: "exp-test",
    command: "python train.py --lr 0.001",
    exitCode: 0,
    startedAt: "2026-07-07T12:00:00.000Z",
    finishedAt: "2026-07-07T12:00:05.000Z",
    workspacePath: "experiment/exp-test",
    artifacts: ["results/loss.png", "metrics.csv"],
    env: {
      python: "/usr/bin/python3",
      pythonVersion: "3.12",
      platform: "darwin",
      gitCommit: "abc1234",
    },
  };

  it("discuss intent omits paper reverse-link scaffolding", () => {
    const text = formatExperimentRunAgentContext({ ...base, intent: "discuss" });
    expect(text).toContain("experiment-run: cite:run-20260707-120000");
    expect(text).toContain("`python train.py --lr 0.001`");
    expect(text).not.toContain("Paper reverse-link");
    expect(text).not.toContain("![loss.png]");
  });

  it("cite-in-paper adds Methods instructions and markdown figure embeds", () => {
    const text = formatExperimentRunAgentContext({
      ...base,
      intent: "cite-in-paper",
      logPath: "logs/run-20260707-120000-a1b2.log",
    });
    expect(text).toContain("Paper reverse-link");
    expect(text).toContain("Draft a Methods sentence");
    expect(text).toContain("![loss.png](experiment/exp-test/results/loss.png)");
    expect(text).toContain("fullLog: experiment/exp-test/logs/run-20260707-120000-a1b2.log");
    expect(text).not.toContain("![metrics.csv]");
  });
});
