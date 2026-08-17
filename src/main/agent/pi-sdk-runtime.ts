/**
 * Pi SDK adapter for the product Agent host.
 * Electron 43 embeds Node 24.18, which meets Pi's Node >= 22.19.0 requirement.
 */

import { mkdirSync } from "node:fs";
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
import type {
  AgentSessionStore,
  AgentToolCallSnapshot,
  AgentTurnRecord,
} from "./session-store";
import { FORBIDDEN_PROJECT_RESOURCE_DIRS } from "./session-store";
import type { ToolHost } from "./tool-host";
import type { ToolExecuteContext } from "./tool-host";
import type { PermissionGate } from "./permission-gate";
import { isPiPrimitiveToolName } from "./capability-matrix";
import { wrapPiPrimitiveTools } from "./pi-primitive-tools";
import type { InteractionBroker } from "./interaction-broker";
import { PI_PRIMITIVE_TOOL_NAMES } from "./capability-matrix";

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

export type PiSessionPersist =
  | { mode: "memory" }
  | { mode: "create"; sessionDir: string }
  | { mode: "open"; sessionFile: string; sessionDir?: string };

export function createPiSessionManager(
  cwd: string,
  persist: PiSessionPersist = { mode: "memory" },
): SessionManager {
  if (persist.mode === "open") {
    return SessionManager.open(persist.sessionFile, persist.sessionDir, cwd);
  }
  if (persist.mode === "create") {
    mkdirSync(persist.sessionDir, { recursive: true });
    return SessionManager.create(cwd, persist.sessionDir);
  }
  return SessionManager.inMemory(cwd);
}

export function closedPiSessionOptions(input: {
  cwd: string;
  agentDir: string;
  systemPrompt?: string;
}): {
  cwd: string;
  agentDir: string;
  primitiveTools: readonly string[];
  resourceLoader: ClosedResourceLoader;
  settingsManagerMode: "inMemory";
  sessionManagerMode: "inMemory";
  systemPrompt?: string;
  forbiddenDiscovery: readonly string[];
} {
  return {
    cwd: input.cwd,
    agentDir: input.agentDir,
    primitiveTools: PI_PRIMITIVE_TOOL_NAMES,
    resourceLoader: new ClosedResourceLoader(input.systemPrompt),
    settingsManagerMode: "inMemory",
    sessionManagerMode: "inMemory",
    systemPrompt: input.systemPrompt,
    forbiddenDiscovery: FORBIDDEN_PROJECT_RESOURCE_DIRS,
  };
}

import { ALL_NATIVE_TOOLS } from "./tools/index";

export type PiToolExecutionContext = Omit<
  ToolExecuteContext,
  "toolCallId" | "abortSignal"
>;

/**
 * Maps host research / interactive tools into Pi ToolDefinition objects.
 * File and shell primitives are registered separately from Pi's own factories.
 */
export function createPiNativeTools(input: {
  toolHost: Pick<ToolHost, "execute"> & { toPiTools?: (getContext: () => PiToolExecutionContext) => ToolDefinition[] };
  getContext: () => PiToolExecutionContext;
}): ToolDefinition[] {
  if (typeof (input.toolHost as ToolHost).toPiTools === "function") {
    return (input.toolHost as ToolHost).toPiTools(input.getContext)
      .filter((tool) => !isPiPrimitiveToolName(tool.name));
  }
  return ALL_NATIVE_TOOLS.filter((tool) => !isPiPrimitiveToolName(tool.name)).map((tool) =>
    defineTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      execute: async (toolCallId, args, signal) => {
        const result = await input.toolHost.execute(tool.name, args as Record<string, unknown>, {
          ...input.getContext(),
          toolCallId,
          abortSignal: signal,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
        };
      },
    }),
  );
}

export interface PiSdkSessionFactoryInput {
  providerId: string;
  modelId: string;
  apiKey?: string;
  systemPrompt: string;
  toolHost: Pick<ToolHost, "execute">;
  gate: PermissionGate;
  interactions?: InteractionBroker;
}

interface PiSessionHandle {
  sessionId: string;
  sessionFile?: string;
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  dispose: () => void;
  subscribe: (listener: (event: PiLikeSessionEvent) => void) => () => void;
  setTurnContext?: (context: PiToolExecutionContext) => void;
  getSystemPrompt?: () => string | undefined;
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
  persist?: PiSessionPersist;
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

    const getContext = (): PiToolExecutionContext => turnContext;
    let turnContext: PiToolExecutionContext = {
      runtimeSessionId: opts.runtimeSessionId,
      tabId: opts.tabId,
      turnId: "pending",
      projectRoot: opts.projectRoot,
      permissionMode: opts.permissionMode ?? "edit_auto",
      sessionAgent: opts.sessionAgent,
      allowedPaths: opts.allowedPaths,
      askUser: input.interactions
        ? (question) => input.interactions!.askQuestion({
            requestId: `q-${turnContext.turnId}-${Date.now().toString(36)}`,
            runtimeSessionId: turnContext.runtimeSessionId,
            tabId: turnContext.tabId,
            turnId: turnContext.turnId,
            prompt: question.prompt,
            options: question.options,
            multiSelect: question.multiSelect,
          })
        : undefined,
      suggestPlan: input.interactions
        ? (plan) => input.interactions!.suggestPlan({
            requestId: `plan-${turnContext.turnId}-${Date.now().toString(36)}`,
            runtimeSessionId: turnContext.runtimeSessionId,
            tabId: turnContext.tabId,
            turnId: turnContext.turnId,
            reason: plan.reason,
          })
        : undefined,
    };
    const hostTools = createPiNativeTools({
      toolHost: input.toolHost,
      getContext,
    });
    const primitiveTools = wrapPiPrimitiveTools({
      cwd: opts.cwd,
      gate: input.gate,
      getContext,
    });
    const customTools = [...primitiveTools, ...hostTools];
    const resourceLoader = new ClosedResourceLoader(input.systemPrompt);
    const sessionManager = createPiSessionManager(opts.cwd, opts.persist);
    const { session } = await createAgentSession({
      cwd: opts.cwd,
      agentDir: opts.agentDir,
      model,
      modelRuntime,
      resourceLoader,
      sessionManager,
      settingsManager: SettingsManager.inMemory(),
      noTools: "builtin",
      tools: customTools.map((tool) => tool.name),
      customTools,
    });

    return {
      sessionId: session.sessionId,
      sessionFile: sessionManager.getSessionFile(),
      prompt: (text: string) => session.prompt(text, { expandPromptTemplates: false }),
      abort: () => session.abort(),
      dispose: () => session.dispose(),
      subscribe: (listener: (event: PiLikeSessionEvent) => void) => (
        session.subscribe((event) => listener(event as PiLikeSessionEvent))
      ),
      setTurnContext: (next: PiToolExecutionContext) => {
        turnContext = {
          ...next,
          askUser: next.askUser ?? turnContext.askUser,
          suggestPlan: next.suggestPlan ?? turnContext.suggestPlan,
        };
      },
      getSystemPrompt: () => {
        const agent = (session as { agent?: { state?: { systemPrompt?: string } } }).agent;
        return agent?.state?.systemPrompt;
      },
    };
  };
}

interface LiveTurnAccumulator {
  turnIndex: number;
  turnId: string;
  createdAt: number;
  userText: string;
  assistantText: string;
  assistantThinking: string;
  toolCalls: Map<string, AgentToolCallSnapshot>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

interface LivePiSession {
  runtimeSessionId: RuntimeSessionId;
  tabId: string;
  projectRoot: string;
  boundCheckoutPath: string;
  handle: PiSessionHandle;
  unsubscribe: () => void;
  turnId: string;
  activeTurn: LiveTurnAccumulator | null;
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
      persistSessions?: boolean;
      piSessionDir?: string;
    },
  ) {
    if (typeof this.opts.toolHost?.addEventSink === "function") {
      this.opts.toolHost.addEventSink((event) => {
        this.emit(event);
      });
    }
  }

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AgentEvent): void {
    this.processTurnAccumulation(event);
    for (const listener of this.listeners) listener(event);
  }

  private processTurnAccumulation(event: AgentEvent): void {
    const session = this.sessions.get(event.runtimeSessionId);
    if (!session || !session.activeTurn) return;
    const turn = session.activeTurn;
    if (turn.turnId !== event.turnId) return;

    switch (event.type) {
      case "text_delta":
        turn.assistantText += event.text;
        break;
      case "thinking_delta":
        turn.assistantThinking += event.text;
        break;
      case "tool_started":
        turn.toolCalls.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          startedAt: Date.now(),
        });
        break;
      case "tool_finished": {
        const existing = turn.toolCalls.get(event.toolCallId);
        if (existing) {
          existing.finishedAt = Date.now();
          existing.result = event.result;
          existing.error = event.error;
          existing.denied = event.denied;
        } else {
          turn.toolCalls.set(event.toolCallId, {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: {},
            startedAt: Date.now(),
            finishedAt: Date.now(),
            result: event.result,
            error: event.error,
            denied: event.denied,
          });
        }
        break;
      }
      case "usage_updated":
        turn.usage = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        };
        break;
      case "turn_finished": {
        const record: AgentTurnRecord = {
          turnIndex: turn.turnIndex,
          turnId: turn.turnId,
          createdAt: turn.createdAt,
          finishedAt: Date.now(),
          user: { text: turn.userText },
          assistant: {
            text: turn.assistantText,
            ...(turn.assistantThinking ? { thinking: turn.assistantThinking } : {}),
            toolCalls: Array.from(turn.toolCalls.values()),
          },
          ...(turn.usage ? { usage: turn.usage } : {}),
          status: "completed",
        };
        this.opts.store.appendTurn(session.runtimeSessionId, record);
        session.activeTurn = null;
        break;
      }
      case "turn_failed": {
        const record: AgentTurnRecord = {
          turnIndex: turn.turnIndex,
          turnId: turn.turnId,
          createdAt: turn.createdAt,
          finishedAt: Date.now(),
          user: { text: turn.userText },
          assistant: {
            text: turn.assistantText,
            ...(turn.assistantThinking ? { thinking: turn.assistantThinking } : {}),
            toolCalls: Array.from(turn.toolCalls.values()),
          },
          ...(turn.usage ? { usage: turn.usage } : {}),
          status: "failed",
          error: event.error,
        };
        this.opts.store.appendTurn(session.runtimeSessionId, record);
        session.activeTurn = null;
        break;
      }
      case "turn_cancelled": {
        const record: AgentTurnRecord = {
          turnIndex: turn.turnIndex,
          turnId: turn.turnId,
          createdAt: turn.createdAt,
          finishedAt: Date.now(),
          user: { text: turn.userText },
          assistant: {
            text: turn.assistantText,
            ...(turn.assistantThinking ? { thinking: turn.assistantThinking } : {}),
            toolCalls: Array.from(turn.toolCalls.values()),
          },
          ...(turn.usage ? { usage: turn.usage } : {}),
          status: "cancelled",
        };
        this.opts.store.appendTurn(session.runtimeSessionId, record);
        session.activeTurn = null;
        break;
      }
    }
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    const runtimeSessionId = newRuntimeSessionId();
    const conversationId = input.conversationId || runtimeSessionId;
    const agentDir = join(this.opts.agentDir, runtimeSessionId);
    const boundCheckoutPath = input.boundCheckoutPath || input.projectRoot;
    const persist = input.piSessionFile
      ? { mode: "open" as const, sessionFile: input.piSessionFile, sessionDir: this.opts.piSessionDir }
      : this.opts.persistSessions && this.opts.piSessionDir
        ? { mode: "create" as const, sessionDir: this.opts.piSessionDir }
        : { mode: "memory" as const };
    const handle = await this.opts.createPiSession({
      runtimeSessionId,
      tabId: input.tabId,
      cwd: boundCheckoutPath,
      agentDir,
      projectRoot: input.projectRoot,
      permissionMode: input.permissionMode,
      sessionAgent: input.sessionAgent,
      allowedPaths: input.allowedPaths,
      resourceLoader: new ClosedResourceLoader(),
      persist,
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
      boundCheckoutPath,
      handle,
      unsubscribe,
      turnId,
      activeTurn: null,
    });
    this.opts.store.createSession({
      conversationId,
      runtimeSessionId,
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      boundCheckoutPath,
      backend: "pi-sdk",
      permissionMode: input.permissionMode ?? "edit_auto",
      sessionAgent: input.sessionAgent ?? "build",
      piSessionFile: handle.sessionFile,
    });
    return {
      runtimeSessionId,
      tabId: input.tabId,
      conversationId,
      piSessionFile: handle.sessionFile,
    };
  }

  async sendTurn(input: TurnInput): Promise<void> {
    const session = this.sessions.get(input.runtimeSessionId);
    if (!session) throw new Error(`unknown_session:${input.runtimeSessionId}`);
    if (session.tabId !== input.tabId) throw new Error(`tab_mismatch:${input.tabId}`);

    const existingRecord = this.opts.store.getSession(session.runtimeSessionId);
    const turnIndex = existingRecord?.turns.length ?? 0;
    session.turnId = input.turnId || newTurnId();
    session.activeTurn = {
      turnIndex,
      turnId: session.turnId,
      createdAt: Date.now(),
      userText: input.text,
      assistantText: "",
      assistantThinking: "",
      toolCalls: new Map(),
    };

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
    // Note: Do NOT delete session from store! Session JSON history is preserved.
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
