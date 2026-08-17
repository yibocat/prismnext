/**
 * Isolated Pi Agent Lab — not the production chat backend.
 *
 * Experimental Pi chat tabs talk to this service only. `ipc/chat.ts` and
 * AcpService stay on OpenCode.
 */

import { join } from "node:path";
import type { WebContents } from "electron";
import type { AgentEvent } from "../../shared/agent-runtime";
import type { PermissionMode } from "../../shared/session-agent";
import {
  PI_LAB_TAB_ID,
  type PiLabAuthInput,
  type PiLabAuthResult,
  type PiLabSendInput,
  type PiLabSendResult,
  type PiLabStatus,
} from "../../shared/pi-lab";
import { isOpenCodeCatalogProvider } from "../../shared/opencode-provider";
import { PermissionGate, type PermissionGateRequest } from "./permission-gate";
import { ToolHost } from "./tool-host";
import { AgentSessionStore, resolvePiAgentRoot } from "./session-store";
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

const LAB_TOOLS = ALL_NATIVE_TOOLS.map((t) => t.name);

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

export function resolvePiLabAuth(input: PiLabAuthInput): PiLabAuthResult {
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

export function buildPiLabSystemPrompt(input: {
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

export function buildPiLabUserText(input: {
  text: string;
  projectRules?: string;
}): string {
  const rules = input.projectRules?.trim();
  const text = input.text.trim();
  return rules ? `${rules}\n\n${text}` : text;
}

export function createPiLabExperimentRunner(deps: {
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

export function createPiLabNativeTools(deps?: {
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

export interface PiLabServiceDeps {
  userDataDir: string;
  getSettings: () => Record<string, unknown>;
  composeStableSystem: (projectRoot: string) => Promise<string>;
  composeProjectRules: (projectRoot: string) => Promise<string>;
  composeAgentsMd: (projectRoot: string) => Promise<string>;
  resolveTeamBinding?: (input: TeamPiBindingInput) => TeamPiBindingResult;
}

export class PiLabService {
  private runtime: PiSdkRuntime | null = null;
  private gate: PermissionGate | null = null;
  private sessionId: string | null = null;
  private projectRoot: string | null = null;
  private sending = false;
  private sink: ((event: AgentEvent) => void) | null = null;
  private permissionSink: ((request: PermissionGateRequest) => void) | null = null;
  private owner: WebContents | null = null;
  private activeTabId: string = PI_LAB_TAB_ID;

  constructor(private readonly deps: PiLabServiceDeps) {}

  status(projectRoot?: string | null, sessionTeamId?: string | null): PiLabStatus {
    const settings = this.deps.getSettings();
    const auth = resolvePiLabAuth({ settings: settings as PiLabAuthInput["settings"] });
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
      tools: [...LAB_TOOLS],
      permissionMode: permissionModeFromSettings(settings),
    };
  }

  async send(input: PiLabSendInput): Promise<PiLabSendResult> {
    const projectRoot = input.projectRoot.trim();
    if (!projectRoot) return { ok: false, error: "missing_project" };
    if (this.sending) return { ok: false, error: "lab_busy" };

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

    const auth = resolvePiLabAuth({
      provider: effectiveProvider,
      modelId: effectiveModelId,
      apiKey: input.apiKey,
      settings: settings as PiLabAuthInput["settings"],
    });
    if (!auth.ok) return { ok: false, error: auth.reason };

    const text = input.text.trim();
    if (!text) return { ok: false, error: "missing_prompt" };

    this.sending = true;
    this.activeTabId = input.tabId?.trim() || PI_LAB_TAB_ID;
    try {
      if (!this.runtime || this.projectRoot !== projectRoot || !this.sessionId) {
        await this.resetSession();
        await this.startSession({
          projectRoot,
          provider: auth.provider,
          modelId: auth.modelId,
          apiKey: auth.apiKey,
          permissionMode: input.permissionMode ?? permissionModeFromSettings(settings),
          lead: teamBinding?.lead,
          roster: teamBinding?.availableRoster,
        });
      }

      const sessionId = this.sessionId;
      if (!sessionId || !this.runtime) {
        return { ok: false, error: "lab_session_missing" };
      }

      const userText = buildPiLabUserText({
        text,
        projectRules: await this.deps.composeProjectRules(projectRoot),
      });
      await this.runtime.sendTurn({
        runtimeSessionId: sessionId,
        tabId: this.activeTabId,
        text: userText,
        permissionMode: input.permissionMode ?? permissionModeFromSettings(settings),
      });
      return { ok: true, sessionId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.sink?.({
        type: "turn_failed",
        runtimeSessionId: this.sessionId ?? "none",
        tabId: this.activeTabId,
        turnId: "lab",
        error,
      });
      return { ok: false, error };
    } finally {
      this.sending = false;
    }
  }

  async cancel(): Promise<void> {
    if (!this.runtime || !this.sessionId) return;
    await this.runtime.cancelTurn(this.sessionId);
  }

  async reset(): Promise<void> {
    await this.resetSession();
  }

  resolvePermission(requestId: string, decision: "allow" | "deny"): boolean {
    return this.gate?.resolve(requestId, decision) ?? false;
  }

  attachOwner(contents: WebContents): void {
    this.owner = contents;
    this.sink = (event) => {
      if (this.owner && !this.owner.isDestroyed()) {
        this.owner.send("pi-lab:event", event);
      }
    };
    this.permissionSink = (request) => {
      if (this.owner && !this.owner.isDestroyed()) {
        this.owner.send("pi-lab:permission", request);
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

  private async startSession(input: {
    projectRoot: string;
    provider: string;
    modelId: string;
    apiKey: string;
    permissionMode: PermissionMode;
    lead?: ResolvedPiLeadConfig;
    roster?: ResolvedPiRosterEntry[];
  }): Promise<void> {
    const agentRoot = resolvePiAgentRoot(this.deps.userDataDir);
    const store = new AgentSessionStore(agentRoot);
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
    toolHost.registerAll(createPiLabNativeTools());

    // Register dynamic task tool if team has a valid roster
    if (input.roster && input.roster.length > 0) {
      const subsessionRuntime = new PiSubsessionRuntime({
        allTools: ALL_NATIVE_TOOLS,
        gate,
        onEvent: (event) => this.sink?.(event),
      });
      const taskTool = createTaskDelegationTool({
        subsessionRuntime,
        roster: input.roster,
      });
      toolHost.register(taskTool);
    }

    const systemPrompt = buildPiLabSystemPrompt({
      stableSystem: await this.deps.composeStableSystem(input.projectRoot),
      agentsMd: await this.deps.composeAgentsMd(input.projectRoot),
      leadInstructions: input.lead?.instructions,
      leadName: input.lead?.name,
    });
    const runtime = new PiSdkRuntime({
      createPiSession: createPiSdkSessionFactory({
        providerId: input.provider,
        modelId: input.modelId,
        apiKey: input.apiKey,
        systemPrompt,
        toolHost,
      }),
      store,
      toolHost,
      gate,
      agentDir: join(agentRoot, "lab-runtime"),
    });
    runtime.subscribe((event) => this.sink?.(event));

    const created = await runtime.createSession({
      tabId: this.activeTabId,
      projectRoot: input.projectRoot,
      permissionMode: input.permissionMode,
      sessionAgent: "build",
    });
    this.runtime = runtime;
    this.gate = gate;
    this.sessionId = created.runtimeSessionId;
    this.projectRoot = input.projectRoot;
  }

  private async resetSession(): Promise<void> {
    const runtime = this.runtime;
    const sessionId = this.sessionId;
    this.runtime = null;
    this.gate = null;
    this.sessionId = null;
    this.projectRoot = null;
    if (runtime && sessionId) {
      await runtime.disposeSession(sessionId).catch(() => {});
    }
  }
}

let singleton: PiLabService | null = null;

export function createPiLabService(deps: PiLabServiceDeps): PiLabService {
  return new PiLabService(deps);
}

export async function getPiLabService(): Promise<PiLabService> {
  if (singleton) return singleton;
  const { app } = await import("electron");
  const { getSettings } = await import("../services/settings");
  const { promptManager } = await import("../prompts");
  const { buildPromptContext } = await import("../prompts/context");

  singleton = createPiLabService({
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

export async function disposePiLabService(): Promise<void> {
  const current = singleton;
  singleton = null;
  await current?.reset();
}
