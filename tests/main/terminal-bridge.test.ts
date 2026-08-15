import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { processBridgeOnceForTests } from "../../src/main/services/terminal-bridge";
import { registerChatSession, _resetChatSessionRegistryForTests } from "../../src/main/services/chat-session-registry";
import { _resetAiPtyForTests } from "../../src/main/services/ai-pty";
import {
  _readBridgeResultForTests,
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
  const transport: ExecutionTransport & { started: string[] } = {
    started,
    async start(execution, next) {
      started.push(execution.executionId);
      handlers.set(execution.executionId, next);
      next.onOutput("already-running\n");
      next.onExit(0);
    },
    async cancel() {},
  };
  return transport;
}

describe("terminal-bridge", () => {
  const bridgeRoot = join(tmpdir(), "prism-terminal-bridge-test");
  const sessionDir = join(bridgeRoot, "test-session");

  beforeEach(() => {
    process.env.PRISM_TERMINAL_BRIDGE_ROOT = bridgeRoot;
    _resetChatSessionRegistryForTests();
    _resetAiPtyForTests();
    _resetAiBashRunnerForTests();
    _resetExecutionRegistryForTests();
    registerChatSession("test-session", "chat-tab-1");
    mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.PRISM_TERMINAL_BRIDGE_ROOT;
    _resetChatSessionRegistryForTests();
    _resetAiPtyForTests();
    _resetAiBashRunnerForTests();
    _resetExecutionRegistryForTests();
    try {
      rmSync(bridgeRoot, { recursive: true, force: true });
    } catch {}
  });

  it("executes bridge request via PTY and writes result + stream", async () => {
    const reqId = "req-1";
    writeFileSync(
      join(sessionDir, `${reqId}.request.json`),
      JSON.stringify({
        command: "echo bridge-ok",
        cwd: process.cwd(),
        sessionId: "test-session",
        requestId: reqId,
      }),
      "utf-8",
    );

    await processBridgeOnceForTests();

    const resPath = join(sessionDir, `${reqId}.result.json`);
    const streamPath = join(sessionDir, `${reqId}.stream`);
    expect(existsSync(resPath)).toBe(true);
    expect(existsSync(streamPath)).toBe(true);
    const result = JSON.parse(readFileSync(resPath, "utf-8"));
    expect(result.output).toContain("bridge-ok");
    expect(result.exitCode).toBe(0);
    expect(readFileSync(streamPath, "utf-8")).toContain("bridge-ok");
  });

  it("does not start a second PTY when a legacy bridge request maps to an existing execution", async () => {
    const historyRoot = join(bridgeRoot, "execution-history");
    mkdirSync(historyRoot, { recursive: true });
    const transport = createFakeTransport();
    initExecutionRegistry(historyRoot, transport);

    const execution = await getExecutionRegistry().create({
      origin: "agent-bash",
      command: "echo already",
      cwd: process.cwd(),
      projectId: process.cwd(),
      chatTabId: "chat-tab-1",
      opencodeSessionId: "test-session",
      toolCallId: "tool-existing",
    });

    writeFileSync(
      join(sessionDir, "tool-existing.request.json"),
      JSON.stringify({
        command: "echo already",
        cwd: process.cwd(),
        sessionId: "test-session",
        requestId: "tool-existing",
        toolCallId: "tool-existing",
      }),
      "utf-8",
    );

    await processBridgeOnceForTests();

    expect(transport.started).toEqual([execution.executionId]);
    expect(_readBridgeResultForTests("test-session", "tool-existing")?.executionId).toBe(
      execution.executionId,
    );
  });
});
