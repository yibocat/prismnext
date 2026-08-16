import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mapPiSessionEvent, toChatStreamEnvelope } from "../../src/main/agent/events";
import {
  ClosedResourceLoader,
  closedPiSessionOptions,
  isNodeCompatibleWithPi,
  PI_MIN_NODE,
  PI_SDK_PACKAGE,
  PI_SDK_PINNED_VERSION,
  PiSdkRuntime,
  probePiEmbedCompatibility,
  tryLoadPiSdkModule,
} from "../../src/main/agent/pi-sdk-runtime";
import { AgentSessionStore, FORBIDDEN_PROJECT_RESOURCE_DIRS } from "../../src/main/agent/session-store";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import { ToolHost } from "../../src/main/agent/tool-host";

describe("pi sdk spike", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("records the Electron Node compatibility against the pinned Pi line", () => {
    const legacyProbe = probePiEmbedCompatibility({
      hostNode: "22.16.0",
      electronNode: "22.16.0",
      electronVersion: "35.7.5",
    });
    expect(legacyProbe.pinnedSdk).toBe(`${PI_SDK_PACKAGE}@${PI_SDK_PINNED_VERSION}`);
    expect(legacyProbe.piMinNode).toBe(PI_MIN_NODE);
    expect(legacyProbe.electronMeetsPi).toBe(false);
    expect(legacyProbe.canEmbedInElectronMain).toBe(false);

    const upgradedProbe = probePiEmbedCompatibility({
      hostNode: process.versions.node,
      electronNode: "24.18.1",
      electronVersion: "43.4.0",
    });
    expect(upgradedProbe.electronMeetsPi).toBe(true);
    expect(upgradedProbe.canEmbedInElectronMain).toBe(true);
    expect(isNodeCompatibleWithPi("22.16.0")).toBe(false);
    expect(isNodeCompatibleWithPi("22.19.0")).toBe(true);
    expect(isNodeCompatibleWithPi("24.18.1")).toBe(true);
  });

  it("uses a closed resource loader that never lists project or home skills", () => {
    const loader = new ClosedResourceLoader();
    expect(loader.getExtensions()).toEqual([]);
    expect(loader.getSkills()).toEqual([]);
    expect(loader.getPrompts()).toEqual([]);
    expect(loader.getAgentsFiles()).toEqual({ agentsFiles: [] });
    const opts = closedPiSessionOptions({
      cwd: "/tmp/project",
      agentDir: "/tmp/userData/pi-agent",
      systemPrompt: "direct prompt, no _prism-system.md",
    });
    expect(opts.noTools).toBe("all");
    expect(opts.settingsManagerMode).toBe("inMemory");
    expect(opts.sessionManagerMode).toBe("inMemory");
    expect(opts.forbiddenDiscovery).toEqual(FORBIDDEN_PROJECT_RESOURCE_DIRS);
    expect(opts.systemPrompt).toContain("direct prompt");
  });

  it("maps Pi session events into AgentEvent without leaking runtime types", () => {
    const ctx = { runtimeSessionId: "rt-1", tabId: "tab-1", turnId: "turn-1" };
    const text = mapPiSessionEvent({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Hello" },
    }, ctx);
    const think = mapPiSessionEvent({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "hmm" },
    }, ctx);
    const tool = mapPiSessionEvent({
      type: "tool_execution_start",
      toolName: "literature-search",
      toolCallId: "c1",
    }, ctx);
    const end = mapPiSessionEvent({ type: "agent_end" }, ctx);
    expect(text[0]).toMatchObject({ type: "text_delta", text: "Hello", tabId: "tab-1" });
    expect(think[0]).toMatchObject({ type: "thinking_delta", text: "hmm" });
    expect(tool[0]).toMatchObject({ type: "tool_started", toolName: "literature-search" });
    expect(end[0]).toMatchObject({ type: "turn_finished" });
    expect(JSON.stringify([text, think, tool, end])).not.toMatch(/assistantMessageEvent|tool_execution_start/);
    expect(toChatStreamEnvelope(text[0]!).type).toBe("text_delta");
  });

  it("isolates two Pi-backed tabs and does not write project .pi or .agents", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-pi-proj-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-store-"));
    dirs.push(project, storeRoot);
    writeFileSync(join(project, "README.md"), "keep", "utf-8");

    const events: Array<{ tabId: string; type: string }> = [];
    const createdDirs: string[] = [];
    const runtime = new PiSdkRuntime({
      store: new AgentSessionStore(storeRoot),
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async ({ agentDir }) => {
        createdDirs.push(agentDir);
        mkdirSync(agentDir, { recursive: true });
        let listener: ((event: { type: string; assistantMessageEvent?: { type: string; delta: string } }) => void) | null = null;
        return {
          sessionId: `pi-${createdDirs.length}`,
          subscribe(next) {
            listener = next;
            return () => {
              listener = null;
            };
          },
          async prompt(text) {
            listener?.({
              type: "message_update",
              assistantMessageEvent: { type: "text_delta", delta: `echo:${text}` },
            });
            listener?.({ type: "agent_end" });
          },
          async abort() {},
          dispose() {},
        };
      },
    });
    runtime.subscribe((event) => events.push({ tabId: event.tabId, type: event.type }));

    const a = await runtime.createSession({ tabId: "tab-a", projectRoot: project });
    const b = await runtime.createSession({ tabId: "tab-b", projectRoot: project });
    await Promise.all([
      runtime.sendTurn({
        runtimeSessionId: a.runtimeSessionId,
        tabId: "tab-a",
        text: "alpha",
        permissionMode: "edit_auto",
      }),
      runtime.sendTurn({
        runtimeSessionId: b.runtimeSessionId,
        tabId: "tab-b",
        text: "beta",
        permissionMode: "edit_auto",
      }),
    ]);

    expect(events.filter((event) => event.tabId === "tab-a").some((event) => event.type === "text_delta")).toBe(true);
    expect(events.filter((event) => event.tabId === "tab-b").some((event) => event.type === "text_delta")).toBe(true);
    expect(existsSync(join(project, ".pi"))).toBe(false);
    expect(existsSync(join(project, ".agents"))).toBe(false);
    expect(existsSync(join(project, ".opencode"))).toBe(false);
    expect(createdDirs.every((dir) => dir.startsWith(join(storeRoot, "pi-agent")))).toBe(true);
    expect(existsSync(join(storeRoot, "sessions", `${a.runtimeSessionId}.json`))).toBe(true);
    expect(existsSync(join(storeRoot, "opencode.db"))).toBe(false);

    await runtime.disposeSession(a.runtimeSessionId);
    await runtime.disposeSession(b.runtimeSessionId);
  });

  it("does not load the real Pi package into the Electron-incompatible host path", async () => {
    const loaded = await tryLoadPiSdkModule();
    if (!isNodeCompatibleWithPi(process.versions.node)) {
      expect(loaded.ok).toBe(false);
      return;
    }
    // Host Node may be new enough; the package is intentionally not a production dependency.
    if (!loaded.ok) {
      expect(loaded.reason).toMatch(/Cannot find module|Cannot find package|Failed to resolve/);
    }
  });
});
