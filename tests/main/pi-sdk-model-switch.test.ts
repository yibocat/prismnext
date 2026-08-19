import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiSdkRuntime } from "../../src/main/agent/pi-sdk-runtime";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import { ToolHost } from "../../src/main/agent/tool-host";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import type { AgentEvent } from "../../src/shared/agent-runtime";
import type { PiLikeSessionEvent } from "../../src/main/agent/events";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("PiSdkRuntime sendTurn model switch", () => {
  it("calls setModel, snapshots the new window, and keeps cumulative spend", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-pi-model-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-model-store-"));
    dirs.push(project, storeRoot);
    const store = new AgentSessionStore(storeRoot);

    const setModelCalls: Array<{ provider: string; modelId: string; apiKey?: string }> = [];
    const snapshotOpts: Array<{ previousCostUsd?: number } | undefined> = [];
    const live = {
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
      windowSize: 200_000,
      occupancy: 90_000,
      billedCost: 0,
    };
    let emitPi: ((event: PiLikeSessionEvent) => void) | null = null;

    const runtime = new PiSdkRuntime({
      store,
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-model-session",
        subscribe(next: (event: PiLikeSessionEvent) => void) {
          emitPi = next;
          return () => {
            emitPi = null;
          };
        },
        getModelRef: () => ({ provider: live.provider, modelId: live.modelId }),
        setModel: async (next) => {
          setModelCalls.push(next);
          live.provider = next.provider;
          live.modelId = next.modelId;
          live.windowSize = 32_000;
        },
        getUsageSnapshot: (opts) => {
          snapshotOpts.push(opts);
          const previous = typeof opts?.previousCostUsd === "number" && opts.previousCostUsd > 0
            ? opts.previousCostUsd
            : 0;
          return {
            occupancyTokens: live.occupancy,
            windowSize: live.windowSize,
            costUsd: live.billedCost > 0 ? live.billedCost : previous,
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            updatedAt: Date.now(),
          };
        },
        async prompt() {
          emitPi?.({ type: "agent_end" });
        },
        async abort() {},
        dispose() {},
      }),
    });

    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    const session = await runtime.createSession({ tabId: "tab-model", projectRoot: project });
    expect(store.getSession(session.runtimeSessionId)?.modelRef).toEqual({
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
    });

    store.setUsageTotals(session.runtimeSessionId, {
      occupancyTokens: 90_000,
      windowSize: 200_000,
      costUsd: 1.23,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      updatedAt: Date.now(),
    });

    await runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-model",
      text: "continue on a smaller window",
      permissionMode: "edit_auto",
      provider: "openai",
      modelId: "gpt-4.1-mini",
      apiKey: "sk-test",
    });

    expect(setModelCalls).toEqual([
      { provider: "openai", modelId: "gpt-4.1-mini", apiKey: "sk-test" },
    ]);
    expect(store.getSession(session.runtimeSessionId)?.modelRef).toEqual({
      provider: "openai",
      modelId: "gpt-4.1-mini",
    });
    expect(snapshotOpts.some((opts) => opts?.previousCostUsd === 1.23)).toBe(true);

    const switched = events.filter(
      (event): event is Extract<AgentEvent, { type: "usage_updated" }> =>
        event.type === "usage_updated" && event.windowSize === 32_000,
    );
    expect(switched.length).toBeGreaterThan(0);
    expect(switched[0]?.costUsd).toBe(1.23);
    expect(switched[0]?.inputTokens).toBe(90_000);
  });

  it("does not call setModel when the live session already has that model", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-pi-model-same-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-model-same-store-"));
    dirs.push(project, storeRoot);

    let setModelCalls = 0;
    let emitPi: ((event: PiLikeSessionEvent) => void) | null = null;
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-model-same",
        subscribe(next: (event: PiLikeSessionEvent) => void) {
          emitPi = next;
          return () => {
            emitPi = null;
          };
        },
        getModelRef: () => ({ provider: "anthropic", modelId: "claude-sonnet-4-5" }),
        setModel: async () => {
          setModelCalls += 1;
        },
        async prompt() {
          emitPi?.({ type: "agent_end" });
        },
        async abort() {},
        dispose() {},
      }),
    });

    const session = await runtime.createSession({ tabId: "tab-same", projectRoot: project });
    await runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-same",
      text: "stay on the same model",
      permissionMode: "edit_auto",
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
    });

    expect(setModelCalls).toBe(0);
  });

  it("fails the turn when setModel rejects, without prompting", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-pi-model-fail-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-model-fail-store-"));
    dirs.push(project, storeRoot);

    let prompted = false;
    const events: AgentEvent[] = [];
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-model-fail",
        subscribe: () => () => {},
        getModelRef: () => ({ provider: "anthropic", modelId: "claude-sonnet-4-5" }),
        setModel: async (next) => {
          throw new Error(`unknown_pi_model:${next.provider}/${next.modelId}`);
        },
        async prompt() {
          prompted = true;
        },
        async abort() {},
        dispose() {},
      }),
    });
    runtime.subscribe((event) => events.push(event));

    const session = await runtime.createSession({ tabId: "tab-fail", projectRoot: project });
    await runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-fail",
      text: "switch to a missing model",
      permissionMode: "edit_auto",
      provider: "openai",
      modelId: "not-a-model",
    });

    expect(prompted).toBe(false);
    const failed = events.find((event) => event.type === "turn_failed");
    expect(failed?.type).toBe("turn_failed");
    if (failed?.type === "turn_failed") {
      expect(failed.error).toBe("unknown_pi_model:openai/not-a-model");
    }
  });
});
