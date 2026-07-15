/**
 * experiment-run executor — runs a shell command in the workspace experiment island,
 * appends run record to `.prismnext/experiments/<id>/runs.jsonl`.
 *
 * Two completion sinks (Sprint 0.7):
 *  - Bridge caller passes `resPath` (legacy file-bridge contract; unchanged).
 *  - UI IPC caller passes `onComplete(result)` (Sprint 0.7).
 *  - Both can be used at once; either is optional.
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { runAiCommand } from "./ai-pty";
import {
  appendRun,
  detectEnv,
  ensureExperimentPythonVenv,
  gateExperimentPythonExecution,
  generateRunId,
  workspaceIslandPathForId,
  type ExperimentStorageContext,
  type ExperimentVenvRunner,
} from "./experiment-log-service";
import { isPythonRelatedCommand } from "../../shared/experiment-log";
import type { ExperimentEnv, ExperimentRunEntry } from "../../shared/experiment-log";
import { stripAnsi } from "../../shared/experiment-log";
import { createLogger } from "./logger";
import { broadcastExperimentChanged } from "./experiment-ui-events";

const log = createLogger("experiment-run-executor", "agent");

/** Result reported via `onComplete` (UI track) and/or the bridge `.result.json` (agent track). */
export interface ExperimentRunResult {
  ok: boolean;
  /** Present when the run completed and was appended to runs.jsonl. */
  run?: ExperimentRunEntry;
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  /** Failure reason (validation, PTY error, timeout). */
  error?: string;
}

export interface KickoffExperimentRunArgs {
  ctx: ExperimentStorageContext;
  id: string;
  command: string;
  artifacts?: string[];
  notes?: string;
  /** Optional caller-supplied runId; if omitted, the executor generates one. */
  runId?: string;
  /** Legacy file-bridge completion sink — optional in Sprint 0.7. */
  resPath?: string;
  /** UI completion callback — fires after the run finishes (or fails). */
  onComplete?: (result: ExperimentRunResult) => void;
  /** Live PTY output chunks (UI stream). */
  onOutputChunk?: (chunk: string) => void;
  /**
   * OpenCode chat session that triggered the run (best-effort provenance link).
   * NOT the PTY session id built below - kept separate to avoid collision.
   */
  chatSessionId?: string | null;
  /** Default true — ensure shared Experiment workspace `.venv` before detect/run. */
  ensureVenv?: boolean;
  venvRunner?: ExperimentVenvRunner;
}

function detectIslandEnv(
  ctx: KickoffExperimentRunArgs["ctx"],
  island: string,
): ExperimentEnv {
  return detectEnv(island, {
    workspaceAbs: ctx.workspaceAbs,
    workspaceRel: ctx.workspaceRel,
  });
}

export function kickoffExperimentRun(args: KickoffExperimentRunArgs): void {
  const { ctx, id, command } = args;
  const island = workspaceIslandPathForId(ctx, id);

  if (!island || !existsSync(island)) {
    // Defer to nextTick so the caller (IPC handler) can return its immediate
    // response first; otherwise the sync callback would race the handler.
    queueMicrotask(() => reportResult(args, { ok: false, error: "experiment_not_found" }));
    return;
  }
  if (!command.trim()) {
    queueMicrotask(() => reportResult(args, { ok: false, error: "missing_command" }));
    return;
  }

  // Hard gate: Python under Experiment uses the shared workspace `.venv`.
  if (isPythonRelatedCommand(command) && args.ensureVenv !== false) {
    const gate = gateExperimentPythonExecution({
      projectRoot: ctx.projectRoot,
      cwd: island,
      command,
      ensureOpts: { runner: args.venvRunner },
    });
    if (gate.action === "block") {
      queueMicrotask(() => reportResult(args, { ok: false, error: gate.error }));
      return;
    }
    if (gate.action === "apply") {
      const env = detectIslandEnv(ctx, island);
      kickoffWithEnv(args, island, env, gate.envExtra);
      return;
    }
  } else if (args.ensureVenv !== false) {
    // Non-Python: best-effort ensure so later Python runs share the workspace venv.
    ensureExperimentPythonVenv(ctx.workspaceAbs, {
      runner: args.venvRunner,
      workspaceRel: ctx.workspaceRel,
    });
  }

  const env = detectIslandEnv(ctx, island);
  kickoffWithEnv(args, island, env, buildPythonEnvExtra(env));
}

function kickoffWithEnv(
  args: KickoffExperimentRunArgs,
  island: string,
  env: ExperimentEnv,
  envExtra: Record<string, string>,
): void {
  const { ctx, id, command } = args;
  const runId = args.runId ?? generateRunId();
  const startedAt = new Date().toISOString();
  const sessionId = `experiment:${id}:${runId}`;
  const cwd = island;
  const workspacePath = `${ctx.workspaceRel}/${id}`;

  // Defer PTY spawn so the IPC handler returns runId before output chunks
  // reach the renderer (avoids losing early chunks before runInFlight is set).
  setImmediate(() => {
    runAiCommand({
      command,
      cwd,
      sessionId,
      chatTabId: "experiment",
      requestId: runId,
      toolCallId: runId,
      envExtra,
      onChunk: (chunk) => {
        if (args.onOutputChunk) {
          try {
            args.onOutputChunk(stripAnsi(chunk));
          } catch {
            // ignore callback errors
          }
        }
      },
    })
      .then((ptyResult) => {
        const finishedAt = new Date().toISOString();
        const append = appendRun(ctx, id, {
          runId,
          startedAt,
          finishedAt,
          command,
          cwd: workspacePath,
          exitCode: ptyResult.exitCode,
          stdoutTail: ptyResult.output,
          stderrTail: "",
          artifacts: args.artifacts ?? [],
          env,
          notes: args.notes,
        }, { chatSessionId: args.chatSessionId ?? null });
        if (!append.ok) {
          reportResult(args, { ok: false, error: append.error });
          return;
        }
        const run: ExperimentRunEntry = append.run;
        reportResult(args, {
          ok: true,
          run,
          exitCode: run.exitCode,
          stdoutTail: run.stdoutTail,
          stderrTail: run.stderrTail,
        });
      })
      .catch((err: unknown) => {
        const finishedAt = new Date().toISOString();
        const message = err instanceof Error ? err.message : String(err);
        log.warn("experiment-run failed", { id, runId, error: message });
        const append = appendRun(ctx, id, {
          runId,
          startedAt,
          finishedAt,
          command,
          cwd: workspacePath,
          exitCode: 124,
          stdoutTail: message,
          stderrTail: "Prism experiment-run: command failed to execute.",
          artifacts: args.artifacts ?? [],
          env,
          notes: args.notes,
        }, { chatSessionId: args.chatSessionId ?? null });
        const run: ExperimentRunEntry | null = append.ok ? append.run : null;
        reportResult(args, {
          ok: false,
          error: message,
          run: run ?? undefined,
        });
      });
  });
}

function reportResult(args: KickoffExperimentRunArgs, data: ExperimentRunResult): void {
  if (args.resPath) {
    try {
      writeFileSync(args.resPath, JSON.stringify(data), "utf-8");
    } catch (err) {
      log.warn("experiment-run failed to write result", {
        resPath: args.resPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // Notify UI to refresh registry (Agent + Human UI share this path).
  broadcastExperimentChanged({
    projectRoot: args.ctx.projectRoot,
    id: args.id,
    reason: "run_complete",
  });
  if (args.onComplete) {
    try {
      args.onComplete(data);
    } catch (err) {
      log.warn("experiment-run onComplete callback threw", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Build PTY env vars so the run uses the detected python interpreter:
 *  - If `env.python` points at the shared Experiment workspace venv, prepend its
 *    `bin` dir to PATH (so `python` / `pip` resolve to the venv).
 *  - Set `VIRTUAL_ENV` to the venv root so `pip` / `python` / `uv pip` self-identify it.
 *  - Always set `PYTHONUNBUFFERED=1` for streaming output.
 *
 * When ensure failed and no venv is present, PATH is left alone (system python).
 */
export function buildPythonEnvExtra(env: ExperimentEnv): Record<string, string> {
  const extra: Record<string, string> = { PYTHONUNBUFFERED: "1" };
  if (env.python && env.venvPath) {
    // env.python is `<experiment-dir>/.venv/bin/python` (posix) or
    // `…/Scripts/python.exe` (windows). dirname gives the bin dir.
    const venvBin = dirname(env.python);
    const venvRoot = pathResolve(venvBin, "..");
    const currentPath = process.env.PATH ?? "";
    extra.PATH = currentPath ? `${venvBin}${pathDelimiter()}${currentPath}` : venvBin;
    extra.VIRTUAL_ENV = venvRoot;
  }
  return extra;
}

function pathDelimiter(): string {
  return process.platform === "win32" ? ";" : ":";
}

function runWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout();
      } catch {
        // ignore
      }
      reject(new Error(`Prism experiment-run: command timed out after ${ms}ms.`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
