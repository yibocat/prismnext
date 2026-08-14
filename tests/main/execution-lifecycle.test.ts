import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createExecutionRegistry,
  type ExecutionTransport,
  type ExecutionTransportHandlers,
} from "../../src/main/services/execution-registry";

function createFakeTransport() {
  const handlers = new Map<string, ExecutionTransportHandlers>();
  const cancelled: string[] = [];
  const transport: ExecutionTransport & {
    cancelled: string[];
    emitExit(executionId: string, exitCode: number): void;
  } = {
    cancelled,
    async start(execution, next) {
      handlers.set(execution.executionId, next);
    },
    async cancel(executionId) {
      cancelled.push(executionId);
      handlers.get(executionId)?.onExit(130);
    },
    emitExit(executionId, exitCode) {
      handlers.get(executionId)?.onExit(exitCode);
    },
  };
  return transport;
}

describe("execution lifecycle policy", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    dirs.length = 0;
  });

  function setup() {
    const historyRoot = mkdtempSync(join(tmpdir(), "prism-exec-life-"));
    dirs.push(historyRoot);
    const transport = createFakeTransport();
    const registry = createExecutionRegistry({ transport, historyRoot });
    return { registry, transport, historyRoot };
  }

  it("cancels only agent-bash executions for a chat close", async () => {
    const { registry } = setup();
    const chatExecution = await registry.create({
      origin: "agent-bash",
      command: "sleep 30",
      cwd: "/tmp",
      projectId: "/proj",
      chatTabId: "chat-1",
    });
    const experimentExecution = await registry.create({
      origin: "experiment-run",
      command: "python train.py",
      cwd: "/tmp/exp",
      projectId: "/proj",
      chatTabId: "chat-1",
      experimentId: "exp-1",
      runId: "run-1",
    });

    await registry.cancelForChat("chat-1");

    expect(registry.get(chatExecution.executionId)?.state).toBe("cancelled");
    expect(registry.get(experimentExecution.executionId)?.state).toBe("running");
  });

  it("project switch cancels agent jobs and only the chosen experiments", async () => {
    const { registry } = setup();
    const agent = await registry.create({
      origin: "agent-bash",
      command: "ls",
      cwd: "/tmp",
      projectId: "/proj-a",
      chatTabId: "chat-1",
    });
    const keep = await registry.create({
      origin: "experiment-run",
      command: "python keep.py",
      cwd: "/tmp/keep",
      projectId: "/proj-a",
      experimentId: "keep",
      runId: "run-keep",
    });
    const stop = await registry.create({
      origin: "experiment-run",
      command: "python stop.py",
      cwd: "/tmp/stop",
      projectId: "/proj-a",
      experimentId: "stop",
      runId: "run-stop",
    });

    await registry.applyProjectSwitch("/proj-a", { stopExperimentIds: [stop.executionId] });

    expect(registry.get(agent.executionId)?.state).toBe("cancelled");
    expect(registry.get(stop.executionId)?.state).toBe("cancelled");
    expect(registry.get(keep.executionId)?.state).toBe("running");
  });

  it("quit requests cancellation for every running execution", async () => {
    const { registry } = setup();
    const first = await registry.create({
      origin: "agent-bash",
      command: "sleep 1",
      cwd: "/tmp",
      projectId: "/proj",
    });
    const second = await registry.create({
      origin: "experiment-run",
      command: "python train.py",
      cwd: "/tmp",
      projectId: "/proj",
      experimentId: "exp-1",
      runId: "run-1",
    });

    await registry.finalizeForQuit();

    expect(registry.get(first.executionId)?.state).toBe("cancelled");
    expect(registry.get(second.executionId)?.state).toBe("cancelled");
  });
});
