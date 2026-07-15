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
  detectEnvForIsland,
  generateRunId,
  listExperiments,
  readExperiment,
  resolveExperimentCtx,
  workspaceIslandPathForId,
} from "../services/experiment-log-service";
import {
  kickoffExperimentRun,
  type ExperimentRunResult,
} from "../services/experiment-run-executor";
import { resolvePermissionAction, resolvePermissionMode } from "../services/permission-modes";
import { EXPERIMENT_REGISTRY_REL } from "../../shared/experiment-log";

interface ExperimentListArgs {
  projectRoot: string;
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
    const list = listExperiments(ctxResult);
    return {
      ok: true as const,
      experimentRoot: ctxResult.workspaceRel,
      registryRoot: EXPERIMENT_REGISTRY_REL,
      experiments: list.experiments,
    };
  });

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
    kickoffExperimentRun({
      ctx: ctxResult,
      id,
      command,
      artifacts: args.artifacts,
      notes: args.notes,
      runId,
      chatSessionId,
      onOutputChunk: (chunk) => {
        try {
          sender.send("experiment:runOutput", { id, runId, chunk });
        } catch {
          // Window may have closed.
        }
      },
      onComplete: (result: ExperimentRunResult) => {
        try {
          sender.send("experiment:runComplete", { id, runId, result });
        } catch {
          // Window may have closed; ignore — the run record is already in runs.jsonl.
        }
      },
    });
    return { ok: true as const, runId, status: "started" as const };
  });

  ipcMain.handle("experiment:cancelRun", (_event, args: ExperimentCancelRunArgs) => {
    const id = (args.id || "").trim();
    const runId = (args.runId || "").trim();
    if (!id || !runId) return { ok: true as const };
    cancelAiCommandForSession(`experiment:${id}:${runId}`);
    return { ok: true as const };
  });
}

// Re-export the event argument type for any future test helpers.
export type { IpcMainInvokeEvent };
