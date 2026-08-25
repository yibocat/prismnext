import { describe, expect, it } from "vitest";
import {
  PROVENANCE_SCHEMA_VERSION,
  isProvenanceArtifactLinked,
  isProvenanceDownloadRecorded,
  isProvenanceRunRecorded,
  normalizeArtifactPath,
  type ProvenanceRunRecorded,
} from "../../src/shared/experiments/provenance";

describe("provenance types", () => {
  it("recognizes run_recorded events", () => {
    const event: ProvenanceRunRecorded = {
      id: "prov_test",
      schemaVersion: PROVENANCE_SCHEMA_VERSION,
      type: "run_recorded",
      at: "2026-07-11T12:00:00.000Z",
      workspaceRel: "experiment",
      chatSessionId: "ses_abc",
      gitBranch: "main",
      gitCommit: "abc1234",
      experimentId: "exp-20260711-test-a1b2",
      runId: "run_20260711_120000_x1",
      command: "python scripts/train.py",
      cwd: "experiment/exp-20260711-test-a1b2",
      exitCode: 0,
      startedAt: "2026-07-11T12:00:00.000Z",
      finishedAt: "2026-07-11T12:00:05.000Z",
      env: { python: "/usr/bin/python3", pythonVersion: "3.12", platform: "darwin", gitCommit: "abc1234" },
      artifacts: ["experiment/exp-20260711-test-a1b2/results/plot.png"],
      stdoutTailBytes: 0,
      stderrTailBytes: 0,
    };
    expect(isProvenanceRunRecorded(event)).toBe(true);
    expect(isProvenanceArtifactLinked(event)).toBe(false);
    expect(isProvenanceDownloadRecorded(event)).toBe(false);
  });

  it("exposes the schema version constant", () => {
    expect(PROVENANCE_SCHEMA_VERSION).toBe(1);
  });

  it("normalizes artifact paths (backslash + leading ./)", () => {
    expect(normalizeArtifactPath("experiment\\exp-x\\plot.png")).toBe("experiment/exp-x/plot.png");
    expect(normalizeArtifactPath("./experiment/exp-x/plot.png")).toBe("experiment/exp-x/plot.png");
    expect(normalizeArtifactPath("experiment/exp-x/plot.png")).toBe("experiment/exp-x/plot.png");
  });
});
