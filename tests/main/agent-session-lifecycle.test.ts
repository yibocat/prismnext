import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AgentSessionStore,
  type AgentTurnRecord,
} from "../../src/main/agent/session-store";
import { ToolHost } from "../../src/main/agent/tool-host";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import { PiSdkRuntime, type PiSessionFactory } from "../../src/main/agent/pi-sdk-runtime";
import { InProcessAgentRuntime } from "../../src/main/agent/in-process-runtime";
import type { AgentEvent } from "../../src/shared/agent/runtime";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import type { NativeToolDefinition } from "../../src/main/agent/tools/types";

describe("Agent Session Lifecycle & Turn Persistence (Phase 4A)", () => {
  let tempDir: string;
  let store: AgentSessionStore;
  let gate: PermissionGate;
  let toolHost: ToolHost;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-lifecycle-test-"));
    store = new AgentSessionStore(tempDir);
    gate = new PermissionGate();
    toolHost = new ToolHost({ gate });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("PiSdkRuntime: accumulates text, tools, thinking, usage into AgentTurnRecord upon turn completion", async () => {
    const fakeTool: NativeToolDefinition = {
      name: "sample-tool",
      label: "Sample Tool",
      description: "A test tool",
      parameters: Type.Object({ query: Type.String() }),
      permission: { category: "read_only" },
      execute: async (args) => ({ echo: args.query }),
    };
    toolHost.register(fakeTool);

    let sessionSubscriber: ((event: unknown) => void) | null = null;
    let currentTurnContext: { turnId: string } | null = null;
    const fakeFactory: PiSessionFactory = async (input) => {
      return {
        setTurnContext: (ctx) => {
          currentTurnContext = ctx;
        },
        prompt: async (text: string) => {
          const turnId = currentTurnContext?.turnId || "turn-0";
          // Simulate Pi runtime stream events
          sessionSubscriber?.({
            type: "message_update",
            assistantMessageEvent: {
              type: "thinking_delta",
              delta: "Analyzing user input...",
            },
          });
          sessionSubscriber?.({
            type: "message_update",
            assistantMessageEvent: {
              type: "text_delta",
              delta: `Echoing: ${text}`,
            },
          });

          // Simulate tool execution through toolHost
          await toolHost.execute("sample-tool", { query: "pi query" }, {
            runtimeSessionId: input.runtimeSessionId,
            tabId: input.tabId,
            turnId,
            toolCallId: "call-1",
            projectRoot: input.projectRoot,
            permissionMode: "auto",
          });

          sessionSubscriber?.({
            usage: {
              input: 50,
              output: 25,
            },
          });
          sessionSubscriber?.({
            type: "agent_end",
          });
        },
        abort: async () => {},
        dispose: () => {},
        subscribe: (fn) => {
          sessionSubscriber = fn;
          return () => {
            sessionSubscriber = null;
          };
        },
      };
    };

    const runtime = new PiSdkRuntime({
      createPiSession: fakeFactory,
      store,
      toolHost,
      gate,
      agentDir: join(tempDir, "runtime"),
    });

    const sessionResult = await runtime.createSession({
      tabId: "tab-1",
      projectRoot: "/path/to/project",
      boundCheckoutPath: "/path/to/project/worktrees/feat",
      permissionMode: "auto",
    });

    const initialRecord = store.getSession(sessionResult.runtimeSessionId);
    expect(initialRecord).toBeDefined();
    expect(initialRecord?.boundCheckoutPath).toBe("/path/to/project/worktrees/feat");
    expect(initialRecord?.turns).toHaveLength(0);

    // Send Turn 0
    await runtime.sendTurn({
      runtimeSessionId: sessionResult.runtimeSessionId,
      tabId: "tab-1",
      text: "Hello Pi",
      permissionMode: "auto",
    });

    const recordAfterTurn0 = store.getSession(sessionResult.runtimeSessionId);
    expect(recordAfterTurn0?.turns).toHaveLength(1);
    const turn0 = recordAfterTurn0?.turns[0];
    expect(turn0?.turnIndex).toBe(0);
    expect(turn0?.user.text).toBe("Hello Pi");
    expect(turn0?.assistant.text).toBe("Echoing: Hello Pi");
    expect(turn0?.assistant.thinking).toBe("Analyzing user input...");
    expect(turn0?.assistant.toolCalls).toHaveLength(1);
    expect(turn0?.assistant.toolCalls[0]?.toolName).toBe("sample-tool");
    expect(turn0?.assistant.toolCalls[0]?.result).toEqual({ echo: "pi query" });
    expect(turn0?.usage?.inputTokens).toBe(75);
    expect(turn0?.status).toBe("completed");

    // Dispose runtime session should NOT delete the on-disk session
    await runtime.disposeSession(sessionResult.runtimeSessionId);
    const recordAfterDispose = store.getSession(sessionResult.runtimeSessionId);
    expect(recordAfterDispose).toBeDefined();
    expect(recordAfterDispose?.turns).toHaveLength(1);
  });

  it("InProcessAgentRuntime: records scripted tools and turn records, and preserves JSON on dispose", async () => {
    const dummyTool: NativeToolDefinition = {
      name: "dummy-tool",
      label: "Dummy",
      description: "Dummy tool",
      parameters: Type.Object({ action: Type.String() }),
      permission: { category: "read_only" },
      execute: async (args) => ({ done: args.action }),
    };
    toolHost.register(dummyTool);

    const runtime = new InProcessAgentRuntime({
      store,
      toolHost,
      gate,
    });

    const created = await runtime.createSession({
      tabId: "tab-inproc",
      projectRoot: "/repo/main",
      boundCheckoutPath: "/repo/main",
      permissionMode: "auto",
    });

    runtime.scriptNextTurn(created.runtimeSessionId, [
      { toolName: "dummy-tool", args: { action: "step-1" } },
      { toolName: "dummy-tool", args: { action: "step-2" } },
    ]);

    await runtime.sendTurn({
      runtimeSessionId: created.runtimeSessionId,
      tabId: "tab-inproc",
      text: "Run scripted steps",
      permissionMode: "auto",
    });

    const session = store.getSession(created.runtimeSessionId);
    expect(session?.turns).toHaveLength(1);
    const turn = session?.turns[0];
    expect(turn?.user.text).toBe("Run scripted steps");
    expect(turn?.assistant.toolCalls).toHaveLength(2);
    expect(turn?.assistant.toolCalls[0]?.result).toEqual({ done: "step-1" });
    expect(turn?.assistant.toolCalls[1]?.result).toEqual({ done: "step-2" });
    expect(turn?.status).toBe("completed");

    // Dispose runtime should preserve JSON on disk
    await runtime.disposeSession(created.runtimeSessionId);
    expect(store.getSession(created.runtimeSessionId)).toBeDefined();
  });

  it("records cancelled status when turn is cancelled via abort signal", async () => {
    let sessionSubscriber: ((event: unknown) => void) | null = null;
    const fakeFactory: PiSessionFactory = async (input) => {
      return {
        prompt: async (text: string) => {
          // Do not emit turn_finished to simulate in-flight turn
          sessionSubscriber?.({
            type: "message_update",
            assistantMessageEvent: {
              type: "text_delta",
              delta: "Starting long process...",
            },
          });
        },
        abort: async () => {},
        dispose: () => {},
        subscribe: (fn) => {
          sessionSubscriber = fn;
          return () => {
            sessionSubscriber = null;
          };
        },
      };
    };

    const runtime = new PiSdkRuntime({
      createPiSession: fakeFactory,
      store,
      toolHost,
      gate,
      agentDir: join(tempDir, "runtime"),
    });

    const sessionResult = await runtime.createSession({
      tabId: "tab-cancel",
      projectRoot: "/path/to/project",
      permissionMode: "auto",
    });

    // Start turn
    const promise = runtime.sendTurn({
      runtimeSessionId: sessionResult.runtimeSessionId,
      tabId: "tab-cancel",
      text: "Start heavy calculation",
      permissionMode: "auto",
    });

    // Cancel turn
    await runtime.cancelTurn(sessionResult.runtimeSessionId);
    await promise;

    const session = store.getSession(sessionResult.runtimeSessionId);
    expect(session?.turns).toHaveLength(1);
    expect(session?.turns[0]?.status).toBe("cancelled");
    expect(session?.turns[0]?.user.text).toBe("Start heavy calculation");
  });
});
