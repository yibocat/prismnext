import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiSdkRuntime } from "../../src/main/agent/pi-sdk-runtime";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import { ToolHost } from "../../src/main/agent/tool-host";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import { deleteTool } from "../../src/main/agent/tools/system";
import type { AgentEvent } from "../../src/shared/agent-runtime";
import type { PiLikeSessionEvent } from "../../src/main/agent/events";

const dirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("PiSdkRuntime turn stays live while PermissionGate is waiting", () => {
  it("does not emit turn_finished on agent_end until the pending delete settles", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-pi-hold-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-hold-store-"));
    dirs.push(project, storeRoot);

    const events: AgentEvent[] = [];
    let emitPi: ((event: PiLikeSessionEvent) => void) | null = null;
    let resolvePrompt: (() => void) | null = null;
    const gate = new PermissionGate({ timeoutMs: 120_000 });
    const toolHost = new ToolHost({ gate });
    toolHost.register(deleteTool);

    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost,
      gate,
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-hold-session",
        subscribe(next: (event: PiLikeSessionEvent) => void) {
          emitPi = next;
          return () => {
            emitPi = null;
          };
        },
        prompt: () => new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
        async abort() {},
        dispose() {},
      }),
    });
    runtime.subscribe((event) => events.push(event));

    const session = await runtime.createSession({ tabId: "tab-hold", projectRoot: project });
    const sendPromise = runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-hold",
      text: "draw then clean",
      permissionMode: "edit_auto",
    });

    emitPi?.({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "图好了" },
    });
    const turnId = events.find((event) => event.type === "text_delta")?.turnId;
    expect(turnId).toBeTruthy();

    const execPromise = toolHost.execute("delete", { path: "tmp/figure.png" }, {
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-hold",
      turnId: turnId!,
      toolCallId: "call-delete-1",
      projectRoot: project,
      permissionMode: "edit_auto",
    });

    await vi.waitFor(() => {
      expect(gate.hasPendingForSession(session.runtimeSessionId)).toBe(true);
    });

    emitPi?.({ type: "agent_end" });
    expect(events.some((event) => event.type === "turn_finished")).toBe(false);
    expect(runtime.isTurnLive(session.runtimeSessionId, turnId)).toBe(true);

    expect(gate.resolve("perm-call-delete-1", "deny")).toBe(true);
    const result = await execPromise;
    expect(result.denied).toBe(true);

    await vi.waitFor(() => {
      expect(events.some((event) => event.type === "turn_finished")).toBe(true);
    });

    resolvePrompt?.();
    await sendPromise;
  });

  it("does not fire engine_ended_without_terminal_event while a delete is waiting", async () => {
    vi.useFakeTimers();
    const project = mkdtempSync(join(tmpdir(), "prism-pi-500-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-500-store-"));
    dirs.push(project, storeRoot);

    const events: AgentEvent[] = [];
    let resolvePrompt: (() => void) | null = null;
    const gate = new PermissionGate({ timeoutMs: 120_000 });

    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate }),
      gate,
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-500-session",
        subscribe: () => () => {},
        prompt: () => new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
        async abort() {},
        dispose() {},
      }),
    });
    runtime.subscribe((event) => events.push(event));

    const session = await runtime.createSession({ tabId: "tab-500", projectRoot: project });
    const sendPromise = runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-500",
      text: "draw",
      permissionMode: "edit_auto",
    });

    await Promise.resolve();
    const decidePromise = gate.decide({
      requestId: "perm-delete-1",
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-500",
      turnId: "turn-placeholder",
      toolCallId: "call-delete-1",
      toolName: "delete",
      args: { path: "tmp/figure.png" },
      projectRoot: project,
      permissionMode: "edit_auto",
      filePath: "tmp/figure.png",
    });

    resolvePrompt?.();
    await sendPromise;
    await vi.advanceTimersByTimeAsync(800);

    expect(events.some((event) => (
      event.type === "turn_failed"
      && event.error === "engine_ended_without_terminal_event"
    ))).toBe(false);
    expect(runtime.isTurnLive(session.runtimeSessionId)).toBe(true);

    gate.resolve("perm-delete-1", "deny");
    await decidePromise;
  });
});
