import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => ({
  app: { isPackaged: true, getPath: () => "/tmp" },
}));

vi.mock("electron-store", () => ({
  default: class {
    constructor() {}
    get() { return undefined; }
    set() {}
    store = {};
  },
}));

import { AcpService } from "../../src/main/acp/service";

/**
 * Exercises the real AcpService.startTurnWatchdog against fake timers.
 * The watchdog is the last line of defense against OpenCode going silent on
 * the wire (provider retry loops / halt() never emitting an ACP frame).
 */
function makeService(): AcpService {
  const svc = Object.create(AcpService.prototype) as AcpService;
  (svc as any).sessionActivityAt = new Map<string, number>();
  (svc as any).sessionProviderErrors = new Map<string, string>();
  (svc as any).subtreeRunningToolKeys = new Map<string, Set<string>>();
  (svc as any).sessionParentCache = new Map<string, string>();
  (svc as any).notificationHandlers = [];
  (svc as any).opencodeLogWatchOffset = 0;
  (svc as any).getOpenCodeLogPath = () => "/tmp/prism-opencode-test.log";
  return svc;
}

describe("AcpService turn watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("warns on stall after stallMs of upstream silence", () => {
    const svc = makeService();
    const onStall = vi.fn();
    const onTimeout = vi.fn();
    const stop = svc.startTurnWatchdog("s1", { onStall, onTimeout }, { stallMs: 1_000, timeoutMs: 10_000, pollMs: 100 });

    vi.advanceTimersByTime(1_500);
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
    stop();
  });

  it("hard-timeout fires after timeoutMs of silence and only once", () => {
    const svc = makeService();
    const onStall = vi.fn();
    const onTimeout = vi.fn();
    const stop = svc.startTurnWatchdog("s1", { onStall, onTimeout }, { stallMs: 1_000, timeoutMs: 5_000, pollMs: 100 });

    vi.advanceTimersByTime(20_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stream activity (session/update) resets the silence window", () => {
    const svc = makeService();
    const onStall = vi.fn();
    const onTimeout = vi.fn();
    const stop = svc.startTurnWatchdog("s1", { onStall, onTimeout }, { stallMs: 1_000, timeoutMs: 5_000, pollMs: 100 });

    // Chunks keep arriving every 500ms — a healthy streaming turn.
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(500);
      (svc as any).emitNotification("session/update", { sessionId: "s1" });
    }
    expect(onStall).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
    stop();
  });

  it("activity for OTHER sessions does not reset this turn's window", () => {
    const svc = makeService();
    const onStall = vi.fn();
    const onTimeout = vi.fn();
    const stop = svc.startTurnWatchdog("s1", { onStall, onTimeout }, { stallMs: 1_000, timeoutMs: 5_000, pollMs: 100 });

    vi.advanceTimersByTime(500);
    (svc as any).emitNotification("session/update", { sessionId: "s2" });
    vi.advanceTimersByTime(1_000);
    expect(onStall).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stop() silences all further callbacks", () => {
    const svc = makeService();
    const onStall = vi.fn();
    const onTimeout = vi.fn();
    const stop = svc.startTurnWatchdog("s1", { onStall, onTimeout }, { stallMs: 1_000, timeoutMs: 5_000, pollMs: 100 });

    stop();
    vi.advanceTimersByTime(30_000);
    expect(onStall).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("open tool call switches the hard timeout to the busy tier", () => {
    const svc = makeService();
    const onStall = vi.fn();
    const onTimeout = vi.fn();
    const stop = svc.startTurnWatchdog("s1", { onStall, onTimeout }, { stallMs: 1_000, timeoutMs: 5_000, busyTimeoutMs: 15_000, pollMs: 100 });

    // A Task/tool starts right after the turn begins, then total silence —
    // the long-task case (subagent waiting on its own provider call).
    (svc as any).emitNotification("session/update", {
      sessionId: "s1",
      update: { sessionUpdate: "tool_call", tool_call: { tool_call_id: "t1" } },
    });

    // Past the idle hard timeout — must NOT fire while the tool is open.
    vi.advanceTimersByTime(6_000);
    expect(onTimeout).not.toHaveBeenCalled();

    // Past the busy hard timeout — fires once, flagged busy.
    vi.advanceTimersByTime(10_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout.mock.calls[0][1]).toBe(true);
    stop();
  });

  it("terminal tool_call_update returns the turn to the idle tier", () => {
    const svc = makeService();
    const onStall = vi.fn();
    const onTimeout = vi.fn();
    const stop = svc.startTurnWatchdog("s1", { onStall, onTimeout }, { stallMs: 1_000, timeoutMs: 5_000, busyTimeoutMs: 60_000, pollMs: 100 });

    (svc as any).emitNotification("session/update", {
      sessionId: "s1",
      update: { sessionUpdate: "tool_call", tool_call: { tool_call_id: "t1" } },
    });
    vi.advanceTimersByTime(2_000);
    (svc as any).emitNotification("session/update", {
      sessionId: "s1",
      update: { sessionUpdate: "tool_call_update", tool_call_update: { tool_call_id: "t1", status: "completed" } },
    });

    // Idle tier again — 5s of silence after the terminal frame stops the turn.
    vi.advanceTimersByTime(6_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout.mock.calls[0][1]).toBe(false);
    stop();
  });

  it("tool activity from a Task child session keeps the parent turn in the busy tier", () => {
    const svc = makeService();
    (svc as any).sessionParentCache.set("child1", "s1");
    const onStall = vi.fn();
    const onTimeout = vi.fn();
    const stop = svc.startTurnWatchdog("s1", { onStall, onTimeout }, { stallMs: 1_000, timeoutMs: 5_000, busyTimeoutMs: 15_000, pollMs: 100 });

    (svc as any).emitNotification("session/update", {
      sessionId: "child1",
      update: { sessionUpdate: "tool_call", tool_call: { tool_call_id: "t9" } },
    });

    // Parent sees no frames at all, yet the child's open tool shields it.
    vi.advanceTimersByTime(6_000);
    expect(onTimeout).not.toHaveBeenCalled();

    // Child tool completes → parent back to the idle tier.
    (svc as any).emitNotification("session/update", {
      sessionId: "child1",
      update: { sessionUpdate: "tool_call_update", tool_call_update: { tool_call_id: "t9", status: "completed" } },
    });
    vi.advanceTimersByTime(6_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout.mock.calls[0][1]).toBe(false);
    stop();
  });
});
