/**
 * Pi conversation host. Product send/cancel/history go through RuntimeRegistry.
 */

import { join } from "node:path";
import type { AgentEvent } from "../../shared/agent/runtime";
import type { AgentEventSink } from "../../shared/remote";
import { GATEWAY_PLACEHOLDER_KEY } from "../../shared/remote";
import { createElectronSink, type ElectronSinkTarget } from "../remote/event-sink";
import type { PermissionMode, SessionAgent } from "../../shared/agent/session-agent";
import { isProvisionalSessionTitle } from "../../shared/agent/session-title";
import { buildPlanModeTurnAppendix } from "../prompts/per-turn/plan-mode";
import {
  assembleAgentSystemPrompt,
  HOST_SYSTEM_IDENTITY,
} from "../prompts/system-assemble";
import {
  type AgentAnswerQuestionInput,
  type AgentAuthInput,
  type AgentAuthResult,
  type AgentCompactInput,
  type AgentCompactResult,
  type AgentDeleteSessionInput,
  type AgentDescribeImagesInput,
  type AgentDescribeImagesResult,
  type AgentLoadSessionInput,
  type AgentLoadSessionResult,
  type AgentPlanArtifactInput,
  type AgentPlanDecisionInput,
  type AgentPlanEvent,
  type AgentReassignDirectoryInput,
  type AgentReassignDirectoryResult,
  type AgentSyncIntensiveReadingInput,
  type AgentTruncateInput,
  type AgentTruncateResult,
  type AgentTurnMetaInput,
  type AgentUndoTruncateInput,
  type AgentUndoTruncateResult,
  type AgentRenameSessionInput,
  type AgentGenerateSessionTitleInput,
  type AgentGenerateSessionTitleResult,
  type AgentReassignSessionProjectInput,
  type AgentReassignSessionProjectResult,
  type AgentResolvePlanSuggestInput,
  type AgentEffortCatalogSnapshot,
  type AgentListModelsInput,
  type AgentListModelsResult,
  type AgentModelEffortInput,
  type AgentModelEffortResult,
  type AgentModelsCatalogSnapshot,
  type AgentSendInput,
  type AgentSendResult,
  type AgentSessionSummary,
  type AgentStatus,
  type AgentTestConnectionInput,
  type AgentTestConnectionResult,
} from "../../shared/agent/api";
import {
  getAgentEffortCatalog,
  getAgentModelEffort,
  listAgentModels,
  listAgentModelsCatalog,
  testAgentConnection,
} from "./model-catalog";
import { hydrateSessionRecordToConversation } from "./session-hydrator";
import { applySubagentEventToRuns } from "../../shared/agent/conversation-blocks";
import type { ConversationSubagentRun } from "../../shared/agent/conversation";
import { PermissionGate, type PermissionGateRequest } from "./permission-gate";
import { ToolHost } from "./tool-host";
import { resolvePiAgentRoot, resolvePiRuntimeSessionDir, type AgentSessionRecord } from "./session-store";
import { RuntimeRegistry, type StartRuntimeInput } from "./runtime-registry";
import { isPiPrimitiveToolName, PI_PRIMITIVE_TOOL_NAMES } from "./capability-matrix";
import { InteractionBroker } from "./interaction-broker";
import { ALL_NATIVE_TOOLS, type NativeToolDefinition, type ExperimentRunFn } from "./tools/index";
import { resolveTeamPiBinding, type ResolvedPiLeadConfig, type ResolvedPiRosterEntry, type TeamPiBindingInput, type TeamPiBindingResult } from "./team-binding";
import { buildPermissionRulesFromSettings } from "../../shared/permissions/modes";
import {
  createTaskDelegationTool,
  PiSubsessionRuntime,
} from "./pi-subsession-runtime";
import {
  PI_SDK_PACKAGE,
  PI_SDK_PINNED_VERSION,
  PiSdkRuntime,
  createPiSdkSessionFactory,
  createPiSubagentRunnerFactory,
  probePiEmbedCompatibility,
  restorePersistedPiSessionLeaf,
  truncatePersistedPiSession,
} from "./pi-sdk-runtime";
import {
  AgentMcpHost,
  mcpDefsFromTeamAssets,
  resolveMcpSpawnCwd,
  selectMcpServers,
} from "./mcp-host";
import type { McpServerDef } from "../../shared/teams/types";
import { buildLiveTaskRosterMarkdown } from "../../shared/agent/subagent-roster";
import { createLogger, shortLogDetail } from "../app/logger";

const log = createLogger("agent-service", "agent");

const AGENT_TOOLS = [
  ...PI_PRIMITIVE_TOOL_NAMES,
  ...ALL_NATIVE_TOOLS.map((t) => t.name).filter((name) => !isPiPrimitiveToolName(name)),
];
const AGENT_FALLBACK_CONVERSATION_ID = "agent";

/** Pi uses this sentence when ResourceLoader.getSystemPrompt() is empty. */
export const PI_DEFAULT_CODING_IDENTITY =
  "You are an expert coding assistant operating inside pi";

export { HOST_SYSTEM_IDENTITY };

export function resolveAgentAuth(input: AgentAuthInput): AgentAuthResult {
  const provider = (input.provider ?? input.settings.aiProvider ?? "").trim();
  const modelId = (input.modelId ?? input.settings.aiModel ?? "").trim();
  const apiKey = (
    input.apiKey
    ?? input.settings.aiApiKeys?.[provider]
    ?? ""
  ).trim();

  if (!provider) return { ok: false, reason: "missing_pi_provider" };
  if (!modelId) return { ok: false, reason: "missing_pi_model" };
  if (!apiKey) {
    if (input.allowMissingKey) {
      return { ok: true, provider, modelId, apiKey: GATEWAY_PLACEHOLDER_KEY };
    }
    return { ok: false, reason: "missing_pi_api_key" };
  }

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
  profileModules?: string;
  taskRoster?: string;
}): string {
  return assembleAgentSystemPrompt(input);
}

export function buildAgentUserText(input: {
  text: string;
  projectRules?: string;
}): string {
  const rules = input.projectRules?.trim();
  const text = input.text.trim();
  return rules ? `${rules}\n\n${text}` : text;
}

export const REMOTE_MODULE_PENDING = "remote_module_pending";

function isRemotePendingModule(name: string): boolean {
  return name.startsWith("interaction-")
    || name === "results-snapshot"
    || name === "provenance-query";
}

export function createAgentNativeTools(deps?: {
  runExperiment?: ExperimentRunFn;
  /** RW-2 leftover: interaction / provenance fail clearly until later steps. */
  pendingRemoteModules?: boolean;
  /** Host experiment-run: tell the model SSH drop kills the job. */
  remoteJobNote?: boolean;
}): NativeToolDefinition[] {
  const catalog = ALL_NATIVE_TOOLS.filter((tool) => !isPiPrimitiveToolName(tool.name));
  return catalog.map((tool) => {
    if (deps?.pendingRemoteModules && isRemotePendingModule(tool.name)) {
      return {
        ...tool,
        execute: async () => ({ ok: false, error: REMOTE_MODULE_PENDING }),
      };
    }
    if (tool.name === "experiment-run" && deps?.runExperiment) {
      const customRun = deps.runExperiment;
      return {
        ...tool,
        execute: async (args, ctx) => {
          const id = typeof args.id === "string" ? args.id.trim() : "";
          const command = typeof args.command === "string" ? args.command : "";
          if (!id || !command) return { ok: false, error: "missing_id_or_command" };
          const result = await customRun({
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
          if (deps.remoteJobNote && result && typeof result === "object") {
            return { ...result, remoteNote: "ssh_drop_kills_job" };
          }
          return result;
        },
      };
    }
    if (tool.name === "experiment-run" && deps?.remoteJobNote) {
      return {
        ...tool,
        execute: async (args, ctx) => {
          const result = await tool.execute(args, ctx);
          if (result && typeof result === "object") {
            return { ...result as Record<string, unknown>, remoteNote: "ssh_drop_kills_job" };
          }
          return result;
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
  /** Host default is proxy — no real API key on the server. */
  modelTransport?: "direct" | "proxy";
  pendingRemoteModules?: boolean;
  remoteJobNote?: boolean;
}

export class AgentService {
  private runtime: PiSdkRuntime | null = null;
  private sessionId: string | null = null;
  private projectRoot: string | null = null;
  /** Conversations whose `send()` is still awaiting the engine. */
  private readonly sending = new Set<string>();
  /**
   * Bumped when a turn lock is released early (cancel / terminal event) so a
   * still-awaiting `send()` `finally` cannot drop a newer turn's lock.
   */
  private readonly sendEpoch = new Map<string, number>();
  private sink: ((event: AgentEvent) => void) | null = null;
  private permissionSink: ((request: PermissionGateRequest) => void) | null = null;
  private ownerSink: AgentEventSink | null = null;
  private owner: ElectronSinkTarget | null = null;
  private activeTabId: string = AGENT_FALLBACK_CONVERSATION_ID;
  private activeConversationId: string | null = null;
  private readonly registry: RuntimeRegistry;
  /** Per-conversation start context. Consumed (and deleted) by startRuntime. */
  private readonly startContexts = new Map<string, {
    provider: string;
    modelId: string;
    apiKey: string;
    permissionMode: PermissionMode;
    lead?: ResolvedPiLeadConfig;
    roster?: ResolvedPiRosterEntry[];
    skills?: Array<{ dir: string; fqid: string }>;
    mcpAllowlist?: string[];
    mcpServers?: McpServerDef[];
  }>();
  private readonly mcpHosts = new Map<string, AgentMcpHost>();
  private readonly subsessionRuntimes = new Map<string, PiSubsessionRuntime>();
  private readonly subagentRunsByRuntime = new Map<string, Record<string, ConversationSubagentRun>>();

  constructor(private readonly deps: AgentServiceDeps) {
    this.registry = deps.registry ?? new RuntimeRegistry({
      userDataDir: deps.userDataDir,
      startRuntime: (input) => this.startRuntime(input),
    });
  }

  status(projectRoot?: string | null, sessionTeamId?: string | null): AgentStatus {
    const settings = this.deps.getSettings();
    const auth = resolveAgentAuth({
      settings: settings as AgentAuthInput["settings"],
      allowMissingKey: this.deps.modelTransport === "proxy",
    });
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

    const proxy = this.deps.modelTransport === "proxy";
    const ready = Boolean(
      probe.canEmbedInElectronMain
      && root
      && (!teamBinding || teamBinding.ok)
      && (proxy || auth.ok),
    );
    let reason: string | undefined;
    if (!probe.canEmbedInElectronMain) reason = "electron_node_incompatible";
    else if (!root) reason = "missing_project";
    else if (!proxy && !auth.ok) reason = auth.reason;
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
    if (this.sending.has(conversationId)) return { ok: false, error: "turn_in_progress" };

    const resolverFn = this.deps.resolveTeamBinding ?? resolveTeamPiBinding;
    let teamBinding: TeamPiBindingResult | undefined;
    try {
      teamBinding = resolverFn({
        projectRoot,
        sessionTeamId: input.sessionTeamId,
        extraSkillIds: input.skillIds,
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
      allowMissingKey: this.deps.modelTransport === "proxy",
      settings: settings as AgentAuthInput["settings"],
    });
    if (!auth.ok) return { ok: false, error: auth.reason };

    const text = input.text.trim();
    if (!text) return { ok: false, error: "missing_prompt" };

    const sendEpoch = (this.sendEpoch.get(conversationId) ?? 0) + 1;
    this.sendEpoch.set(conversationId, sendEpoch);
    this.sending.add(conversationId);
    this.activeTabId = input.tabId?.trim() || conversationId;
    try {
      this.startContexts.set(conversationId, {
        provider: auth.provider,
        modelId: auth.modelId,
        apiKey: auth.apiKey,
        permissionMode: input.permissionMode ?? permissionModeFromSettings(settings),
        lead: teamBinding?.lead,
        roster: teamBinding?.availableRoster,
        skills: teamBinding?.skills?.map((skill) => ({
          dir: skill.dir,
          fqid: skill.fqid,
        })),
        mcpAllowlist: input.mcpServerAllowlist?.filter(Boolean),
        mcpServers: mcpDefsFromTeamAssets(teamBinding?.mcps),
      });
      let binding = this.registry.getBinding(conversationId);
      const existing = this.registry.store.getByConversationId(conversationId);
      if (binding && existing) {
        const recRoot = existing.projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
        const want = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
        if (recRoot !== want) {
          return { ok: false, error: "conversation_project_mismatch" };
        }
      }
      if (!binding) {
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
              boundCheckoutPath: input.boundCheckoutPath?.trim() || projectRoot,
            });
      }
      this.updateDefaultTitle(conversationId, text);

      this.sessionId = binding.runtimeSessionId ?? null;
      this.projectRoot = projectRoot;
      this.activeConversationId = conversationId;
      this.runtime = this.registry.getRuntime(conversationId) as PiSdkRuntime | null;
      if (!this.sessionId) {
        return { ok: false, error: "session_missing" };
      }
      await this.attachLiveMcpTools(conversationId);

      const userText = buildAgentUserText({
        text: input.sessionAgent === "plan"
          ? `${text}\n\n${buildPlanModeTurnAppendix(conversationId)}`
          : text,
        projectRules: await this.deps.composeProjectRules(projectRoot),
      });
      await this.registry.sendTurn({
        conversationId,
        tabId: this.activeTabId,
        turnId: input.turnId,
        text: userText,
        images: input.images,
        attachments: input.attachments,
        sessionAgent: input.sessionAgent,
        permissionMode: input.permissionMode ?? permissionModeFromSettings(settings),
        provider: auth.provider,
        modelId: auth.modelId,
        apiKey: auth.apiKey,
      });
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn("turn.fail", {
        conversationId,
        runtimeSessionId: this.sessionId ?? undefined,
        error: shortLogDetail(error),
      });
      this.sink?.({
        type: "turn_failed",
        runtimeSessionId: this.sessionId ?? "none",
        tabId: this.activeTabId,
        turnId: input.turnId || "agent",
        error,
      });
      return { ok: false, error };
    } finally {
      if (this.sendEpoch.get(conversationId) === sendEpoch) {
        this.sending.delete(conversationId);
      }
    }
  }

  /** Drop the in-flight send lock so Stop / timeout can start the next turn. */
  private releaseTurnLock(conversationId: string | null | undefined): void {
    const id = conversationId?.trim();
    if (!id) return;
    this.sendEpoch.set(id, (this.sendEpoch.get(id) ?? 0) + 1);
    this.sending.delete(id);
  }

  async cancel(conversationId?: string): Promise<void> {
    const id = conversationId?.trim();
    if (!id) return;
    const runtimeSessionId = this.registry.cancelConversationWaiters(id);
    if (runtimeSessionId) {
      this.subsessionRuntimes.get(id)?.cancelAllForParentSession(runtimeSessionId);
    }
    await this.registry.cancelTurn(id);
    this.releaseTurnLock(id);
  }

  async reset(tabId?: string): Promise<void> {
    await this.resetSession(tabId?.trim() || undefined);
  }

  cancelSubagent(conversationId: string, toolCallId: string): boolean {
    return this.subsessionRuntimes.get(conversationId)?.cancelByParentToolCallId(toolCallId) ?? false;
  }

  resolvePermission(requestId: string, decision: "allow" | "deny"): boolean {
    return this.registry.resolvePermission(requestId, decision);
  }

  answerQuestion(input: AgentAnswerQuestionInput): boolean {
    return this.registry.answerQuestion(input.requestId, {
      answer: input.answer,
      selected: input.selected,
    });
  }

  resolvePlanSuggest(input: AgentResolvePlanSuggestInput): boolean {
    return this.registry.resolvePlanSuggest(input.requestId, input.decision);
  }

  async deleteSession(input: AgentDeleteSessionInput): Promise<{ ok: boolean }> {
    const conversationId = input.conversationId.trim();
    if (!conversationId) return { ok: false };
    await this.registry.disposeConversation(conversationId);
    this.registry.store.deleteByConversationId(conversationId);
    if (conversationId === this.activeConversationId) {
      this.runtime = null;
      this.sessionId = null;
      this.activeConversationId = null;
    }
    return { ok: true };
  }

  listSessions(projectRoot: string): AgentSessionSummary[] {
    const root = projectRoot.trim();
    if (!root) return [];
    return this.summarizeSessions(this.registry.store.listSessionsByProject(root));
  }

  listSessionsByProjectId(projectId: string): AgentSessionSummary[] {
    const id = projectId.trim();
    if (!id) return [];
    return this.summarizeSessions(this.registry.store.listSessionsByProjectId(id));
  }

  private summarizeSessions(records: AgentSessionRecord[]): AgentSessionSummary[] {
    return records.map((record) => ({
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
      planEvents: record.planEvents ?? [],
    };
  }

  listModels(input: AgentListModelsInput): Promise<AgentListModelsResult> {
    return listAgentModels(input);
  }

  listModelsCatalog(): Promise<AgentModelsCatalogSnapshot> {
    return listAgentModelsCatalog();
  }

  testConnection(input: AgentTestConnectionInput): Promise<AgentTestConnectionResult> {
    return testAgentConnection(input);
  }

  getModelEffort(input: AgentModelEffortInput): Promise<AgentModelEffortResult> {
    return getAgentModelEffort(input);
  }

  getEffortCatalog(): Promise<AgentEffortCatalogSnapshot> {
    return getAgentEffortCatalog();
  }

  async compact(input: AgentCompactInput): Promise<AgentCompactResult> {
    const conversationId = input.conversationId.trim();
    if (!conversationId) return { ok: false, error: "missing_conversation" };
    const binding = this.registry.getBinding(conversationId);
    if (!binding?.runtimeSessionId) return { ok: false, error: "session_not_live" };
    const runtime = this.registry.getRuntime(conversationId);
    if (!runtime?.compact) return { ok: false, error: "compact_unavailable" };
    const result = await runtime.compact(binding.runtimeSessionId);
    if (!result.ok) return result;
    const record = this.registry.store.getSession(binding.runtimeSessionId)
      ?? this.registry.store.getByConversationId(conversationId);
    const throughTurnIndex = record?.turns.length ?? 0;
    if (record) {
      this.registry.store.put({
        ...record,
        compacted: {
          throughTurnIndex,
          ...(result.summary ? { summary: result.summary } : {}),
          at: Date.now(),
        },
        updatedAt: new Date().toISOString(),
      });
    }
    return { ...result, throughTurnIndex };
  }

  async describeImages(input: AgentDescribeImagesInput): Promise<AgentDescribeImagesResult> {
    const { describeImagesWithVisionFallback } = await import("./vision-fallback");
    return {
      descriptions: await describeImagesWithVisionFallback(
        input.providerId,
        input.modelId,
        input.images,
      ),
    };
  }

  async truncateToTurn(input: AgentTruncateInput): Promise<AgentTruncateResult> {
    const conversationId = input.conversationId.trim();
    if (!conversationId) return { ok: false, error: "missing_conversation" };
    const record = this.registry.store.getByConversationId(conversationId);
    if (!record) return { ok: false, error: "unknown_conversation" };
    const keepThrough = Number.isFinite(input.turnIndex) ? Math.trunc(input.turnIndex) : -1;
    const exclusive = keepThrough + 1;

    let previousLeafId: string | null | undefined;
    const runtime = this.registry.getRuntime(conversationId);
    if (runtime?.truncate && this.registry.getBinding(conversationId)?.runtimeSessionId) {
      const engine = await runtime.truncate(record.runtimeSessionId, keepThrough);
      if (!engine.ok && engine.error !== "unknown_session") {
        return { ok: false, error: engine.error ?? "truncate_failed" };
      }
      previousLeafId = engine.previousLeafId;
    } else if (record.piSessionFile) {
      const engine = truncatePersistedPiSession(record.piSessionFile, keepThrough);
      if (!engine.ok) return { ok: false, error: engine.error ?? "truncate_failed" };
      previousLeafId = engine.previousLeafId;
    }

    const rolled = this.registry.store.rollbackSession(record.runtimeSessionId, Math.max(0, exclusive));
    if (!rolled.ok) return { ok: false, error: "truncate_failed" };
    this.registry.store.attachRegretPiLeaf(record.runtimeSessionId, previousLeafId);
    return { ok: true, keptCount: rolled.keptCount };
  }

  async undoTruncate(input: AgentUndoTruncateInput): Promise<AgentUndoTruncateResult> {
    const conversationId = input.conversationId.trim();
    if (!conversationId) return { ok: false, error: "missing_conversation" };
    const record = this.registry.store.getByConversationId(conversationId);
    if (!record?.regret) return { ok: false, error: "no_regret" };
    const leafId = record.regret.piLeafId;

    // Engine branch first: if restoring the Pi leaf fails, leave the store untouched
    // so the store and engine branches cannot diverge.
    if (leafId) {
      const runtime = this.registry.getRuntime(conversationId);
      let engineOk = true;
      if (runtime?.restoreLeaf) {
        try {
          const restoredLeaf = await runtime.restoreLeaf(record.runtimeSessionId, leafId);
          engineOk = restoredLeaf?.ok === true;
        } catch {
          engineOk = false;
        }
      } else if (record.piSessionFile) {
        try {
          restorePersistedPiSessionLeaf(record.piSessionFile, leafId);
        } catch {
          engineOk = false;
        }
      }
      if (!engineOk) {
        return { ok: false, error: "restore_engine_failed" };
      }
    }

    const restored = this.registry.store.restoreRegret(record.runtimeSessionId);
    if (!restored.ok) return { ok: false, error: "undo_failed" };
    return { ok: true, restoredCount: restored.restoredCount };
  }

  reassignDirectory(input: AgentReassignDirectoryInput): AgentReassignDirectoryResult {
    const fromDirectory = input.fromDirectory.trim();
    const toDirectory = input.toDirectory.trim();
    if (!fromDirectory || !toDirectory || fromDirectory === toDirectory) return { count: 0 };
    return { count: this.registry.store.rebindCheckout(fromDirectory, toDirectory) };
  }

  async reassignSessionProject(
    input: AgentReassignSessionProjectInput,
  ): Promise<AgentReassignSessionProjectResult> {
    const conversationId = input.conversationId.trim();
    const projectId = input.projectId.trim();
    const projectRoot = input.projectRoot.trim();
    if (!conversationId || !projectId || !projectRoot) {
      return { ok: false, error: "missing_args" };
    }
    const existed = this.registry.store.reassignProject(conversationId, projectId, projectRoot);
    if (this.registry.getBinding(conversationId)) {
      await this.resetSession(conversationId);
    }
    return { ok: true, existed };
  }

  async syncIntensiveReading(input: AgentSyncIntensiveReadingInput): Promise<{ ok: boolean }> {
    const conversationId = input.conversationId.trim();
    const projectRoot = input.projectRoot.trim();
    if (!conversationId || !projectRoot) return { ok: false };
    const { getPaper } = await import("../literature/facade");
    const { setSessionIntensiveBibkeys } = await import("../session/chat-session-registry");
    const bibkeys: string[] = [];
    for (const paperId of input.paperIds ?? []) {
      const paper = getPaper(projectRoot, paperId);
      if (paper?.bibkey) bibkeys.push(paper.bibkey);
    }
    setSessionIntensiveBibkeys(conversationId, bibkeys);
    const runtimeSessionId = this.registry.getBinding(conversationId)?.runtimeSessionId;
    if (runtimeSessionId) setSessionIntensiveBibkeys(runtimeSessionId, bibkeys);
    return { ok: true };
  }

  lookupSessionAgent(id: string): SessionAgent | undefined {
    const key = id.trim();
    if (!key) return undefined;
    const record = this.registry.store.getByConversationId(key) ?? this.registry.store.get(key);
    return record?.sessionAgent;
  }

  getPlanEvents(conversationId: string): AgentPlanEvent[] {
    return this.registry.store.getByConversationId(conversationId.trim())?.planEvents ?? [];
  }

  upsertPlanArtifact(input: AgentPlanArtifactInput): { ok: boolean } {
    const record = this.registry.store.getByConversationId(input.conversationId.trim());
    if (!record) return { ok: false };
    this.registry.store.upsertPlanArtifact(record.runtimeSessionId, input.event);
    return { ok: true };
  }

  appendPlanDecision(input: AgentPlanDecisionInput): { ok: boolean } {
    const record = this.registry.store.getByConversationId(input.conversationId.trim());
    if (!record) return { ok: false };
    this.registry.store.appendPlanDecision(record.runtimeSessionId, input.event);
    return { ok: true };
  }

  markPlanArtifactDiscarded(conversationId: string): { ok: boolean } {
    const record = this.registry.store.getByConversationId(conversationId.trim());
    if (!record) return { ok: false };
    this.registry.store.markPlanArtifactDiscarded(record.runtimeSessionId);
    return { ok: true };
  }

  upsertTurnMeta(input: AgentTurnMetaInput): { ok: boolean } {
    const record = this.registry.store.getByConversationId(input.conversationId.trim());
    if (!record) return { ok: false };
    return { ok: this.registry.store.upsertTurnMeta(record.runtimeSessionId, input.turnIndex, input.meta) };
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

  async generateSessionTitle(
    input: AgentGenerateSessionTitleInput,
  ): Promise<AgentGenerateSessionTitleResult> {
    const conversationId = input.conversationId.trim();
    if (!conversationId) return { ok: false, error: "missing_conversation" };
    const record = this.registry.store.getByConversationId(conversationId);
    if (!record) return { ok: false, error: "unknown_conversation" };
    const { generateSessionTitleFromRecord } = await import("./session-title");
    const result = await generateSessionTitleFromRecord(
      record,
      input,
      this.deps.getSettings(),
    );
    if (!result.ok || !result.title || result.skipped) return result;
    const latest = this.registry.store.getByConversationId(conversationId);
    if (!latest) return result;
    const firstUser = (input.userText || latest.turns.find((turn) => turn.status === "completed")?.user.text || "").trim();
    if (!isProvisionalSessionTitle(latest.title, firstUser)) {
      return { ok: true, title: latest.title, skipped: true };
    }
    this.registry.store.put({ ...latest, title: result.title });
    return result;
  }

  attachSink(eventSink: AgentEventSink): void {
    this.owner = null;
    this.ownerSink = eventSink;
    this.bindEventPipes();
  }

  attachOwner(contents?: ElectronSinkTarget | null): void {
    if (!contents || typeof contents.send !== "function") return;
    if (this.owner !== contents) {
      this.owner = contents;
      const drop = () => {
        if (this.owner === contents) {
          this.owner = null;
          this.ownerSink = null;
        }
      };
      const once = (contents as { once?: (event: string, listener: () => void) => void }).once?.bind(contents);
      once?.("destroyed", drop);
      once?.("render-process-gone", drop);
    }
    this.ownerSink = createElectronSink(contents);
    this.bindEventPipes();
  }

  private bindEventPipes(): void {
    this.sink = (event) => {
      if (event.subagent) {
        const parentRt =
          this.registry.getBinding(event.tabId)?.runtimeSessionId
          ?? this.sessionId;
        if (parentRt) this.runtime?.touchTurnWatchdog?.(parentRt);
        if (parentRt) {
          const next = applySubagentEventToRuns(
            this.subagentRunsByRuntime.get(parentRt) ?? {},
            event,
          );
          this.subagentRunsByRuntime.set(parentRt, next);
          if (
            event.type === "turn_finished"
            || event.type === "turn_failed"
            || event.type === "turn_cancelled"
          ) {
            this.persistSubagentRuns(parentRt);
          }
        }
      } else if (
        event.type === "turn_finished"
        || event.type === "turn_failed"
        || event.type === "turn_cancelled"
      ) {
        this.persistSubagentRuns(event.runtimeSessionId);
        this.releaseTurnLock(event.tabId);
        const bound = this.registry.store.getSession(event.runtimeSessionId)?.conversationId;
        if (bound && bound !== event.tabId) this.releaseTurnLock(bound);
        // A finished prompt has no waiters. Only abort/fail should tear down
        // an in-flight Allow/Deny — otherwise a premature terminal event
        // silently kills a live delete (or any other) prompt.
        if (event.type === "turn_cancelled" || event.type === "turn_failed") {
          this.registry.cancelHostWaiters(event.runtimeSessionId);
        }
      }
      if (
        event.type === "tool_started"
        && event.toolName === "task"
        && !event.subagent
        && typeof event.args?.expertId === "string"
      ) {
        (
          this.subsessionRuntimes.get(event.tabId)
          ?? (this.activeConversationId
            ? this.subsessionRuntimes.get(this.activeConversationId)
            : undefined)
        )?.prewarmFromParentTool({
          parentSessionId: event.runtimeSessionId,
          parentTabId: event.tabId,
          parentTurnId: event.turnId,
          parentToolCallId: event.toolCallId,
          expertId: event.args.expertId,
        });
      }
      this.emitToOwner("agent:event", event);
    };
    this.permissionSink = (request) => {
      this.emitToOwner("agent:permission", request);
    };
  }

  private emitToOwner(channel: string, payload: unknown): void {
    if (channel !== "agent:event" && channel !== "agent:permission") return;
    try {
      this.ownerSink?.emit(channel, payload);
    } catch {
      this.ownerSink = null;
      this.owner = null;
      log.warn("owner.send.drop", { channel, reason: "render_frame_gone" });
    }
  }

  detachOwner(contents?: ElectronSinkTarget): void {
    if (contents && this.owner !== contents) return;
    this.owner = null;
    this.ownerSink = null;
    this.sink = null;
    this.permissionSink = null;
  }

  private persistSubagentRuns(runtimeSessionId: string): void {
    const live = this.subagentRunsByRuntime.get(runtimeSessionId);
    if (!live || Object.keys(live).length === 0) return;
    const record = this.registry.store.getSession(runtimeSessionId);
    if (!record) return;
    this.registry.store.put({
      ...record,
      subagentRuns: { ...(record.subagentRuns ?? {}), ...live },
      updatedAt: new Date().toISOString(),
    });
  }

  isOwnedBy(contents: ElectronSinkTarget): boolean {
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
    const ctx = this.startContexts.get(input.conversationId);
    if (!ctx) throw new Error("start_context_missing");
    const mcpHost = this.mcpHosts.get(input.conversationId) ?? new AgentMcpHost();
    this.mcpHosts.set(input.conversationId, mcpHost);
    const agentRoot = resolvePiAgentRoot();
    const store = this.registry.store;
    let runtimeRef: PiSdkRuntime | null = null;
    const gate = new PermissionGate({
      timeoutMs: 120_000,
      rules: buildPermissionRulesFromSettings(this.deps.getSettings()),
      onPrompt: (request) => {
        // Only drop a prompt that belongs to a *different* live turn.
        // A dead-looking turn with this request still in decide() is still
        // this prompt() — showing the card is the contract, not silent deny.
        if (
          runtimeRef
          && request.turnId
          && runtimeRef.isTurnLive(request.runtimeSessionId)
          && !runtimeRef.isTurnLive(request.runtimeSessionId, request.turnId)
        ) {
          gate.resolve(request.requestId, "deny");
          return;
        }
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
    const interactions = new InteractionBroker({
      timeoutMs: 120_000,
      onQuestion: (request) => {
        this.sink?.({
          type: "question_requested",
          runtimeSessionId: request.runtimeSessionId,
          tabId: request.tabId,
          turnId: request.turnId,
          requestId: request.requestId,
          prompt: request.prompt,
          options: request.options,
        });
      },
      onPlanSuggest: (request) => {
        this.sink?.({
          type: "plan_suggested",
          runtimeSessionId: request.runtimeSessionId,
          tabId: request.tabId,
          turnId: request.turnId,
          requestId: request.requestId,
          reason: request.reason,
        });
      },
    });
    const toolHost = new ToolHost({
      gate,
      onEvent: (event) => this.sink?.(event),
    });
    toolHost.registerAll(createAgentNativeTools({
      pendingRemoteModules: this.deps.pendingRemoteModules,
      remoteJobNote: this.deps.remoteJobNote,
    }));

    const { buildPromptContext } = await import("../prompts/context");
    const {
      composeOrchestratorProfileModulePrompts,
      composeSubagentProfileModulePrompts,
    } = await import("../prompts/resolve-active-modules");
    const promptCtx = await buildPromptContext(input.projectRoot);

    if (ctx.roster && ctx.roster.length > 0) {
      const subsessionRuntime = new PiSubsessionRuntime({
        allTools: ALL_NATIVE_TOOLS,
        gate,
        createRunner: createPiSubagentRunnerFactory({
          fallbackProvider: ctx.provider,
          fallbackModelId: ctx.modelId,
          resolveApiKey: (provider) => {
            if (provider === ctx.provider) return ctx.apiKey;
            const keys = this.deps.getSettings().aiApiKeys as Record<string, string> | undefined;
            return keys?.[provider] || ctx.apiKey;
          },
          gate,
          interactions,
          agentRoot,
          modelTransport: this.deps.modelTransport,
        }),
        skills: ctx.skills?.map((skill) => ({ dir: skill.dir, source: skill.fqid })),
        profileModules: composeSubagentProfileModulePrompts(promptCtx),
        roster: ctx.roster,
        projectRoot: input.projectRoot,
        boundCheckoutPath: input.boundCheckoutPath,
        onEvent: (event) => this.sink?.(event),
      });
      this.subsessionRuntimes.set(input.conversationId, subsessionRuntime);
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
      profileModules: composeOrchestratorProfileModulePrompts(promptCtx),
      taskRoster: buildLiveTaskRosterMarkdown(
        (ctx.roster ?? []).map((entry) => ({
          id: entry.runtimeName,
          name: entry.name,
          description: entry.description,
          fqid: entry.fqid,
        })),
      ),
    });
    const runtime = new PiSdkRuntime({
      createPiSession: createPiSdkSessionFactory({
        providerId: ctx.provider,
        modelId: ctx.modelId,
        apiKey: ctx.apiKey,
        modelTransport: this.deps.modelTransport,
        systemPrompt,
        toolHost,
        gate,
        interactions,
        skills: ctx.skills?.map((skill) => ({
          dir: skill.dir,
          source: skill.fqid,
        })),
        mcpHost,
        mcpServers: selectMcpServers(ctx.mcpServers ?? [], ctx.mcpAllowlist),
      }),
      store,
      toolHost,
      gate,
      agentDir: join(agentRoot, "runtime"),
      persistSessions: true,
      piSessionDir: resolvePiRuntimeSessionDir(),
    });
    runtimeRef = runtime;
    runtime.subscribe((event) => this.sink?.(event));

    try {
      const created = await runtime.createSession({
        tabId: input.tabId,
        projectRoot: input.projectRoot,
        conversationId: input.conversationId,
        boundCheckoutPath: input.boundCheckoutPath,
        piSessionFile: input.piSessionFile,
        permissionMode: ctx.permissionMode,
        sessionAgent: "build",
      });
      const { getSessionIntensiveBibkeys, setSessionIntensiveBibkeys } = await import(
        "../session/chat-session-registry"
      );
      const intensive = getSessionIntensiveBibkeys(input.conversationId);
      if (intensive.length > 0) {
        setSessionIntensiveBibkeys(created.runtimeSessionId, intensive);
      }
      return {
        runtime,
        runtimeSessionId: created.runtimeSessionId,
        piSessionFile: created.piSessionFile,
        gate,
        interactions,
      };
    } catch (err) {
      this.mcpHosts.delete(input.conversationId);
      this.subsessionRuntimes.delete(input.conversationId);
      await mcpHost.dispose().catch(() => {});
      throw err;
    }
  }

  private async attachLiveMcpTools(conversationId: string): Promise<void> {
    const host = this.mcpHosts.get(conversationId);
    const runtime = this.registry.getRuntime(conversationId) as PiSdkRuntime | null;
    const sessionId = this.registry.getBinding(conversationId)?.runtimeSessionId;
    const ctx = this.startContexts.get(conversationId);
    if (!host || !runtime || !sessionId || !ctx) return;
    const record = this.registry.store.getByConversationId(conversationId);
    const tools = await host.ensure(
      selectMcpServers(ctx.mcpServers ?? [], ctx.mcpAllowlist),
      {
        cwd: resolveMcpSpawnCwd({
          boundCheckoutPath: record?.boundCheckoutPath,
          projectRoot: record?.projectRoot || this.projectRoot || "",
        }),
      },
    );
    const fresh = host.takeUnattached(tools);
    if (fresh.length === 0) return;
    runtime.attachCustomTools(sessionId, fresh);
  }

  private updateDefaultTitle(conversationId: string, text: string): void {
    const title = text.trim().slice(0, 80);
    if (!title) return;
    const record = this.registry.store.getByConversationId(conversationId);
    if (!record || (record.title && record.title !== "New Chat")) return;
    this.registry.store.put({ ...record, title });
  }

  private async resetSession(conversationId?: string): Promise<void> {
    const id = conversationId?.trim();
    if (!id) return;
    this.releaseTurnLock(id);
    const host = this.mcpHosts.get(id);
    this.mcpHosts.delete(id);
    await host?.dispose().catch(() => {});
    const subs = this.subsessionRuntimes.get(id);
    this.subsessionRuntimes.delete(id);
    if (subs) {
      const runtimeSessionId = this.registry.getBinding(id)?.runtimeSessionId;
      if (runtimeSessionId) subs.cancelAllForParentSession(runtimeSessionId);
    }
    await this.registry.disposeConversation(id).catch(() => {});
    if (id === this.activeConversationId) {
      this.runtime = null;
      this.sessionId = null;
      this.projectRoot = null;
      this.activeConversationId = null;
    }
    this.startContexts.delete(id);
  }
}

let singleton: AgentService | null = null;

export function createAgentService(deps: AgentServiceDeps): AgentService {
  return new AgentService(deps);
}

export async function getAgentService(): Promise<AgentService> {
  if (singleton) return singleton;
  const { app } = await import("electron");
  const { getSettings } = await import("../app/settings");
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
