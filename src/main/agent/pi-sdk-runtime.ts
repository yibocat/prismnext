/**
 * Controlled Pi SDK adapter.
 *
 * Production chat must not import this as the default backend.
 * Electron 43 embeds Node 24.18, which meets Pi's Node >= 22.19.0 requirement.
 */

import { join } from "node:path";
import {
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore, Type } from "@earendil-works/pi-ai";
import type {
  AgentEvent,
  CreateSessionInput,
  CreateSessionResult,
  RuntimeSessionId,
  TurnInput,
} from "../../shared/agent-runtime";
import type { AgentEventListener, AgentRuntime } from "./runtime";
import { newRuntimeSessionId, newTurnId } from "./runtime";
import { mapPiSessionEvent, type PiLikeSessionEvent } from "./events";
import type { AgentSessionStore } from "./session-store";
import { FORBIDDEN_PROJECT_RESOURCE_DIRS } from "./session-store";
import type { ToolHost } from "./tool-host";
import type { ToolExecuteContext } from "./tool-host";
import type { PermissionGate } from "./permission-gate";

export const PI_SDK_PACKAGE = "@earendil-works/pi-coding-agent";
export const PI_AI_PACKAGE = "@earendil-works/pi-ai";
export const PI_SDK_PINNED_VERSION = "0.84.2";
export const PI_MIN_NODE = "22.19.0";

export interface PiCompatProbe {
  hostNode: string;
  electronNode: string;
  electronVersion: string;
  piMinNode: string;
  pinnedSdk: string;
  hostMeetsPi: boolean;
  electronMeetsPi: boolean;
  canEmbedInElectronMain: boolean;
}

export function parseSemver(version: string): [number, number, number] {
  const core = version.trim().replace(/^v/, "").split("-")[0] ?? "0.0.0";
  const [maj, min, pat] = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return [maj, min, pat];
}

export function isNodeCompatibleWithPi(nodeVersion: string, min = PI_MIN_NODE): boolean {
  const a = parseSemver(nodeVersion);
  const b = parseSemver(min);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

export function probePiEmbedCompatibility(input: {
  hostNode: string;
  electronNode: string;
  electronVersion: string;
}): PiCompatProbe {
  const hostMeetsPi = isNodeCompatibleWithPi(input.hostNode);
  const electronMeetsPi = isNodeCompatibleWithPi(input.electronNode);
  return {
    hostNode: input.hostNode,
    electronNode: input.electronNode,
    electronVersion: input.electronVersion,
    piMinNode: PI_MIN_NODE,
    pinnedSdk: `${PI_SDK_PACKAGE}@${PI_SDK_PINNED_VERSION}`,
    hostMeetsPi,
    electronMeetsPi,
    canEmbedInElectronMain: electronMeetsPi,
  };
}

/**
 * ResourceLoader that never walks the project or home directory.
 * DefaultResourceLoader would read `.pi/`, `.agents/`, parent AGENTS.md, and `~/.pi`.
 */
export class ClosedResourceLoader implements ResourceLoader {
  private readonly extensions = {
    extensions: [],
    errors: [],
    runtime: createExtensionRuntime(),
  };

  constructor(private readonly systemPrompt?: string) {}

  async reload(): Promise<void> {}

  getExtensions() {
    return this.extensions;
  }

  getSkills() {
    return { skills: [], diagnostics: [] };
  }

  getPrompts() {
    return { prompts: [], diagnostics: [] };
  }

  getThemes() {
    return { themes: [], diagnostics: [] };
  }

  getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> } {
    return { agentsFiles: [] };
  }

  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  getSystemPromptSource(): undefined {
    return undefined;
  }

  getAppendSystemPrompt(): string[] {
    return [];
  }

  getAppendSystemPromptSources(): [] {
    return [];
  }

  extendResources(): void {}
}

export function closedPiSessionOptions(input: {
  cwd: string;
  agentDir: string;
  systemPrompt?: string;
}): {
  cwd: string;
  agentDir: string;
  noTools: "builtin";
  resourceLoader: ClosedResourceLoader;
  settingsManagerMode: "inMemory";
  sessionManagerMode: "inMemory";
  systemPrompt?: string;
  forbiddenDiscovery: readonly string[];
} {
  return {
    cwd: input.cwd,
    agentDir: input.agentDir,
    noTools: "builtin",
    resourceLoader: new ClosedResourceLoader(input.systemPrompt),
    settingsManagerMode: "inMemory",
    sessionManagerMode: "inMemory",
    systemPrompt: input.systemPrompt,
    forbiddenDiscovery: FORBIDDEN_PROJECT_RESOURCE_DIRS,
  };
}

export type PiToolExecutionContext = Omit<
  ToolExecuteContext,
  "toolCallId" | "abortSignal"
>;

/**
 * The only tools Pi may see in the Spike. Pi's file and shell tools remain
 * disabled; every call routes to PrismNext ToolHost and PermissionGate.
 */
export function createPiNativeTools(input: {
  toolHost: Pick<ToolHost, "execute">;
  getContext: () => PiToolExecutionContext;
}): ToolDefinition[] {
  const bridge = (
    name: string,
    label: string,
    description: string,
    parameters: ToolDefinition["parameters"],
  ): ToolDefinition => defineTool({
    name,
    label,
    description,
    parameters,
    execute: async (toolCallId, args, signal) => {
      const result = await input.toolHost.execute(name, args as Record<string, unknown>, {
        ...input.getContext(),
        toolCallId,
        abortSignal: signal,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: result,
      };
    },
  });

  return [
    bridge(
      "literature-search",
      "Search Literature",
      "Search the current project's local literature library.",
      Type.Object({
        query: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        tag: Type.Optional(Type.String()),
        collection: Type.Optional(Type.String()),
      }),
    ),
    bridge(
      "literature-discover",
      "Discover Literature",
      "Search external academic catalogs for literature.",
      Type.Object({
        query: Type.String({ minLength: 1 }),
        sources: Type.Optional(Type.Array(Type.String())),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        year: Type.Optional(Type.String()),
        author: Type.Optional(Type.String()),
      }),
    ),
    bridge(
      "research-brief-update",
      "Update Research Brief",
      "Update one section of the project research brief.",
      Type.Object({
        section: Type.String({ minLength: 1 }),
        content: Type.String({ minLength: 1 }),
        append: Type.Optional(Type.Boolean()),
      }),
    ),
    bridge(
      "experiment-run",
      "Run Experiment",
      "Run a command in an existing experiment island and record it.",
      Type.Object({
        id: Type.String({ minLength: 1 }),
        command: Type.String({ minLength: 1 }),
        artifacts: Type.Optional(Type.Array(Type.String())),
        notes: Type.Optional(Type.String()),
        kind: Type.Optional(Type.String()),
        interpreter: Type.Optional(Type.String()),
        pythonPath: Type.Optional(Type.String()),
      }),
    ),
  ];
}

export interface PiSdkSessionFactoryInput {
  providerId: string;
  modelId: string;
  apiKey?: string;
  systemPrompt: string;
  toolHost: Pick<ToolHost, "execute">;
}

interface PiSessionHandle {
  sessionId: string;
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  dispose: () => void;
  subscribe: (listener: (event: PiLikeSessionEvent) => void) => () => void;
  setTurnContext?: (context: PiToolExecutionContext) => void;
}

export type PiSessionFactory = (opts: {
  runtimeSessionId: string;
  tabId: string;
  cwd: string;
  agentDir: string;
  projectRoot: string;
  permissionMode: CreateSessionInput["permissionMode"];
  sessionAgent: CreateSessionInput["sessionAgent"];
  allowedPaths: string[] | undefined;
  systemPrompt?: string;
  resourceLoader: ClosedResourceLoader;
}) => Promise<PiSessionHandle>;

/**
 * Creates a real Pi SDK session factory for the internal Spike only.
 * This deliberately takes an explicit BYOK value: it does not read Pi's
 * global auth file, shell expansions, or any project configuration.
 */
export function createPiSdkSessionFactory(
  input: PiSdkSessionFactoryInput,
): PiSessionFactory {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) throw new Error("missing_pi_api_key");
  if (!input.providerId.trim() || !input.modelId.trim()) {
    throw new Error("missing_pi_model");
  }

  return async (opts) => {
    const modelRuntime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
    });
    await modelRuntime.setRuntimeApiKey(input.providerId, apiKey);

    const model = modelRuntime.getModel(input.providerId, input.modelId);
    if (!model) {
      throw new Error(`unknown_pi_model:${input.providerId}/${input.modelId}`);
    }

    let turnContext: PiToolExecutionContext = {
      runtimeSessionId: opts.runtimeSessionId,
      tabId: opts.tabId,
      turnId: "pending",
      projectRoot: opts.projectRoot,
      permissionMode: opts.permissionMode ?? "edit_auto",
      sessionAgent: opts.sessionAgent,
      allowedPaths: opts.allowedPaths,
    };
    const customTools = createPiNativeTools({
      toolHost: input.toolHost,
      getContext: () => turnContext,
    });
    const resourceLoader = new ClosedResourceLoader(input.systemPrompt);
    const { session } = await createAgentSession({
      cwd: opts.cwd,
      agentDir: opts.agentDir,
      model,
      modelRuntime,
      resourceLoader,
      sessionManager: SessionManager.inMemory(opts.cwd),
      settingsManager: SettingsManager.inMemory(),
      noTools: "builtin",
      tools: customTools.map((tool) => tool.name),
      customTools,
    });

    return {
      sessionId: session.sessionId,
      prompt: (text: string) => session.prompt(text, { expandPromptTemplates: false }),
      abort: () => session.abort(),
      dispose: () => session.dispose(),
      subscribe: (listener: (event: PiLikeSessionEvent) => void) => (
        session.subscribe((event) => listener(event as PiLikeSessionEvent))
      ),
      setTurnContext: (next: PiToolExecutionContext) => {
        turnContext = next;
      },
    };
  };
}

interface LivePiSession {
  runtimeSessionId: RuntimeSessionId;
  tabId: string;
  projectRoot: string;
  handle: PiSessionHandle;
  unsubscribe: () => void;
  turnId: string;
}

/**
 * AgentRuntime backed by a Pi AgentSession factory.
 * Tests inject a fake factory; production would dynamic-import the SDK
 * only after `canEmbedInElectronMain` is true.
 */
export class PiSdkRuntime implements AgentRuntime {
  private readonly sessions = new Map<RuntimeSessionId, LivePiSession>();
  private readonly listeners = new Set<AgentEventListener>();

  constructor(
    private readonly opts: {
      createPiSession: PiSessionFactory;
      store: AgentSessionStore;
      toolHost: ToolHost;
      gate: PermissionGate;
      agentDir: string;
    },
  ) {}

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    const runtimeSessionId = newRuntimeSessionId();
    const agentDir = join(this.opts.agentDir, runtimeSessionId);
    const handle = await this.opts.createPiSession({
      runtimeSessionId,
      tabId: input.tabId,
      cwd: input.projectRoot,
      agentDir,
      projectRoot: input.projectRoot,
      permissionMode: input.permissionMode,
      sessionAgent: input.sessionAgent,
      allowedPaths: input.allowedPaths,
      resourceLoader: new ClosedResourceLoader(),
    });
    const turnId = newTurnId();
    const unsubscribe = handle.subscribe((piEvent) => {
      const live = this.sessions.get(runtimeSessionId);
      if (!live) return;
      for (const event of mapPiSessionEvent(piEvent, {
        runtimeSessionId,
        tabId: live.tabId,
        turnId: live.turnId,
      })) {
        this.emit(event);
      }
    });
    this.sessions.set(runtimeSessionId, {
      runtimeSessionId,
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      handle,
      unsubscribe,
      turnId,
    });
    const now = new Date().toISOString();
    this.opts.store.put({
      runtimeSessionId,
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      backend: "pi-sdk",
      permissionMode: input.permissionMode ?? "edit_auto",
      sessionAgent: input.sessionAgent ?? "build",
      createdAt: now,
      updatedAt: now,
    });
    return { runtimeSessionId, tabId: input.tabId };
  }

  async sendTurn(input: TurnInput): Promise<void> {
    const session = this.sessions.get(input.runtimeSessionId);
    if (!session) throw new Error(`unknown_session:${input.runtimeSessionId}`);
    if (session.tabId !== input.tabId) throw new Error(`tab_mismatch:${input.tabId}`);
    session.turnId = newTurnId();
    session.handle.setTurnContext?.({
      runtimeSessionId: session.runtimeSessionId,
      tabId: session.tabId,
      turnId: session.turnId,
      projectRoot: session.projectRoot,
      permissionMode: input.permissionMode,
      sessionAgent: input.sessionAgent,
      allowedPaths: input.allowedPaths,
    });
    try {
      await session.handle.prompt(input.text);
    } catch (err) {
      this.emit({
        type: "turn_failed",
        runtimeSessionId: session.runtimeSessionId,
        tabId: session.tabId,
        turnId: session.turnId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async cancelTurn(runtimeSessionId: RuntimeSessionId): Promise<void> {
    const session = this.sessions.get(runtimeSessionId);
    if (!session) return;
    this.opts.gate.cancelSession(runtimeSessionId);
    await session.handle.abort();
    this.emit({
      type: "turn_cancelled",
      runtimeSessionId: session.runtimeSessionId,
      tabId: session.tabId,
      turnId: session.turnId,
    });
  }

  async disposeSession(runtimeSessionId: RuntimeSessionId): Promise<void> {
    const session = this.sessions.get(runtimeSessionId);
    if (!session) return;
    session.unsubscribe();
    await session.handle.abort().catch(() => {});
    session.handle.dispose();
    this.sessions.delete(runtimeSessionId);
    this.opts.store.delete(runtimeSessionId);
  }
}

export async function tryLoadPiSdkModule(): Promise<
  { ok: true; module: Record<string, unknown> } | { ok: false; reason: string }
> {
  if (!isNodeCompatibleWithPi(process.versions.node)) {
    return {
      ok: false,
      reason: `node ${process.versions.node} < ${PI_MIN_NODE}`,
    };
  }
  try {
    const loaded = await import(/* @vite-ignore */ PI_SDK_PACKAGE);
    return { ok: true, module: loaded as Record<string, unknown> };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
