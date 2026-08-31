import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentService } from "../../src/main/agent/agent-service";
import { RuntimeRegistry } from "../../src/main/agent/runtime-registry";
import type { AgentRuntime } from "../../src/main/agent/runtime";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import type { CreateSessionInput, CreateSessionResult, RuntimeSessionId } from "../../src/shared/agent/runtime";

describe("remote agent cancel", () => {
  const dirs: string[] = [];
  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
  });

  it("cancelTurn reaches the runtime while send is in flight", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-cancel-"));
    const project = mkdtempSync(join(tmpdir(), "prism-cancel-proj-"));
    dirs.push(userData, project);
    setWorkbenchUserHomeOverride(userData);

    let release!: () => void;
    const cancelled: string[] = [];
    const runtime: AgentRuntime = {
      async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
        return { runtimeSessionId: "rt-live", tabId: input.tabId };
      },
      sendTurn() {
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      async cancelTurn(id: RuntimeSessionId) {
        cancelled.push(id);
        release();
      },
      async disposeSession() {},
      subscribe() {
        return () => undefined;
      },
    };

    const registry = new RuntimeRegistry({
      userDataDir: userData,
      startRuntime: async () => ({ runtime, runtimeSessionId: "rt-live" }),
    });
    const agent = createAgentService({
      userDataDir: userData,
      registry,
      getSettings: () => ({
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      }),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });

    const events: unknown[] = [];
    agent.attachSink({
      emit(_channel, payload) {
        events.push(payload);
      },
    });

    const sending = agent.send({
      conversationId: "conv-stop",
      tabId: "conv-stop",
      turnId: "turn-1",
      projectRoot: project,
      text: "please hang",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await agent.cancel("conv-stop");
    await expect(sending).resolves.toEqual({ ok: true });
    expect(cancelled).toEqual(["rt-live"]);
    agent.dispatchEvent({
      type: "turn_cancelled",
      runtimeSessionId: "rt-live",
      tabId: "conv-stop",
      turnId: "turn-1",
    });
    expect(events).toMatchObject([{ type: "turn_cancelled" }]);
  });
});
