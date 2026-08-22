/**
 * experiment-run executor — runs a shell command in the workspace experiment island,
 * appends run record to `.workbench/experiments/<id>/runs.jsonl`.
 *
 * Completion: UI IPC / tests may pass `onComplete(result)`. Optional `resPath`
 * is leftover and unused on the Pi path.
 */
import { existsSync, mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve as pathResolve } from "node:path";
import { tmpdir } from "node:os";
import { app } from "electron";
import { cancelAiCommandForSession } from "./ai-pty";
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
import { ensureExecutionRegistry } from "./execution-registry";
import {
  isPythonRelatedCommand,
  parseExperimentRunKind,
  RUN_OUTPUT_TAIL_BYTES,
  stripAnsi,
  type ExperimentEnv,
  type ExperimentRunEntry,
  type ExperimentRunKind,
  type ExperimentRunResult,
} from "../../shared/experiments/log";
import { createLogger, shortLogDetail } from "./logger";
import {
  broadcastExperimentChanged,
  broadcastExperimentRunComplete,
  broadcastExperimentRunOutput,
  broadcastExperimentRunStarted,
} from "./experiment-ui-events";

const log = createLogger("experiment-run-executor", "agent");

/** Re-export shared completion payload (UI track + bridge `.result.json`). */
export type { ExperimentRunResult };

/** Runs the human cancelled before natural PTY exit (Bug #21). Cleared on append. */
const cancelledRunKeys = new Set<string>();
/** `experimentId\0runId` → executionId, while the run is in flight. */
const executionByRun = new Map<string, string>();

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
  executionByRun.clear();
}

export function resolveExperimentExecutionId(experimentId: string, runId: string): string | undefined {
  return executionByRun.get(cancelledKey(experimentId, runId));
}

/** Mark + cancel the Execution for this run; fall back to the legacy session id. */
export async function cancelExperimentExecution(
  experimentId: string,
  runId: string,
  reason = "user",
): Promise<void> {
  markExperimentRunCancelled(experimentId, runId);
  const executionId = resolveExperimentExecutionId(experimentId, runId);
  if (executionId) {
    try {
      await ensureExecutionRegistry().cancel(executionId, reason);
      return;
    } catch {
      // Fall through to the session-id kill so in-flight PTYs still stop.
    }
  }
  cancelAiCommandForSession(`experiment:${experimentId}:${runId}`);
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
  /** Optional leftover completion file — unused on the Pi path. */
  resPath?: string;
  /** UI completion callback — fires after the run finishes (or fails). */
  onComplete?: (result: ExperimentRunResult) => void;
  /** Live PTY output chunks (UI stream). Prefer IPC broadcast; optional for tests. */
  onOutputChunk?: (chunk: string) => void;
  /**
   * Originating renderer webContents (Human UI `experiment:run`). When set,
   * run stream events are delivered origin-first then broadcast (Bug #4).
   * Agent bridge leaves this unset — broadcast-only still reaches Chat.
   */
  originSender?: { send: (channel: string, payload: unknown) => void };
  /**
   * OpenCode chat session that triggered the run (best-effort provenance link).
   * NOT the PTY session id built below - kept separate to avoid collision.
   */
  chatSessionId?: string | null;
  /** Default true — ensure shared project `.workbench/.venv` before detect/run. */
  ensureVenv?: boolean;
  venvRunner?: ExperimentVenvRunner;
  /**
   * Interpreter lane (default "project"). "external" opts out of the shared
   * venv entirely: no ensure, no PATH/VIRTUAL_ENV injection; the declared
   * interpreter and its probed version are recorded in the run's env.
   */
  interpreter?: "project" | "external";
  /** Required when interpreter="external" — absolute path or PATH-resolvable command. */
  pythonPath?: string;
}

/** Best-effort `--version` probe of an external interpreter (never throws). */
function probeInterpreterVersion(pythonPath: string, cwd: string): string | null {
  try {
    const out = execFileSync(pythonPath, ["--version"], {
      cwd,
      timeout: 15000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const first = (out || "").split("\n")[0]?.trim() ?? "";
    return first ? first.slice(0, 200) : null;
  } catch {
    return null;
  }
}

function logExperimentRunFail(
  args: Pick<KickoffExperimentRunArgs, "ctx" | "id" | "command" | "runId">,
  error: string,
): void {
  log.warn("experiment.run.fail", {
    experimentId: args.id,
    runId: args.runId,
    command: args.command ? shortLogDetail(args.command) : undefined,
    error,
    project: basename(args.ctx.projectRoot),
  });
}

function detectIslandEnv(
  ctx: KickoffExperimentRunArgs["ctx"],
  island: string,
): ExperimentEnv {
  return detectEnv(island, {
    workspaceAbs: ctx.workspaceAbs,
    workspaceRel: ctx.workspaceRel,
    projectRoot: ctx.projectRoot,
  });
}

export async function kickoffExperimentRun(
  args: KickoffExperimentRunArgs,
): Promise<{ runId: string; executionId: string } | undefined> {
  const { ctx, id, command } = args;
  const island = workspaceIslandPathForId(ctx, id);

  if (!island || !existsSync(island)) {
    // Defer to nextTick so the caller (IPC handler) can return its immediate
    // response first; otherwise the sync callback would race the handler.
    logExperimentRunFail(args, "experiment_not_found");
    queueMicrotask(() => reportResult(args, { ok: false, error: "experiment_not_found" }));
    return undefined;
  }
  if (!command.trim()) {
    logExperimentRunFail(args, "missing_command");
    queueMicrotask(() => reportResult(args, { ok: false, error: "missing_command" }));
    return undefined;
  }

  // External-interpreter lane (SageMath & co): run the command as-is with the
  // declared interpreter — no venv ensure, no gate, no PATH/VIRTUAL_ENV
  // injection. The run's env records the real interpreter (provenance).
  if (args.interpreter === "external") {
    const pythonPath = (args.pythonPath ?? "").trim();
    if (!pythonPath) {
      logExperimentRunFail(args, "missing_python_path");
      queueMicrotask(() =>
        reportResult(args, { ok: false, error: "missing_python_path" }),
      );
      return undefined;
    }
    const env = detectIslandEnv(ctx, island);
    const version = probeInterpreterVersion(pythonPath, island);
    env.python = pythonPath;
    env.pythonVersion = version;
    env.interpreter = { kind: "external", path: pythonPath, version };
    return kickoffWithEnv(args, island, env, { PYTHONUNBUFFERED: "1" });
  }

  // Hard gate: Python under Experiment uses the shared project `.workbench/.venv`.
  if (isPythonRelatedCommand(command) && args.ensureVenv !== false) {
    const gate = gateExperimentPythonExecution({
      projectRoot: ctx.projectRoot,
      cwd: island,
      command,
      ensureOpts: { runner: args.venvRunner },
    });
    if (gate.action === "block") {
      logExperimentRunFail(args, gate.error);
      queueMicrotask(() => reportResult(args, { ok: false, error: gate.error }));
      return undefined;
    }
    if (gate.action === "apply") {
      const env = detectIslandEnv(ctx, island);
      env.interpreter = { kind: "project", path: env.python, version: env.pythonVersion };
      const gatedArgs = gate.warning
        ? { ...args, notes: [gate.warning, args.notes].filter(Boolean).join(" ") }
        : args;
      return kickoffWithEnv(gatedArgs, island, env, gate.envExtra);
    }
  } else if (args.ensureVenv !== false) {
    // Non-Python: best-effort ensure so later Python runs share the project venv.
    ensureExperimentPythonVenv(ctx.projectRoot, {
      runner: args.venvRunner,
    });
  }

  const env = detectIslandEnv(ctx, island);
  env.interpreter = { kind: "project", path: env.python, version: env.pythonVersion };
  return kickoffWithEnv(args, island, env, buildPythonEnvExtra(env));
}

/**
 * Base env for every run: the Electron binary doubles as a Node runtime
 * (ELECTRON_RUN_AS_NODE=1) so JS tooling lanes (e.g. the Observable Plot
 * SVG renderer) work without requiring a system Node install, and
 * PRISM_APP_NODE_MODULES lets island scripts resolve the app's bundled deps
 * (@observablehq/plot, jsdom) via createRequire. Harmless to Python runs.
 */
function prismRuntimeEnv(): Record<string, string> {
  const env: Record<string, string> = {
    PRISM_NODE: process.execPath,
    ELECTRON_RUN_AS_NODE: "1",
  };
  let appPath: string | null = null;
  try {
    // `app.getAppPath` is absent in unit-test electron mocks and in plain
    // Node (where `electron` resolves to a path string) — fall back to cwd.
    appPath = typeof app?.getAppPath === "function" ? app.getAppPath() : null;
  } catch {
    appPath = null;
  }
  env.PRISM_APP_NODE_MODULES = join(appPath ?? process.cwd(), "node_modules");
  return env;
}

async function kickoffWithEnv(
  args: KickoffExperimentRunArgs,
  island: string,
  env: ExperimentEnv,
  envExtra: Record<string, string>,
): Promise<{ runId: string; executionId: string }> {
  const { ctx, id, command } = args;
  const runId = args.runId ?? generateRunId();
  const startedAt = new Date().toISOString();
  const sessionId = `experiment:${id}:${runId}`;
  const cwd = island;
  const workspacePath = `${ctx.workspaceRel}/${id}`;
  const kind = parseExperimentRunKind(args.kind);
  const origin = args.originSender;
  const runKey = cancelledKey(id, runId);

  // Allocate a temp file for stderr capture (Bug #11). A PTY merges
  // stdout+stderr onto a single stream; ai-pty wraps the command so stderr
  // is teed into this file. The temp file is unlinked by ai-pty after exit.
  const stderrTmpDir = mkdtempSync(join(tmpdir(), "prism-exp-stderr-"));
  const stderrCapturePath = join(stderrTmpDir, `${runId}.log`);
  const registry = ensureExecutionRegistry();
  let created;
  try {
    created = await registry.create(
    {
      origin: "experiment-run",
      command,
      cwd,
      projectId: ctx.projectRoot,
      chatTabId: "experiment",
      opencodeSessionId: sessionId,
      toolCallId: runId,
      experimentId: id,
      runId,
      envExtra: { ...prismRuntimeEnv(), ...envExtra },
      captureStderr: stderrCapturePath,
    },
    { start: false },
    );
  } catch (err) {
    logExperimentRunFail({ ctx, id, command, runId }, shortLogDetail(err));
    throw err;
  }
  executionByRun.set(runKey, created.executionId);

  log.info("experiment.run.start", {
    experimentId: id,
    runId,
    command: shortLogDetail(command),
    project: basename(ctx.projectRoot),
  });

  // Announce before PTY so Chat / panel can lift runInFlight (Station 2).
  broadcastExperimentRunStarted(
    { id, runId, command, executionId: created.executionId },
    origin,
  );
  broadcastExperimentChanged({
    projectRoot: ctx.projectRoot,
    id,
    reason: "run_start",
  });

  const unsubscribe = registry.subscribe((event) => {
    if (event.executionId !== created.executionId || event.type !== "output" || !event.data) {
      return;
    }
    const cleaned = stripAnsi(event.data);
    broadcastExperimentRunOutput({ id, runId, chunk: cleaned }, origin);
    if (args.onOutputChunk) {
      try {
        args.onOutputChunk(cleaned);
      } catch {
        // ignore callback errors
      }
    }
  });

  // Defer spawn so the IPC handler can return runId + executionId before
  // output chunks reach the renderer.
  setImmediate(() => {
    void (async () => {
      try {
        await registry.start(created.executionId);
        const final = await registry.waitForFinal(created.executionId);
        const finishedAt = new Date().toISOString();
        const stdout = final.transcriptTail ?? "";
        const stderr = final.stderrTail ?? "";
        const logPath = maybeWriteFullLog(island, runId, stdout, stderr);
        const cancelled =
          consumeExperimentRunCancelled(id, runId) || final.state === "cancelled";
        const append = appendRun(ctx, id, {
          runId,
          startedAt,
          finishedAt,
          command,
          cwd: workspacePath,
          exitCode: final.exitCode ?? 1,
          stdoutTail: stdout,
          stderrTail: stderr,
          artifacts: args.artifacts ?? [],
          env,
          notes: notesForCancel(args.notes, cancelled),
          cancelled: cancelled || undefined,
          kind,
          logPath,
          executionId: created.executionId,
          transcriptPath: final.transcriptPath,
          stderrPath: final.stderrPath,
        }, { chatSessionId: args.chatSessionId ?? null });
        if (!append.ok) {
          reportResult(args, { ok: false, error: append.error }, runId);
          return;
        }
        const run: ExperimentRunEntry = append.run;
        reportResult(
          args,
          {
            ok: true,
            run,
            exitCode: run.exitCode,
            stdoutTail: run.stdoutTail,
            stderrTail: run.stderrTail,
          },
          runId,
        );
      } catch (err: unknown) {
        const finishedAt = new Date().toISOString();
        const message = err instanceof Error ? err.message : String(err);
        logExperimentRunFail({ ctx, id, command, runId }, message);
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
          executionId: created.executionId,
          transcriptPath: created.transcriptPath,
        }, { chatSessionId: args.chatSessionId ?? null });
        const run: ExperimentRunEntry | null = append.ok ? append.run : null;
        reportResult(
          args,
          {
            ok: false,
            error: message,
            run: run ?? undefined,
          },
          runId,
        );
      } finally {
        unsubscribe();
        executionByRun.delete(runKey);
      }
    })();
  });

  return { runId, executionId: created.executionId };
}

function reportResult(
  args: KickoffExperimentRunArgs,
  data: ExperimentRunResult,
  runId?: string,
): void {
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
  const resolvedRunId = runId ?? data.run?.runId ?? args.runId;
  if (resolvedRunId) {
    broadcastExperimentRunComplete(
      { id: args.id, runId: resolvedRunId, result: data },
      args.originSender,
    );
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

/**
 * Build PTY env vars so the run uses the detected python interpreter:
 *  - If `env.python` points at the shared project `.workbench/.venv`, prepend its
 *    `bin` dir to PATH (so `python` / `pip` resolve to the venv).
 *  - Set `VIRTUAL_ENV` to the venv root so `pip` / `python` / `uv pip` self-identify it.
 *  - Always set `PYTHONUNBUFFERED=1` for streaming output.
 *
 * When ensure failed and no venv is present, PATH is left alone (system python).
 */
export function buildPythonEnvExtra(env: ExperimentEnv): Record<string, string> {
  const extra: Record<string, string> = { PYTHONUNBUFFERED: "1" };
  if (env.python && env.venvPath) {
    // env.python is `.workbench/.venv/bin/python` (posix) or
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
