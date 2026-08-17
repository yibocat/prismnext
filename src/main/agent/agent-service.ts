/**
 * Pi conversation host. New Agent send/cancel go through RuntimeRegistry.
 * `ipc/chat.ts` / AcpService stay only for old OpenCode history.
 */

import { join } from "node:path";
import type { WebContents } from "electron";
import type { AgentEvent } from "../../shared/agent-runtime";
import type { PermissionMode } from "../../shared/session-agent";
import {
  type AgentAuthInput,
  type AgentAuthResult,
  type AgentLoadSessionInput,
  type AgentLoadSessionResult,
  type AgentRenameSessionInput,
  type AgentSendInput,
  type AgentSendResult,
  type AgentSessionSummary,
  type AgentStatus,
} from "../../shared/agent-api";
import { hydrateSessionRecordToConversation } from "./session-hydrator";
import { isOpenCodeCatalogProvider } from "../../shared/opencode-provider";
import { PermissionGate, type PermissionGateRequest } from "./permission-gate";
import { ToolHost } from "./tool-host";
import { resolvePiAgentRoot, resolvePiRuntimeSessionDir } from "./session-store";
import { RuntimeRegistry, type StartRuntimeInput } from "./runtime-registry";
import { createRepresentativeTools, type ExperimentRunFn } from "./representative-tools";
import { ALL_NATIVE_TOOLS, type NativeToolDefinition } from "./tools/index";
import {
  resolveTeamPiBinding,
  type ResolvedPiLeadConfig,
  type ResolvedPiRosterEntry,
  type TeamPiBindingInput,
  type TeamPiBindingResult,
} from "./team-binding";
import {
  createTaskDelegationTool,
  PiSubsessionRuntime,
} from "./pi-subsession-runtime";
import {
  PI_SDK_PACKAGE,
  PI_SDK_PINNED_VERSION,
  PiSdkRuntime,
  createPiSdkSessionFactory,
  probePiEmbedCompatibility,
} from "./pi-sdk-runtime";
import type { ExperimentCtxResult } from "../services/experiment-log-service";
import type { KickoffExperimentRunArgs } from "../services/experiment-run-executor";
import { parseExperimentRunKind } from "../../shared/experiment-log";

const AGENT_TOOLS = ALL_NATIVE_TOOLS.map((t) => t.name);
const AGENT_FALLBACK_CONVERSATION_ID = "agent";

/** Pi uses this sentence when ResourceLoader.getSystemPrompt() is empty. */
export const PI_DEFAULT_CODING_IDENTITY =
  "You are an expert coding assistant operating inside pi";

export const HOST_SYSTEM_IDENTITY = [
  "You are the PrismNext research collaborator for this project.",
  "Do not claim to be Claude, GPT, Gemini, DeepSeek, or any other vendor model.",
  "Use only the tools this host registered.",
  "Prefer literature-search for local papers, literature-discover for catalogs,",
  "research-brief-update for the project brief, and experiment-run for island commands.",
].join(" ");

export function resolveAgentAuth(input: AgentAuthInput): AgentAuthResult {
  const provider = (input.provider ?? input.settings.aiProvider ?? "").trim();
  const modelId = (input.modelId ?? input.settings.aiModel ?? "").trim();
  const apiKey = (
    input.apiKey
    ?? input.settings.aiApiKeys?.[provider]
    ?? ""
  ).trim();

  if (!provider) return { ok: false, reason: "missing_pi_provider" };
  if (isOpenCodeCatalogProvider(provider) || provider === "opencode") {
    return { ok: false, reason: `unsupported_pi_provider:${provider}` };
  }
  if (!modelId) return { ok: false, reason: "missing_pi_model" };
  if (!apiKey) return { ok: false, reason: "missing_pi_api_key" };

  return {
    ok: true,
    provider,
    modelId,
    apiKey,
  };
}

export function buildAgentSystemPrompt(input: {
  stableSystem: string;
  agentsMd?: string;
  leadInstructions?: string;
  leadName?: string;
}): string {
  const leadSection = input.leadInstructions?.trim()
    ? `## Active Team Lead: ${input.leadName || "Lead"}\n\n${input.leadInstructions.trim()}`
    : "";
  return [
    HOST_SYSTEM_IDENTITY,
    input.stableSystem.trim(),
    input.agentsMd?.trim(),
    leadSection,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildAgentUserText(input: {
  text: string;
  projectRules?: string;
}): string {
  const rules = input.projectRules?.trim();
  const text = input.text.trim();
  return rules ? `${rules}\n\n${text}` : text;
}

export function createAgentExperimentRunner(deps: {
  resolveCtx: (projectRoot: string) => ExperimentCtxResult;
  isCtxError: (ctx: ExperimentCtxResult) => boolean;
  kickoff: (args: KickoffExperimentRunArgs) => Promise<{ runId: string; executionId: string } | undefined>;
}): ExperimentRunFn {
  return async (input) => {
    const ctx = deps.resolveCtx(input.projectRoot);
    if (deps.isCtxError(ctx)) {
      const err = ctx as Extract<ExperimentCtxResult, { ok: false }>;
      return { ok: false, error: err.error, hint: err.hint };
    }
    const started = await deps.kickoff({
      ctx: ctx as Exclude<ExperimentCtxResult, { ok: false }>,
      id: input.experimentId,
      command: input.command,
      artifacts: input.artifacts,
      notes: input.notes,
      kind: parseExperimentRunKind(input.kind),
      interpreter: input.interpreter === "external" ? "external" : undefined,
      pythonPath: input.pythonPath,
      chatSessionId: input.toolCallId,
    });
    if (!started) {
      return { ok: false, error: "experiment_not_found" };
    }
    return {
      ok: true,
      started: true,
      runId: started.runId,
      executionId: started.executionId,
    };
  };
}

export function createAgentNativeTools(deps?: {
  runExperiment?: ExperimentRunFn;
}): NativeToolDefinition[] {
  if (!deps?.runExperiment) {
    return [...ALL_NATIVE_TOOLS];
  }
  const customRun = deps.runExperiment;
  return ALL_NATIVE_TOOLS.map((tool) => {
    if (tool.name === "experiment-run") {
      return {
        ...tool,
        execute: async (args, ctx) => {
          const id = typeof args.id === "string" ? args.id.trim() : "";
          const command = typeof args.command === "string" ? args.command : "";
          if (!id || !command) return { ok: false, error: "missing_id_or_command" };
          return customRun({
            experimentId: id,
            command,
            toolCallId: ctx.toolCallId,
            projectRoot: ctx.projectRoot,
            abortSignal: ctx.abortSignal,
            artifacts: Array.isArray(args.artifacts)
              ? args.artifacts.filter((item): item is string => typeof item === "string")
              : undefined,
            notes: typeof args.notes === "string" ? args.notes : undefined,
            kind: typeof args.kind === "string" ? args.kind : undefined,
            interpreter: typeof args.interpreter === "string" ? args.interpreter : undefined,
            pythonPath: typeof args.pythonPath === "string" ? args.pythonPath : undefined,
          });
        },
      };
    }
    return tool;
  });
}

function permissionModeFromSettings(settings: Record<string, unknown>): PermissionMode {
  const raw = settings.permissionMode;
  if (raw === "ask" || raw === "edit_auto" || raw === "auto" || raw === "readonly") {
    return raw;
  }
  return "edit_auto";
}

export interface AgentServiceDeps {
  userDataDir: string;
  getSettings: () => Record<string, unknown>;
  composeStableSystem: (projectRoot: string) => Promise<string>;
  composeProjectRules: (projectRoot: string) => Promise<string>;
  composeAgentsMd: (projectRoot: string) => Promise<string>;
  resolveTeamBinding?: (input: TeamPiBindingInput) => TeamPiBindingResult;
  registry?: RuntimeRegistry;
}

export class AgentService {
  private runtime: PiSdkRuntime | null = null;
  private gate: PermissionGate | null = null;
  private sessionId: string | null = null;
  private projectRoot: string | null = null;
  private readonly sending = new Set<string>();
  private sink: ((event: AgentEvent) => void) | null = null;
  private permissionSink: ((request: PermissionGateRequest) => void) | null = null;
  private owner: WebContents | null = null;
  private activeTabId: string = AGENT_FALLBACK_CONVERSATION_ID;
  private activeConversationId: string | null = null;
  private readonly registry: RuntimeRegistry;
  private startContext: {
    provider: string;
    modelId: string;
    apiKey: string;
    permissionMode: PermissionMode;
    lead?: ResolvedPiLeadConfig;
    roster?: ResolvedPiRosterEntry[];
  } | null = null;

  constructor(private readonly deps: AgentServiceDeps) {
    this.registry = deps.registry ?? new RuntimeRegistry({
      userDataDir: deps.userDataDir,
      startRuntime: (input) => this.startRuntime(input),
    });
  }

  status(projectRoot?: string | null, sessionTeamId?: string | null): AgentStatus {
    const settings = this.deps.getSettings();
    const auth = resolveAgentAuth({ settings: settings as AgentAuthInput["settings"] });
    const probe = probePiEmbedCompatibility({
      hostNode: process.versions.node,
      electronNode: process.versions.node,
      electronVersion: process.versions.electron ?? "unknown",
    });
    const root = projectRoot?.trim() || this.projectRoot;

    let teamBinding: TeamPiBindingResult | undefined;
    if (root) {
      const resolverFn = this.deps.resolveTeamBinding ?? resolveTeamPiBinding;
      try {
        teamBinding = resolverFn({ projectRoot: root, sessionTeamId });
      } catch {
        // non-fatal in status probing
      }
    }

    const ready = Boolean(
      probe.canEmbedInElectronMain
      && auth.ok
      && root
      && (!teamBinding || teamBinding.ok),
    );
    let reason: string | undefined;
    if (!probe.canEmbedInElectronMain) reason = "electron_node_incompatible";
    else if (!root) reason = "missing_project";
    else if (!auth.ok) reason = auth.reason;
    else if (teamBinding && !teamBinding.ok) reason = teamBinding.error;

    return {
      ready,
      reason,
      sdk: `${PI_SDK_PACKAGE}@${PI_SDK_PINNED_VERSION}`,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron ?? "unknown",
      canEmbed: probe.canEmbedInElectronMain,
      provider: auth.ok ? auth.provider : (settings.aiProvider as string | undefined),
      modelId: auth.ok ? auth.modelId : (typeof settings.aiModel === "string" ? settings.aiModel : undefined),
      hasApiKey: auth.ok,
      projectRoot: root ?? null,
      sessionId: this.sessionId,
      teamId: teamBinding?.lead?.teamId,
      leadName: teamBinding?.lead?.name,
      leadFqid: teamBinding?.lead?.fqid,
      roster: teamBinding?.roster?.map((r) => ({
        fqid: r.fqid,
        name: r.name,
        available: r.available,
        unavailableReason: r.unavailableReason,
      })),
      tools: [...AGENT_TOOLS],
      permissionMode: permissionModeFromSettings(settings),
    };
  }

  async send(input: AgentSendInput): Promise<AgentSendResult> {
    const projectRoot = input.projectRoot.trim();
    if (!projectRoot) return { ok: false, error: "missing_project" };
    const conversationId = (
      input.conversationId?.trim()
      || input.tabId?.trim()
      || AGENT_FALLBACK_CONVERSATION_ID
    );
    if (this.sending.has(conversationId)) return { ok: false, error: "lab_busy" };

    const resolverFn = this.deps.resolveTeamBinding ?? resolveTeamPiBinding;
    let teamBinding: TeamPiBindingResult | undefined;
    try {
      teamBinding = resolverFn({
        projectRoot,
        sessionTeamId: input.sessionTeamId,
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (teamBinding && !teamBinding.ok) {
      return { ok: false, error: teamBinding.error || "team_resolution_failed" };
    }

    const settings = this.deps.getSettings();
    const effectiveProvider = input.provider ?? teamBinding?.lead?.modelRef?.provider;
    const effectiveModelId = input.modelId ?? teamBinding?.lead?.modelRef?.modelId;

    const auth = resolveAgentAuth({
      provider: effectiveProvider,
      modelId: effectiveModelId,
      apiKey: input.apiKey,
      settings: settings as AgentAuthInput["settings"],
    });
    if (!auth.ok) return { ok: false, error: auth.reason };

    const text = input.text.trim();
    if (!text) return { ok: false, error: "missing_prompt" };

    this.sending.add(conversationId);
    this.activeTabId = conversationId;
    try {
      this.startContext = {
        provider: auth.provider,
        modelId: auth.modelId,
        apiKey: auth.apiKey,
        permissionMode: input.permissionMode ?? permissionModeFromSettings(settings),
        lead: teamBinding?.lead,
        roster: teamBinding?.availableRoster,
      };
      let binding = this.registry.getBinding(conversationId);
      if (!binding) {
        const existing = this.registry.store.getByConversationId(conversationId);
        binding = existing
          ? await this.registry.openConversation({
              conversationId,
              tabId: this.activeTabId,
              projectRoot,
            })
          : await this.registry.createConversation({
              conversationId,
              tabId: this.activeTabId,
              projectRoot,
            });
      }
      this.updateDefaultTitle(conversationId, text);

      this.sessionId = binding.runtimeSessionId ?? null;
      this.projectRoot = projectRoot;
      this.activeConversationId = conversationId;
      this.runtime = this.registry.getRuntime(conversationId) as PiSdkRuntime | null;
      if (!this.sessionId) {
        return { ok: false, error: "lab_session_missing" };
      }

      const userText = buildAgentUserText({
        text,
        projectRules: await this.deps.composeProjectRules(projectRoot),
      });
      await this.registry.sendTurn({
        conversationId,
        tabId: this.activeTabId,
        turnId: input.turnId,
        text: userText,
        permissionMode: input.permissionMode ?? permissionModeFromSettings(settings),
      });
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.sink?.({
        type: "turn_failed",
        runtimeSessionId: this.sessionId ?? "none",
        tabId: this.activeTabId,
        turnId: input.turnId || "agent",
        error,
      });
      return { ok: false, error };
    } finally {
      this.sending.delete(conversationId);
    }
  }

  async cancel(tabId?: string): Promise<void> {
    const conversationId = tabId?.trim() || this.activeConversationId;
    if (conversationId) {
      await this.registry.cancelTurn(conversationId);
      return;
    }
    if (!this.runtime || !this.sessionId) return;
    await this.runtime.cancelTurn(this.sessionId);
  }

  async reset(tabId?: string): Promise<void> {
    await this.resetSession(tabId?.trim() || undefined);
  }

  resolvePermission(requestId: string, decision: "allow" | "deny"): boolean {
    return this.gate?.resolve(requestId, decision) ?? false;
  }

  listSessions(projectRoot: string): AgentSessionSummary[] {
    const root = projectRoot.trim();
    if (!root) return [];
    return this.registry.store.listSessionsByProject(root).map((record) => ({
      conversationId: record.conversationId || record.runtimeSessionId,
      title: record.title,
      updatedAt: Date.parse(record.updatedAt) || 0,
      createdAt: Date.parse(record.createdAt) || 0,
      directory: record.boundCheckoutPath,
    }));
  }

  loadSession(input: AgentLoadSessionInput): AgentLoadSessionResult {
    const conversationId = input.conversationId.trim();
    const projectRoot = input.projectRoot.trim();
    if (!conversationId) return { ok: false, error: "missing_conversation" };
    if (!projectRoot) return { ok: false, error: "missing_project" };
    const record = this.registry.store.getByConversationId(conversationId);
    if (!record) return { ok: false, error: "unknown_conversation" };
    const recordProject = record.projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const want = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    if (recordProject !== want) return { ok: false, error: "conversation_project_mismatch" };
    return {
      ok: true,
      conversationId: record.conversationId || record.runtimeSessionId,
      title: record.title,
      conversation: hydrateSessionRecordToConversation(record),
      directory: record.boundCheckoutPath,
    };
  }

  renameSession(input: AgentRenameSessionInput): { ok: boolean } {
    const conversationId = input.conversationId.trim();
    const title = input.title.trim();
    if (!conversationId || !title) return { ok: false };
    const record = this.registry.store.getByConversationId(conversationId);
    if (!record) return { ok: true };
    this.registry.store.put({ ...record, title });
    return { ok: true };
  }

  attachOwner(contents: WebContents): void {
    this.owner = contents;
    this.sink = (event) => {
      if (this.owner && !this.owner.isDestroyed()) {
        this.owner.send("agent:event", event);
      }
    };
    this.permissionSink = (request) => {
      if (this.owner && !this.owner.isDestroyed()) {
        this.owner.send("agent:permission", request);
      }
    };
  }

  detachOwner(contents?: WebContents): void {
    if (contents && this.owner !== contents) return;
    this.owner = null;
    this.sink = null;
    this.permissionSink = null;
  }

  isOwnedBy(contents: WebContents): boolean {
    return this.owner === contents;
  }

  /** Test helper: send through the current owner sink without starting a Pi turn. */
  dispatchEvent(event: AgentEvent): void {
    this.sink?.(event);
  }

  /** Test helper: send a permission prompt through the current owner sink. */
  dispatchPermission(request: PermissionGateRequest): void {
    this.permissionSink?.(request);
  }

  private async startRuntime(input: StartRuntimeInput) {
    const ctx = this.startContext;
    if (!ctx) throw new Error("lab_start_context_missing");
    const agentRoot = resolvePiAgentRoot(this.deps.userDataDir);
    const store = this.registry.store;
    const gate = new PermissionGate({
      timeoutMs: 120_000,
      onPrompt: (request) => {
        this.sink?.({
          type: "permission_requested",
          runtimeSessionId: request.runtimeSessionId,
          tabId: request.tabId,
          turnId: request.turnId,
          requestId: request.requestId,
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          args: request.args,
        });
        this.permissionSink?.(request);
      },
    });
    const toolHost = new ToolHost({
      gate,
      onEvent: (event) => this.sink?.(event),
    });
    toolHost.registerAll(createAgentNativeTools());

    if (ctx.roster && ctx.roster.length > 0) {
      const subsessionRuntime = new PiSubsessionRuntime({
        allTools: ALL_NATIVE_TOOLS,
        gate,
        onEvent: (event) => this.sink?.(event),
      });
      const taskTool = createTaskDelegationTool({
        subsessionRuntime,
        roster: ctx.roster,
      });
      toolHost.register(taskTool);
    }

    const systemPrompt = buildAgentSystemPrompt({
      stableSystem: await this.deps.composeStableSystem(input.projectRoot),
      agentsMd: await this.deps.composeAgentsMd(input.projectRoot),
      leadInstructions: ctx.lead?.instructions,
      leadName: ctx.lead?.name,
    });
    const runtime = new PiSdkRuntime({
      createPiSession: createPiSdkSessionFactory({
        providerId: ctx.provider,
        modelId: ctx.modelId,
        apiKey: ctx.apiKey,
        systemPrompt,
        toolHost,
      }),
      store,
      toolHost,
      gate,
      agentDir: join(agentRoot, "lab-runtime"),
      persistSessions: true,
      piSessionDir: resolvePiRuntimeSessionDir(this.deps.userDataDir),
    });
    runtime.subscribe((event) => this.sink?.(event));

    const created = await runtime.createSession({
      tabId: input.tabId,
      projectRoot: input.projectRoot,
      conversationId: input.conversationId,
      piSessionFile: input.piSessionFile,
      permissionMode: ctx.permissionMode,
      sessionAgent: "build",
    });
    this.gate = gate;
    return {
      runtime,
      runtimeSessionId: created.runtimeSessionId,
      piSessionFile: created.piSessionFile,
    };
  }

  private updateDefaultTitle(conversationId: string, text: string): void {
    const title = text.trim().slice(0, 80);
    if (!title) return;
    const record = this.registry.store.getByConversationId(conversationId);
    if (!record || (record.title && record.title !== "New Chat")) return;
    this.registry.store.put({ ...record, title });
  }

  private async resetSession(conversationId?: string): Promise<void> {
    const ids = conversationId
      ? [conversationId]
      : this.registry.liveConversationIds();
    for (const id of ids) {
      this.sending.delete(id);
      await this.registry.disposeConversation(id).catch(() => {});
    }
    if (!conversationId || conversationId === this.activeConversationId) {
      this.runtime = null;
      this.gate = null;
      this.sessionId = null;
      this.projectRoot = null;
      this.activeConversationId = null;
      this.startContext = null;
    }
  }
}

let singleton: AgentService | null = null;

export function createAgentService(deps: AgentServiceDeps): AgentService {
  return new AgentService(deps);
}

export async function getAgentService(): Promise<AgentService> {
  if (singleton) return singleton;
  const { app } = await import("electron");
  const { getSettings } = await import("../services/settings");
  const { promptManager } = await import("../prompts");
  const { buildPromptContext } = await import("../prompts/context");

  singleton = createAgentService({
    userDataDir: app.getPath("userData"),
    getSettings: () => getSettings() as Record<string, unknown>,
    composeStableSystem: async (projectRoot) => {
      const ctx = await buildPromptContext(projectRoot);
      return promptManager.composeStableSystem(ctx);
    },
    composeProjectRules: async (projectRoot) => {
      const ctx = await buildPromptContext(projectRoot);
      return promptManager.composeProjectRules(ctx);
    },
    composeAgentsMd: async (projectRoot) => {
      const ctx = await buildPromptContext(projectRoot);
      return ctx.agentsMdContent ?? "";
    },
  });
  return singleton;
}

export async function disposeAgentService(): Promise<void> {
  const current = singleton;
  singleton = null;
  await current?.reset();
}
