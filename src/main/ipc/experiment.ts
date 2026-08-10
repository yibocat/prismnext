/**
 * experiment:* IPC — UI track for the Experiments RightArea mode (Sprint 0.7).
 *
 * Mirrors the file-bridge flow (single source of truth: `experiment-log-service` +
 * `kickoffExperimentRun`). Validates the project has a Workspace Experiment folder
 * configured and consults the current permission mode before kicking off a run.
 */
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cancelAiCommandForSession } from "../services/ai-pty";
import { getSettings } from "../services/settings";
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
} from "../services/experiment-log-service";
import {
  kickoffExperimentRun,
  markExperimentRunCancelled,
} from "../services/experiment-run-executor";
import { snapshotExperiment } from "../services/experiment-results-snapshot";
import { broadcastExperimentChanged } from "../services/experiment-ui-events";
import { AcpService } from "../acp/service";
import {
  buildPermissionRulesFromSettings,
  resolvePermissionAction,
  resolvePermissionMode,
} from "../services/permission-modes";
import {
  EXPERIMENT_REGISTRY_REL,
  parseExperimentRunKind,
} from "../../shared/experiment-log";

interface ExperimentListArgs {
  projectRoot: string;
  /** Human browse default false — hide archived. Agent list uses bridge (include all). */
  includeArchived?: boolean;
}
interface ExperimentReadArgs {
  projectRoot: string;
  id: string;
  runsLimit?: number;
}
interface ExperimentDetectEnvArgs {
  projectRoot: string;
  id: string;
}
interface ExperimentGetPathsArgs {
  projectRoot: string;
  id: string;
}
interface ExperimentRunArgs {
  projectRoot: string;
  id: string;
  command: string;
  artifacts?: string[];
  notes?: string;
  /** Optional run classification (train/eval/…). Omit when unknown. */
  kind?: string;
  /** Active chat session — binds provenance "Open chat session" for UI runs. */
  chatSessionId?: string | null;
}
interface ExperimentCancelRunArgs {
  projectRoot: string;
  id: string;
  runId: string;
}
interface ExperimentUpdateArgs {
  projectRoot: string;
  id: string;
  title?: string;
  tags?: string[];
  description?: string;
  briefLinks?: {
    sections?: string[];
    hypothesisExcerpt?: string;
    researchQuestionExcerpt?: string;
  } | null;
}
interface ExperimentSnapshotArgs {
  projectRoot: string;
  id: string;
  scanDirs?: string[];
  metricsFiles?: string[];
  maxFiles?: number;
  maxDepth?: number;
}

export function registerExperimentHandlers(): void {
  ipcMain.handle("experiment:list", async (_event, args: ExperimentListArgs) => {
    const ctxResult = resolveExperimentCtx(args.projectRoot);
    if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
    const list = listExperiments(ctxResult, {
      includeArchived: args.includeArchived === true,
    });
    return {
      ok: true as const,
      experimentRoot: ctxResult.workspaceRel,
      registryRoot: EXPERIMENT_REGISTRY_REL,
      experiments: list.experiments,
      corruptIds: list.corruptIds,
    };
  });

  ipcMain.handle(
    "experiment:archive",
    async (_event, args: { projectRoot: string; id: string }) => {
      const ctxResult = resolveExperimentCtx(args.projectRoot);
      if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
      const result = archiveExperiment(ctxResult, (args.id || "").trim());
      if (!result.ok) return { ok: false as const, error: result.error };
      broadcastExperimentChanged({
        projectRoot: ctxResult.projectRoot,
        id: result.meta.id,
        reason: "archive",
      });
      return { ok: true as const, meta: result.meta };
    },
  );

  ipcMain.handle(
    "experiment:create",
    async (
      _event,
      args: {
        projectRoot: string;
        title: string;
        tags?: string[];
        description?: string;
        briefLinks?: {
          sections?: string[];
          hypothesisExcerpt?: string;
          researchQuestionExcerpt?: string;
        };
      },
    ) => {
      const ctxResult = resolveExperimentCtx(args.projectRoot);
      if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
      const result = createExperiment(ctxResult, {
        title: args.title,
        tags: args.tags,
        description: args.description,
        briefLinks: args.briefLinks,
      });
      if (!result.ok) return { ok: false as const, error: result.error };
      broadcastExperimentChanged({
        projectRoot: ctxResult.projectRoot,
        id: result.id,
        reason: "create",
        focus: true,
      });
      return { ok: true as const, id: result.id, path: result.path, meta: result.meta };
    },
  );

  ipcMain.handle("experiment:update", async (_event, args: ExperimentUpdateArgs) => {
    const ctxResult = resolveExperimentCtx(args.projectRoot);
    if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
    const result = updateExperiment(ctxResult, args.id, {
      title: args.title,
      tags: args.tags,
      description: args.description,
      briefLinks: args.briefLinks,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    broadcastExperimentChanged({
      projectRoot: ctxResult.projectRoot,
      id: result.meta.id,
      reason: "update",
    });
    return { ok: true as const, meta: result.meta };
  });

  ipcMain.handle(
    "experiment:updateRun",
    async (
      _event,
      args: { projectRoot: string; id: string; runId: string; notes: string },
    ) => {
      const ctxResult = resolveExperimentCtx(args.projectRoot);
      if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
      const result = updateRunNotes(
        ctxResult,
        (args.id || "").trim(),
        (args.runId || "").trim(),
        typeof args.notes === "string" ? args.notes : "",
      );
      if (!result.ok) return { ok: false as const, error: result.error };
      broadcastExperimentChanged({
        projectRoot: ctxResult.projectRoot,
        id: (args.id || "").trim(),
        reason: "update",
      });
      return { ok: true as const, run: result.run };
    },
  );

  ipcMain.handle(
    "experiment:restore",
    async (_event, args: { projectRoot: string; id: string }) => {
      const ctxResult = resolveExperimentCtx(args.projectRoot);
      if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
      const result = restoreExperiment(ctxResult, (args.id || "").trim());
      if (!result.ok) return { ok: false as const, error: result.error };
      broadcastExperimentChanged({
        projectRoot: ctxResult.projectRoot,
        id: result.meta.id,
        reason: "restore",
      });
      return { ok: true as const, meta: result.meta };
    },
  );

  ipcMain.handle(
    "experiment:delete",
    async (_event, args: { projectRoot: string; id: string; removeLab?: boolean }) => {
      const ctxResult = resolveExperimentCtx(args.projectRoot);
      if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
      const id = (args.id || "").trim();
      const result = deleteExperiment(ctxResult, id, { removeLab: args.removeLab === true });
      if (!result.ok) return { ok: false as const, error: result.error };
      broadcastExperimentChanged({
        projectRoot: ctxResult.projectRoot,
        id,
        reason: "delete",
      });
      return { ok: true as const };
    },
  );

  ipcMain.handle("experiment:read", async (_event, args: ExperimentReadArgs) => {
    const ctxResult = resolveExperimentCtx(args.projectRoot);
    if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
    const limit = typeof args.runsLimit === "number" && args.runsLimit > 0 ? args.runsLimit : 20;
    // Human UI needs stdout/stderr tails; agent bridge uses lean reads separately.
    const result = readExperiment(ctxResult, args.id, limit, { includeOutput: true });
    if (!result.ok) return { ok: false as const, error: result.error };
    return {
      ok: true as const,
      meta: result.meta,
      runs: result.runs,
      runCount: result.runCount,
      lastRunAt: result.lastRunAt,
      oldestRun: result.oldestRun,
      latestRun: result.latestRun,
      experimentRoot: result.workspaceRel,
      registryRoot: result.registryRoot,
    };
  });

  ipcMain.handle("experiment:detectEnv", async (_event, args: ExperimentDetectEnvArgs) => {
    const ctxResult = resolveExperimentCtx(args.projectRoot);
    if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
    const result = detectEnvForIsland(ctxResult, args.id);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, env: result.env, workspacePath: result.workspacePath };
  });

  ipcMain.handle("experiment:getPaths", async (_event, args: ExperimentGetPathsArgs) => {
    const ctxResult = resolveExperimentCtx(args.projectRoot);
    if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
    const workspaceAbs = workspaceIslandPathForId(ctxResult, args.id);
    if (!workspaceAbs) return { ok: false as const, error: "experiment_not_found" };
    if (!existsSync(workspaceAbs)) {
      return { ok: false as const, error: "experiment_not_found" };
    }
    return {
      ok: true as const,
      registryPath: join(EXPERIMENT_REGISTRY_REL, args.id),
      workspaceAbs,
      workspaceRel: `${ctxResult.workspaceRel}/${args.id}`,
    };
  });

  ipcMain.handle("experiment:run", async (event, args: ExperimentRunArgs) => {
    const ctxResult = resolveExperimentCtx(args.projectRoot);
    if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
    const id = (args.id || "").trim();
    const command = (args.command || "").trim();
    if (!id) return { ok: false as const, error: "experiment_not_found" };
    if (!command) return { ok: false as const, error: "missing_command" };
    if (!workspaceIslandPathForId(ctxResult, id)) {
      return { ok: false as const, error: "experiment_not_found" };
    }

    // Permission backstop: the renderer-side modal is the primary gate, but
    // main still refuses the call in readonly mode to mirror the agent path.
    const chatSessionId =
      typeof args.chatSessionId === "string" && args.chatSessionId.trim()
        ? args.chatSessionId.trim()
        : null;
    const settings = getSettings() as Record<string, unknown>;
    const mode = resolvePermissionMode(settings.permissionMode as string | undefined);
    const permRules = buildPermissionRulesFromSettings(settings);
    const sessionAgent = chatSessionId
      ? AcpService.getInstanceForSession(chatSessionId).getSessionAgent(chatSessionId)
      : undefined;
    const action = resolvePermissionAction(mode, "experiment-run", sessionAgent, {
      projectRoot: args.projectRoot,
      bashCwd: args.projectRoot,
    }, permRules);
    if (action === "deny") {
      const planBlocked = sessionAgent === "plan";
      return {
        ok: false as const,
        error: "permission_denied",
        hint: planBlocked
          ? "Plan mode blocks experiment runs; switch the tab to Build to run."
          : "Current permission mode is read-only; experiment runs are disabled.",
      };
    }

    const runId = generateRunId();
    const sender = event.sender;
    const kind = parseExperimentRunKind(args.kind);
    if (args.kind !== undefined && args.kind !== null && String(args.kind).trim() && !kind) {
      return {
        ok: false as const,
        error: "invalid_run_kind",
        hint: "kind must be one of: train, eval, plot, data, setup, other (or omit)",
      };
    }
    // Stream events (started / output / complete) are broadcast from the
    // executor so Agent bridge runs share the same Chat live path (Station 2).
    // Pass originSender so this window still gets events origin-first (Bug #4).
    kickoffExperimentRun({
      ctx: ctxResult,
      id,
      command,
      artifacts: args.artifacts,
      notes: args.notes,
      kind,
      runId,
      chatSessionId,
      originSender: sender,
    });
    return { ok: true as const, runId, status: "started" as const };
  });

  ipcMain.handle("experiment:cancelRun", (_event, args: ExperimentCancelRunArgs) => {
    const id = (args.id || "").trim();
    const runId = (args.runId || "").trim();
    if (!id || !runId) return { ok: true as const };
    // Stamp before kill so the eventual appendRun can mark cancelled (Bug #21).
    markExperimentRunCancelled(id, runId);
    cancelAiCommandForSession(`experiment:${id}:${runId}`);
    return { ok: true as const };
  });

  // Station 3 — read-only workspace scan for Results panel (same core as agent tool).
  ipcMain.handle("experiment:snapshot", async (_event, args: ExperimentSnapshotArgs) => {
    const ctxResult = resolveExperimentCtx(args.projectRoot);
    if ("ok" in ctxResult && ctxResult.ok === false) return ctxResult;
    const id = (args.id || "").trim();
    if (!id) return { ok: false as const, error: "experiment_not_found" };
    const result = snapshotExperiment(ctxResult, id, {
      scanDirs: args.scanDirs,
      metricsFiles: args.metricsFiles,
      maxFiles: args.maxFiles,
      maxDepth: args.maxDepth,
    });
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    return { ok: true as const, snapshot: result.snapshot };
  });
}

// Re-export the event argument type for any future test helpers.
export type { IpcMainInvokeEvent };
