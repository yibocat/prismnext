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
});
