import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";

const { info, warn, debug, error } = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../src/main/services/logger", () => ({
  createLogger: () => ({ info, warn, debug, error }),
  shortLogDetail: (value: unknown, max = 160) => {
    const text = value instanceof Error ? value.message : String(value ?? "");
    const line = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "";
    return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
  },
}));

import { PiSdkRuntime } from "../../src/main/agent/pi-sdk-runtime";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import { RuntimeRegistry } from "../../src/main/agent/runtime-registry";
import { ToolHost, type NativeToolDefinition, type ToolExecuteContext } from "../../src/main/agent/tool-host";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import {
  PiSubsessionRuntime,
  type SubagentSessionRunnerFactory,
} from "../../src/main/agent/pi-subsession-runtime";
import type { AgentRuntime } from "../../src/main/agent/runtime";
import type { ResolvedPiRosterEntry } from "../../src/main/agent/team-binding";
import type { CreateSessionInput, CreateSessionResult, RuntimeSessionId, TurnInput } from "../../src/shared/agent/runtime";

const dirs: string[] = [];

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function ctx(overrides: Partial<ToolExecuteContext> = {}): ToolExecuteContext {
  return {
    runtimeSessionId: "rt-1",
    tabId: "tab-1",
    turnId: "turn-1",
    toolCallId: "call-1",
    projectRoot: "/Users/me/paper",
    permissionMode: "auto",
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  info.mockReset();
  warn.mockReset();
  debug.mockReset();
  error.mockReset();
});

describe("L2 Agent HOST logs", () => {
  it("logs session.create on a new memory session, not the user prompt", async () => {
    const project = tmp("prism-host-create-");
    const storeRoot = tmp("prism-host-create-store-");
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-1",
        subscribe: () => () => {},
        async prompt() {},
        async abort() {},
        dispose() {},
      }),
    });
    const session = await runtime.createSession({ tabId: "tab-1", projectRoot: project });
    expect(info).toHaveBeenCalledWith(
      "session.create",
      expect.objectContaining({
        runtimeSessionId: session.runtimeSessionId,
        persist: "memory",
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("hello world");
  });

  it("logs session.open when Registry reopens a conversation", async () => {
    const userData = tmp("prism-host-open-");
    const project = tmp("prism-host-open-proj-");
    const store = new AgentSessionStore(join(userData, "pi-agent"));
    const fake = (): AgentRuntime => ({
      async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
        return { runtimeSessionId: "rt-open", tabId: input.tabId };
      },
      async sendTurn(_input: TurnInput): Promise<void> {},
      async cancelTurn(_id: RuntimeSessionId): Promise<void> {},
      async disposeSession(_id: RuntimeSessionId): Promise<void> {},
      subscribe() {
        return () => {};
      },
    });
    const registry = new RuntimeRegistry({
      userDataDir: userData,
      store,
      startRuntime: async () => ({
        runtime: fake(),
        runtimeSessionId: "rt-open",
        piSessionFile: join(userData, "sess.jsonl"),
      }),
    });
    const created = await registry.createConversation({ tabId: "tab-1", projectRoot: project });
    await registry.disposeConversation(created.conversationId);
    info.mockClear();
    await registry.openConversation({
      conversationId: created.conversationId,
      tabId: "tab-1",
      projectRoot: project,
    });
    expect(info).toHaveBeenCalledWith(
      "session.open",
      expect.objectContaining({
        conversationId: created.conversationId,
        hasPiSessionFile: true,
      }),
    );
  });

  it("logs session.set_model only when the live session actually switches", async () => {
    const project = tmp("prism-host-model-");
    const storeRoot = tmp("prism-host-model-store-");
    const live = { provider: "anthropic", modelId: "claude-sonnet-4-5" };
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-model",
        subscribe: () => () => {},
        getModelRef: () => ({ provider: live.provider, modelId: live.modelId }),
        setModel: async (next) => {
          live.provider = next.provider;
          live.modelId = next.modelId;
        },
        async prompt() {},
        async abort() {},
        dispose() {},
      }),
    });
    const session = await runtime.createSession({ tabId: "tab-1", projectRoot: project });
    info.mockClear();
    await runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      text: "switch please",
      permissionMode: "edit_auto",
      provider: "openai",
      modelId: "gpt-5",
    });
    expect(info).toHaveBeenCalledWith(
      "session.set_model",
      expect.objectContaining({
        from: "anthropic/claude-sonnet-4-5",
        to: "openai/gpt-5",
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("switch please");
  });

  it("logs session.compact with tokensBefore and never the summary", async () => {
    const project = tmp("prism-host-compact-");
    const storeRoot = tmp("prism-host-compact-store-");
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-compact",
        subscribe: () => () => {},
        compact: async () => ({ summary: "SECRET SUMMARY TEXT", tokensBefore: 12_000 }),
        async prompt() {},
        async abort() {},
        dispose() {},
      }),
    });
    const session = await runtime.createSession({ tabId: "tab-1", projectRoot: project });
    info.mockClear();
    await runtime.compact(session.runtimeSessionId);
    expect(info).toHaveBeenCalledWith(
      "session.compact",
      expect.objectContaining({ ok: true, tokensBefore: 12_000 }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("SECRET SUMMARY TEXT");
  });

  it("logs session.corrupt when a session JSON cannot be parsed", () => {
    const storeRoot = tmp("prism-host-corrupt-");
    const store = new AgentSessionStore(storeRoot);
    store.createSession({
      runtimeSessionId: "ses-bad",
      tabId: "tab-1",
      projectRoot: "/p",
      boundCheckoutPath: "/p",
      backend: "pi-sdk",
    });
    writeFileSync(join(store.sessionsDir(), "ses-bad.json"), "{ not json", "utf-8");
    expect(store.getSession("ses-bad")).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "session.corrupt",
      expect.objectContaining({ runtimeSessionId: "ses-bad" }),
    );
  });

  it("logs turn.fail on prompt() throw without the user text", async () => {
    const project = tmp("prism-host-fail-");
    const storeRoot = tmp("prism-host-fail-store-");
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-fail",
        subscribe: () => () => {},
        async prompt() {
          throw new Error("provider_rate_limited");
        },
        async abort() {},
        dispose() {},
      }),
    });
    const session = await runtime.createSession({ tabId: "tab-1", projectRoot: project });
    warn.mockClear();
    await runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-1",
      text: "USER SECRET PROMPT",
      permissionMode: "edit_auto",
    });
    expect(warn).toHaveBeenCalledWith(
      "turn.fail",
      expect.objectContaining({ error: "provider_rate_limited" }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("USER SECRET PROMPT");
  });

  it("logs session.dispose with runtime and conversation ids", async () => {
    const project = tmp("prism-host-dispose-");
    const storeRoot = tmp("prism-host-dispose-store-");
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-dispose",
        subscribe: () => () => {},
        async prompt() {},
        async abort() {},
        dispose() {},
      }),
    });
    const session = await runtime.createSession({
      tabId: "tab-1",
      projectRoot: project,
      conversationId: "conv-1",
    });
    info.mockClear();
    await runtime.disposeSession(session.runtimeSessionId);
    expect(info).toHaveBeenCalledWith(
      "session.dispose",
      expect.objectContaining({
        runtimeSessionId: session.runtimeSessionId,
        conversationId: "conv-1",
      }),
    );
  });

  it("logs tool.execute start/end after allow and never logs args", async () => {
    const host = new ToolHost({ gate: new PermissionGate() });
    const tool: NativeToolDefinition = {
      name: "literature-search",
      label: "Search",
      description: "search",
      parameters: Type.Object({ query: Type.String() }),
      permission: { category: "read_only" },
      execute: async () => ({ hits: 1 }),
    };
    host.register(tool);
    await host.execute("literature-search", { query: "DO NOT LOG QUERY" }, ctx());
    expect(info).toHaveBeenCalledWith(
      "tool.execute.start",
      expect.objectContaining({ toolName: "literature-search", toolCallId: "call-1" }),
    );
    expect(info).toHaveBeenCalledWith(
      "tool.execute.end",
      expect.objectContaining({ toolName: "literature-search", ok: "ok" }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("DO NOT LOG QUERY");
  });

  it("logs subagent start/end without the child prompt", async () => {
    const createRunner: SubagentSessionRunnerFactory = async () => ({
      prompt: async () => {},
      abort: () => {},
      dispose: () => {},
    });
    const expert: ResolvedPiRosterEntry = {
      fqid: "team:reviewer",
      name: "Reviewer",
      runtimeName: "reviewer",
      description: "reviews",
      instructions: "review",
      originTeamId: "team",
      via: "all",
      available: true,
      isDelegatable: true,
      allowedTools: [],
    };
    const runtime = new PiSubsessionRuntime({
      gate: new PermissionGate(),
      allTools: [],
      createRunner,
    });
    await runtime.runSubagentTask({
      parentSessionId: "rt-1",
      parentTabId: "tab-1",
      parentTurnId: "turn-1",
      parentToolCallId: "task-1",
      projectRoot: "/p",
      boundCheckoutPath: "/p",
      permissionMode: "auto",
      expert,
      prompt: "SECRET CHILD PROMPT",
    });
    expect(info).toHaveBeenCalledWith(
      "subagent.start",
      expect.objectContaining({ parentToolCallId: "task-1", expertFqid: "team:reviewer" }),
    );
    expect(info).toHaveBeenCalledWith(
      "subagent.end",
      expect.objectContaining({ parentToolCallId: "task-1", ok: "ok" }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("SECRET CHILD PROMPT");
  });
});
