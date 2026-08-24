import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PI_TURN_IDLE_TIMEOUT_MS,
  PiSdkRuntime,
} from "../../src/main/agent/pi-sdk-runtime";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import { ToolHost } from "../../src/main/agent/tool-host";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import type { AgentEvent } from "../../src/shared/agent/runtime";

const dirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("PiSdkRuntime turn idle watchdog", () => {
  it("emits turn_failed when a turn goes silent with no Pi events", async () => {
    vi.useFakeTimers();
    const project = mkdtempSync(join(tmpdir(), "prism-pi-idle-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-idle-store-"));
    dirs.push(project, storeRoot);

    const events: AgentEvent[] = [];
    let aborted = false;
    let rejectPrompt: ((err: Error) => void) | null = null;

    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-idle-session",
        subscribe: () => () => {},
        prompt: () => new Promise<void>((_resolve, reject) => {
          rejectPrompt = reject;
        }),
        abort: async () => {
          aborted = true;
        },
        dispose: () => {},
      }),
    });
    runtime.subscribe((event) => events.push(event));

    const session = await runtime.createSession({ tabId: "tab-idle", projectRoot: project });
    const sendPromise = runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-idle",
      text: "think long",
      permissionMode: "edit_auto",
    });

    // No Pi event arrives — advance past the idle window.
    await vi.advanceTimersByTimeAsync(PI_TURN_IDLE_TIMEOUT_MS + 100);

    const failed = events.find((e) => e.type === "turn_failed");
    expect(failed?.type).toBe("turn_failed");
    if (failed?.type === "turn_failed") {
      expect(failed.error).toBe("turn_idle_timeout");
    }
    expect(aborted).toBe(true);
    expect(events.filter((e) => e.type === "turn_failed")).toHaveLength(1);

    // abort() rejects the hanging prompt with "terminated" — must not emit again.
    rejectPrompt?.(new Error("terminated"));
    await sendPromise;
    expect(events.filter((e) => e.type === "turn_failed")).toHaveLength(1);
    expect(events.some((e) => e.type === "turn_failed" && e.error === "terminated")).toBe(false);
  });

  it("keeps streaming when Pi events keep arriving inside the idle window", async () => {
    vi.useFakeTimers();
    const project = mkdtempSync(join(tmpdir(), "prism-pi-idle-ok-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-idle-ok-store-"));
    dirs.push(project, storeRoot);

    const events: AgentEvent[] = [];
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => {
        let listener: ((event: unknown) => void) | null = null;
        return {
          sessionId: "pi-idle-ok-session",
          subscribe(next: (event: unknown) => void) {
            listener = next;
            return () => {
              listener = null;
            };
          },
          async prompt() {
            // Emit one delta every 30s — each re-arms the watchdog.
            for (let i = 0; i < 4; i++) {
              await vi.advanceTimersByTimeAsync(30_000);
              listener?.({ type: "agent_end" });
            }
          },
          async abort() {},
          dispose() {},
        };
      },
    });
    runtime.subscribe((event) => events.push(event));

    const session = await runtime.createSession({ tabId: "tab-idle-ok", projectRoot: project });
    await runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-idle-ok",
      text: "steady stream",
      permissionMode: "edit_auto",
    });

    expect(events.some((e) => e.type === "turn_failed" && e.error === "turn_idle_timeout")).toBe(false);
    expect(events.some((e) => e.type === "turn_finished")).toBe(true);
  });

  it("touchTurnWatchdog keeps a silent parent turn alive", async () => {
    vi.useFakeTimers();
    const project = mkdtempSync(join(tmpdir(), "prism-pi-idle-touch-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-idle-touch-store-"));
    dirs.push(project, storeRoot);

    const events: AgentEvent[] = [];
    let resolvePrompt: (() => void) | null = null;
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-idle-touch-session",
        subscribe: () => () => {},
        prompt: () => new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
        abort: async () => {},
        dispose: () => {},
      }),
    });
    runtime.subscribe((event) => events.push(event));

    const session = await runtime.createSession({ tabId: "tab-idle-touch", projectRoot: project });
    const sendPromise = runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-idle-touch",
      text: "wait on child",
      permissionMode: "edit_auto",
    });

    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(PI_TURN_IDLE_TIMEOUT_MS - 5_000);
      runtime.touchTurnWatchdog(session.runtimeSessionId);
    }

    expect(events.some((e) => e.type === "turn_failed" && e.error === "turn_idle_timeout")).toBe(false);
    resolvePrompt?.();
    await sendPromise;
  });
});
