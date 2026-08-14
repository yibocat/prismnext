import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type IpcHandler = (event: unknown, args: unknown) => unknown | Promise<unknown>;
const handlers = new Map<string, IpcHandler>();

vi.mock("electron", () => ({
  ipcMain: {
    handle(channel: string, fn: IpcHandler) {
      handlers.set(channel, fn);
    },
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

import { registerExecutionHandlers } from "../../src/main/ipc/execution";
import {
  createExecutionRegistry,
  type ExecutionTransport,
  type ExecutionTransportHandlers,
  _resetExecutionRegistryForTests,
} from "../../src/main/services/execution-registry";

function createFakeTransport() {
  const next = new Map<string, ExecutionTransportHandlers>();
  const transport: ExecutionTransport & {
    emitExit(executionId: string, exitCode: number): void;
  } = {
    async start(execution, handlers) {
      next.set(execution.executionId, handlers);
    },
    async cancel(executionId) {
      next.get(executionId)?.onExit(130);
    },
    emitExit(executionId, exitCode) {
      next.get(executionId)?.onExit(exitCode);
    },
  };
  return transport;
}

describe("execution:* IPC", () => {
  const dirs: string[] = [];

  beforeEach(() => {
    handlers.clear();
    _resetExecutionRegistryForTests();
  });

  afterEach(() => {
    _resetExecutionRegistryForTests();
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    dirs.length = 0;
  });

  function setup(callerProjectId: string | null) {
    const historyRoot = mkdtempSync(join(tmpdir(), "prism-exec-ipc-"));
    dirs.push(historyRoot);
    const registry = createExecutionRegistry({
      transport: createFakeTransport(),
      historyRoot,
    });
    registerExecutionHandlers({
      registry,
      getCallerProjectId: () => callerProjectId,
    });
    return registry;
  }

  it("replays only executions attached to the caller project", async () => {
    const registry = setup("proj-a");
    const foreign = await registry.create({
      origin: "agent-bash",
      command: "echo foreign",
      cwd: process.cwd(),
      projectId: "proj-b",
    });

    const result = await handlers.get("execution:replay")!({}, {
      executionId: foreign.executionId,
      fromSequence: 0,
    });
    expect(result).toEqual({ ok: false, error: "execution_not_available" });
  });

  it("replays executions that belong to the caller project", async () => {
    const registry = setup("proj-a");
    const local = await registry.create({
      origin: "agent-bash",
      command: "echo local",
      cwd: process.cwd(),
      projectId: "proj-a",
    });

    const result = await handlers.get("execution:replay")!({}, {
      executionId: local.executionId,
      fromSequence: 0,
    });
    expect(result).toMatchObject({
      ok: true,
      summary: { executionId: local.executionId, projectId: "proj-a" },
    });
    expect((result as { events: unknown[] }).events.length).toBeGreaterThan(0);
  });

  it("refuses cancel and get when no project is authorized", async () => {
    const registry = setup(null);
    const execution = await registry.create({
      origin: "agent-bash",
      command: "sleep 30",
      cwd: process.cwd(),
      projectId: "proj-a",
    });

    await expect(handlers.get("execution:get")!({}, { executionId: execution.executionId })).resolves.toEqual({
      ok: false,
      error: "execution_not_available",
    });
    await expect(handlers.get("execution:cancel")!({}, { executionId: execution.executionId })).resolves.toEqual({
      ok: false,
      error: "execution_not_available",
    });
  });

  it("lists only running executions for the caller project", async () => {
    const registry = setup("proj-a");
    const local = await registry.create({
      origin: "agent-bash",
      command: "sleep 30",
      cwd: process.cwd(),
      projectId: "proj-a",
    });
    await registry.create({
      origin: "experiment-run",
      command: "python train.py",
      cwd: process.cwd(),
      projectId: "proj-b",
      experimentId: "exp-1",
      runId: "run-1",
    });

    const result = await handlers.get("execution:listRunning")!({}, {});
    expect(result).toMatchObject({ ok: true });
    expect((result as { summaries: { executionId: string }[] }).summaries.map((item) => item.executionId))
      .toEqual([local.executionId]);
  });

  it("applies project switch only for the authorized project", async () => {
    const registry = setup("proj-a");
    const agent = await registry.create({
      origin: "agent-bash",
      command: "sleep 30",
      cwd: process.cwd(),
      projectId: "proj-a",
    });
    const keep = await registry.create({
      origin: "experiment-run",
      command: "python keep.py",
      cwd: process.cwd(),
      projectId: "proj-a",
      experimentId: "keep",
      runId: "run-keep",
    });

    await expect(handlers.get("execution:applyProjectSwitch")!({}, {
      projectId: "proj-b",
      stopExperimentIds: [],
    })).resolves.toEqual({ ok: false, error: "execution_not_available" });

    await expect(handlers.get("execution:applyProjectSwitch")!({}, {
      projectId: "proj-a",
      stopExperimentIds: [],
    })).resolves.toEqual({ ok: true });
    expect(registry.get(agent.executionId)?.state).toBe("cancelled");
    expect(registry.get(keep.executionId)?.state).toBe("running");
  });

  it("finds a restored execution by toolCallId for the caller project", async () => {
    const registry = setup("proj-a");
    const local = await registry.create({
      origin: "agent-bash",
      command: "echo local",
      cwd: process.cwd(),
      projectId: "proj-a",
      toolCallId: "tool-local",
    });
    await registry.create({
      origin: "agent-bash",
      command: "echo foreign",
      cwd: process.cwd(),
      projectId: "proj-b",
      toolCallId: "tool-foreign",
    });

    await expect(handlers.get("execution:findByToolCallId")!({}, { toolCallId: "tool-local" })).resolves.toMatchObject({
      ok: true,
      summary: { executionId: local.executionId, toolCallId: "tool-local" },
    });
    await expect(handlers.get("execution:findByToolCallId")!({}, { toolCallId: "tool-foreign" })).resolves.toEqual({
      ok: false,
      error: "execution_not_available",
    });
  });
});
