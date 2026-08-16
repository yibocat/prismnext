/**
 * Isolated Pi Agent Lab — not the production chat backend.
 *
 * Settings → Agent Lab talks to this service only. `ipc/chat.ts` and
 * AcpService stay on OpenCode.
 */

import { join } from "node:path";
import type { BrowserWindow } from "electron";
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
import { createRepresentativeTools } from "./representative-tools";
import {
  PI_SDK_PACKAGE,
  PI_SDK_PINNED_VERSION,
  PiSdkRuntime,
  createPiSdkSessionFactory,
  probePiEmbedCompatibility,
} from "./pi-sdk-runtime";
import { searchPapers } from "../services/literature-service";
import { discoverLiterature } from "../services/literature-discovery";

const LAB_TOOLS = [
  "literature-search",
  "literature-discover",
  "research-brief-update",
  "experiment-run",
] as const;

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
}): string {
  return [input.stableSystem.trim(), input.agentsMd?.trim()]
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

export function createPiLabNativeTools() {
  return createRepresentativeTools({
    searchPapers: ({ projectRoot, query, limit, tag, collection }) => {
      return searchPapers(projectRoot, query, limit ?? 20, { tag, collection }).map((row) => ({
        id: row.id,
        bibkey: row.bibkey,
        title: row.title,
        authors: row.authors,
        year: row.year,
        doi: row.doi,
      }));
    },
    discoverLiterature,
    runExperiment: async () => ({
      ok: false,
      error: "experiment_run_not_available_in_lab",
    }),
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
}

export class PiLabService {
  private runtime: PiSdkRuntime | null = null;
  private gate: PermissionGate | null = null;
  private sessionId: string | null = null;
  private projectRoot: string | null = null;
  private sending = false;
  private sink: ((event: AgentEvent) => void) | null = null;
  private permissionSink: ((request: PermissionGateRequest) => void) | null = null;

  constructor(private readonly deps: PiLabServiceDeps) {}

  status(projectRoot?: string | null): PiLabStatus {
    const settings = this.deps.getSettings();
    const auth = resolvePiLabAuth({ settings: settings as PiLabAuthInput["settings"] });
    const probe = probePiEmbedCompatibility({
      hostNode: process.versions.node,
      electronNode: process.versions.node,
      electronVersion: process.versions.electron ?? "unknown",
    });
    const root = projectRoot?.trim() || this.projectRoot;
    const ready = Boolean(
      probe.canEmbedInElectronMain
      && auth.ok
      && root,
    );
    let reason: string | undefined;
    if (!probe.canEmbedInElectronMain) reason = "electron_node_incompatible";
    else if (!root) reason = "missing_project";
    else if (!auth.ok) reason = auth.reason;

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
      tools: [...LAB_TOOLS],
    };
  }

  async send(input: PiLabSendInput): Promise<PiLabSendResult> {
    const projectRoot = input.projectRoot.trim();
    if (!projectRoot) return { ok: false, error: "missing_project" };
    if (this.sending) return { ok: false, error: "lab_busy" };

    const settings = this.deps.getSettings();
    const auth = resolvePiLabAuth({
      provider: input.provider,
      modelId: input.modelId,
      apiKey: input.apiKey,
      settings: settings as PiLabAuthInput["settings"],
    });
    if (!auth.ok) return { ok: false, error: auth.reason };

    const text = input.text.trim();
    if (!text) return { ok: false, error: "missing_prompt" };

    this.sending = true;
    try {
      if (!this.runtime || this.projectRoot !== projectRoot || !this.sessionId) {
        await this.resetSession();
        await this.startSession({
          projectRoot,
          provider: auth.provider,
          modelId: auth.modelId,
          apiKey: auth.apiKey,
          permissionMode: input.permissionMode ?? permissionModeFromSettings(settings),
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
        tabId: PI_LAB_TAB_ID,
        text: userText,
        permissionMode: input.permissionMode ?? permissionModeFromSettings(settings),
      });
      return { ok: true, sessionId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.sink?.({
        type: "turn_failed",
        runtimeSessionId: this.sessionId ?? "none",
        tabId: PI_LAB_TAB_ID,
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

  attachWindow(win: BrowserWindow): void {
    this.sink = (event) => {
      if (!win.isDestroyed()) win.webContents.send("pi-lab:event", event);
    };
    this.permissionSink = (request) => {
      if (!win.isDestroyed()) win.webContents.send("pi-lab:permission", request);
    };
  }

  private async startSession(input: {
    projectRoot: string;
    provider: string;
    modelId: string;
    apiKey: string;
    permissionMode: PermissionMode;
  }): Promise<void> {
    const agentRoot = resolvePiAgentRoot(this.deps.userDataDir);
    const store = new AgentSessionStore(join(agentRoot, "lab"));
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

    const systemPrompt = buildPiLabSystemPrompt({
      stableSystem: await this.deps.composeStableSystem(input.projectRoot),
      agentsMd: await this.deps.composeAgentsMd(input.projectRoot),
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
      tabId: PI_LAB_TAB_ID,
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
