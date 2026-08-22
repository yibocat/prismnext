/**
 * experiment-tool-dispatch — append_run schema + worktree cwd + run interpreter.
 *
 * Direct dispatch (no request.json).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => "/tmp/prism-experiment-tool-dispatch-test" },
}));

import {
  dispatchExperimentLog,
  executeExperimentAction,
  type ExperimentToolRequest,
} from "../../src/main/experiment/experiment-tool-dispatch";
import {
  buildExperimentStorageContext,
  createExperiment,
} from "../../src/main/experiment/facade";
import * as experimentRunExecutor from "../../src/main/experiment/experiment-run-executor";
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

function appendReq(
  projectRoot: string,
  sessionId: string,
  expId: string,
  run: NonNullable<ExperimentToolRequest["run"]>,
): ExperimentToolRequest {
  return {
    tool: "experiment-log",
    sessionId,
    projectRoot,
    action: "append_run",
    id: expId,
    run,
  };
}

describe("experiment-tool-dispatch append_run schema validation (Bug #3)", () => {
  let root: string;
  let sessionId: string;
  let projectRoot: string;
  let expId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-dispatch-append-"));
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
  });

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("accepts a well-formed append_run and writes the line to runs.jsonl", () => {
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const result = dispatchExperimentLog(
      appendReq(projectRoot, sessionId, expId, {
        command: "python train.py --lr 0.001",
        exitCode: 0,
        startedAt: "2026-07-15T10:00:00.000Z",
        finishedAt: "2026-07-15T10:00:30.000Z",
        artifacts: ["results/loss.png"],
        notes: "baseline run",
        kind: "train",
      }),
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.run).toBeDefined();
    expect((result.run as { kind?: string }).kind).toBe("train");
  });

  it("rejects append_run with invalid kind", () => {
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const result = dispatchExperimentLog(
      appendReq(projectRoot, sessionId, expId, {
        command: "echo hi",
        exitCode: 0,
        kind: "training",
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_kind");
  });

  it("rejects append_run with empty command (the one non-negotiable field)", () => {
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const result = dispatchExperimentLog(
      appendReq(projectRoot, sessionId, expId, {
        command: "",
        exitCode: 0,
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_command");
  });

  it("rejects append_run with non-integer exitCode (LLM hallucinated 'success')", () => {
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const result = dispatchExperimentLog(
      appendReq(projectRoot, sessionId, expId, {
        command: "echo hi",
        exitCode: "success" as unknown as number,
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_exitCode");
  });

  it("rejects append_run with non-ISO startedAt (LLM backdating)", () => {
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const result = dispatchExperimentLog(
      appendReq(projectRoot, sessionId, expId, {
        command: "echo hi",
        startedAt: "yesterday",
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_startedAt");
  });

  it("rejects append_run with finishedAt before startedAt", () => {
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const result = dispatchExperimentLog(
      appendReq(projectRoot, sessionId, expId, {
        command: "echo hi",
        startedAt: "2026-07-15T10:00:30.000Z",
        finishedAt: "2026-07-15T10:00:00.000Z",
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_timestamps");
  });

  it("rejects append_run with non-string artifacts (would crash figure linking)", () => {
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const result = dispatchExperimentLog(
      appendReq(projectRoot, sessionId, expId, {
        command: "echo hi",
        artifacts: [1, 2] as unknown as string[],
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_artifacts");
  });

  it("rejects append_run with array-shaped env object", () => {
    const ctx = buildExperimentStorageContext(projectRoot, "experiment");
    const result = dispatchExperimentLog(
      appendReq(projectRoot, sessionId, expId, {
        command: "echo hi",
        env: ["conda"] as unknown as Record<string, unknown>,
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_run_env");
  });
});

describe("experiment-tool-dispatch worktree projectRoot preference (Bug #9)", () => {
  let root: string;
  let sessionId: string;
  let mainRoot: string;
  let worktreeRoot: string;
  let expId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-dispatch-wt-"));
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
    const ctx = buildExperimentStorageContext(worktreeRoot, "experiment");
    const created = createExperiment(ctx, { title: "WT only" }, { ensureVenv: false });
    if (!created.ok) throw new Error("setup createExperiment failed");
    expId = created.id;
    sessionId = `test-wt-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    _resetChatSessionRegistryForTests();
    registerChatSession(sessionId, "tab-wt", mainRoot);
  });

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    _resetChatSessionRegistryForTests();
  });

  it("uses tool projectRoot (worktree) even when session root is main", () => {
    const result = executeExperimentAction({
      tool: "experiment-log",
      sessionId,
      projectRoot: worktreeRoot,
      action: "read",
      id: expId,
    });
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    expect((result!.meta as { id?: string } | undefined)?.id).toBe(expId);
  });
});

describe("experiment-tool-dispatch experiment-run interpreter", () => {
  let root: string;
  let sessionId: string;
  let projectRoot: string;
  let expId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-dispatch-run-"));
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
  });

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("passes interpreter=external + pythonPath through to kickoffExperimentRun", () => {
    const executorSpy = vi.spyOn(experimentRunExecutor, "kickoffExperimentRun").mockImplementation(() => {});

    try {
      const result = executeExperimentAction({
        tool: "experiment-run",
        sessionId,
        projectRoot,
        action: "run",
        id: expId,
        command: "sage -python train.py",
        interpreter: "external",
        pythonPath: "sage",
      });
      expect(result).toBeNull();
      expect(executorSpy).toHaveBeenCalledTimes(1);
      expect(executorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expId,
          command: "sage -python train.py",
          interpreter: "external",
          pythonPath: "sage",
        }),
      );
    } finally {
      executorSpy.mockRestore();
    }
  });

  it("rejects interpreter=external without pythonPath (missing_python_path, no kickoff)", () => {
    const executorSpy = vi.spyOn(experimentRunExecutor, "kickoffExperimentRun");
    try {
      const result = executeExperimentAction({
        tool: "experiment-run",
        sessionId,
        projectRoot,
        action: "run",
        id: expId,
        command: "true",
        interpreter: "external",
      });
      expect(executorSpy).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        ok: false,
        error: "missing_python_path",
      });
    } finally {
      executorSpy.mockRestore();
    }
  });

  it("rejects an unknown interpreter value (invalid_interpreter, no kickoff)", () => {
    const executorSpy = vi.spyOn(experimentRunExecutor, "kickoffExperimentRun");
    try {
      const result = executeExperimentAction({
        tool: "experiment-run",
        sessionId,
        projectRoot,
        action: "run",
        id: expId,
        command: "true",
        interpreter: "conda",
      });
      expect(executorSpy).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        ok: false,
        error: "invalid_interpreter",
      });
    } finally {
      executorSpy.mockRestore();
    }
  });
});
