import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runAiBashJob,
  _resetAiBashRunnerForTests,
} from "../../src/main/services/ai-bash-runner";
import {
  getExecutionRegistry,
  initExecutionRegistry,
  _resetExecutionRegistryForTests,
  type ExecutionTransport,
  type ExecutionTransportHandlers,
} from "../../src/main/services/execution-registry";

function createFakeTransport() {
  const started: string[] = [];
  const handlers = new Map<string, ExecutionTransportHandlers>();
  const transport: ExecutionTransport & {
    started: string[];
    emitOutput(executionId: string, data: string): void;
    emitExit(executionId: string, exitCode: number): void;
  } = {
    started,
    async start(execution, next) {
      started.push(execution.executionId);
      handlers.set(execution.executionId, next);
      next.onOutput("bridge-ok\n");
      next.onExit(0);
    },
    async cancel() {},
    emitOutput(executionId, data) {
      handlers.get(executionId)?.onOutput(data);
    },
    emitExit(executionId, exitCode) {
      handlers.get(executionId)?.onExit(exitCode);
    },
  };
  return transport;
}

describe("runAiBashJob via ExecutionRegistry", () => {
  const dirs: string[] = [];
  let historyRoot: string;
  let fakeTransport: ReturnType<typeof createFakeTransport>;

  beforeEach(() => {
    historyRoot = mkdtempSync(join(tmpdir(), "prism-bash-exec-"));
    dirs.push(historyRoot);
    fakeTransport = createFakeTransport();
    initExecutionRegistry(historyRoot, fakeTransport);
    _resetAiBashRunnerForTests();
  });

  afterEach(() => {
    _resetAiBashRunnerForTests();
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

  it("records the job on the execution registry", async () => {
    const job = await runAiBashJob({
      sessionId: "ses-1",
      chatTabId: "chat-1",
      toolCallId: "tool-1",
      command: "echo bridge-ok",
      cwd: historyRoot,
      projectRoot: historyRoot,
    });
    const execution = getExecutionRegistry().get(job.executionId);
    expect(job.executionId).toMatch(/[0-9a-f-]{36}/);
    expect(execution).toBeDefined();
    await getExecutionRegistry().waitForFinal(job.executionId);
    expect(job.output).toBe(execution?.transcriptTail);
    expect(job.exitCode).toBe(0);
    expect(fakeTransport.started).toEqual([job.executionId]);
  });

  it("dedupes an approval race to one execution and one PTY start", async () => {
    const args = {
      sessionId: "ses-race",
      chatTabId: "chat-1",
      toolCallId: "tool-race",
      command: "echo once",
      cwd: historyRoot,
      projectRoot: historyRoot,
    };
    const [first, second] = await Promise.all([runAiBashJob(args), runAiBashJob(args)]);
    expect(first.executionId).toBe(second.executionId);
    expect(fakeTransport.started).toEqual([first.executionId]);
  });

  it("records a failed execution without spawning when LaTeX is blocked", async () => {
    const job = await runAiBashJob({
      sessionId: "ses-tex",
      chatTabId: "chat-1",
      toolCallId: "tool-tex",
      command: "pdflatex main.tex",
      cwd: historyRoot,
      projectRoot: historyRoot,
    });
    const execution = getExecutionRegistry().get(job.executionId);
    expect(execution?.state).toBe("failed");
    expect(execution?.exitCode).toBe(1);
    expect(job.exitCode).toBe(1);
    expect(fakeTransport.started).toEqual([]);
  });
});
