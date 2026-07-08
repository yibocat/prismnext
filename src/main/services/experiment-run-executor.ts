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
import { runAiCommand, cancelAiCommandForSession } from "./ai-pty";
import {
  appendRun,
  detectEnv,
  generateRunId,
  workspaceIslandPathForId,
  type ExperimentStorageContext,
} from "./experiment-log-service";
import type { ExperimentEnv, ExperimentRunEntry } from "../../shared/experiment-log";
import { createLogger } from "./logger";

const log = createLogger("experiment-run-executor", "agent");
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

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
}

export function kickoffExperimentRun(args: KickoffExperimentRunArgs): void {
  const { ctx, id, command, resPath, onComplete } = args;
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

  const env: ExperimentEnv = detectEnv(island);
  const runId = args.runId ?? generateRunId();
  const startedAt = new Date().toISOString();
  const sessionId = `experiment:${id}:${runId}`;
  const cwd = island;
  const workspacePath = `${ctx.workspaceRel}/${id}`;

  runWithTimeout(
    runAiCommand({
      command,
      cwd,
      sessionId,
      chatTabId: "experiment",
      requestId: runId,
      toolCallId: runId,
      onChunk: () => {},
    }),
    RUN_TIMEOUT_MS,
    () => cancelAiCommandForSession(sessionId),
  )
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
      });
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
        stderrTail: "Prism experiment-run: command failed or timed out.",
        artifacts: args.artifacts ?? [],
        env,
        notes: args.notes,
      });
      const run: ExperimentRunEntry | null = append.ok ? append.run : null;
      reportResult(args, {
        ok: false,
        error: message,
        run: run ?? undefined,
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
