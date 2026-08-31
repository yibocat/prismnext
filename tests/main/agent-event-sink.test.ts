import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createElectronSink } from "../../src/main/remote/event-sink";
import { createFrameSink } from "../../src/host/frame-sink";
import { createAgentService } from "../../src/main/agent/agent-service";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("AgentEventSink", () => {
  it("forwards text_delta through ElectronSink", () => {
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const sink = createElectronSink({
      isDestroyed: () => false,
      send(channel, payload) {
        sent.push({ channel, payload });
      },
    });
    sink.emit("agent:event", { type: "text_delta", text: "hi" });
    expect(sent).toEqual([{ channel: "agent:event", payload: { type: "text_delta", text: "hi" } }]);
  });

  it("attachOwner keeps EventEmitter.once bound to the owner", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-sink-once-"));
    const agent = createAgentService({
      userDataDir: dir,
      getSettings: () => ({}),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });
    const owner = new EventEmitter() as EventEmitter & { send: (channel: string, payload: unknown) => void };
    owner.send = () => undefined;
    expect(() => agent.attachOwner(owner)).not.toThrow();
  });

  it("attachOwner ignores a missing webContents", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-sink-owner-"));
    const agent = createAgentService({
      userDataDir: dir,
      getSettings: () => ({}),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });
    expect(() => agent.attachOwner(undefined)).not.toThrow();
    expect(() => agent.attachOwner(null)).not.toThrow();
  });

  it("lets AgentService attachSink deliver dispatchEvent", () => {
    const sent: unknown[] = [];
    const dir = mkdtempSync(join(tmpdir(), "prism-sink-"));
    const agent = createAgentService({
      userDataDir: dir,
      getSettings: () => ({ aiProvider: "anthropic", aiModel: "claude", aiApiKeys: { anthropic: "sk" } }),
      composeStableSystem: async () => "",
      composeProjectRules: async () => "",
      composeAgentsMd: async () => "",
    });
    agent.attachSink({
      emit(_channel, payload) {
        sent.push(payload);
      },
    });
    agent.dispatchEvent({
      type: "text_delta",
      runtimeSessionId: "rt",
      tabId: "tab",
      turnId: "t1",
      text: "ok",
    });
    expect(sent).toMatchObject([{ type: "text_delta", text: "ok" }]);
  });

  it("forwards Host events through FrameSink", () => {
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const sink = createFrameSink({
      remoteRoot: null,
      projectId: null,
      emit(channel, payload) {
        sent.push({ channel, payload });
      },
    });
    sink.emit("agent:event", { type: "text_delta", text: "hi" });
    expect(sent).toEqual([{ channel: "agent:event", payload: { type: "text_delta", text: "hi" } }]);
  });
});
