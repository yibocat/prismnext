import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => "/tmp/prism-provenance-bridge-test" },
}));

import {
  dispatchProvenanceQuery,
  type ExperimentLogBridgeRequest,
} from "../../src/main/services/experiment-log-bridge";
import { recordRunProvenance } from "../../src/main/services/provenance-service";
import type { ExperimentRunEntry } from "../../src/shared/experiment-log";

function makeRun(): ExperimentRunEntry {
  return {
    runId: "run_1",
    startedAt: "2026-07-11T12:00:00.000Z",
    finishedAt: "2026-07-11T12:00:05.000Z",
    command: "python train.py",
    cwd: "experiment/exp-test",
    exitCode: 0,
    stdoutTail: "ok",
    stderrTail: "",
    artifacts: ["experiment/exp-test/plot.png"],
    env: {
      python: "/usr/bin/python3",
      pythonVersion: "3.12",
      rscript: null,
      rVersion: null,
      platform: "darwin",
      gitCommit: "abc1234",
      venvPath: null,
    },
  };
}

function req(partial: Partial<ExperimentLogBridgeRequest>): ExperimentLogBridgeRequest {
  return { tool: "provenance-query", action: "", ...partial } as ExperimentLogBridgeRequest;
}

describe("dispatchProvenanceQuery (experiment -> agent loop)", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "prism-provq-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("resolve_artifact traces a file to its run", () => {
    recordRunProvenance(projectRoot, {
      workspaceRel: "experiment",
      experimentId: "exp-test",
      run: makeRun(),
      chatSessionId: "ses_x",
    });
    const result = dispatchProvenanceQuery(
      req({ action: "resolve_artifact", artifactPath: "experiment/exp-test/plot.png" }),
      projectRoot,
    );
    expect(result.ok).toBe(true);
    expect(result.found).toBe(true);
    expect((result.resolved as { run: { command: string } }).run.command).toBe("python train.py");
  });

  it("resolve_artifact returns found:false for an unlinked file (honest empty)", () => {
    const result = dispatchProvenanceQuery(
      req({ action: "resolve_artifact", artifactPath: "experiment/exp-test/unknown.png" }),
      projectRoot,
    );
    expect(result.ok).toBe(true);
    expect(result.found).toBe(false);
    expect(result.resolved).toBeNull();
  });

  it("resolve_artifact errors on missing artifactPath", () => {
    const result = dispatchProvenanceQuery(req({ action: "resolve_artifact" }), projectRoot);
    expect(result.ok).toBe(false);
  });

  it("resolve_run fetches a run_recorded event by id", () => {
    recordRunProvenance(projectRoot, {
      workspaceRel: "experiment",
      experimentId: "exp-test",
      run: makeRun(),
    });
    const result = dispatchProvenanceQuery(req({ action: "resolve_run", runId: "run_1" }), projectRoot);
    expect(result.ok).toBe(true);
    expect((result.run as { command: string }).command).toBe("python train.py");
  });

  it("resolve_run returns null for an unknown runId", () => {
    const result = dispatchProvenanceQuery(req({ action: "resolve_run", runId: "nope" }), projectRoot);
    expect(result.ok).toBe(true);
    expect(result.run).toBeNull();
  });

  it("list_recent returns the most recent events", () => {
    recordRunProvenance(projectRoot, {
      workspaceRel: "experiment",
      experimentId: "exp-test",
      run: makeRun(),
    });
    const result = dispatchProvenanceQuery(req({ action: "list_recent", limit: 5 }), projectRoot);
    expect(result.ok).toBe(true);
    const events = result.events as unknown[];
    // run_recorded + 1 artifact_linked = 2 events
    expect(events.length).toBe(2);
  });

  it("list_recent errors on unknown action", () => {
    const result = dispatchProvenanceQuery(req({ action: "bogus" }), projectRoot);
    expect(result.ok).toBe(false);
  });
});
