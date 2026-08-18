/**
 * Pi conversation host. Product send/cancel/history go through RuntimeRegistry.
 */

import { join } from "node:path";
import type { WebContents } from "electron";
import type { AgentEvent } from "../../shared/agent-runtime";
import type { PermissionMode, SessionAgent } from "../../shared/session-agent";
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
} from "../../shared/agent-api";
import {
  getAgentEffortCatalog,
  getAgentModelEffort,
  listAgentModels,
  listAgentModelsCatalog,
  testAgentConnection,
} from "./model-catalog";
import { hydrateSessionRecordToConversation } from "./session-hydrator";
import { PermissionGate, type PermissionGateRequest } from "./permission-gate";
import { ToolHost } from "./tool-host";
import { resolvePiAgentRoot, resolvePiRuntimeSessionDir } from "./session-store";
import { RuntimeRegistry, type StartRuntimeInput } from "./runtime-registry";
import { isPiPrimitiveToolName, PI_PRIMITIVE_TOOL_NAMES } from "./capability-matrix";
import { InteractionBroker } from "./interaction-broker";
import { ALL_NATIVE_TOOLS, type NativeToolDefinition, type ExperimentRunFn } from "./tools/index";
import { resolveTeamPiBinding, type ResolvedPiLeadConfig, type ResolvedPiRosterEntry, type TeamPiBindingInput, type TeamPiBindingResult } from "./team-binding";
import { buildPermissionRulesFromSettings } from "../services/permission-modes";
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
  selectMcpServers,
} from "./mcp-host";
import type { McpServerDef } from "../../shared/teams/types";

const AGENT_TOOLS = [
  ...PI_PRIMITIVE_TOOL_NAMES,
  ...ALL_NATIVE_TOOLS.map((t) => t.name).filter((name) => !isPiPrimitiveToolName(name)),
];
const AGENT_FALLBACK_CONVERSATION_ID = "agent";

/** Pi uses this sentence when ResourceLoader.getSystemPrompt() is empty. */
export const PI_DEFAULT_CODING_IDENTITY =
  "You are an expert coding assistant operating inside pi";

export const HOST_SYSTEM_IDENTITY = [
  "You are the PrismNext research collaborator for this project.",
  "Do not claim to be Claude, GPT, Gemini, DeepSeek, or any other vendor model.",
  "Use the file and shell tools registered from Pi, plus the host research tools.",
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

export function createAgentNativeTools(deps?: {
  runExperiment?: ExperimentRunFn;
}): NativeToolDefinition[] {
  const catalog = ALL_NATIVE_TOOLS.filter((tool) => !isPiPrimitiveToolName(tool.name));
  if (!deps?.runExperiment) {
    return [...catalog];
  }
  const customRun = deps.runExperiment;
  return catalog.map((tool) => {
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
  private interactions: InteractionBroker | null = null;
  private sessionId: string | null = null;
  private projectRoot: string | null = null;
  private readonly sending = new Set<string>();
  private sink: ((event: AgentEvent) => void) | null = null;
  private permissionSink: ((request: PermissionGateRequest) => void) | null = null;
  private owner: WebContents | null = null;
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
      settings: settings as AgentAuthInput["settings"],
    });
    if (!auth.ok) return { ok: false, error: auth.reason };

    const text = input.text.trim();
    if (!text) return { ok: false, error: "missing_prompt" };

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
        return { ok: false, error: "session_missing" };
      }
      await this.attachLiveMcpTools(conversationId, projectRoot);

      const userText = buildAgentUserText({
        text,
        projectRules: await this.deps.composeProjectRules(projectRoot),
      });
      await this.registry.sendTurn({
        conversationId,
        tabId: this.activeTabId,
        turnId: input.turnId,
        text: userText,
        images: input.images,
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
      const binding = this.registry.getBinding(conversationId);
      if (binding?.runtimeSessionId) {
        this.interactions?.cancelSession(binding.runtimeSessionId);
        this.subsessionRuntimes.get(conversationId)?.cancelAllForParentSession(binding.runtimeSessionId);
      }
      await this.registry.cancelTurn(conversationId);
      return;
    }
    if (!this.runtime || !this.sessionId) return;
    await this.runtime.cancelTurn(this.sessionId);
  }

  async reset(tabId?: string): Promise<void> {
    await this.resetSession(tabId?.trim() || undefined);
  }

  cancelSubagent(conversationId: string, toolCallId: string): boolean {
    return this.subsessionRuntimes.get(conversationId)?.cancelByParentToolCallId(toolCallId) ?? false;
  }

  resolvePermission(requestId: string, decision: "allow" | "deny"): boolean {
    return this.gate?.resolve(requestId, decision) ?? false;
  }

  answerQuestion(input: AgentAnswerQuestionInput): boolean {
    return this.interactions?.resolveQuestion(input.requestId, {
      answer: input.answer,
      selected: input.selected,
    }) ?? false;
  }

  resolvePlanSuggest(input: AgentResolvePlanSuggestInput): boolean {
    return this.interactions?.resolvePlanSuggest(input.requestId, input.decision) ?? false;
  }

  async deleteSession(input: AgentDeleteSessionInput): Promise<{ ok: boolean }> {
    const conversationId = input.conversationId.trim();
    if (!conversationId) return { ok: false };
    const record = this.registry.store.getByConversationId(conversationId);
    await this.registry.disposeConversation(conversationId);
    if (record) this.registry.store.deleteSession(record.runtimeSessionId);
    if (conversationId === this.activeConversationId) {
      this.runtime = null;
      this.gate = null;
      this.interactions = null;
      this.sessionId = null;
      this.activeConversationId = null;
    }
    return { ok: true };
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
    return runtime.compact(binding.runtimeSessionId);
  }

  async describeImages(input: AgentDescribeImagesInput): Promise<AgentDescribeImagesResult> {
    const { describeImagesWithVisionFallback } = await import("../services/vision-fallback");
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

  async syncIntensiveReading(input: AgentSyncIntensiveReadingInput): Promise<{ ok: boolean }> {
    const conversationId = input.conversationId.trim();
    const projectRoot = input.projectRoot.trim();
    if (!conversationId || !projectRoot) return { ok: false };
    const { getPaper } = await import("../services/literature-service");
    const { setSessionIntensiveBibkeys } = await import("../services/chat-session-registry");
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
    const ctx = this.startContexts.get(input.conversationId);
    if (!ctx) throw new Error("start_context_missing");
    this.startContexts.delete(input.conversationId);
    const mcpHost = this.mcpHosts.get(input.conversationId) ?? new AgentMcpHost();
    this.mcpHosts.set(input.conversationId, mcpHost);
    const agentRoot = resolvePiAgentRoot(this.deps.userDataDir);
    const store = this.registry.store;
    const gate = new PermissionGate({
      timeoutMs: 120_000,
      rules: buildPermissionRulesFromSettings(this.deps.getSettings()),
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
    toolHost.registerAll(createAgentNativeTools());

    if (ctx.roster && ctx.roster.length > 0) {
      const { buildPromptContext } = await import("../prompts/context");
      const { composeSubagentProfileModulePrompts } = await import(
        "../prompts/resolve-active-modules"
      );
      const profileModules = await composeSubagentProfileModulePrompts(
        await buildPromptContext(input.projectRoot),
      );
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
        }),
        skills: ctx.skills?.map((skill) => ({ dir: skill.dir, source: skill.fqid })),
        profileModules,
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
    });
    const runtime = new PiSdkRuntime({
      createPiSession: createPiSdkSessionFactory({
        providerId: ctx.provider,
        modelId: ctx.modelId,
        apiKey: ctx.apiKey,
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
      piSessionDir: resolvePiRuntimeSessionDir(this.deps.userDataDir),
    });
    runtime.subscribe((event) => this.sink?.(event));

    try {
      const created = await runtime.createSession({
        tabId: input.tabId,
        projectRoot: input.projectRoot,
        conversationId: input.conversationId,
        piSessionFile: input.piSessionFile,
        permissionMode: ctx.permissionMode,
        sessionAgent: "build",
      });
      this.gate = gate;
      this.interactions = interactions;
      const { getSessionIntensiveBibkeys, setSessionIntensiveBibkeys } = await import(
        "../services/chat-session-registry"
      );
      const intensive = getSessionIntensiveBibkeys(input.conversationId);
      if (intensive.length > 0) {
        setSessionIntensiveBibkeys(created.runtimeSessionId, intensive);
      }
      return {
        runtime,
        runtimeSessionId: created.runtimeSessionId,
        piSessionFile: created.piSessionFile,
      };
    } catch (err) {
      this.mcpHosts.delete(input.conversationId);
      this.subsessionRuntimes.delete(input.conversationId);
      await mcpHost.dispose().catch(() => {});
      throw err;
    }
  }

  private async attachLiveMcpTools(conversationId: string, projectRoot: string): Promise<void> {
    const host = this.mcpHosts.get(conversationId);
    const runtime = this.runtime;
    const sessionId = this.sessionId;
    const ctx = this.startContext;
    if (!host || !runtime || !sessionId || !ctx) return;
    const tools = await host.ensure(
      selectMcpServers(ctx.mcpServers ?? [], ctx.mcpAllowlist),
      { cwd: projectRoot },
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
    const ids = conversationId
      ? [conversationId]
      : this.registry.liveConversationIds();
    for (const id of ids) {
      this.sending.delete(id);
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
    }
    if (!conversationId || conversationId === this.activeConversationId) {
      this.runtime = null;
      this.gate = null;
      this.interactions = null;
      this.sessionId = null;
      this.projectRoot = null;
      this.activeConversationId = null;
      this.startContexts.clear();
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
