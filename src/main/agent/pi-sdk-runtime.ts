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
  type Skill,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { loadPiSkillsFromDirs, type HostSkillDir } from "./skill-loader";
import { skillReadRootsFromDirs } from "../../shared/skills/read-roots";
import { createLogger, shortLogDetail } from "../app/logger";
import type { AgentMcpHost } from "./mcp-host";

const piRuntimeLog = createLogger("pi-runtime", "agent");
import type { McpServerDef } from "../../shared/teams/types";
import { InMemoryCredentialStore, Type } from "@earendil-works/pi-ai";
import type {
  AgentEvent,
  CreateSessionInput,
  CreateSessionResult,
  RuntimeSessionId,
  TurnInput,
} from "../../shared/agent/runtime";
import type { ContentBlock } from "../../shared/agent/conversation";
import {
  applyAssistantEventToBlocks,
  deriveFlattenedAssistant,
  sealTurnBlockTimings,
} from "../../shared/agent/conversation-blocks";
import type { AgentCompactResult } from "../../shared/agent/api";
import type { AgentEventListener, AgentRuntime, AgentTruncateEngineResult } from "./runtime";
import { newRuntimeSessionId, newTurnId } from "./runtime";
import { mapPiSessionEvent, type PiLikeSessionEvent } from "./events";
import type {
  AgentMessageAttachment,
  AgentSessionStore,
  AgentToolCallSnapshot,
  AgentTurnRecord,
} from "./session-store";
import { FORBIDDEN_PROJECT_RESOURCE_DIRS } from "./session-store";
import type { ToolHost } from "./tool-host";
import type { ToolExecuteContext } from "./tool-host";
import type { PermissionGate } from "./permission-gate";
import { isPiPrimitiveToolName, PI_PRIMITIVE_TOOL_NAMES } from "./capability-matrix";
import { TOOL_NAMES } from "../../shared/agent/tool-names";
import { wrapPiPrimitiveTools } from "./pi-primitive-tools";
import type { InteractionBroker } from "./interaction-broker";
import type { SubagentSessionRunnerFactory } from "./pi-subsession-runtime";
import { snapshotPiSessionUsage, type PiUsageSnapshot } from "./context-usage";

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
export type ClosedResourceLoaderInput = {
  systemPrompt?: string;
  skills?: Skill[];
};

function normalizeClosedLoaderInput(
  input?: string | ClosedResourceLoaderInput,
): ClosedResourceLoaderInput {
  if (typeof input === "string" || input === undefined) {
    return { systemPrompt: input };
  }
  return input;
}

export class ClosedResourceLoader implements ResourceLoader {
  private readonly extensions = {
    extensions: [],
    errors: [],
    runtime: createExtensionRuntime(),
  };
  private readonly systemPrompt?: string;
  private readonly skills: Skill[];

  constructor(input?: string | ClosedResourceLoaderInput) {
    const opts = normalizeClosedLoaderInput(input);
    this.systemPrompt = opts.systemPrompt;
    this.skills = opts.skills ?? [];
  }

  async reload(): Promise<void> {}

  getExtensions() {
    return this.extensions;
  }

  getSkills() {
    return { skills: this.skills, diagnostics: [] };
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

function isUserSessionEntry(entry: { type: string; message?: { role?: string } }): boolean {
  return entry.type === "message" && entry.message?.role === "user";
}

function currentPiLeafId(manager: SessionManager): string | null {
  const branch = manager.getBranch();
  return branch.at(-1)?.id ?? null;
}

export function truncatePersistedPiSession(
  sessionFile: string,
  keepThroughTurnIndex: number,
): AgentTruncateEngineResult {
  try {
    const manager = SessionManager.open(sessionFile);
    const previousLeafId = currentPiLeafId(manager);
    if (keepThroughTurnIndex < 0) {
      manager.resetLeaf();
      return { ok: true, previousLeafId };
    }
    const users = manager.getEntries().filter(isUserSessionEntry);
    const discarded = users[keepThroughTurnIndex + 1];
    if (!discarded) return { ok: true, previousLeafId };
    if (discarded.parentId) manager.branch(discarded.parentId);
    else manager.resetLeaf();
    return { ok: true, previousLeafId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function restorePersistedPiSessionLeaf(
  sessionFile: string,
  leafId: string,
): { ok: boolean; error?: string } {
  try {
    SessionManager.open(sessionFile).branch(leafId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function sessionManagerOf(session: object): SessionManager | null {
  const manager = (session as { sessionManager?: SessionManager }).sessionManager;
  return manager && typeof manager.getEntries === "function" ? manager : null;
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
/** Pi catalog `input` includes `"image"` when the live model can see pixels. */
export function piModelAcceptsImages(
  model: { input?: readonly string[] } | null | undefined,
): boolean {
  return Boolean(model?.input?.includes("image"));
}

/**
 * Vision chat models must `read` PNG/JPG themselves. `image-describe` is the
 * text-only helper path and must not stay in the tool list.
 */
export function hostToolsForChatModel(
  tools: ToolDefinition[],
  model: { input?: readonly string[] } | null | undefined,
): ToolDefinition[] {
  if (!piModelAcceptsImages(model)) return tools;
  return tools.filter((tool) => tool.name !== TOOL_NAMES.imageDescribe);
}

function syncImageDescribeTool(
  session: object,
  model: { input?: readonly string[] } | null | undefined,
  describeTool: ToolDefinition | undefined,
): void {
  const raw = session as {
    _customTools?: ToolDefinition[];
    _refreshToolRegistry?: () => void;
  };
  if (!Array.isArray(raw._customTools) || typeof raw._refreshToolRegistry !== "function") {
    return;
  }
  const has = raw._customTools.some((tool) => tool.name === TOOL_NAMES.imageDescribe);
  const need = !piModelAcceptsImages(model);
  if (need && !has && describeTool) {
    raw._customTools.push(describeTool);
    raw._refreshToolRegistry();
  } else if (!need && has) {
    raw._customTools = raw._customTools.filter((tool) => tool.name !== TOOL_NAMES.imageDescribe);
    raw._refreshToolRegistry();
  }
}

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
  /** Host Gateway: never write a real key into Pi's credential store. */
  modelTransport?: "direct" | "proxy";
  systemPrompt: string;
  toolHost: Pick<ToolHost, "execute">;
  gate: PermissionGate;
  interactions?: InteractionBroker;
  skills?: HostSkillDir[];
  mcpHost?: AgentMcpHost;
  mcpServers?: McpServerDef[];
  /** Omit = all Pi primitives. `[]` = none (used by scoped subagent sessions). */
  primitiveToolNames?: readonly string[];
}

interface PiSessionHandle {
  sessionId: string;
  sessionFile?: string;
  prompt: (text: string, images?: Array<{ mimeType: string; data: string }>) => Promise<void>;
  abort: () => Promise<void>;
  dispose: () => void;
  compact?: (customInstructions?: string) => Promise<{
    summary: string;
    tokensBefore: number;
  }>;
  truncateToKeepTurns?: (keepThroughTurnIndex: number) => Promise<AgentTruncateEngineResult>;
  restoreLeaf?: (leafId: string) => Promise<{ ok: boolean; error?: string }>;
  subscribe: (listener: (event: PiLikeSessionEvent) => void) => () => void;
  setTurnContext?: (context: PiToolExecutionContext) => void;
  getSystemPrompt?: () => string | undefined;
  attachCustomTools?: (tools: ToolDefinition[]) => number;
  getUsageSnapshot?: (opts?: {
    occupancy?: number | null;
    includeBreakdown?: boolean;
    previousCostUsd?: number;
  }) => PiUsageSnapshot | null;
  getModelRef?: () => { provider: string; modelId: string } | null;
  setModel?: (input: {
    provider: string;
    modelId: string;
    apiKey?: string;
  }) => Promise<void>;
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
function attachPiCustomTools(session: object, tools: ToolDefinition[]): number {
  const raw = session as {
    _customTools?: ToolDefinition[];
    _refreshToolRegistry?: () => void;
  };
  if (!Array.isArray(raw._customTools) || typeof raw._refreshToolRegistry !== "function") {
    // Upgrade guardrail: if the pinned SDK no longer exposes this private attach
    // surface, fail loudly instead of silently dropping MCP tools on upgrade.
    if (tools.length > 0) {
      throw new Error(
        `pi_sdk_incompatible: ${PI_SDK_PACKAGE}@${PI_SDK_PINNED_VERSION} ` +
          "no longer exposes session._customTools/_refreshToolRegistry used by attachCustomTools",
      );
    }
    return 0;
  }
  const have = new Set(raw._customTools.map((tool) => tool.name));
  let added = 0;
  for (const tool of tools) {
    if (have.has(tool.name)) continue;
    raw._customTools.push(tool);
    have.add(tool.name);
    added += 1;
  }
  if (added > 0) raw._refreshToolRegistry();
  return added;
}

type PiModelRuntimeLike = Pick<
  ModelRuntime,
  "getModel" | "refresh" | "setRuntimeApiKey"
>;

/** Resolve a Pi model, refreshing the provider catalog when the bundled snapshot is stale. */
export async function resolvePiModelFromRuntime(
  runtime: PiModelRuntimeLike,
  input: { providerId: string; modelId: string; apiKey?: string; modelTransport?: "direct" | "proxy" },
): Promise<NonNullable<ReturnType<ModelRuntime["getModel"]>>> {
  const providerId = input.providerId.trim();
  const modelId = input.modelId.trim();
  if (!providerId || !modelId) {
    throw new Error("missing_pi_model");
  }

  let model = runtime.getModel(providerId, modelId);
  if (model) return model;

  if (input.modelTransport === "proxy") {
    throw new Error(`unknown_pi_model:${providerId}/${modelId}`);
  }

  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    await runtime.setRuntimeApiKey(providerId, apiKey);
    await runtime.refresh?.({
      providers: [providerId],
      allowNetwork: true,
      force: true,
    });
    model = runtime.getModel(providerId, modelId);
  }

  if (!model) {
    throw new Error(`unknown_pi_model:${providerId}/${modelId}`);
  }
  return model;
}

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
      allowModelNetwork: true,
    });
    const model = await resolvePiModelFromRuntime(modelRuntime, {
      providerId: input.providerId,
      modelId: input.modelId,
      apiKey,
      modelTransport: input.modelTransport,
    });

    const getContext = (): PiToolExecutionContext => turnContext;
    const skillReadRoots = skillReadRootsFromDirs(input.skills);
    let turnContext: PiToolExecutionContext = {
      runtimeSessionId: opts.runtimeSessionId,
      tabId: opts.tabId,
      turnId: "pending",
      projectRoot: opts.projectRoot,
      permissionMode: opts.permissionMode ?? "edit_auto",
      sessionAgent: opts.sessionAgent,
      allowedPaths: opts.allowedPaths,
      skillReadRoots,
      askUser: input.interactions
        ? (question) => input.interactions!.askQuestion({
            requestId: question.requestId?.trim()
              || `q-${turnContext.turnId}-${Date.now().toString(36)}`,
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
    const hostToolsAll = createPiNativeTools({
      toolHost: input.toolHost,
      getContext,
    });
    const imageDescribeTool = hostToolsAll.find((tool) => tool.name === TOOL_NAMES.imageDescribe);
    const hostTools = hostToolsForChatModel(hostToolsAll, model);
    const primitiveTools = wrapPiPrimitiveTools({
      cwd: opts.cwd,
      gate: input.gate,
      getContext,
      names: input.primitiveToolNames,
    });
    input.mcpHost?.bindToolEnv({ gate: input.gate, getContext });
    const mcpTools = input.mcpHost
      ? await input.mcpHost.ensure(input.mcpServers ?? [], { cwd: opts.cwd })
      : [];
    input.mcpHost?.markAttached(mcpTools.map((tool) => tool.name));
    const customTools = [...primitiveTools, ...hostTools, ...mcpTools];
    const resourceLoader = new ClosedResourceLoader({
      systemPrompt: input.systemPrompt,
      skills: loadPiSkillsFromDirs(input.skills ?? []),
    });
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
      prompt: (text, images) =>
        session.prompt(text, {
          expandPromptTemplates: false,
          ...(images?.length
            ? {
                images: images.map((img) => ({
                  type: "image" as const,
                  data: img.data,
                  mimeType: img.mimeType,
                })),
              }
            : {}),
        }),
      abort: () => session.abort(),
      dispose: () => session.dispose(),
      compact: (customInstructions?: string) => session.compact(customInstructions),
      truncateToKeepTurns: async (keepThroughTurnIndex) => {
        const manager = sessionManagerOf(session);
        const previousLeafId = manager
          ? currentPiLeafId(manager)
          : session.getUserMessagesForForking().at(-1)?.entryId ?? null;
        if (keepThroughTurnIndex < 0) {
          if (manager) {
            manager.resetLeaf();
            return { ok: true, previousLeafId };
          }
          return { ok: false, previousLeafId, error: "truncate_empty_unavailable" };
        }
        const users = session.getUserMessagesForForking();
        const discarded = users[keepThroughTurnIndex + 1];
        if (!discarded) return { ok: true, previousLeafId };
        const parentId = manager?.getEntries().find((entry) => entry.id === discarded.entryId)?.parentId;
        await session.navigateTree(parentId || discarded.entryId, { summarize: false });
        return { ok: true, previousLeafId };
      },
      restoreLeaf: async (leafId) => {
        await session.navigateTree(leafId, { summarize: false });
        return { ok: true };
      },
      subscribe: (listener: (event: PiLikeSessionEvent) => void) => (
        session.subscribe((event) => listener(event as PiLikeSessionEvent))
      ),
      setTurnContext: (next: PiToolExecutionContext) => {
        turnContext = {
          ...next,
          askUser: next.askUser ?? turnContext.askUser,
          suggestPlan: next.suggestPlan ?? turnContext.suggestPlan,
          sessionAgent: next.sessionAgent ?? turnContext.sessionAgent,
          skillReadRoots: next.skillReadRoots ?? turnContext.skillReadRoots,
        };
      },
      getSystemPrompt: () => {
        const agent = (session as { agent?: { state?: { systemPrompt?: string } } }).agent;
        return agent?.state?.systemPrompt;
      },
      attachCustomTools: (tools) => attachPiCustomTools(session, tools),
      getUsageSnapshot: (opts) => snapshotPiSessionUsage(session, opts),
      getModelRef: () => {
        const current = session.model;
        if (!current?.provider || !current.id) return null;
        return { provider: String(current.provider), modelId: current.id };
      },
      setModel: async (next) => {
        const key = next.apiKey?.trim() || input.apiKey?.trim();
        const model = await resolvePiModelFromRuntime(modelRuntime, {
          providerId: next.provider,
          modelId: next.modelId,
          apiKey: key,
          modelTransport: input.modelTransport,
        });
        await session.setModel(model);
        syncImageDescribeTool(session, model, imageDescribeTool);
      },
    };
  };
}

export function createPiSubagentRunnerFactory(input: {
  fallbackProvider: string;
  fallbackModelId: string;
  resolveApiKey: (provider: string) => string | undefined;
  gate: PermissionGate;
  interactions?: InteractionBroker;
  agentRoot: string;
  modelTransport?: "direct" | "proxy";
}): SubagentSessionRunnerFactory {
  return async (opts) => {
    const provider = opts.modelRef?.provider ?? input.fallbackProvider;
    const modelId = opts.modelRef?.modelId ?? input.fallbackModelId;
    const apiKey = input.resolveApiKey(provider)?.trim();
    if (!apiKey) throw new Error("missing_pi_api_key");
    const allowed = new Set((opts.allowedToolNames ?? []).map((name) => name.toLowerCase()));
    const factory = createPiSdkSessionFactory({
      providerId: provider,
      modelId,
      apiKey,
      modelTransport: input.modelTransport,
      systemPrompt: opts.systemPrompt,
      toolHost: opts.scopedToolHost,
      gate: input.gate,
      interactions: input.interactions,
      primitiveToolNames: PI_PRIMITIVE_TOOL_NAMES.filter((name) => allowed.has(name)),
    });
    const handle = await factory({
      runtimeSessionId: opts.runtimeSessionId,
      tabId: opts.tabId,
      cwd: opts.boundCheckoutPath,
      agentDir: join(input.agentRoot, "sub", opts.runtimeSessionId),
      projectRoot: opts.projectRoot,
      permissionMode: "edit_auto",
      sessionAgent: "build",
      allowedPaths: undefined,
      resourceLoader: new ClosedResourceLoader({
        systemPrompt: opts.systemPrompt,
        skills: loadPiSkillsFromDirs(opts.skills ?? []),
      }),
      persist: { mode: "memory" },
    });
    let settleTurn: (() => void) | undefined;
    const turnSettled = new Promise<void>((resolve) => {
      settleTurn = resolve;
    });
    const unsubscribe = handle.subscribe((piEvent) => {
      for (const event of mapPiSessionEvent(piEvent, {
        runtimeSessionId: opts.runtimeSessionId,
        tabId: opts.tabId,
        turnId: opts.turnId,
      })) {
        opts.emitEvent(event);
        if (
          event.type === "turn_finished"
          || event.type === "turn_failed"
          || event.type === "turn_cancelled"
        ) {
          settleTurn?.();
        }
      }
    });
    handle.setTurnContext?.({
      runtimeSessionId: opts.runtimeSessionId,
      tabId: opts.tabId,
      turnId: opts.turnId,
      projectRoot: opts.projectRoot,
      permissionMode: "edit_auto",
      sessionAgent: "build",
    });
    return {
      prompt: async (text) => {
        await handle.prompt(text);
        await Promise.race([
          turnSettled,
          new Promise<void>((resolve) => {
            setTimeout(resolve, 1500);
          }),
        ]);
      },
      abort: () => handle.abort(),
      dispose: () => {
        unsubscribe();
        handle.dispose();
      },
    };
  };
}

interface LiveTurnAccumulator {
  turnIndex: number;
  turnId: string;
  createdAt: number;
  userText: string;
  userAttachments?: AgentMessageAttachment[];
  assistantText: string;
  assistantThinking: string;
  assistantBlocks: ContentBlock[];
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
  /** Set by cancelTurn so the terminal-event fallback never overrides a cancel. */
  cancelled: boolean;
  /** Idle watchdog for the active turn — fires when no Pi event arrives for a while. */
  watchdog?: ReturnType<typeof setTimeout>;
  /**
   * `agent_end` (or a fallback fail) arrived while PermissionGate still has
   * a waiter for this session. Do not commit the turn until that settles.
   */
  heldTerminal?: AgentEvent;
}

/**
 * AgentRuntime backed by a Pi AgentSession factory.
 * Tests inject a fake factory; production would dynamic-import the SDK
 * only after `canEmbedInElectronMain` is true.
 */
/**
 * Idle timeout for a streaming turn. If no Pi event arrives within this window
 * (model stalled mid-thinking, provider rate-limited / network hung), force a
 * turn_failed so the UI never sits on a frozen "Thinking…" forever.
 */
export const PI_TURN_IDLE_TIMEOUT_MS = 180_000;

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
    const enriched = this.enrichUsageEvent(event);
    if (this.holdTerminalWhilePermissionPending(enriched)) return;
    this.processTurnAccumulation(enriched);
    this.armTurnWatchdog(enriched.runtimeSessionId);
    for (const listener of this.listeners) listener(enriched);
    if (
      enriched.type === "turn_finished"
      || enriched.type === "turn_failed"
      || enriched.type === "turn_cancelled"
    ) {
      this.emitSessionUsageSnapshot(enriched.runtimeSessionId, enriched.tabId, enriched.turnId);
    }
    if (enriched.type === "tool_finished") {
      this.releaseHeldTerminal(enriched.runtimeSessionId);
    }
  }

  /** A permission waiter means the model is still in this prompt() — the turn is not over. */
  private sessionHasPendingPermission(runtimeSessionId: string): boolean {
    return this.opts.gate.hasPendingForSession(runtimeSessionId);
  }

  /**
   * `agent_end` is not the end of the product turn while PermissionGate still
   * has a waiter. Committing then makes the composer look idle while a
   * destructive prompt is still in flight.
   */
  private holdTerminalWhilePermissionPending(event: AgentEvent): boolean {
    if (event.type !== "turn_finished") return false;
    const session = this.sessions.get(event.runtimeSessionId);
    if (!session?.activeTurn || session.activeTurn.turnId !== event.turnId) return false;
    if (!this.sessionHasPendingPermission(event.runtimeSessionId)) return false;
    session.heldTerminal = event;
    this.armTurnWatchdog(event.runtimeSessionId);
    return true;
  }

  private releaseHeldTerminal(runtimeSessionId: string): void {
    const session = this.sessions.get(runtimeSessionId);
    const held = session?.heldTerminal;
    if (!session || !held) return;
    if (this.sessionHasPendingPermission(runtimeSessionId)) return;
    session.heldTerminal = undefined;
    this.emit(held);
  }

  private enrichUsageEvent(event: AgentEvent): AgentEvent {
    if (event.type !== "usage_updated") return event;
    const live = this.sessions.get(event.runtimeSessionId);
    const snap = live?.handle.getUsageSnapshot?.({
      occupancy: typeof event.inputTokens === "number" ? event.inputTokens : null,
      includeBreakdown: false,
    });
    if (!snap) return event;
    return {
      ...event,
      ...(snap.occupancyTokens != null ? { inputTokens: snap.occupancyTokens } : {}),
      ...(snap.windowSize != null ? { windowSize: snap.windowSize } : {}),
      costUsd: snap.costUsd,
    };
  }

  private emitSessionUsageSnapshot(
    runtimeSessionId: RuntimeSessionId,
    tabId: string,
    turnId: string,
    extra?: { occupancyReset?: boolean; preserveCost?: boolean },
  ): void {
    const live = this.sessions.get(runtimeSessionId);
    const prevCost = extra?.preserveCost
      ? (this.opts.store.getSession(runtimeSessionId)?.usageTotals?.costUsd ?? 0)
      : undefined;
    const snap = live?.handle.getUsageSnapshot?.({
      includeBreakdown: true,
      ...(prevCost != null ? { previousCostUsd: prevCost } : {}),
    });
    if (!snap) return;
    const occupancy = extra?.occupancyReset ? null : snap.occupancyTokens;
    this.opts.store.setUsageTotals(runtimeSessionId, {
      ...snap,
      occupancyTokens: occupancy,
    });
    const event: AgentEvent = {
      type: "usage_updated",
      runtimeSessionId,
      tabId,
      turnId,
      ...(occupancy != null ? { inputTokens: occupancy } : {}),
      outputTokens: snap.output,
      cacheReadTokens: snap.cacheRead,
      cacheWriteTokens: snap.cacheWrite,
      costUsd: snap.costUsd,
      ...(snap.windowSize != null ? { windowSize: snap.windowSize } : {}),
      ...(!extra?.occupancyReset && snap.breakdown ? { breakdown: snap.breakdown } : {}),
      ...(extra?.occupancyReset ? { occupancyReset: true } : {}),
    };
    for (const listener of this.listeners) listener(event);
  }

  /** Public poke so a child subagent stream can keep the parent turn alive. */
  touchTurnWatchdog(runtimeSessionId: string): void {
    this.armTurnWatchdog(runtimeSessionId);
  }

  isTurnLive(runtimeSessionId: string, turnId?: string): boolean {
    const session = this.sessions.get(runtimeSessionId);
    if (session?.activeTurn) {
      if (turnId && session.activeTurn.turnId !== turnId) return false;
      return true;
    }
    return this.sessionHasPendingPermission(runtimeSessionId);
  }

  cancelPendingPermissions(runtimeSessionId: string): number {
    return this.opts.gate.cancelSession(runtimeSessionId);
  }

  /** Reset the idle watchdog for a session whenever a turn event arrives. */
  private armTurnWatchdog(runtimeSessionId: string): void {
    const session = this.sessions.get(runtimeSessionId);
    if (!session || !session.activeTurn) return;
    if (session.watchdog) clearTimeout(session.watchdog);
    session.watchdog = setTimeout(() => {
      const live = this.sessions.get(runtimeSessionId);
      if (!live || !live.activeTurn || live.cancelled) return;
      if (live.activeTurn.turnId !== live.turnId) return;
      // Waiting on Allow/Deny is not a stalled model. Re-arm instead of failing.
      if (this.sessionHasPendingPermission(runtimeSessionId)) {
        this.armTurnWatchdog(runtimeSessionId);
        return;
      }
      piRuntimeLog.warn("turn.idle_timeout", {
        runtimeSessionId: live.runtimeSessionId,
        turnId: live.activeTurn.turnId,
      });
      this.emit({
        type: "turn_failed",
        runtimeSessionId: live.runtimeSessionId,
        tabId: live.tabId,
        turnId: live.activeTurn.turnId,
        error: "turn_idle_timeout",
      });
      void live.handle.abort().catch(() => {});
    }, PI_TURN_IDLE_TIMEOUT_MS);
  }

  private persistActiveTurn(
    session: LivePiSession,
    status: AgentTurnRecord["status"],
    error?: string,
  ): void {
    const turn = session.activeTurn;
    if (!turn) return;
    const blocks = sealTurnBlockTimings(turn.assistantBlocks);
    const flatten = deriveFlattenedAssistant(blocks);
    const toolCalls = flatten.toolCalls.map((snapshot) => {
      const live = turn.toolCalls.get(snapshot.toolCallId);
      if (!live) return snapshot;
      return {
        ...snapshot,
        startedAt: live.startedAt || snapshot.startedAt,
        ...(live.finishedAt !== undefined ? { finishedAt: live.finishedAt } : {}),
        ...(live.result !== undefined ? { result: live.result } : {}),
        ...(live.error !== undefined ? { error: live.error } : {}),
        ...(live.denied !== undefined ? { denied: live.denied } : {}),
      };
    });
    const prevCost = this.opts.store.getSession(session.runtimeSessionId)?.usageTotals?.costUsd ?? 0;
    const snap = session.handle.getUsageSnapshot?.({
      occupancy: turn.usage?.inputTokens ?? null,
      includeBreakdown: true,
    });
    const occupancy = snap?.occupancyTokens ?? turn.usage?.inputTokens;
    const turnCost = snap ? Math.max(0, snap.costUsd - prevCost) : undefined;
    const usage = turn.usage || snap
      ? {
          ...(turn.usage ?? {}),
          ...(occupancy != null ? { inputTokens: occupancy } : {}),
          ...(turnCost != null ? { costUsd: turnCost } : {}),
        }
      : undefined;
    const record: AgentTurnRecord = {
      turnIndex: turn.turnIndex,
      turnId: turn.turnId,
      createdAt: turn.createdAt,
      finishedAt: Date.now(),
      user: {
        text: turn.userText,
        ...(turn.userAttachments?.length ? { attachments: turn.userAttachments } : {}),
      },
      assistant: {
        text: flatten.text || turn.assistantText,
        ...(flatten.thinking || turn.assistantThinking
          ? { thinking: flatten.thinking || turn.assistantThinking }
          : {}),
        toolCalls: toolCalls.length ? toolCalls : Array.from(turn.toolCalls.values()),
        ...(blocks.length ? { blocks } : {}),
      },
      ...(usage && Object.keys(usage).length ? { usage } : {}),
      status,
      ...(error ? { error } : {}),
    };
    this.opts.store.appendTurn(session.runtimeSessionId, record);
    if (snap) {
      this.opts.store.setUsageTotals(session.runtimeSessionId, snap);
    }
    session.activeTurn = null;
  }

  private processTurnAccumulation(event: AgentEvent): void {
    const session = this.sessions.get(event.runtimeSessionId);
    if (!session || !session.activeTurn) return;
    const turn = session.activeTurn;
    if (turn.turnId !== event.turnId) return;

    // Child-session events are tagged and must not land on the parent turn.
    if (event.subagent) return;

    // Terminal events end the turn — clear the idle watchdog.
    if (
      event.type === "turn_finished"
      || event.type === "turn_failed"
      || event.type === "turn_cancelled"
    ) {
      if (session.watchdog) {
        clearTimeout(session.watchdog);
        session.watchdog = undefined;
      }
    }

    switch (event.type) {
      case "text_delta":
        turn.assistantText += event.text;
        turn.assistantBlocks = applyAssistantEventToBlocks(turn.assistantBlocks, event);
        break;
      case "thinking_delta":
        turn.assistantThinking += event.text;
        turn.assistantBlocks = applyAssistantEventToBlocks(turn.assistantBlocks, event);
        break;
      case "tool_started":
        turn.toolCalls.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          startedAt: Date.now(),
        });
        turn.assistantBlocks = applyAssistantEventToBlocks(turn.assistantBlocks, event);
        break;
      case "tool_progress":
        turn.assistantBlocks = applyAssistantEventToBlocks(turn.assistantBlocks, event);
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
        turn.assistantBlocks = applyAssistantEventToBlocks(turn.assistantBlocks, event);
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
      case "turn_finished":
        this.persistActiveTurn(session, "completed");
        break;
      case "turn_failed":
        piRuntimeLog.warn("turn.fail", {
          runtimeSessionId: session.runtimeSessionId,
          turnId: event.turnId,
          error: shortLogDetail(event.error),
        });
        this.persistActiveTurn(session, "failed", event.error);
        break;
      case "turn_cancelled":
        this.persistActiveTurn(session, "cancelled");
        break;
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
      cancelled: false,
    });
    const modelRef = handle.getModelRef?.() ?? undefined;
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
      ...(modelRef ? { modelRef } : {}),
    });
    if (persist.mode !== "open") {
      piRuntimeLog.info("session.create", {
        conversationId,
        runtimeSessionId,
        persist: persist.mode,
      });
    }
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

    // Abort leftover Pi work even when our activeTurn is already null (a
    // dropped provider stream can reject prompt() without aborting the agent).
    await session.handle.abort().catch(() => {});
    session.cancelled = false;

    const existingRecord = this.opts.store.getSession(session.runtimeSessionId);
    const turnIndex = existingRecord?.turns.length ?? 0;
    session.turnId = input.turnId || newTurnId();
    session.activeTurn = {
      turnIndex,
      turnId: session.turnId,
      createdAt: Date.now(),
      userText: input.text,
      ...(input.attachments?.length ? { userAttachments: input.attachments } : {}),
      assistantText: "",
      assistantThinking: "",
      assistantBlocks: [],
      toolCalls: new Map(),
    };
    // Initial idle watchdog — the first Pi event (or the terminal event) re-arms it.
    this.armTurnWatchdog(session.runtimeSessionId);

    session.handle.setTurnContext?.({
      runtimeSessionId: session.runtimeSessionId,
      tabId: session.tabId,
      turnId: session.turnId,
      projectRoot: session.projectRoot,
      permissionMode: input.permissionMode,
      sessionAgent: input.sessionAgent,
      allowedPaths: input.allowedPaths,
    });
    const turnIdAtPrompt = session.turnId;
    try {
      await this.applyTurnModel(session, input);
      await session.handle.prompt(
        input.text,
        input.images?.map((img) => ({
          mimeType: img.mimeType,
          data: img.data,
        })),
      );
    } catch (err) {
      const live = this.sessions.get(session.runtimeSessionId);
      // Watchdog / cancel already committed the turn — abort() then throws
      // "terminated" and must not overwrite that with a second turn_failed.
      if (
        !live
        || live.cancelled
        || !live.activeTurn
        || live.activeTurn.turnId !== turnIdAtPrompt
      ) {
        return;
      }
      // Provider drop ("Connection error") can reject prompt() while Pi still
      // thinks a turn is in flight. Abort so the next send is not
      // "Agent is already processing".
      await live.handle.abort().catch(() => {});
      const afterAbort = this.sessions.get(session.runtimeSessionId);
      if (
        !afterAbort
        || afterAbort.cancelled
        || !afterAbort.activeTurn
        || afterAbort.activeTurn.turnId !== turnIdAtPrompt
      ) {
        return;
      }
      piRuntimeLog.warn("turn.fail", {
        runtimeSessionId: session.runtimeSessionId,
        turnId: turnIdAtPrompt,
        error: shortLogDetail(err),
      });
      this.emit({
        type: "turn_failed",
        runtimeSessionId: session.runtimeSessionId,
        tabId: session.tabId,
        turnId: turnIdAtPrompt,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    // Pi may deliver terminal events (message_end / agent_end) asynchronously
    // after prompt() resolves. Wait briefly before closing the live turn, so
    // the terminal event's usage accumulation is not lost.
    setTimeout(() => {
      const live = this.sessions.get(session.runtimeSessionId);
      if (!live) return;
      const active = live.activeTurn;
      // Only fail the turn we actually prompted — if a new turn already started
      // within the window, its activeTurn belongs to that newer turn.
      if (active && active.turnId === turnIdAtPrompt && !live.cancelled) {
        if (this.sessionHasPendingPermission(session.runtimeSessionId)) return;
        piRuntimeLog.warn("turn.fail", {
          runtimeSessionId: session.runtimeSessionId,
          turnId: turnIdAtPrompt,
          error: "engine_ended_without_terminal_event",
        });
        this.emit({
          type: "turn_failed",
          runtimeSessionId: session.runtimeSessionId,
          tabId: session.tabId,
          turnId: turnIdAtPrompt,
          error: "engine_ended_without_terminal_event",
        });
      }
    }, 500);
  }

  private async applyTurnModel(session: LivePiSession, input: TurnInput): Promise<void> {
    const provider = input.provider?.trim();
    const modelId = input.modelId?.trim();
    if (!provider || !modelId || !session.handle.setModel) return;
    const current = session.handle.getModelRef?.();
    if (current?.provider === provider && current.modelId === modelId) return;
    await session.handle.setModel({
      provider,
      modelId,
      apiKey: input.apiKey,
    });
    piRuntimeLog.info("session.set_model", {
      runtimeSessionId: session.runtimeSessionId,
      from: current ? `${current.provider}/${current.modelId}` : undefined,
      to: `${provider}/${modelId}`,
    });
    const next = session.handle.getModelRef?.() ?? { provider, modelId };
    this.opts.store.setModelRef(session.runtimeSessionId, next);
    this.emitSessionUsageSnapshot(session.runtimeSessionId, session.tabId, session.turnId, {
      preserveCost: true,
    });
  }

  async compact(runtimeSessionId: RuntimeSessionId): Promise<AgentCompactResult> {
    const session = this.sessions.get(runtimeSessionId);
    if (!session) {
      piRuntimeLog.warn("session.compact", { runtimeSessionId, ok: false, error: "session_not_live" });
      return { ok: false, error: "session_not_live" };
    }
    if (!session.handle.compact) {
      piRuntimeLog.warn("session.compact", { runtimeSessionId, ok: false, error: "compact_unavailable" });
      return { ok: false, error: "compact_unavailable" };
    }
    try {
      const result = await session.handle.compact();
      this.emitSessionUsageSnapshot(runtimeSessionId, session.tabId, session.turnId, {
        occupancyReset: true,
      });
      piRuntimeLog.info("session.compact", {
        runtimeSessionId,
        ok: true,
        tokensBefore: result.tokensBefore,
      });
      return {
        ok: true,
        summary: result.summary,
        tokensBefore: result.tokensBefore,
      };
    } catch (err) {
      piRuntimeLog.warn("session.compact", {
        runtimeSessionId,
        ok: false,
        error: shortLogDetail(err),
      });
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async truncate(
    runtimeSessionId: RuntimeSessionId,
    keepThroughTurnIndex: number,
  ): Promise<AgentTruncateEngineResult> {
    const session = this.sessions.get(runtimeSessionId);
    if (!session) return { ok: false, error: "unknown_session" };
    if (!session.handle.truncateToKeepTurns) return { ok: false, error: "truncate_unavailable" };
    try {
      return await session.handle.truncateToKeepTurns(keepThroughTurnIndex);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async restoreLeaf(
    runtimeSessionId: RuntimeSessionId,
    leafId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const session = this.sessions.get(runtimeSessionId);
    if (!session) return { ok: false, error: "unknown_session" };
    if (!session.handle.restoreLeaf) return { ok: false, error: "restore_unavailable" };
    try {
      return await session.handle.restoreLeaf(leafId);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async cancelTurn(runtimeSessionId: RuntimeSessionId): Promise<void> {
    const session = this.sessions.get(runtimeSessionId);
    if (!session) return;
    session.cancelled = true;
    session.heldTerminal = undefined;
    this.opts.gate.cancelSession(runtimeSessionId);
    await session.handle.abort();
    piRuntimeLog.debug("turn.cancelled", {
      runtimeSessionId: session.runtimeSessionId,
      turnId: session.turnId,
    });
    this.emit({
      type: "turn_cancelled",
      runtimeSessionId: session.runtimeSessionId,
      tabId: session.tabId,
      turnId: session.turnId,
    });
  }

  attachCustomTools(runtimeSessionId: RuntimeSessionId, tools: ToolDefinition[]): number {
    const session = this.sessions.get(runtimeSessionId);
    if (!session) return 0;
    return session.handle.attachCustomTools?.(tools) ?? 0;
  }

  async disposeSession(runtimeSessionId: RuntimeSessionId): Promise<void> {
    const session = this.sessions.get(runtimeSessionId);
    if (!session) return;
    const conversationId = this.opts.store.getSession(runtimeSessionId)?.conversationId;
    piRuntimeLog.info("session.dispose", {
      runtimeSessionId,
      conversationId,
    });
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
