import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mapPiSessionEvent, toChatStreamEnvelope } from "../../src/main/agent/events";
import {
  ClosedResourceLoader,
  closedPiSessionOptions,
  createPiSessionManager,
  createPiSdkSessionFactory,
  isNodeCompatibleWithPi,
  PI_MIN_NODE,
  PI_SDK_PACKAGE,
  PI_SDK_PINNED_VERSION,
  PiSdkRuntime,
  probePiEmbedCompatibility,
  tryLoadPiSdkModule,
} from "../../src/main/agent/pi-sdk-runtime";
import { AgentSessionStore, FORBIDDEN_PROJECT_RESOURCE_DIRS, resolvePiRuntimeSessionDir } from "../../src/main/agent/session-store";
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

  it("creates and reopens a Pi SessionManager under userData, not the project", () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-pi-persist-"));
    const project = mkdtempSync(join(tmpdir(), "prism-pi-persist-proj-"));
    dirs.push(userData, project);
    writeFileSync(join(project, "README.md"), "keep", "utf-8");
    const sessionDir = resolvePiRuntimeSessionDir(userData);
    const created = createPiSessionManager(project, { mode: "create", sessionDir });
    const file = created.getSessionFile();
    expect(file).toBeTruthy();
    expect(file!.startsWith(sessionDir)).toBe(true);
    expect(existsSync(join(project, ".pi"))).toBe(false);
    expect(existsSync(join(project, ".agents"))).toBe(false);
    // Pi defers writing the JSONL until the first assistant turn; seed the header so open is real.
    writeFileSync(file!, `${JSON.stringify({
      type: "session",
      version: 3,
      id: created.getSessionId(),
      timestamp: new Date().toISOString(),
      cwd: project,
    })}\n`);
    const opened = createPiSessionManager(project, { mode: "open", sessionFile: file!, sessionDir });
    expect(opened.getSessionId()).toBe(created.getSessionId());
  });

  it("uses a closed resource loader that never lists project or home skills", () => {
    const loader = new ClosedResourceLoader();
    expect(loader.getExtensions().extensions).toEqual([]);
    expect(loader.getSkills().skills).toEqual([]);
    expect(loader.getPrompts().prompts).toEqual([]);
    expect(loader.getAgentsFiles()).toEqual({ agentsFiles: [] });
    const opts = closedPiSessionOptions({
      cwd: "/tmp/project",
      agentDir: "/tmp/userData/pi-agent",
      systemPrompt: "direct prompt, no _prism-system.md",
    });
    expect(opts.noTools).toBe("builtin");
    expect(opts.settingsManagerMode).toBe("inMemory");
    expect(opts.sessionManagerMode).toBe("inMemory");
    expect(opts.forbiddenDiscovery).toEqual(FORBIDDEN_PROJECT_RESOURCE_DIRS);
    expect(opts.systemPrompt).toContain("direct prompt");
  });

  it("passes the composed prompt directly without exposing discovered resources", () => {
    const opts = closedPiSessionOptions({
      cwd: "/tmp/project",
      agentDir: "/tmp/userData/pi-agent",
      systemPrompt: "Only this composed PrismNext prompt is visible.",
    });
    const loader = opts.resourceLoader as unknown as {
      getSystemPrompt(): string | undefined;
      getAppendSystemPrompt(): string[];
      getExtensions(): { extensions: unknown[]; errors: unknown[] };
      getSkills(): { skills: unknown[]; diagnostics: unknown[] };
    };

    expect(loader.getSystemPrompt()).toBe("Only this composed PrismNext prompt is visible.");
    expect(loader.getAppendSystemPrompt()).toEqual([]);
    expect(loader.getExtensions()).toMatchObject({ extensions: [], errors: [] });
    expect(loader.getSkills()).toEqual({ skills: [], diagnostics: [] });
  });

  it("exposes only PrismNext native tools to Pi and delegates with the active turn context", async () => {
    const module = await import("../../src/main/agent/pi-sdk-runtime");
    const createNativeTools = (module as unknown as {
      createPiNativeTools: (input: {
        toolHost: {
          execute: (
            toolName: string,
            args: Record<string, unknown>,
            context: Record<string, unknown>,
          ) => Promise<unknown>;
        };
        getContext: () => Record<string, unknown>;
      }) => Array<{
        name: string;
        execute: (
          toolCallId: string,
          args: Record<string, unknown>,
          signal?: AbortSignal,
        ) => Promise<{ content: Array<{ type: string; text: string }> }>;
      }>;
    }).createPiNativeTools;

    const calls: Array<{ name: string; args: Record<string, unknown>; context: Record<string, unknown> }> = [];
    const tools = createNativeTools({
      toolHost: {
        async execute(name, args, context) {
          calls.push({ name, args, context });
          return { ok: true, result: { source: "PrismNext" } };
        },
      },
      getContext: () => ({
        runtimeSessionId: "rt-1",
        tabId: "tab-1",
        turnId: "turn-1",
        projectRoot: "/tmp/project",
        permissionMode: "edit_auto",
      }),
    });

    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "literature-search",
      "literature-discover",
      "research-brief-update",
      "experiment-run",
      "literature-read",
      "literature-stage",
    ]));

    const brief = tools.find((tool) => tool.name === "research-brief-update");
    const result = await brief!.execute("brief-call", {
      section: "Research question",
      content: "Does X affect Y?",
    });
    expect(calls).toEqual([{
      name: "research-brief-update",
      args: {
        section: "Research question",
        content: "Does X affect Y?",
      },
      context: {
        runtimeSessionId: "rt-1",
        tabId: "tab-1",
        turnId: "turn-1",
        projectRoot: "/tmp/project",
        permissionMode: "edit_auto",
        toolCallId: "brief-call",
        abortSignal: undefined,
      },
    }]);
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ ok: true, result: { source: "PrismNext" } }),
    });
  });

  it("requires an explicit BYOK key before creating a real Pi session factory", async () => {
    const module = await import("../../src/main/agent/pi-sdk-runtime");
    const createFactory = (module as unknown as {
      createPiSdkSessionFactory: (input: {
        providerId: string;
        modelId: string;
        apiKey?: string;
        systemPrompt: string;
        toolHost: unknown;
      }) => unknown;
    }).createPiSdkSessionFactory;

    expect(() => createFactory({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      systemPrompt: "PrismNext system prompt",
      toolHost: {},
    })).toThrow("missing_pi_api_key");
  });

  it("creates a real in-memory Pi SDK session with no built-in tools", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-pi-sdk-"));
    dirs.push(root);
    const factory = createPiSdkSessionFactory({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      apiKey: "test-key-never-sent",
      systemPrompt: "Only the PrismNext prompt reaches this session.",
      toolHost: {
        async execute() {
          return { ok: false, error: "test_tool_host" };
        },
      },
    });

    const session = await factory({
      runtimeSessionId: "pi-real-session",
      tabId: "tab-pi-real",
      cwd: root,
      agentDir: join(root, "pi-agent"),
      projectRoot: root,
      permissionMode: "edit_auto",
      sessionAgent: "build",
      allowedPaths: undefined,
      resourceLoader: new ClosedResourceLoader(),
    });

    expect(session.sessionId).toBeTruthy();
    expect(typeof session.prompt).toBe("function");
    expect(session.getSystemPrompt?.()).toContain("Only the PrismNext prompt reaches this session.");
    expect(session.getSystemPrompt?.()).not.toMatch(/expert coding assistant operating inside pi/i);
    expect(existsSync(join(root, "pi-agent", "auth.json"))).toBe(false);
    expect(existsSync(join(root, "pi-agent", "models.json"))).toBe(false);
    await session.abort();
    session.dispose();
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
    expect(tool).toEqual([]);
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
