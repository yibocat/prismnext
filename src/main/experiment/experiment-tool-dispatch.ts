/**
 * In-process dispatch for experiment-log / results-snapshot / provenance-query.
 * Pi native tools call these functions directly. experiment-run is kicked off
 * here only for tests / leftover executeExperimentAction — the product tool
 * calls kickoffExperimentRun itself.
 *
 * Errors are data ({ ok: false, error, hint? }), never thrown.
 */
import { getSessionProjectRoot } from "../session/chat-session-registry";
import {
  appendRun,
  createExperiment,
  detectEnvForIsland,
  listExperiments,
  MAX_AGENT_RUNS_WITH_OUTPUT,
  NO_EXPERIMENT_FOLDER_HINT,
  readExperiment,
  resolveExperimentCtx,
  isExperimentCtxError,
  type ExperimentStorageContext,
} from "./facade";
import {
  EXPERIMENT_REGISTRY_REL,
  parseExperimentRunKind,
  type ExperimentBriefLinks,
} from "../../shared/experiments/log";
import { kickoffExperimentRun } from "./experiment-run-executor";
import { snapshotExperiment } from "./experiment-results-snapshot";
import {
  readProvenanceEvents,
  resolveRunById,
  resolveRunForArtifact,
} from "./provenance-service";
import { broadcastExperimentChanged } from "./experiment-ui-events";

export interface ExperimentToolRequest {
  /** Which tool issued this request. provenance-query / results-snapshot share the type. */
  tool: "experiment-log" | "experiment-run" | "provenance-query" | "results-snapshot";
  action: string;
  sessionId?: string;
  projectRoot?: string;
  // results-snapshot
  scanDirs?: string[];
  metricsFiles?: string[];
  maxFiles?: number;
  // create
  title?: string;
  briefLinks?: ExperimentBriefLinks;
  tags?: string[];
  // read / append_run / detect_env / run
  id?: string;
  runsLimit?: number;
  /** read only — when true, include stdoutTail/stderrTail (default false for agent). */
  includeOutput?: boolean;
  // append_run
  run?: {
    runId?: string;
    startedAt?: string;
    finishedAt?: string;
    command?: string;
    cwd?: string;
    exitCode?: number;
    stdoutTail?: string;
    stderrTail?: string;
    artifacts?: string[];
    env?: unknown;
    notes?: string;
    kind?: string;
    logPath?: string | null;
  };
  // experiment-run
  command?: string;
  artifacts?: string[];
  notes?: string;
  kind?: string;
  /** External-interpreter lane: "project" (default) or "external". */
  interpreter?: string;
  /** External interpreter path/command — required when interpreter="external". */
  pythonPath?: string;
  // provenance-query
  artifactPath?: string;
  runId?: string;
  limit?: number;
}

/**
 * Resolve the checkout that owns the experiment registry / islands.
 *
 * Prefer the tool-supplied `projectRoot` so Agent runs land in the active
 * worktree when chat cwd is a worktree. The chat session registry often
 * stores the canonical **main** project path for literature / MCP — that
 * must not override experiment cwd (Bug #9).
 */
function resolveProjectRoot(req: ExperimentToolRequest): string {
  const fromTool = req.projectRoot?.trim().replace(/\\/g, "/") || "";
  if (fromTool) return fromTool;
  const fromSession = req.sessionId ? getSessionProjectRoot(req.sessionId) : undefined;
  return (fromSession || "").replace(/\\/g, "/");
}

function notConfigured(): Record<string, unknown> {
  return {
    ok: false,
    error: "no_experiment_folder",
    hint: NO_EXPERIMENT_FOLDER_HINT,
  };
}

/** In-process entry for tests / leftover callers — no request.json. */
export function executeExperimentAction(
  req: ExperimentToolRequest,
): Record<string, unknown> | null {
  return dispatch(req);
}

/**
 * Dispatch a sync experiment-log action. Returns the result, or `null` for
 * experiment-run (the executor finishes asynchronously).
 */
function dispatch(req: ExperimentToolRequest): Record<string, unknown> | null {
  const projectRoot = resolveProjectRoot(req);
  if (!projectRoot) {
    return {
      error: "Project root unknown for this chat session.",
      hint: "Open a project in prismnext and start a new chat tab from that project.",
    };
  }

  // ── provenance-query: read-only, no experiment folder required ──
  if (req.tool === "provenance-query") {
    return dispatchProvenanceQuery(req, projectRoot);
  }

  const ctxResult = resolveExperimentCtx(projectRoot);
  if (isExperimentCtxError(ctxResult)) return notConfigured();
  const ctx = ctxResult;

  // ── results-snapshot: read-only lab scan (needs experiment folder) ──
  if (req.tool === "results-snapshot") {
    return dispatchResultsSnapshot(req, ctx);
  }

  // ── experiment-run: async, fire-and-forget ──
  if (req.tool === "experiment-run") {
    if (req.action !== "run") {
      return { ok: false, error: `Unknown experiment-run action: ${String(req.action)}` };
    }
    const id = typeof req.id === "string" ? req.id.trim() : "";
    const command = typeof req.command === "string" ? req.command : "";
    if (!id) return { ok: false, error: "missing_id" };
    if (!command.trim()) return { ok: false, error: "missing_command" };
    const kind = parseExperimentRunKind(req.kind);
    if (req.kind !== undefined && req.kind !== null && req.kind !== "" && !kind) {
      return {
        ok: false,
        error: "invalid_run_kind",
        hint: "kind must be one of: train, eval, plot, data, setup, other (or omit)",
      };
    }
    // External-interpreter lane (SageMath etc.): explicit opt-in, requires pythonPath.
    let interpreter: "project" | "external" | undefined;
    if (req.interpreter === "project" || req.interpreter === "external") {
      interpreter = req.interpreter;
    } else if (req.interpreter !== undefined && req.interpreter !== null && req.interpreter !== "") {
      return {
        ok: false,
        error: "invalid_interpreter",
        hint: 'interpreter must be "project" or "external" (or omit for the project venv default)',
      };
    }
    const pythonPath = typeof req.pythonPath === "string" ? req.pythonPath.trim() : "";
    if (interpreter === "external" && !pythonPath) {
      return {
        ok: false,
        error: "missing_python_path",
        hint: 'interpreter="external" requires pythonPath (absolute path or PATH-resolvable command, e.g. "sage")',
      };
    }
    kickoffExperimentRun({
      ctx,
      id,
      command,
      artifacts: req.artifacts,
      notes: req.notes,
      kind,
      chatSessionId: req.sessionId ?? null,
      interpreter,
      pythonPath: pythonPath || undefined,
    });
    return null;
  }

  // ── experiment-log: sync actions ──
  return dispatchExperimentLog(req, ctx);
}

export function dispatchExperimentLog(
  req: ExperimentToolRequest,
  ctx: ExperimentStorageContext,
): Record<string, unknown> {
  switch (req.action) {
    case "list": {
      const result = listExperiments(ctx);
      return {
        ok: true,
        experimentRoot: ctx.workspaceRel,
        registryRoot: EXPERIMENT_REGISTRY_REL,
        experiments: result.experiments,
        corruptIds: result.corruptIds,
      };
    }
    case "create": {
      const title = typeof req.title === "string" ? req.title.trim() : "";
      if (!title) return { ok: false, error: "missing_title" };
      const result = createExperiment(ctx, {
        title,
        briefLinks: req.briefLinks,
        tags: req.tags,
      });
      if (!result.ok) return { ok: false, error: result.error };
      broadcastExperimentChanged({
        projectRoot: ctx.projectRoot,
        id: result.id,
        reason: "create",
      });
      return {
        ok: true,
        id: result.id,
        path: result.path,
        registryPath: `${EXPERIMENT_REGISTRY_REL}/${result.id}`,
        meta: result.meta,
      };
    }
    case "read": {
      const id = typeof req.id === "string" ? req.id.trim() : "";
      if (!id) return { ok: false, error: "missing_id" };
      const rawLimit = typeof req.runsLimit === "number" && req.runsLimit > 0 ? req.runsLimit : 20;
      // Agent default: lean (no stdout/stderr tails). UI IPC keeps full output.
      const includeOutput = req.includeOutput === true;
      const limit = includeOutput
        ? Math.min(rawLimit, MAX_AGENT_RUNS_WITH_OUTPUT)
        : rawLimit;
      const result = readExperiment(ctx, id, limit, { includeOutput });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        meta: result.meta,
        runs: result.runs,
        runCount: result.runCount,
        lastRunAt: result.lastRunAt,
        oldestRun: result.oldestRun,
        latestRun: result.latestRun,
        runsOrder: result.runsOrder,
        includeOutput: result.includeOutput,
        experimentRoot: ctx.workspaceRel,
        registryRoot: EXPERIMENT_REGISTRY_REL,
        hint:
          "runs are the last N entries, chronological oldest→newest (latest = runs[runs.length-1]). " +
          "For absolute first/latest use oldestRun / latestRun. " +
          "stdout/stderr omitted unless includeOutput=true — prefer artifacts / logPath / results-snapshot for figures.",
      };
    }
    case "append_run": {
      const id = typeof req.id === "string" ? req.id.trim() : "";
      if (!id) return { ok: false, error: "missing_id" };
      const run = req.run;
      if (!run || typeof run !== "object") return { ok: false, error: "missing_run" };

      // Schema-validate the run record before touching disk. Without this, the
      // agent could backdate `startedAt` / `finishedAt`, claim any
      // `exitCode` (including faking success), or inject arbitrary `artifacts`.
      // In a paper-trace context, runs.jsonl is the "did this experiment
      // actually run" record — the JSONL must not be trust-the-agent
      // (Bug #3 from docs-private/audit/experiment-agent-architecture-analysis.md).
      const validation = validateAppendRunInput(run);
      if (!validation.ok) {
        return {
          ok: false,
          error: validation.error,
          hint: validation.hint,
        };
      }
      const validated = validation.value;

      const result = appendRun(ctx, id, validated, { chatSessionId: req.sessionId ?? null });
      if (!result.ok) return { ok: false, error: result.error };
      broadcastExperimentChanged({
        projectRoot: ctx.projectRoot,
        id,
        reason: "append_run",
      });
      return { ok: true, run: result.run, path: result.path };
    }
    case "detect_env": {
      const id = typeof req.id === "string" ? req.id.trim() : "";
      if (!id) return { ok: false, error: "missing_id" };
      const result = detectEnvForIsland(ctx, id);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, env: result.env, workspacePath: result.workspacePath };
    }
    case "open": {
      // Focus Experiments UI on this island (renderer deep-link). Registry read validates id.
      const id = typeof req.id === "string" ? req.id.trim() : "";
      if (!id) return { ok: false, error: "missing_id" };
      const result = readExperiment(ctx, id, 1);
      if (!result.ok) return { ok: false, error: result.error };
      broadcastExperimentChanged({
        projectRoot: ctx.projectRoot,
        id,
        reason: "open",
        focus: true,
      });
      return {
        ok: true,
        id,
        focused: true,
        title: result.meta.title,
        hint: "Opened in Experiments mode for the user.",
      };
    }
    default:
      return { ok: false, error: `Unknown experiment-log action: ${String(req.action)}` };
  }
}

/** Dispatch results-snapshot (read-only lab scan). Exported for tests. */
export function dispatchResultsSnapshot(
  req: ExperimentToolRequest,
  ctx: ExperimentStorageContext,
): Record<string, unknown> {
  if (req.action && req.action !== "snapshot") {
    return { ok: false, error: `Unknown results-snapshot action: ${String(req.action)}` };
  }
  const id = typeof req.id === "string" ? req.id.trim() : "";
  if (!id) return { ok: false, error: "missing_id" };
  const result = snapshotExperiment(ctx, id, {
    scanDirs: Array.isArray(req.scanDirs)
      ? req.scanDirs.filter((d): d is string => typeof d === "string")
      : undefined,
    metricsFiles: Array.isArray(req.metricsFiles)
      ? req.metricsFiles.filter((d): d is string => typeof d === "string")
      : undefined,
    maxFiles: typeof req.maxFiles === "number" ? req.maxFiles : undefined,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, ...result.snapshot };
}

/**
 * Dispatch a read-only provenance-query action. Exported for direct testing.
 * Actions:
 *  - resolve_artifact: which run (if any) claimed a file path
 *  - resolve_run:      the run_recorded event for a runId
 *  - list_recent:      the most recent provenance events (runs + downloads)
 *
 * "Not found" is a normal null / empty result, not an error - the caller
 * (agent) should treat it as "no provenance recorded".
 */
export function dispatchProvenanceQuery(
  req: ExperimentToolRequest,
  projectRoot: string,
): Record<string, unknown> {
  switch (req.action) {
    case "resolve_artifact": {
      const artifactPath = typeof req.artifactPath === "string" ? req.artifactPath.trim() : "";
      if (!artifactPath) return { ok: false, error: "missing_artifactPath" };
      const resolved = resolveRunForArtifact(projectRoot, artifactPath);
      return { ok: true, found: resolved !== null, resolved };
    }
    case "resolve_run": {
      const runId = typeof req.runId === "string" ? req.runId.trim() : "";
      if (!runId) return { ok: false, error: "missing_runId" };
      return { ok: true, run: resolveRunById(projectRoot, runId) };
    }
    case "list_recent": {
      const limit =
        typeof req.limit === "number" && req.limit > 0 ? Math.min(req.limit, 200) : 20;
      const events = readProvenanceEvents(projectRoot);
      return { ok: true, events: events.slice(-limit) };
    }
    default:
      return { ok: false, error: `Unknown provenance-query action: ${String(req.action)}` };
  }
}

// ─── append_run input validation ─────────────────────────────────────────
//
// The `append_run` action lets the agent record a run that it executed out
// of band (typically because it called raw `bash` after `experiment-run`
// refused a Python script via `gateExperimentPythonExecution`). In a
// paper-trace context, runs.jsonl is the "did this experiment actually
// run" record, and a hallucinated entry would silently corrupt the
// experiment log — see Bug #3 in
// docs-private/audit/experiment-agent-architecture-analysis.md.
//
// We validate field-by-field and return a precise error rather than
// silently coercing, so the model gets feedback it can correct from. The
// single non-negotiable is `command` (a run without a command is nonsense);
// the rest either fall back to safe defaults (`env` ⇒ `detectEnv`,
// timestamps ⇒ `now`) or are type-checked.
function isIsoString(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

function isFiniteInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function validateAppendRunInput(
  raw: Record<string, unknown>,
): { ok: true; value: Parameters<typeof appendRun>[2] } | {
  ok: false;
  error: string;
  hint: string;
} {
  // command — required, must be a non-empty string
  if (typeof raw.command !== "string" || raw.command.trim() === "") {
    return {
      ok: false,
      error: "invalid_run_command",
      hint: "run.command must be a non-empty string",
    };
  }
  const command = raw.command;

  // runId — optional string; server generates when missing
  let runId: string | undefined;
  if (raw.runId !== undefined) {
    if (typeof raw.runId !== "string" || raw.runId.trim() === "") {
      return {
        ok: false,
        error: "invalid_run_runId",
        hint: "run.runId, if provided, must be a non-empty string",
      };
    }
    runId = raw.runId;
  }

  // startedAt / finishedAt — optional ISO strings
  let startedAt: string | undefined;
  if (raw.startedAt !== undefined) {
    if (!isIsoString(raw.startedAt)) {
      return {
        ok: false,
        error: "invalid_run_startedAt",
        hint: "run.startedAt, if provided, must be an ISO-8601 string parseable by Date",
      };
    }
    startedAt = raw.startedAt;
  }
  let finishedAt: string | undefined;
  if (raw.finishedAt !== undefined) {
    if (!isIsoString(raw.finishedAt)) {
      return {
        ok: false,
        error: "invalid_run_finishedAt",
        hint: "run.finishedAt, if provided, must be an ISO-8601 string parseable by Date",
      };
    }
    finishedAt = raw.finishedAt;
  }
  if (startedAt && finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) {
    return {
      ok: false,
      error: "invalid_run_timestamps",
      hint: "run.finishedAt must be >= run.startedAt",
    };
  }

  // exitCode — optional; -1 (default) means "unstarted", 0 success, others are process exit codes
  let exitCode: number | undefined;
  if (raw.exitCode !== undefined) {
    if (!isFiniteInteger(raw.exitCode)) {
      return {
        ok: false,
        error: "invalid_run_exitCode",
        hint: "run.exitCode, if provided, must be an integer (0 = success, non-zero = failure, -1 = unstarted)",
      };
    }
    exitCode = raw.exitCode;
  }

  // cwd — optional string
  let cwd: string | undefined;
  if (raw.cwd !== undefined) {
    if (typeof raw.cwd !== "string") {
      return {
        ok: false,
        error: "invalid_run_cwd",
        hint: "run.cwd, if provided, must be a string",
      };
    }
    cwd = raw.cwd;
  }

  // stdoutTail / stderrTail — optional strings
  let stdoutTail: string | undefined;
  if (raw.stdoutTail !== undefined) {
    if (typeof raw.stdoutTail !== "string") {
      return {
        ok: false,
        error: "invalid_run_stdoutTail",
        hint: "run.stdoutTail, if provided, must be a string",
      };
    }
    stdoutTail = raw.stdoutTail;
  }
  let stderrTail: string | undefined;
  if (raw.stderrTail !== undefined) {
    if (typeof raw.stderrTail !== "string") {
      return {
        ok: false,
        error: "invalid_run_stderrTail",
        hint: "run.stderrTail, if provided, must be a string",
      };
    }
    stderrTail = raw.stderrTail;
  }

  // artifacts — optional string[]
  let artifacts: string[] | undefined;
  if (raw.artifacts !== undefined) {
    if (
      !Array.isArray(raw.artifacts) ||
      !raw.artifacts.every((a) => typeof a === "string" && a.length > 0)
    ) {
      return {
        ok: false,
        error: "invalid_run_artifacts",
        hint: "run.artifacts, if provided, must be an array of non-empty strings (island-relative paths)",
      };
    }
    artifacts = raw.artifacts as string[];
  }

  // env — optional object (the run-executor fills this with detectEnv
  // when omitted; we just type-check what the agent supplies)
  let env: Parameters<typeof appendRun>[2]["env"];
  if (raw.env !== undefined) {
    if (!raw.env || typeof raw.env !== "object" || Array.isArray(raw.env)) {
      return {
        ok: false,
        error: "invalid_run_env",
        hint: "run.env, if provided, must be an object",
      };
    }
    env = raw.env as never;
  }

  // notes — optional string
  let notes: string | undefined;
  if (raw.notes !== undefined) {
    if (typeof raw.notes !== "string") {
      return {
        ok: false,
        error: "invalid_run_notes",
        hint: "run.notes, if provided, must be a string",
      };
    }
    notes = raw.notes;
  }

  // cancelled — optional bool (human cancel path; agents rarely set this)
  let cancelled: boolean | undefined;
  if (raw.cancelled !== undefined && raw.cancelled !== null) {
    if (typeof raw.cancelled !== "boolean") {
      return {
        ok: false,
        error: "invalid_run_cancelled",
        hint: "run.cancelled, if provided, must be a boolean",
      };
    }
    cancelled = raw.cancelled || undefined;
  }

  // kind — optional enum (omit when unknown; reject invalid strings)
  let kind: ReturnType<typeof parseExperimentRunKind> = undefined;
  if (raw.kind !== undefined && raw.kind !== null && raw.kind !== "") {
    kind = parseExperimentRunKind(raw.kind);
    if (!kind) {
      return {
        ok: false,
        error: "invalid_run_kind",
        hint: "run.kind, if provided, must be one of: train, eval, plot, data, setup, other",
      };
    }
  }

  // logPath — optional lab-relative string (full log spill)
  let logPath: string | null | undefined;
  if (raw.logPath !== undefined && raw.logPath !== null) {
    if (typeof raw.logPath !== "string") {
      return {
        ok: false,
        error: "invalid_run_logPath",
        hint: "run.logPath, if provided, must be a string",
      };
    }
    logPath = raw.logPath;
  }

  return {
    ok: true,
    value: {
      runId,
      startedAt,
      finishedAt,
      command,
      cwd,
      exitCode,
      stdoutTail,
      stderrTail,
      artifacts,
      env,
      notes,
      cancelled,
      kind,
      logPath,
    },
  };
}
