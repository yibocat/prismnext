/**
 * experiment-log-bridge — dispatch() schema validation tests.
 *
 * Covers the append_run input validation added in
 * docs-private/audit/experiment-agent-architecture-analysis.md Bug #3. The
 * bridge is the LLM-facing entry point for `experiment-log
 * action=append_run`, so it must reject records that would corrupt
 * runs.jsonl (a paper-trace file) — hallucinated `exitCode: 0`,
 * backdated timestamps, non-string artifacts, missing `command`, etc.
 *
 * We test the pure `dispatch` path by writing request files and
 * inspecting the result files written by the bridge's poll loop —
 * this matches the production contract end-to-end without requiring
 * the full bridge ticker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => "/tmp/prism-experiment-log-bridge-test" },
}));

import {
  processExperimentLogBridgeOnceForTests,
  stopExperimentLogBridge,
} from "../../src/main/services/experiment-log-bridge";
import { getExperimentLogBridgeRoot } from "../../src/main/services/prism-bridge-paths";
import {
  buildExperimentStorageContext,
  createExperiment,
} from "../../src/main/services/experiment-log-service";
import * as experimentRunExecutor from "../../src/main/services/experiment-run-executor";
import {
  registerChatSession,
  _resetChatSessionRegistryForTests,
} from "../../src/main/services/chat-session-registry";

function writeWorkspaceSettings(projectRoot: string, workspaceDirs: unknown[]): void {
  const metaDir = join(projectRoot, ".workbench");
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(
    join(metaDir, "workbench.json"),
    JSON.stringify({ id: "p_test", workspace: { folders: workspaceDirs } }),
    "utf-8",
  );
}

function clearBridgeSession(sessionId: string): void {
  const dir = join(getExperimentLogBridgeRoot(), sessionId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

function writeBridgeRequest(
  sessionId: string,
  requestId: string,
  payload: Record<string, unknown>,
): { reqPath: string; resPath: string } {
  const root = getExperimentLogBridgeRoot();
  const dir = join(root, sessionId);
  mkdirSync(dir, { recursive: true });
  const reqPath = join(dir, `${requestId}.request.json`);
  const resPath = join(dir, `${requestId}.result.json`);
  // Stale result from a prior run with the same ids would skip dispatch.
  if (existsSync(resPath)) rmSync(resPath, { force: true });
  if (existsSync(reqPath)) rmSync(reqPath, { force: true });
  writeFileSync(reqPath, JSON.stringify(payload, null, 2), "utf-8");
  return { reqPath, resPath };
}

function readResult(resPath: string): Record<string, unknown> {
  if (!existsSync(resPath)) {
    throw new Error(`Result file missing: ${resPath}`);
  }
  return JSON.parse(readFileSync(resPath, "utf-8")) as Record<string, unknown>;
}

describe("experiment-log-bridge append_run schema validation (Bug #3)", () => {
  let root: string;
  let sessionId: string;
  let projectRoot: string;
  let expId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-bridge-append-"));
    projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    writeWorkspaceSettings(projectRoot, [
      { name: "experiment", function: "experiment", path: "experiment" },
    ]);
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const created = createExperiment(ctx, { title: "Schema" });
    if (!created.ok) throw new Error("setup createExperiment failed");
    expId = created.id;
    sessionId = `test-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    clearBridgeSession(sessionId);
  });

  afterEach(() => {
    if (sessionId) clearBridgeSession(sessionId);
    if (root) rmSync(root, { recursive: true, force: true });
    stopExperimentLogBridge();
  });

  it("accepts a well-formed append_run and writes the line to runs.jsonl", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "ok-1", {
      tool: "experiment-log",
      sessionId,
      projectRoot,
      action: "append_run",
      id: expId,
      run: {
        command: "python train.py --lr 0.001",
        exitCode: 0,
        startedAt: "2026-07-15T10:00:00.000Z",
        finishedAt: "2026-07-15T10:00:30.000Z",
        artifacts: ["results/loss.png"],
        notes: "baseline run",
        kind: "train",
      },
    });
    await processExperimentLogBridgeOnceForTests();
    const result = readResult(resPath);
    expect(result.ok).toBe(true);
    expect(result.run).toBeDefined();
    expect((result.run as { kind?: string }).kind).toBe("train");
  });

  it("rejects append_run with invalid kind", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "bad-kind", {
      tool: "experiment-log",
      sessionId,
      projectRoot,
      action: "append_run",
      id: expId,
      run: { command: "echo hi", exitCode: 0, kind: "training" },
    });
    await processExperimentLogBridgeOnceForTests();
    const result = readResult(resPath);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_kind");
  });

  it("rejects append_run with empty command (the one non-negotiable field)", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "bad-cmd", {
      tool: "experiment-log",
      sessionId,
      projectRoot,
      action: "append_run",
      id: expId,
      run: { command: "   ", exitCode: 0 },
    });
    await processExperimentLogBridgeOnceForTests();
    const result = readResult(resPath);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_command");
    expect(String(result.hint)).toMatch(/non-empty string/);
  });

  it("rejects append_run with non-integer exitCode (LLM hallucinated 'success')", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "bad-exit", {
      tool: "experiment-log",
      sessionId,
      projectRoot,
      action: "append_run",
      id: expId,
      run: { command: "ls", exitCode: "0" },
    });
    await processExperimentLogBridgeOnceForTests();
    const result = readResult(resPath);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_exitCode");
  });

  it("rejects append_run with non-ISO startedAt (LLM backdating)", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "bad-date", {
      tool: "experiment-log",
      sessionId,
      projectRoot,
      action: "append_run",
      id: expId,
      run: {
        command: "ls",
        exitCode: 0,
        startedAt: "yesterday",
        finishedAt: "today",
      },
    });
    await processExperimentLogBridgeOnceForTests();
    const result = readResult(resPath);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_startedAt");
  });

  it("rejects append_run with finishedAt before startedAt", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "neg-dur", {
      tool: "experiment-log",
      sessionId,
      projectRoot,
      action: "append_run",
      id: expId,
      run: {
        command: "ls",
        exitCode: 0,
        startedAt: "2026-07-15T10:00:30.000Z",
        finishedAt: "2026-07-15T10:00:00.000Z",
      },
    });
    await processExperimentLogBridgeOnceForTests();
    const result = readResult(resPath);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_timestamps");
  });

  it("rejects append_run with non-string artifacts (would crash figure linking)", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "bad-art", {
      tool: "experiment-log",
      sessionId,
      projectRoot,
      action: "append_run",
      id: expId,
      run: { command: "ls", exitCode: 0, artifacts: ["ok.png", 42, null] },
    });
    await processExperimentLogBridgeOnceForTests();
    const result = readResult(resPath);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_artifacts");
  });

  it("rejects append_run with array-shaped env object", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "bad-env", {
      tool: "experiment-log",
      sessionId,
      projectRoot,
      action: "append_run",
      id: expId,
      run: { command: "ls", exitCode: 0, env: ["not", "an", "object"] },
    });
    await processExperimentLogBridgeOnceForTests();
    const result = readResult(resPath);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_env");
  });
});

describe("experiment-log-bridge worktree projectRoot preference (Bug #9)", () => {
  let root: string;
  let sessionId: string;
  let mainRoot: string;
  let worktreeRoot: string;
  let expId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-bridge-wt-"));
    mainRoot = join(root, "main");
    worktreeRoot = join(root, "worktree");
    mkdirSync(mainRoot, { recursive: true });
    mkdirSync(worktreeRoot, { recursive: true });
    writeWorkspaceSettings(mainRoot, [
      { name: "experiment", function: "experiment", path: "experiment" },
    ]);
    writeWorkspaceSettings(worktreeRoot, [
      { name: "experiment", function: "experiment", path: "experiment" },
    ]);
    // Experiment exists only under the worktree checkout.
    const ctx = buildExperimentStorageContext(worktreeRoot, "experiment");
    const created = createExperiment(ctx, { title: "WT only" }, { ensureVenv: false });
    if (!created.ok) throw new Error("setup createExperiment failed");
    expId = created.id;
    sessionId = `test-wt-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    clearBridgeSession(sessionId);

    _resetChatSessionRegistryForTests();
    // Session registry stores canonical main — previously won over tool directory.
    registerChatSession(sessionId, "tab-wt", mainRoot);
  });

  afterEach(() => {
    if (sessionId) clearBridgeSession(sessionId);
    if (root) rmSync(root, { recursive: true, force: true });
    stopExperimentLogBridge();
    _resetChatSessionRegistryForTests();
  });

  it("uses tool projectRoot (worktree) even when session root is main", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "wt-read", {
      tool: "experiment-log",
      sessionId,
      projectRoot: worktreeRoot,
      action: "read",
      id: expId,
    });
    await processExperimentLogBridgeOnceForTests();
    const result = readResult(resPath);
    expect(result.ok).toBe(true);
    expect((result.meta as { id?: string } | undefined)?.id).toBe(expId);
  });
});

describe("experiment-log-bridge experiment-run request lifecycle (Bug #1)", () => {
  let root: string;
  let sessionId: string;
  let projectRoot: string;
  let expId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-bridge-run-"));
    projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    writeWorkspaceSettings(projectRoot, [
      { name: "experiment", function: "experiment", path: "experiment" },
    ]);
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const created = createExperiment(ctx, { title: "Run lifecycle" });
    if (!created.ok) throw new Error("setup createExperiment failed");
    expId = created.id;
    sessionId = `test-run-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    clearBridgeSession(sessionId);
  });

  afterEach(() => {
    if (sessionId) clearBridgeSession(sessionId);
    if (root) rmSync(root, { recursive: true, force: true });
    stopExperimentLogBridge();
  });

  it("unlinks claiming hold in the post-pass once resPath appears (Bug #1 / #30)", async () => {
    const { reqPath, resPath } = writeBridgeRequest(sessionId, "run-1", {
      tool: "experiment-run",
      sessionId,
      projectRoot,
      action: "run",
      id: expId,
      command: "true",
    });
    const claimPath = reqPath.replace(/\.request\.json$/, ".claiming");

    // Patch the executor so we don't actually spawn a PTY in this test —
    // we only care about the bridge's request file lifecycle. The mock
    // writes the resPath on the next event-loop tick (setImmediate),
    // which the bridge's post-pass will then observe and unlink .claiming.
    const executorSpy = vi
      .spyOn(experimentRunExecutor, "kickoffExperimentRun")
      .mockImplementation(() => {
        setImmediate(() => {
          writeFileSync(resPath, JSON.stringify({ ok: true, exitCode: 0 }), "utf-8");
        });
      });

    try {
      // First poll: atomic rename request → claiming, then kickoff.
      await processExperimentLogBridgeOnceForTests();
      expect(existsSync(reqPath)).toBe(false);
      expect(existsSync(claimPath)).toBe(true);
      // Yield past the mock's setImmediate before the post-pass poll.
      await new Promise((r) => setImmediate(r));
      // Second poll: post-pass sees resPath → unlinks .claiming.
      await processExperimentLogBridgeOnceForTests();
      expect(existsSync(claimPath)).toBe(false);
      expect(existsSync(resPath)).toBe(true);
    } finally {
      executorSpy.mockRestore();
    }
  });

  it("does not re-kickoff while an async run is still in flight", async () => {
    const { reqPath, resPath } = writeBridgeRequest(sessionId, "run-inflight", {
      tool: "experiment-run",
      sessionId,
      projectRoot,
      action: "run",
      id: expId,
      command: "sleep 999",
    });
    const claimPath = reqPath.replace(/\.request\.json$/, ".claiming");

    let kickoffs = 0;
    const executorSpy = vi
      .spyOn(experimentRunExecutor, "kickoffExperimentRun")
      .mockImplementation(() => {
        kickoffs += 1;
        // Intentionally do NOT write resPath yet — simulate a long training run.
      });

    try {
      await processExperimentLogBridgeOnceForTests();
      await processExperimentLogBridgeOnceForTests();
      await processExperimentLogBridgeOnceForTests();
      expect(kickoffs).toBe(1);
      expect(existsSync(reqPath)).toBe(false);
      expect(existsSync(claimPath)).toBe(true);
      expect(existsSync(resPath)).toBe(false);

      writeFileSync(resPath, JSON.stringify({ ok: true, exitCode: 0 }), "utf-8");
      await processExperimentLogBridgeOnceForTests();
      expect(existsSync(claimPath)).toBe(false);
      // A new request after completion may kick off again — not this one.
      expect(kickoffs).toBe(1);
    } finally {
      executorSpy.mockRestore();
    }
  });

  it("resumes orphan .claiming after processing set is cleared (Bug #30)", async () => {
    const { reqPath, resPath } = writeBridgeRequest(sessionId, "run-orphan", {
      tool: "experiment-run",
      sessionId,
      projectRoot,
      action: "run",
      id: expId,
      command: "true",
    });
    const claimPath = reqPath.replace(/\.request\.json$/, ".claiming");
    // Simulate crash after rename but before/without in-memory slot.
    const { renameSync } = await import("node:fs");
    renameSync(reqPath, claimPath);
    stopExperimentLogBridge(); // clears processingRequests

    let kickoffs = 0;
    const executorSpy = vi
      .spyOn(experimentRunExecutor, "kickoffExperimentRun")
      .mockImplementation(() => {
        kickoffs += 1;
        writeFileSync(resPath, JSON.stringify({ ok: true, exitCode: 0 }), "utf-8");
      });

    try {
      await processExperimentLogBridgeOnceForTests();
      expect(kickoffs).toBe(1);
      expect(existsSync(claimPath)).toBe(false);
      expect(existsSync(resPath)).toBe(true);
    } finally {
      executorSpy.mockRestore();
    }
  });

  it("passes interpreter=external + pythonPath through to kickoffExperimentRun", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "run-external", {
      tool: "experiment-run",
      sessionId,
      projectRoot,
      action: "run",
      id: expId,
      command: "sage -python train.py",
      interpreter: "external",
      pythonPath: "sage",
    });

    const executorSpy = vi
      .spyOn(experimentRunExecutor, "kickoffExperimentRun")
      .mockImplementation(() => {
        setImmediate(() => {
          writeFileSync(resPath, JSON.stringify({ ok: true, exitCode: 0 }), "utf-8");
        });
      });

    try {
      await processExperimentLogBridgeOnceForTests();
      expect(executorSpy).toHaveBeenCalledTimes(1);
      expect(executorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expId,
          command: "sage -python train.py",
          interpreter: "external",
          pythonPath: "sage",
        }),
      );
      await new Promise((r) => setImmediate(r));
      await processExperimentLogBridgeOnceForTests();
      expect(readResult(resPath)).toMatchObject({ ok: true, exitCode: 0 });
    } finally {
      executorSpy.mockRestore();
    }
  });

  it("rejects interpreter=external without pythonPath (missing_python_path, no kickoff)", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "run-external-missing", {
      tool: "experiment-run",
      sessionId,
      projectRoot,
      action: "run",
      id: expId,
      command: "true",
      interpreter: "external",
    });

    const executorSpy = vi.spyOn(experimentRunExecutor, "kickoffExperimentRun");

    try {
      await processExperimentLogBridgeOnceForTests();
      expect(executorSpy).not.toHaveBeenCalled();
      expect(readResult(resPath)).toMatchObject({
        ok: false,
        error: "missing_python_path",
      });
    } finally {
      executorSpy.mockRestore();
    }
  });

  it("rejects an unknown interpreter value (invalid_interpreter, no kickoff)", async () => {
    const { resPath } = writeBridgeRequest(sessionId, "run-external-bogus", {
      tool: "experiment-run",
      sessionId,
      projectRoot,
      action: "run",
      id: expId,
      command: "true",
      interpreter: "conda",
    });

    const executorSpy = vi.spyOn(experimentRunExecutor, "kickoffExperimentRun");

    try {
      await processExperimentLogBridgeOnceForTests();
      expect(executorSpy).not.toHaveBeenCalled();
      expect(readResult(resPath)).toMatchObject({
        ok: false,
        error: "invalid_interpreter",
      });
    } finally {
      executorSpy.mockRestore();
    }
  });
});
