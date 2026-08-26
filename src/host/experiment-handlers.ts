import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  archiveExperiment,
  createExperiment,
  deleteExperiment,
  detectEnvForIsland,
  generateRunId,
  listExperiments,
  readExperiment,
  resolveExperimentCtx,
  restoreExperiment,
  updateExperiment,
  updateRunNotes,
  workspaceIslandPathForId,
  isExperimentCtxError,
} from "../main/experiment/facade";
import { snapshotExperiment } from "../main/experiment/experiment-results-snapshot";
import { kickoffExperimentRun, cancelExperimentExecution } from "../main/experiment/experiment-run-executor";
import {
  attachDetachedJob,
  createDetachedExecutionTransport,
} from "../main/experiment/detached-job";
import { broadcastExperimentChanged } from "../main/experiment/experiment-ui-events";
import { EXPERIMENT_REGISTRY_REL, parseExperimentRunKind } from "../shared/experiments/log";
import { HOME_JOBS_DIRNAME } from "../shared/workbench/paths";
import { resolveWorkbenchHome } from "../main/workbench/home";
import {
  ensureExecutionRegistry,
  getExecutionRegistry,
  initExecutionRegistry,
} from "../main/terminal/execution-registry";
import { shouldExcludeRemoteSyncPath } from "../shared/remote";
import type { HostHandlerContext } from "./context";
import { setHostEvents } from "../main/app/event-sink";

function rootOf(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  return typeof params.projectRoot === "string" && params.projectRoot.trim()
    ? params.projectRoot
    : ctx.remoteRoot ?? "";
}

function walkRels(abs: string, prefix = ""): string[] {
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = join(abs, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (shouldExcludeRemoteSyncPath(rel).exclude) continue;
      out.push(...walkRels(full, rel));
      continue;
    }
    if (!shouldExcludeRemoteSyncPath(rel).exclude) out.push(rel);
  }
  return out;
}

export function installExperimentEvents(ctx: HostHandlerContext): void {
  setHostEvents({
    broadcast(channel, payload) {
      ctx.emit(channel, payload);
    },
    sendToOriginThenBroadcast(channel, payload) {
      ctx.emit(channel, payload);
    },
  });
  try {
    getExecutionRegistry();
  } catch {
    const home = resolveWorkbenchHome();
    const registry = initExecutionRegistry(
      join(home, HOME_JOBS_DIRNAME),
      createDetachedExecutionTransport(home),
      { recoverLive: (summary) => attachDetachedJob(summary.executionId, 0, home)?.running === true },
    );
    registry.subscribe((event) => ctx.emit("execution:event", event));
    for (const live of registry.listRunning()) {
      void registry.start(live.executionId);
    }
  }
}

export const experimentHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "experiment:list"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const list = listExperiments(ctxResult, { includeArchived: params.includeArchived === true });
    return {
      ok: true,
      experimentRoot: ctxResult.workspaceRel,
      registryRoot: EXPERIMENT_REGISTRY_REL,
      experiments: list.experiments,
      corruptIds: list.corruptIds,
    };
  },
  async "experiment:create"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const result = createExperiment(ctxResult, {
      title: String(params.title ?? ""),
      tags: Array.isArray(params.tags) ? params.tags.filter((item): item is string => typeof item === "string") : undefined,
      description: typeof params.description === "string" ? params.description : undefined,
    });
    if (!result.ok) return { ok: false, error: result.error };
    broadcastExperimentChanged({ projectRoot: ctxResult.projectRoot, id: result.id, reason: "create", focus: true });
    return { ok: true, id: result.id, path: result.path, meta: result.meta };
  },
  async "experiment:read"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const limit = typeof params.runsLimit === "number" && params.runsLimit > 0 ? params.runsLimit : 20;
    const result = readExperiment(ctxResult, String(params.id ?? ""), limit, { includeOutput: true });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      meta: result.meta,
      runs: result.runs,
      runCount: result.runCount,
      lastRunAt: result.lastRunAt,
      oldestRun: result.oldestRun,
      latestRun: result.latestRun,
      experimentRoot: result.workspaceRel,
      registryRoot: result.registryRoot,
    };
  },
  async "experiment:update"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const result = updateExperiment(ctxResult, String(params.id ?? ""), {
      title: typeof params.title === "string" ? params.title : undefined,
      tags: Array.isArray(params.tags) ? params.tags.filter((item): item is string => typeof item === "string") : undefined,
      description: typeof params.description === "string" ? params.description : undefined,
    });
    if (!result.ok) return { ok: false, error: result.error };
    broadcastExperimentChanged({ projectRoot: ctxResult.projectRoot, id: result.meta.id, reason: "update" });
    return { ok: true, meta: result.meta };
  },
  async "experiment:updateRun"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const result = updateRunNotes(
      ctxResult,
      String(params.id ?? ""),
      String(params.runId ?? ""),
      typeof params.notes === "string" ? params.notes : "",
    );
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, run: result.run };
  },
  async "experiment:archive"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const result = archiveExperiment(ctxResult, String(params.id ?? ""));
    if (!result.ok) return { ok: false, error: result.error };
    broadcastExperimentChanged({ projectRoot: ctxResult.projectRoot, id: result.meta.id, reason: "archive" });
    return { ok: true, meta: result.meta };
  },
  async "experiment:restore"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const result = restoreExperiment(ctxResult, String(params.id ?? ""));
    if (!result.ok) return { ok: false, error: result.error };
    broadcastExperimentChanged({ projectRoot: ctxResult.projectRoot, id: result.meta.id, reason: "restore" });
    return { ok: true, meta: result.meta };
  },
  async "experiment:delete"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const id = String(params.id ?? "");
    const result = deleteExperiment(ctxResult, id, { removeLab: params.removeLab === true });
    if (!result.ok) return { ok: false, error: result.error };
    broadcastExperimentChanged({ projectRoot: ctxResult.projectRoot, id, reason: "delete" });
    return { ok: true };
  },
  async "experiment:detectEnv"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const result = detectEnvForIsland(ctxResult, String(params.id ?? ""));
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, env: result.env, workspacePath: result.workspacePath };
  },
  async "experiment:getPaths"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const workspaceAbs = workspaceIslandPathForId(ctxResult, String(params.id ?? ""));
    if (!workspaceAbs || !existsSync(workspaceAbs)) return { ok: false, error: "experiment_not_found" };
    return {
      ok: true,
      registryPath: join(EXPERIMENT_REGISTRY_REL, String(params.id ?? "")),
      workspaceAbs,
      workspaceRel: `${ctxResult.workspaceRel}/${params.id}`,
    };
  },
  async "experiment:listArtifactRels"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const workspaceAbs = workspaceIslandPathForId(ctxResult, String(params.id ?? ""));
    if (!workspaceAbs) return { rels: [] };
    return { rels: walkRels(workspaceAbs).map((rel) => `${ctxResult.workspaceRel}/${params.id}/${rel}`) };
  },
  async "experiment:run"(params, ctx) {
    installExperimentEvents(ctx);
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const id = String(params.id ?? "").trim();
    const command = String(params.command ?? "").trim();
    if (!id || !command) return { ok: false, error: !id ? "experiment_not_found" : "missing_command" };
    const runId = generateRunId();
    const started = await kickoffExperimentRun({
      ctx: ctxResult,
      id,
      command,
      artifacts: Array.isArray(params.artifacts)
        ? params.artifacts.filter((item): item is string => typeof item === "string")
        : undefined,
      notes: typeof params.notes === "string" ? params.notes : undefined,
      kind: parseExperimentRunKind(typeof params.kind === "string" ? params.kind : undefined),
      runId,
    });
    return {
      ok: true,
      runId: started?.runId ?? runId,
      executionId: started?.executionId,
      status: "started",
    };
  },
  async "experiment:cancelRun"(params) {
    const id = String(params.id ?? "").trim();
    const runId = String(params.runId ?? "").trim();
    if (id && runId) await cancelExperimentExecution(id, runId);
    return { ok: true };
  },
  async "experiment:snapshot"(params, ctx) {
    const ctxResult = resolveExperimentCtx(rootOf(params, ctx));
    if (isExperimentCtxError(ctxResult)) return ctxResult;
    const result = snapshotExperiment(ctxResult, String(params.id ?? ""), {
      scanDirs: Array.isArray(params.scanDirs) ? params.scanDirs.filter((item): item is string => typeof item === "string") : undefined,
      metricsFiles: Array.isArray(params.metricsFiles) ? params.metricsFiles.filter((item): item is string => typeof item === "string") : undefined,
      maxFiles: typeof params.maxFiles === "number" ? params.maxFiles : undefined,
      maxDepth: typeof params.maxDepth === "number" ? params.maxDepth : undefined,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, snapshot: result.snapshot };
  },
  async "execution:get"(params) {
    ensureExecutionRegistry();
    const summary = getExecutionRegistry().get(String(params.executionId ?? ""));
    return summary ? { ok: true, summary } : { ok: false, error: "execution_not_available" };
  },
  async "execution:replay"(params) {
    ensureExecutionRegistry();
    const executionId = String(params.executionId ?? "");
    const replay = await getExecutionRegistry().replay(executionId, Number(params.fromSequence ?? 0));
    return { ok: true, summary: replay.summary, events: replay.events };
  },
  async "execution:attach"(params, ctx) {
    installExperimentEvents(ctx);
    const executionId = String(params.executionId ?? "");
    const registry = getExecutionRegistry();
    const summary = registry.get(executionId);
    if (summary && !["completed", "failed", "cancelled", "lost", "timed-out"].includes(summary.state)) {
      void registry.start(executionId);
    }
    const replay = summary
      ? await registry.replay(executionId, Number(params.fromSequence ?? 0))
      : { summary: null, events: [] };
    const detached = attachDetachedJob(executionId);
    return {
      ok: true,
      summary: replay.summary ?? detached?.meta ?? null,
      events: replay.events,
      running: detached?.running === true,
      tail: detached?.tail ?? "",
    };
  },
  async "execution:cancel"(params) {
    ensureExecutionRegistry();
    await getExecutionRegistry().cancel(String(params.executionId ?? ""), "user");
    return { ok: true };
  },
  async "execution:listRunning"(params, ctx) {
    ensureExecutionRegistry();
    const projectId = typeof params.projectId === "string" ? params.projectId : ctx.remoteRoot ?? "";
    return { ok: true, summaries: getExecutionRegistry().listRunning(projectId) };
  },
  async "execution:findByToolCallId"(params) {
    ensureExecutionRegistry();
    const summary = getExecutionRegistry().findByToolCallId(String(params.toolCallId ?? ""));
    return summary ? { ok: true, summary } : { ok: false, error: "execution_not_available" };
  },
};
