import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createExecutionRegistry,
  type ExecutionTransport,
  type ExecutionTransportHandlers,
} from "../../src/main/terminal/execution-registry";

function createFakeTransport() {
  const handlers = new Map<string, ExecutionTransportHandlers>();
  const cancelled: string[] = [];
  const transport: ExecutionTransport & {
    cancelled: string[];
    emitOutput(executionId: string, data: string): void;
    emitExit(executionId: string, exitCode: number): void;
  } = {
    cancelled,
    async start(execution, next) {
      handlers.set(execution.executionId, next);
    },
    async cancel(executionId) {
      cancelled.push(executionId);
    },
    emitOutput(executionId, data) {
      handlers.get(executionId)?.onOutput(data);
    },
    emitExit(executionId, exitCode) {
      handlers.get(executionId)?.onExit(exitCode);
    },
  };
  return transport;
}

describe("execution-registry", () => {
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

  function tempRoot(): string {
    const dir = mkdtempSync(join(tmpdir(), "prism-exec-"));
    dirs.push(dir);
    return dir;
  }

  it("replays ordered output to a late viewer", async () => {
    const historyRoot = tempRoot();
    const fakeTransport = createFakeTransport();
    const registry = createExecutionRegistry({ transport: fakeTransport, historyRoot });
    const execution = await registry.create({
      origin: "agent-bash",
      command: "echo one",
      cwd: historyRoot,
      projectId: "proj-a",
    });
    fakeTransport.emitOutput(execution.executionId, "one\n");
    fakeTransport.emitExit(execution.executionId, 0);

    const replay = await registry.replay(execution.executionId, 0);
    expect(replay.events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(replay.events.at(-1)?.state).toBe("completed");
  });

  it("cancels exactly one execution", async () => {
    const historyRoot = tempRoot();
    const fakeTransport = createFakeTransport();
    const registry = createExecutionRegistry({ transport: fakeTransport, historyRoot });
    const first = await registry.create({
      origin: "agent-bash",
      command: "sleep 30",
      cwd: historyRoot,
      projectId: "proj-a",
    });
    const second = await registry.create({
      origin: "agent-bash",
      command: "sleep 30",
      cwd: historyRoot,
      projectId: "proj-a",
    });
    await registry.cancel(first.executionId, "user");
    expect(fakeTransport.cancelled).toEqual([first.executionId]);
    expect(fakeTransport.cancelled).not.toContain(second.executionId);
  });

  it("persists transcript and sequenced events", async () => {
    const historyRoot = tempRoot();
    const fakeTransport = createFakeTransport();
    const registry = createExecutionRegistry({ transport: fakeTransport, historyRoot });
    const execution = await registry.create({
      origin: "experiment-run",
      command: "echo one",
      cwd: historyRoot,
      projectId: "proj-a",
    });
    fakeTransport.emitOutput(execution.executionId, "one\n");
    fakeTransport.emitExit(execution.executionId, 0);

    expect(readFileSync(join(historyRoot, execution.executionId, "transcript.log"), "utf8")).toContain("one");
    expect(readFileSync(join(historyRoot, execution.executionId, "events.ndjson"), "utf8")).toContain('"sequence":');
  });

  it("ignores a second exit so only one final event exists", async () => {
    const historyRoot = tempRoot();
    const fakeTransport = createFakeTransport();
    const registry = createExecutionRegistry({ transport: fakeTransport, historyRoot });
    const execution = await registry.create({
      origin: "agent-bash",
      command: "echo one",
      cwd: historyRoot,
      projectId: "proj-a",
    });
    fakeTransport.emitExit(execution.executionId, 0);
    fakeTransport.emitExit(execution.executionId, 1);
    const replay = await registry.replay(execution.executionId, 0);
    expect(replay.events.filter((event) => event.type === "exited")).toHaveLength(1);
    expect(registry.get(execution.executionId)?.state).toBe("completed");
    expect(registry.get(execution.executionId)?.exitCode).toBe(0);
  });

  it("cancels a created execution without starting the transport", async () => {
    const historyRoot = tempRoot();
    const fakeTransport = createFakeTransport();
    const registry = createExecutionRegistry({ transport: fakeTransport, historyRoot });
    const execution = await registry.create(
      {
        origin: "experiment-run",
        command: "sleep 30",
        cwd: historyRoot,
        projectId: "proj-a",
      },
      { start: false },
    );
    expect(registry.get(execution.executionId)?.state).toBe("created");
    await registry.cancel(execution.executionId, "user");
    expect(registry.get(execution.executionId)?.state).toBe("cancelled");
    expect(fakeTransport.cancelled).toEqual([]);
    await registry.start(execution.executionId);
    expect(fakeTransport.cancelled).toEqual([]);
    expect(registry.get(execution.executionId)?.state).toBe("cancelled");
  });

  it("lists only non-final executions, optionally by project", async () => {
    const historyRoot = tempRoot();
    const fakeTransport = createFakeTransport();
    const registry = createExecutionRegistry({ transport: fakeTransport, historyRoot });
    const running = await registry.create({
      origin: "agent-bash",
      command: "sleep 30",
      cwd: historyRoot,
      projectId: "proj-a",
    });
    const other = await registry.create({
      origin: "experiment-run",
      command: "sleep 30",
      cwd: historyRoot,
      projectId: "proj-b",
    });
    const done = await registry.create({
      origin: "agent-bash",
      command: "echo done",
      cwd: historyRoot,
      projectId: "proj-a",
    });
    fakeTransport.emitExit(done.executionId, 0);

    expect(registry.listRunning().map((item) => item.executionId).sort()).toEqual(
      [other.executionId, running.executionId].sort(),
    );
    expect(registry.listRunning("proj-a").map((item) => item.executionId)).toEqual([running.executionId]);
  });

  it("reloads a finished execution from history, including toolCallId", async () => {
    const historyRoot = tempRoot();
    const transport = createFakeTransport();
    const live = createExecutionRegistry({ transport, historyRoot });
    const created = await live.create({
      origin: "agent-bash",
      command: "echo hi",
      cwd: historyRoot,
      projectId: "proj-a",
      toolCallId: "tool-hist",
      chatTabId: "chat-1",
    });
    transport.emitOutput(created.executionId, "hello\n");
    transport.emitExit(created.executionId, 0);

    const restored = createExecutionRegistry({ transport: createFakeTransport(), historyRoot });
    expect(restored.get(created.executionId)?.command).toBe("echo hi");
    expect(restored.findByToolCallId("tool-hist")?.executionId).toBe(created.executionId);
    const replay = await restored.replay(created.executionId, 0);
    expect(replay.events.some((event) => event.data === "hello\n")).toBe(true);
  });

  it("marks a persisted in-flight execution as lost instead of restarting it", async () => {
    const historyRoot = tempRoot();
    const transport = createFakeTransport();
    const live = createExecutionRegistry({ transport, historyRoot });
    const created = await live.create({
      origin: "experiment-run",
      command: "python train.py",
      cwd: historyRoot,
      projectId: "proj-a",
      toolCallId: "tool-run",
      experimentId: "exp-1",
      runId: "run-1",
    });
    transport.emitOutput(created.executionId, "epoch 1\n");

    const restored = createExecutionRegistry({ transport: createFakeTransport(), historyRoot });
    expect(restored.get(created.executionId)?.state).toBe("lost");
    expect(restored.listRunning()).toEqual([]);
    const replay = await restored.replay(created.executionId, 0);
    expect(replay.events.some((event) => event.data === "epoch 1\n")).toBe(true);
  });
});
