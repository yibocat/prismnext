/**
 * Polls the experiment-log file bridge for OpenCode tool requests.
 *
 * Shared bridge root for BOTH `experiment-log` and `experiment-run` tools —
 * the `tool` field in the request discriminates which tool wrote it, and the
 * `action` field routes the dispatch. This mirrors how research-brief-bridge
 * handles read/update on one root.
 *
 * experiment-log actions (list/create/read/append_run/detect_env) are SYNC
 * and fast: the result is written by processSessionDir, exactly like
 * research-brief-bridge.
 *
 * experiment-run is ASYNC (PTY): the dispatcher kicks off the executor
 * (fire-and-forget) which writes the `.result.json` itself when the run
 * completes. processSessionDir just unlinks the request and moves on, so a
 * long run cannot block other bridge requests.
 *
 * Errors are data ({ ok: false, error, hint? }), never thrown across the bridge.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createLogger } from "./logger";
import { getExperimentLogBridgeRoot } from "./prism-bridge-paths";
import { getSessionProjectRoot } from "./chat-session-registry";
import {
  appendRun,
  createExperiment,
  detectEnvForIsland,
  listExperiments,
  readExperiment,
  resolveExperimentCtx,
  type ExperimentStorageContext,
} from "./experiment-log-service";
import { EXPERIMENT_REGISTRY_REL } from "../../shared/experiment-log";
import { kickoffExperimentRun } from "./experiment-run-executor";
import type { ExperimentBriefLinks } from "../../shared/experiment-log";

const log = createLogger("experiment-log-bridge", "agent");

interface ExperimentLogBridgeRequest {
  /** Which tool wrote this request. */
  tool: "experiment-log" | "experiment-run";
  action: string;
  sessionId?: string;
  projectRoot?: string;
  // create
  title?: string;
  briefLinks?: ExperimentBriefLinks;
  tags?: string[];
  // read / append_run / detect_env / run
  id?: string;
  runsLimit?: number;
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
  };
  // experiment-run
  command?: string;
  artifacts?: string[];
  notes?: string;
}

function bridgeRoot(): string {
  return getExperimentLogBridgeRoot();
}

function resolveProjectRoot(req: ExperimentLogBridgeRequest): string {
  const fromSession = req.sessionId ? getSessionProjectRoot(req.sessionId) : undefined;
  return (fromSession || req.projectRoot?.trim() || "").replace(/\\/g, "/");
}

function notConfigured(): Record<string, unknown> {
  return {
    ok: false,
    error: "no_experiment_folder",
    hint: "Add an Experiment folder in Settings → Workspace (function: Experiment) before creating or running experiments.",
  };
}

/**
 * Dispatch a SYNC experiment-log action. Returns the result to write to the
 * result file, OR `null` for experiment-run (the executor writes the result
 * file itself, fire-and-forget).
 */
function dispatch(req: ExperimentLogBridgeRequest, resPath: string): Record<string, unknown> | null {
  const projectRoot = resolveProjectRoot(req);
  if (!projectRoot) {
    return {
      error: "Project root unknown for this chat session.",
      hint: "Open a project in Prism and start a new chat tab from that project.",
    };
  }
  const ctxResult = resolveExperimentCtx(projectRoot);
  if ("ok" in ctxResult && ctxResult.ok === false) return notConfigured();
  const ctx: ExperimentStorageContext = ctxResult as ExperimentStorageContext;

  // ── experiment-run: async, fire-and-forget ──
  if (req.tool === "experiment-run") {
    if (req.action !== "run") {
      return { ok: false, error: `Unknown experiment-run action: ${String(req.action)}` };
    }
    const id = typeof req.id === "string" ? req.id.trim() : "";
    const command = typeof req.command === "string" ? req.command : "";
    if (!id) return { ok: false, error: "missing_id" };
    if (!command.trim()) return { ok: false, error: "missing_command" };
    kickoffExperimentRun({
      ctx,
      id,
      command,
      artifacts: req.artifacts,
      notes: req.notes,
      resPath,
    });
    return null;
  }

  // ── experiment-log: sync actions ──
  return dispatchExperimentLog(req, ctx);
}

function dispatchExperimentLog(
  req: ExperimentLogBridgeRequest,
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
      const limit = typeof req.runsLimit === "number" && req.runsLimit > 0 ? req.runsLimit : 20;
      const result = readExperiment(ctx, id, limit);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        meta: result.meta,
        runs: result.runs,
        experimentRoot: ctx.workspaceRel,
        registryRoot: EXPERIMENT_REGISTRY_REL,
      };
    }
    case "append_run": {
      const id = typeof req.id === "string" ? req.id.trim() : "";
      if (!id) return { ok: false, error: "missing_id" };
      const run = req.run;
      if (!run || typeof run !== "object") return { ok: false, error: "missing_run" };
      const result = appendRun(ctx, id, {
        runId: run.runId,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        command: run.command ?? "",
        cwd: run.cwd,
        exitCode: run.exitCode,
        stdoutTail: run.stdoutTail,
        stderrTail: run.stderrTail,
        artifacts: run.artifacts,
        env: run.env as never,
        notes: run.notes,
      });
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, run: result.run, path: result.path };
    }
    case "detect_env": {
      const id = typeof req.id === "string" ? req.id.trim() : "";
      if (!id) return { ok: false, error: "missing_id" };
      const result = detectEnvForIsland(ctx, id);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, env: result.env, workspacePath: result.workspacePath };
    }
    default:
      return { ok: false, error: `Unknown experiment-log action: ${String(req.action)}` };
  }
}

const processingRequests = new Set<string>();
let pollInFlight = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function processSessionDir(sessionDir: string): Promise<void> {
  if (!existsSync(sessionDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(sessionDir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (!name.endsWith(".request.json")) continue;
    const reqPath = join(sessionDir, name);
    const requestId = name.replace(".request.json", "");
    const resPath = join(sessionDir, `${requestId}.result.json`);
    if (existsSync(resPath)) continue;
    if (processingRequests.has(reqPath)) continue;

    processingRequests.add(reqPath);
    try {
      const raw = readFileSync(reqPath, "utf-8");
      const req = JSON.parse(raw) as ExperimentLogBridgeRequest;
      const result = dispatch(req, resPath);
      if (result !== null) {
        // Sync action: write the result now.
        writeFileSync(resPath, JSON.stringify(result), "utf-8");
      }
      // For experiment-run (result === null), the executor writes resPath when
      // the run completes. Unlink the request in both cases so it isn't
      // reprocessed; the tool polls resPath until it appears.
      try { unlinkSync(reqPath); } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("experiment-log bridge request failed", { session: basename(sessionDir), error: message });
      writeFileSync(resPath, JSON.stringify({ error: message, ok: false }), "utf-8");
      try { unlinkSync(reqPath); } catch {}
    } finally {
      processingRequests.delete(reqPath);
    }
  }
}

async function pollBridge(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    mkdirSync(bridgeRoot(), { recursive: true });
    let sessions: string[];
    try {
      sessions = readdirSync(bridgeRoot());
    } catch {
      return;
    }
    for (const s of sessions) {
      await processSessionDir(join(bridgeRoot(), s));
    }
  } finally {
    pollInFlight = false;
  }
}

export function startExperimentLogBridge(): void {
  if (pollTimer) return;
  mkdirSync(bridgeRoot(), { recursive: true });
  pollTimer = setInterval(() => {
    void pollBridge();
  }, 50);
  log.info("Experiment log bridge started");
}

export function stopExperimentLogBridge(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** @internal */
export async function processExperimentLogBridgeOnceForTests(): Promise<void> {
  await pollBridge();
}
