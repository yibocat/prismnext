/**
 * experiment-run executor — runs a shell command in the workspace experiment island,
 * appends run record to `.prismnext/experiments/<id>/runs.jsonl`.
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

export interface KickoffExperimentRunArgs {
  ctx: ExperimentStorageContext;
  id: string;
  command: string;
  artifacts?: string[];
  notes?: string;
  resPath: string;
}

export function kickoffExperimentRun(args: KickoffExperimentRunArgs): void {
  const { ctx, id, command, resPath } = args;
  const island = workspaceIslandPathForId(ctx, id);

  if (!island || !existsSync(island)) {
    writeResult(resPath, { ok: false, error: "experiment_not_found" });
    return;
  }
  if (!command.trim()) {
    writeResult(resPath, { ok: false, error: "missing_command" });
    return;
  }

  const env: ExperimentEnv = detectEnv(island);
  const runId = generateRunId();
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
        writeResult(resPath, { ok: false, error: append.error });
        return;
      }
      const run: ExperimentRunEntry = append.run;
      writeResult(resPath, {
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
      writeResult(resPath, {
        ok: false,
        error: message,
        run,
      });
    });
}

function writeResult(resPath: string, data: Record<string, unknown>): void {
  try {
    writeFileSync(resPath, JSON.stringify(data), "utf-8");
  } catch (err) {
    log.warn("experiment-run failed to write result", {
      resPath,
      error: err instanceof Error ? err.message : String(err),
    });
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
