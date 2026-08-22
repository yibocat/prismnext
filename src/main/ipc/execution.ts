import { BrowserWindow, ipcMain } from "electron";
import type {
  ExecutionApplyProjectSwitchArgs,
  ExecutionApplyProjectSwitchResult,
  ExecutionCancelResult,
  ExecutionFindByToolCallIdResult,
  ExecutionGetResult,
  ExecutionListRunningResult,
  ExecutionReplayArgs,
  ExecutionReplayResult,
  ExecutionRerunResult,
  TerminalExecutionEvent,
} from "../../shared/execution";
import { projectLifecycleAuthority } from "../project/project-lifecycle-authority";
import {
  getExecutionRegistry,
  type ExecutionRegistry,
} from "../terminal/execution-registry";

export interface ExecutionIpcOptions {
  registry?: ExecutionRegistry;
  getCallerProjectId?: () => string | null;
}

const NOT_AVAILABLE = { ok: false as const, error: "execution_not_available" };

let stopBroadcast: (() => void) | undefined;

function authorize(
  registry: ExecutionRegistry,
  executionId: string,
  projectId: string | null,
) {
  if (!projectId || !executionId) return null;
  const summary = registry.get(executionId);
  if (!summary || summary.projectId !== projectId) return null;
  return summary;
}

function broadcastExecutionEvent(
  registry: ExecutionRegistry,
  getCallerProjectId: () => string | null,
  event: TerminalExecutionEvent,
): void {
  const summary = registry.get(event.executionId);
  const projectId = getCallerProjectId();
  if (!summary || !projectId || summary.projectId !== projectId) return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send("execution:event", event);
  }
}

function resolveRegistry(options: ExecutionIpcOptions): ExecutionRegistry | null {
  if (options.registry) return options.registry;
  try {
    return getExecutionRegistry();
  } catch {
    return null;
  }
}

export function startExecutionEventBroadcast(options: ExecutionIpcOptions = {}): void {
  const registry = resolveRegistry(options);
  const getCallerProjectId = options.getCallerProjectId ?? (() => projectLifecycleAuthority.currentRoot);
  stopBroadcast?.();
  if (!registry) {
    stopBroadcast = undefined;
    return;
  }
  stopBroadcast = registry.subscribe((event) => {
    broadcastExecutionEvent(registry, getCallerProjectId, event);
  });
}

export function registerExecutionHandlers(options: ExecutionIpcOptions = {}): void {
  const getCallerProjectId = options.getCallerProjectId ?? (() => projectLifecycleAuthority.currentRoot);

  startExecutionEventBroadcast(options);

  ipcMain.handle("execution:get", async (_event, args: { executionId?: string }): Promise<ExecutionGetResult> => {
    const registry = resolveRegistry(options);
    if (!registry) return NOT_AVAILABLE;
    const summary = authorize(registry, args?.executionId ?? "", getCallerProjectId());
    if (!summary) return NOT_AVAILABLE;
    return { ok: true, summary };
  });

  ipcMain.handle(
    "execution:findByToolCallId",
    async (_event, args: { toolCallId?: string }): Promise<ExecutionFindByToolCallIdResult> => {
      const registry = resolveRegistry(options);
      if (!registry) return NOT_AVAILABLE;
      const summary = registry.findByToolCallId((args?.toolCallId ?? "").trim());
      const projectId = getCallerProjectId();
      if (!summary || !projectId || summary.projectId !== projectId) return NOT_AVAILABLE;
      return { ok: true, summary };
    },
  );

  ipcMain.handle(
    "execution:replay",
    async (_event, args: ExecutionReplayArgs): Promise<ExecutionReplayResult> => {
      const registry = resolveRegistry(options);
      if (!registry) return NOT_AVAILABLE;
      const summary = authorize(registry, args?.executionId ?? "", getCallerProjectId());
      if (!summary) return NOT_AVAILABLE;
      const replay = await registry.replay(args.executionId, args.fromSequence ?? 0);
      return { ok: true, summary: replay.summary, events: replay.events };
    },
  );

  ipcMain.handle(
    "execution:cancel",
    async (_event, args: { executionId?: string }): Promise<ExecutionCancelResult> => {
      const registry = resolveRegistry(options);
      if (!registry) return NOT_AVAILABLE;
      const summary = authorize(registry, args?.executionId ?? "", getCallerProjectId());
      if (!summary) return NOT_AVAILABLE;
      await registry.cancel(summary.executionId, "user");
      return { ok: true };
    },
  );

  ipcMain.handle(
    "execution:rerun",
    async (_event, args: { executionId?: string }): Promise<ExecutionRerunResult> => {
      const registry = resolveRegistry(options);
      if (!registry) return NOT_AVAILABLE;
      const summary = authorize(registry, args?.executionId ?? "", getCallerProjectId());
      if (!summary) return NOT_AVAILABLE;
      const next = await registry.create({
        origin: summary.origin,
        command: summary.command,
        cwd: summary.cwd,
        projectId: summary.projectId,
        chatTabId: summary.chatTabId,
        opencodeSessionId: summary.opencodeSessionId,
        toolCallId: summary.toolCallId,
        experimentId: summary.experimentId,
        runId: summary.runId,
      });
      return { ok: true, executionId: next.executionId };
    },
  );

  ipcMain.handle("execution:listRunning", async (): Promise<ExecutionListRunningResult> => {
    const registry = resolveRegistry(options);
    const projectId = getCallerProjectId();
    if (!registry || !projectId) return NOT_AVAILABLE;
    return { ok: true, summaries: registry.listRunning(projectId) };
  });

  ipcMain.handle(
    "execution:applyProjectSwitch",
    async (
      _event,
      args: ExecutionApplyProjectSwitchArgs,
    ): Promise<ExecutionApplyProjectSwitchResult> => {
      const registry = resolveRegistry(options);
      const projectId = (args?.projectId || "").trim();
      const callerProjectId = getCallerProjectId();
      if (!registry || !projectId || !callerProjectId || callerProjectId !== projectId) {
        return NOT_AVAILABLE;
      }
      await registry.applyProjectSwitch(projectId, {
        stopExperimentIds: args?.stopExperimentIds,
      });
      return { ok: true };
    },
  );
}
