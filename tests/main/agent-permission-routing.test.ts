import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentService } from "../../src/main/agent/agent-service";
import { InteractionBroker } from "../../src/main/agent/interaction-broker";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import { RuntimeRegistry } from "../../src/main/agent/runtime-registry";
import type { AgentRuntime } from "../../src/main/agent/runtime";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import type { PermissionGateRequest } from "../../src/main/agent/permission-gate";
import type { CreateSessionInput, CreateSessionResult, RuntimeSessionId, TurnInput } from "../../src/shared/agent/runtime";

const ROOT = "/Users/me/paper";

function fakeRuntime(): AgentRuntime {
  return {
    async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
      return { runtimeSessionId: `rt-${input.tabId}`, tabId: input.tabId };
    },
    async sendTurn(_input: TurnInput): Promise<void> {},
    async cancelTurn(_id: RuntimeSessionId): Promise<void> {},
    async disposeSession(_id: RuntimeSessionId): Promise<void> {},
    subscribe() {
      return () => {};
    },
  };
}

function writePrompt(requestId: string, runtimeSessionId: string): PermissionGateRequest {
  return {
    requestId,
    runtimeSessionId,
    tabId: runtimeSessionId,
    turnId: "turn-1",
    toolCallId: `call-${requestId}`,
    toolName: "write",
    args: {},
    filePath: `${ROOT}/out.txt`,
    projectRoot: ROOT,
    permissionMode: "ask",
  };
}

describe("agent permission routing across conversations", () => {
  const dirs: string[] = [];
  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("resolves conversation A's pending permission after B has started", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-perm-route-"));
    dirs.push(userData);
    setWorkbenchUserHomeOverride(userData);

    const gateA = new PermissionGate({ timeoutMs: 5_000 });
    const gateB = new PermissionGate({ timeoutMs: 5_000 });
    const brokerA = new InteractionBroker({ timeoutMs: 5_000 });
    const brokerB = new InteractionBroker({ timeoutMs: 5_000 });

    const registry = new RuntimeRegistry({
      userDataDir: userData,
      store: new AgentSessionStore(userData),
      startRuntime: async (input) => {
        const isA = input.conversationId === "conv-a";
        return {
          runtime: fakeRuntime(),
          runtimeSessionId: isA ? "rt-a" : "rt-b",
          gate: isA ? gateA : gateB,
          interactions: isA ? brokerA : brokerB,
        };
      },
    });

    const agent = createAgentService({
      userDataDir: userData,
      registry,
      getSettings: () => ({ aiProvider: "anthropic", aiModel: "claude-sonnet-4-5", aiApiKeys: { anthropic: "sk" } }),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    await registry.createConversation({ conversationId: "conv-a", tabId: "conv-a", projectRoot: ROOT });
    const pendingA = gateA.decide(writePrompt("req-a", "rt-a"));

    await registry.createConversation({ conversationId: "conv-b", tabId: "conv-b", projectRoot: ROOT });
    const pendingB = gateB.decide(writePrompt("req-b", "rt-b"));

    expect(agent.resolvePermission("req-a", "allow")).toBe(true);
    await expect(pendingA).resolves.toMatchObject({ decision: "allow", requestId: "req-a" });
    expect(gateB.pendingCount()).toBe(1);

    expect(agent.resolvePermission("req-b", "deny")).toBe(true);
    await expect(pendingB).resolves.toMatchObject({ decision: "deny", requestId: "req-b" });
  });

  it("answers a question on A after B is live", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-q-route-"));
    dirs.push(userData);
    setWorkbenchUserHomeOverride(userData);

    const gateA = new PermissionGate({ timeoutMs: 5_000 });
    const gateB = new PermissionGate({ timeoutMs: 5_000 });
    const brokerA = new InteractionBroker({ timeoutMs: 5_000 });
    const brokerB = new InteractionBroker({ timeoutMs: 5_000 });

    const registry = new RuntimeRegistry({
      userDataDir: userData,
      store: new AgentSessionStore(userData),
      startRuntime: async (input) => ({
        runtime: fakeRuntime(),
        runtimeSessionId: input.conversationId === "conv-a" ? "rt-a" : "rt-b",
        gate: input.conversationId === "conv-a" ? gateA : gateB,
        interactions: input.conversationId === "conv-a" ? brokerA : brokerB,
      }),
    });
    const agent = createAgentService({
      userDataDir: userData,
      registry,
      getSettings: () => ({}),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    await registry.createConversation({ conversationId: "conv-a", tabId: "conv-a", projectRoot: ROOT });
    await registry.createConversation({ conversationId: "conv-b", tabId: "conv-b", projectRoot: ROOT });
    const asked = brokerA.askQuestion({
      requestId: "q-a",
      runtimeSessionId: "rt-a",
      tabId: "conv-a",
      turnId: "t1",
      prompt: "Which file?",
    });
    brokerB.askQuestion({
      requestId: "q-b",
      runtimeSessionId: "rt-b",
      tabId: "conv-b",
      turnId: "t1",
      prompt: "Other?",
    });

    expect(agent.answerQuestion({ requestId: "q-a", answer: "main.tex" })).toBe(true);
    await expect(asked).resolves.toMatchObject({ ok: true, answer: "main.tex" });
    expect(brokerB.pendingCount()).toBe(1);
  });

  it("rejects send() when a live conversation is bound to another project", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-send-mismatch-"));
    dirs.push(userData);
    setWorkbenchUserHomeOverride(userData);

    const registry = new RuntimeRegistry({
      userDataDir: userData,
      store: new AgentSessionStore(userData),
      startRuntime: async (input) => ({
        runtime: fakeRuntime(),
        runtimeSessionId: `rt-${input.conversationId}`,
        gate: new PermissionGate({ timeoutMs: 5_000 }),
        interactions: new InteractionBroker({ timeoutMs: 5_000 }),
      }),
    });
    const agent = createAgentService({
      userDataDir: userData,
      registry,
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk" },
      }),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
      resolveTeamBinding: () => ({ ok: true }),
    });

    await registry.createConversation({ conversationId: "conv-a", tabId: "conv-a", projectRoot: ROOT });
    const sent = await agent.send({
      conversationId: "conv-a",
      turnId: "t1",
      projectRoot: "/Users/me/other-paper",
      text: "hello",
    });
    expect(sent).toEqual({ ok: false, error: "conversation_project_mismatch" });
  });

  it("cancel without conversationId does not touch live waiters", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-cancel-id-"));
    dirs.push(userData);
    setWorkbenchUserHomeOverride(userData);

    const gateA = new PermissionGate({ timeoutMs: 5_000 });
    const registry = new RuntimeRegistry({
      userDataDir: userData,
      store: new AgentSessionStore(userData),
      startRuntime: async () => ({
        runtime: fakeRuntime(),
        runtimeSessionId: "rt-a",
        gate: gateA,
        interactions: new InteractionBroker({ timeoutMs: 5_000 }),
      }),
    });
    const agent = createAgentService({
      userDataDir: userData,
      registry,
      getSettings: () => ({}),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    await registry.createConversation({ conversationId: "conv-a", tabId: "conv-a", projectRoot: ROOT });
    const pendingA = gateA.decide(writePrompt("req-a", "rt-a"));
    await agent.cancel();
    expect(gateA.pendingCount()).toBe(1);
    expect(agent.resolvePermission("req-a", "allow")).toBe(true);
    await expect(pendingA).resolves.toMatchObject({ decision: "allow" });
  });
});
