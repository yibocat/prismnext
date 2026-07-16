/**
 * experiment:* IPC — UI track for the Experiments RightArea mode (Sprint 0.7).
 *
 * Mirrors the file-bridge flow (single source of truth: `experiment-log-service` +
 * `kickoffExperimentRun`). Validates the project has a Workspace Experiment folder
 * configured and consults the current permission mode before kicking off a run.
 */
import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cancelAiCommandForSession } from "../services/ai-pty";
import { getSettings } from "../services/settings";
import {
  archiveExperiment,
  deleteExperiment,
  detectEnvForIsland,
  generateRunId,
  listExperiments,
  readExperiment,
  resolveExperimentCtx,
  restoreExperiment,
  workspaceIslandPathForId,
} from "../services/experiment-log-service";
import {
  kickoffExperimentRun,
  markExperimentRunCancelled,
  type ExperimentRunResult,
} from "../services/experiment-run-executor";
import { broadcastExperimentChanged } from "../services/experiment-ui-events";
import { resolvePermissionAction, resolvePermissionMode } from "../services/permission-modes";
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
    const result = readExperiment(ctxResult, args.id, limit);
    if (!result.ok) return { ok: false as const, error: result.error };
    return {
      ok: true as const,
      meta: result.meta,
      runs: result.runs,
      runCount: result.runCount,
      lastRunAt: result.lastRunAt,
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
    const mode = resolvePermissionMode(
      (getSettings() as Record<string, unknown>).permissionMode as string | undefined,
    );
    const action = resolvePermissionAction(mode, "experiment-run");
    if (action === "deny") {
      return {
        ok: false as const,
        error: "permission_denied",
        hint: "Current permission mode is read-only; experiment runs are disabled.",
      };
    }

    const runId = generateRunId();
    const sender = event.sender;
    const chatSessionId =
      typeof args.chatSessionId === "string" && args.chatSessionId.trim()
        ? args.chatSessionId.trim()
        : null;
    const kind = parseExperimentRunKind(args.kind);
    if (args.kind !== undefined && args.kind !== null && String(args.kind).trim() && !kind) {
      return {
        ok: false as const,
        error: "invalid_run_kind",
        hint: "kind must be one of: train, eval, plot, data, setup, other (or omit)",
      };
    }
    kickoffExperimentRun({
      ctx: ctxResult,
      id,
      command,
      artifacts: args.artifacts,
      notes: args.notes,
      kind,
      runId,
      chatSessionId,
      onOutputChunk: (chunk) => {
        // Send to the originating renderer (preserves the contract that the
        // caller is guaranteed to receive its own run's events) AND broadcast
        // to every other live renderer window. The broadcast path lets a
        // renderer that reloaded (Cmd-R) mid-run still receive subsequent
        // chunks as soon as it resubscribes — fixes Bug #4 from the
        // architecture audit, where capturing `event.sender` at handler time
        // meant the post-reload WebContents never saw the live stream.
        sendToRunSubscribers(sender, "experiment:runOutput", { id, runId, chunk });
      },
      onComplete: (result: ExperimentRunResult) => {
        sendToRunSubscribers(sender, "experiment:runComplete", { id, runId, result });
      },
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
}

/**
 * Send an event to the originating renderer AND every other live renderer
 * window. Replaces the prior pattern of capturing `event.sender` at
 * IPC-handler time and calling `sender.send(...)` later from an async
 * callback — that dropped the event if the renderer reloaded (Cmd-R)
 * between kickoff and completion (Bug #4 in
 * docs/audit/experiment-agent-architecture-analysis.md).
 *
 * The originating sender is still called so the caller is guaranteed its
 * own events regardless of how the broadcast iterates. Other windows
 * receive the same payload and filter by `runId` / `projectRoot` on the
 * renderer side; we don't need to maintain a subscriber map in main.
 */
function sendToRunSubscribers<T>(
  origin: { send: (channel: string, payload: T) => void } | undefined,
  channel: string,
  payload: T,
): void {
  // Track which webContents we already sent to so we don't double-fire
  // the originating renderer in the broadcast loop below.
  const sentTo = new WeakSet<object>();
  // Primary path — the renderer that invoked `experiment:run` always gets
  // its own run's events. We do this first so a misbehaving BrowserWindow
  // iterator (e.g. a stale webContents reference) cannot starve the caller.
  if (origin) {
    sentTo.add(origin as object);
    try {
      origin.send(channel, payload);
    } catch {
      // The originating window is gone; fall through to the broadcast path
      // in case another window picked up the reload.
    }
  }
  // Broadcast path — every other live renderer window also gets the event
  // so that a renderer which reloaded mid-run (and now has a fresh
  // webContents) can pick up where it left off as soon as its preload
  // resubscribes via `onExperimentRunOutput`.
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const wc = win.webContents;
    if (sentTo.has(wc)) continue;
    sentTo.add(wc);
    try {
      wc.send(channel, payload);
    } catch {
      // Renderer may be in the middle of reloading; ignore.
    }
  }
}

// Re-export the event argument type for any future test helpers.
export type { IpcMainInvokeEvent };
