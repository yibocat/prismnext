/**
 * experiment-run executor — runs a shell command in the workspace experiment island,
 * appends run record to `.prismnext/experiments/<id>/runs.jsonl`.
 *
 * Two completion sinks (Sprint 0.7):
 *  - Bridge caller passes `resPath` (legacy file-bridge contract; unchanged).
 *  - UI IPC caller passes `onComplete(result)` (Sprint 0.7).
 *  - Both can be used at once; either is optional.
 */
import { existsSync, mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { tmpdir } from "node:os";
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
import {
  isPythonRelatedCommand,
  parseExperimentRunKind,
  RUN_OUTPUT_TAIL_BYTES,
  stripAnsi,
  type ExperimentEnv,
  type ExperimentRunEntry,
  type ExperimentRunKind,
  type ExperimentRunResult,
} from "../../shared/experiment-log";
import { createLogger } from "./logger";
import { broadcastExperimentChanged } from "./experiment-ui-events";

const log = createLogger("experiment-run-executor", "agent");

/** Re-export shared completion payload (UI track + bridge `.result.json`). */
export type { ExperimentRunResult };

/** Runs the human cancelled before natural PTY exit (Bug #21). Cleared on append. */
const cancelledRunKeys = new Set<string>();

function cancelledKey(experimentId: string, runId: string): string {
  return `${experimentId}\0${runId}`;
}

/** Mark a kickoff'd run as user-cancelled (call from IPC before killing the PTY). */
export function markExperimentRunCancelled(experimentId: string, runId: string): void {
  const id = experimentId.trim();
  const rid = runId.trim();
  if (!id || !rid) return;
  cancelledRunKeys.add(cancelledKey(id, rid));
}

function consumeExperimentRunCancelled(experimentId: string, runId: string): boolean {
  const key = cancelledKey(experimentId, runId);
  if (!cancelledRunKeys.has(key)) return false;
  cancelledRunKeys.delete(key);
  return true;
}

function notesForCancel(notes: string | undefined, cancelled: boolean): string | undefined {
  if (!cancelled) return notes;
  const tag = "Cancelled by user";
  const trimmed = notes?.trim();
  if (!trimmed) return tag;
  if (trimmed.includes(tag)) return trimmed;
  return `${tag}. ${trimmed}`;
}

/** @internal */
export function _resetExperimentRunCancelledForTests(): void {
  cancelledRunKeys.clear();
}

/** @internal */
export function _consumeExperimentRunCancelledForTests(
  experimentId: string,
  runId: string,
): boolean {
  return consumeExperimentRunCancelled(experimentId, runId);
}

function utf8ByteLength(s: string): number {
  return typeof Buffer !== "undefined"
    ? Buffer.byteLength(s, "utf-8")
    : new TextEncoder().encode(s).length;
}

/**
 * When combined stdout/stderr exceeds the JSONL tail budget, spill the full
 * capture to `logs/<runId>.log` under the lab island and return the
 * lab-relative path (P2.5). Returns undefined when the tail is enough.
 */
export function maybeWriteFullLog(
  islandAbs: string,
  runId: string,
  stdout: string,
  stderr: string,
): string | undefined {
  const out = stripAnsi(stdout ?? "");
  const err = stripAnsi(stderr ?? "");
  const combined = err ? `${out}${out.endsWith("\n") ? "" : "\n"}--- stderr ---\n${err}` : out;
  if (!combined || utf8ByteLength(combined) <= RUN_OUTPUT_TAIL_BYTES) return undefined;
  const safeId = (runId || "run").replace(/[^A-Za-z0-9._-]/g, "_");
  const rel = `logs/${safeId}.log`;
  const abs = join(islandAbs, "logs", `${safeId}.log`);
  try {
    mkdirSync(dirname(abs), { recursive: true });
    const body = [
      `# prismnext experiment full log`,
      `# runId: ${runId}`,
      `# --- stdout ---`,
      out,
      ...(err ? [`# --- stderr ---`, err] : []),
      "",
    ].join("\n");
    writeFileSync(abs, body, "utf-8");
    return rel;
  } catch (e) {
    log.warn("failed to write full experiment log", {
      abs,
      error: e instanceof Error ? e.message : String(e),
    });
    return undefined;
  }
}

export interface KickoffExperimentRunArgs {
  ctx: ExperimentStorageContext;
  id: string;
  command: string;
  artifacts?: string[];
  notes?: string;
  /** Optional run classification (omit when unknown — never invent `other`). */
  kind?: ExperimentRunKind;
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
  const kind = parseExperimentRunKind(args.kind);

  // Defer PTY spawn so the IPC handler returns runId before output chunks
  // reach the renderer (avoids losing early chunks before runInFlight is set).
  setImmediate(() => {
    // Allocate a temp file for stderr capture (Bug #11 — see
    // docs-private/audit/experiment-agent-architecture-analysis.md). A PTY merges
    // stdout+stderr onto a single stream; the only way to get a clean
    // stderr record without sacrificing the live PTY stream for stdout
    // is to redirect the *command's* stderr to a file via a subshell
    // wrapper. The temp dir is OS-managed and the file is unlinked by
    // ai-pty after the PTY exits.
    const stderrTmpDir = mkdtempSync(join(tmpdir(), "prism-exp-stderr-"));
    const stderrPath = join(stderrTmpDir, `${runId}.log`);
    runAiCommand({
      command,
      cwd,
      sessionId,
      chatTabId: "experiment",
      requestId: runId,
      toolCallId: runId,
      envExtra,
      captureStderr: stderrPath,
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
        const stdout = ptyResult.output ?? "";
        const stderr = ptyResult.stderr ?? "";
        const logPath = maybeWriteFullLog(island, runId, stdout, stderr);
        const cancelled = consumeExperimentRunCancelled(id, runId);
        const append = appendRun(ctx, id, {
          runId,
          startedAt,
          finishedAt,
          command,
          cwd: workspacePath,
          exitCode: ptyResult.exitCode,
          stdoutTail: stdout,
          // Best-effort: PTY may have failed before the redirect fired
          // (e.g. bash itself crashed, in which case the file was never
          // created). ai-pty returns "" in that case and we persist "".
          stderrTail: stderr,
          artifacts: args.artifacts ?? [],
          env,
          notes: notesForCancel(args.notes, cancelled),
          cancelled: cancelled || undefined,
          kind,
          logPath,
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
        const stderr = "prismnext experiment-run: command failed to execute.";
        const logPath = maybeWriteFullLog(island, runId, message, stderr);
        const cancelled = consumeExperimentRunCancelled(id, runId);
        const append = appendRun(ctx, id, {
          runId,
          startedAt,
          finishedAt,
          command,
          cwd: workspacePath,
          exitCode: 124,
          stdoutTail: message,
          stderrTail: stderr,
          artifacts: args.artifacts ?? [],
          env,
          notes: notesForCancel(args.notes, cancelled),
          cancelled: cancelled || undefined,
          kind,
          logPath,
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
