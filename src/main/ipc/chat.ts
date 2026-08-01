import * as path from "node:path";
import * as fs from "node:fs";
import { ipcMain, BrowserWindow, app } from "electron";
import { AcpService } from "../acp/service";
import type { SessionMessageBackup } from "../acp/service";
import { EventMapper } from "../acp/event-mapper";
import { createLogger } from "../services/logger";
import { promptManager } from "../prompts";
import { buildPromptContext } from "../prompts/context";
import { CONTEXT_CATEGORY_SCHEMA, buildTwoBucketBreakdown } from "../services/context-constants";
import {
  clearSessionContextUsage,
  loadSessionContext,
  persistSessionContext,
} from "../services/session-context-store";
import {
  mapAcpUsageToSnake,
  resolveContextUsedFromPromptUsage,
} from "../../shared/session-context-usage";
import {
  appendPlanDecisionEvent,
  appendUserDisplay,
  deleteSessionDisplays,
  getPlanEvents,
  getSessionDisplayBackup,
  getTurnMetas,
  getUserDisplays,
  markLatestPlanArtifactDiscarded,
  restoreSessionDisplayEntry,
  truncateUserDisplays,
  upsertPlanArtifactEvent,
  upsertTurnMeta,
  type PlanUiEvent,
  type SessionTurnMeta,
  type UserDisplayContent,
} from "../services/session-display-store";
import { cancelAiCommandForSession } from "../services/ai-pty";
import {
  setSessionProjectRoot,
  setSessionIntensiveBibkeys,
  resolveChatTabId,
  setSessionTaskAllowlist,
  clearSessionTaskAllowlist,
  claimTaskAllowlistFollowUp,
  getSessionMissingTaskAllowlist,
  deferTaskAllowlistFollowUp,
} from "../services/chat-session-registry";
import { formatTaskError } from "../../shared/task-error-codes";
import { getPaper } from "../services/literature-service";
import {
  buildIntensiveReadingInstruction,
  type IntensivePaper,
} from "../prompts/per-turn/intensive-reading";
import {
  formatOpenCodeModelRef,
  isOpenCodeCatalogProvider,
  normalizeOpenCodeModelId,
  providerApiKeyEnvVar,
} from "../../shared/opencode-provider";
import { buildOpenCodeCredentialEnv } from "../acp/credential-env";
import {
  OPENCODE_DEFAULT_VARIANT,
} from "../../shared/opencode-effort";
import { effortCatalog } from "../acp/effort-catalog";
import { buildSessionCitationsTurnAppendix } from "../services/session-citations-context";
import { buildSessionCiteAuditTurnAppendix } from "../services/session-cite-audit-context";
import {
  buildPlanModeTurnAppendix,
  planDraftMissingRedirectNote,
} from "../prompts/per-turn/plan-mode";
import {
  sessionDraftMetaShowsWrite,
  snapshotSessionDraftMeta,
} from "../services/research-plan-service";
import { getQuestionsBridgeRoot } from "../services/prism-bridge-paths";
import { emitChatStream } from "../services/chat-stream-notify";
import type { ChatPreparePhase } from "../../shared/chat-prepare-phases";
import { resolveSessionAgent } from "../../shared/session-agent";

const log = createLogger("chat-ipc", "agent");

/** In-flight chat:send per tab — lets cancel complete the UI without waiting on prompt. */
const inflightChatSend = new Map<
  string,
  { cancelled: boolean; sessionId: string; win: BrowserWindow }
>();

function emitChatPrepare(tabId: string, phase: ChatPreparePhase | null): void {
  emitChatStream(tabId, "system.prepare", { phase });
}

/**
 * Resolve intensive paper IDs to {bibkey, title} for the per-turn instruction.
 * Skips IDs that no longer exist in the library (e.g. deleted mid-session).
 */
function resolveIntensivePapers(
  projectRoot: string,
  paperIds: string[] | undefined,
): IntensivePaper[] {
  if (!paperIds?.length) return [];
  const out: IntensivePaper[] = [];
  for (const id of paperIds) {
    const paper = getPaper(projectRoot, id);
    if (paper?.bibkey) {
      out.push({ bibkey: paper.bibkey, title: paper.title ?? "" });
    }
  }
  return out;
}

function syncIntensiveBibkeysForSession(
  projectRoot: string,
  sessionId: string,
  paperIds: string[] | undefined,
): void {
  const bibkeys = resolveIntensivePapers(projectRoot, paperIds).map((p) => p.bibkey);
  setSessionIntensiveBibkeys(sessionId, bibkeys);
}

/** Full SQLite snapshot before session:truncateToTurn — used by session:undoTruncate. */
const sessionTruncationBackups = new Map<string, SessionMessageBackup>();
const sessionDisplayBackups = new Map<
  string,
  NonNullable<ReturnType<typeof getSessionDisplayBackup>>
>();

// ── Session context (persist helpers live in session-context-store) ──

const mappers = new Map<number, EventMapper>();

function getService(): AcpService {
  return AcpService.getInstance();
}

function getMapper(win: BrowserWindow): EventMapper {
  let mapper = mappers.get(win.id);
  if (!mapper) {
    mapper = new EventMapper(win);
    mappers.set(win.id, mapper);
    win.on("closed", () => {
      mapper?.stop();
      mappers.delete(win.id);
    });
  }
  return mapper;
}

/** Register sessionId ↔ tabId so ACP stream events route to the correct chat tab. */
function registerTabSession(
  win: BrowserWindow,
  tabId: string,
  sessionId: string,
  projectPath?: string,
): void {
  const bridge = getMapper(win);
  bridge.registerSession(sessionId, tabId);
  if (projectPath?.trim()) {
    setSessionProjectRoot(sessionId, projectPath.trim());
  }
  bridge.start();
}

/**
 * Ensure the OpenCode ACP process is running. Auto-reconnects if needed.
 * Always merges settings credentials + call-site extraEnv — AcpService restarts
 * the child when credentials change (API keys are only applied at spawn).
 */
async function ensureConnected(
  extraEnv?: Record<string, string>,
  preferredCatalogProvider?: string,
): Promise<void> {
  await getService().initialize(
    buildOpenCodeCredentialEnv(extraEnv, { preferredCatalogProvider }),
  );
}

export function registerChatHandlers(): void {
  // ─── Dispose ───
  // Clears event mappers but keeps the ACP process alive (app-level).
  ipcMain.handle("chat:dispose", async () => {
    for (const mapper of mappers.values()) {
      mapper.stop();
    }
    mappers.clear();
    return { success: true };
  });

  // ─── Register tab ↔ session mapping (sidebar load, tab restore) ───
  ipcMain.handle(
    "chat:registerTab",
    async (
      event,
      args: { tabId: string; sessionId: string; projectPath?: string },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || !args.tabId || !args.sessionId) {
        return { success: false };
      }
      registerTabSession(win, args.tabId, args.sessionId, args.projectPath);
      return { success: true };
    },
  );

  ipcMain.handle(
    "chat:syncIntensiveReading",
    async (
      _event,
      args: { sessionId: string; projectRoot: string; paperIds?: string[] },
    ) => {
      if (!args.sessionId?.trim() || !args.projectRoot?.trim()) {
        return { success: false };
      }
      syncIntensiveBibkeysForSession(args.projectRoot, args.sessionId.trim(), args.paperIds);
      return { success: true };
    },
  );

  ipcMain.handle(
    "chat:setSessionAgent",
    async (
      _event,
      args: { sessionId: string; agent: "build" | "plan" },
    ) => {
      const sessionId = args.sessionId?.trim();
      if (!sessionId) {
        return { success: false, error: "missing_session_id" };
      }
      try {
        await getService().applySessionAgent(sessionId, args.agent);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  );

  ipcMain.handle(
    "chat:setPlanSuggestDismissed",
    async (
      _event,
      args: { sessionId: string; dismissed: boolean },
    ) => {
      const sessionId = args.sessionId?.trim();
      if (!sessionId) {
        return { success: false, error: "missing_session_id" };
      }
      const { setPlanSuggestDismissed } = await import("../services/plan-suggest-bridge");
      setPlanSuggestDismissed(sessionId, !!args.dismissed);
      return { success: true };
    },
  );

  ipcMain.handle(
    "chat:resolvePlanSuggest",
    async (
      _event,
      args: { sessionId: string; decision: "accepted" | "dismissed" | "timed_out" },
    ) => {
      const sessionId = args.sessionId?.trim();
      if (!sessionId) {
        return { success: false, error: "missing_session_id" };
      }
      const decision = args.decision;
      if (decision !== "accepted" && decision !== "dismissed" && decision !== "timed_out") {
        return { success: false, error: "invalid_decision" };
      }
      const { resolvePlanSuggestConsent } = await import("../services/plan-suggest-bridge");
      return resolvePlanSuggestConsent(sessionId, decision);
    },
  );

  // ─── Send Prompt ───
  ipcMain.handle(
    "chat:send",
    async (
      event,
      args: {
        projectPath: string;
        worktreePath?: string;
        prompt: string;
        tabId?: string;
        sessionId?: string | null;
        model?: string;
        provider?: string;
        apiKey?: string;
        baseUrl?: string;
        thoughtLevel?: string;
        /** Composer `/` MCP tokens — limit tools for this turn. */
        mcpServerAllowlist?: string[];
        /** Composer `/` skill tokens — ensure these skills are enabled. */
        skillIds?: string[];
        /** UI display blocks for this user turn (inline tokens); not sent to the model. */
        userDisplayContent?: Record<string, unknown>[];
        /** Per-tab intensive reading paper IDs — resolved to bibkeys and injected
         *  as a per-turn instruction reminding the agent to use literature-read-pdf. */
        intensivePaperIds?: string[];
        /** Composer includes ```paper …``` excerpt block(s) this turn. */
        hasPaperSnippets?: boolean;
        orchestratorId?: string | null;
        sessionAgent?: "build" | "plan";
        selectedExpertIds?: string[];
        /** Vision images — sent as ACP ContentBlock::Image alongside the text prompt. */
        promptImages?: Array<{ mimeType: string; data: string; name: string; uri?: string }>;
        /** File attachments — ACP ContentBlock::ResourceLink (not inlined into prompt text). */
        promptFiles?: Array<{ uri: string; name: string; mimeType: string; size?: number }>;
      },
    ) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");

      inflightChatSend.set(tabId, {
        cancelled: false,
        sessionId: args.sessionId || "",
        win,
      });
      const isSendCancelled = () => inflightChatSend.get(tabId)?.cancelled === true;
      const finishInflightSend = () => {
        inflightChatSend.delete(tabId);
      };

      try {
      const service = getService();
      const cwd = args.worktreePath || args.projectPath || app.getPath("home");
      const isFirstSend = !args.sessionId;
      const clearPrepare = () => {
        emitChatPrepare(tabId, null);
      };
      // Surface progress immediately — otherwise the UI only shows bare "Thinking…"
      // until the first await below finishes. Every turn gets phase updates,
      // not just the first: subsequent sends also hydrate/MCP-reload/wait.
      emitChatPrepare(tabId, "syncing_project");

      // Build env vars for API keys — passed to opencode process on first init.
      // Catalog providers (go/zen) share OPENCODE_API_KEY and are resolved from
      // settings with a stable preferred provider — do not overlay args.apiKey
      // (that caused false credential restarts when Go ≠ Zen last-wins).
      const extraEnv: Record<string, string> = {};
      if (args.apiKey && !isOpenCodeCatalogProvider(args.provider || "")) {
        extraEnv[providerApiKeyEnvVar(args.provider || "anthropic")] = args.apiKey;
      }
      if (args.baseUrl && !isOpenCodeCatalogProvider(args.provider || "")) {
        const provider = (args.provider || "anthropic").replace(/-/g, "_").toUpperCase();
        extraEnv[`${provider}_BASE_URL`] = args.baseUrl;
      }

      // ── Assemble system prompt (prismnext layers) ──
      // Sync project agents/skills to disk BEFORE ensureConnected so a credential
      // restart (if any) is the last OpenCode spawn — avoids sync→reload→spawn
      // doubling first-send latency after app start.
      const intensivePapers = args.projectPath
        ? resolveIntensivePapers(args.projectPath, args.intensivePaperIds)
        : [];
      const intensiveInstruction = buildIntensiveReadingInstruction(intensivePapers, {
        hasPaperSnippets: args.hasPaperSnippets,
      });
      let userPrompt = intensiveInstruction
        ? `${args.prompt}\n\n${intensiveInstruction}`
        : args.prompt;

      let provider = args.provider || "anthropic";
      let modelId = args.model ? normalizeOpenCodeModelId(provider, args.model) : args.model;
      let thoughtLevel = args.thoughtLevel;
      let orchestratorId: string | undefined;
      let promptCtx = await buildPromptContext(args.projectPath);

      if (args.projectPath) {
        const {
          resolveOrchestratorId,
          getOrchestrator,
          getExpert,
          getOrchestratorRuntimeFilters,
        } = await import("../services/experts-sync");

        orchestratorId = resolveOrchestratorId(args.projectPath, args.orchestratorId);
        const orchestrator = getOrchestrator(args.projectPath, orchestratorId);
        if (orchestrator?.model) {
          const slash = orchestrator.model.indexOf("/");
          if (slash > 0) {
            provider = orchestrator.model.slice(0, slash);
            modelId = orchestrator.model.slice(slash + 1);
          }
        }
        if (orchestrator?.thoughtLevel && !args.thoughtLevel?.trim()) {
          thoughtLevel = orchestrator.thoughtLevel;
        }

        const orchestratorRuleAllowlist = getOrchestratorRuntimeFilters(
          args.projectPath,
          orchestratorId,
        )?.rules;

        promptCtx = await buildPromptContext(args.projectPath, {
          ruleAllowlist: orchestratorRuleAllowlist,
        });

        const { ensureProjectChatPrewarm } = await import("../services/project-chat-prewarm");
        emitChatPrepare(tabId, "syncing_project");
        // If credentials will restart OpenCode next, sync-only here so we don't
        // reload once for agents then again for API keys.
        const credentialRestartPending = getService().wouldRestartForCredentials(
          buildOpenCodeCredentialEnv(extraEnv, {
            preferredCatalogProvider: provider,
          }),
        );
        await ensureProjectChatPrewarm(args.projectPath, {
          skipOpenCodeReload: credentialRestartPending,
        });

        const { refreshProjectExpertsIntegrationIfNeeded } = await import("../services/project-experts-refresh");
        try {
          await refreshProjectExpertsIntegrationIfNeeded(args.projectPath, { promptCtx });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`Experts integration refresh failed: ${message}`);
          clearPrepare();
          win.webContents.send("chat:complete", {
            tabId,
            sessionId: args.sessionId || "",
            success: false,
            error: `Expert configuration could not be synced: ${message}`,
          });
          return;
        }

        const expertIds = args.selectedExpertIds?.filter(Boolean) ?? [];
        if (expertIds.length > 0) {
          const { buildExpertTeamPreamble } = await import("../../shared/expert-team-preamble");
          const entries = expertIds
            .map((id) => getExpert(args.projectPath!, id))
            .filter((e): e is NonNullable<typeof e> => !!e?.enabled)
            .map((e) => ({ id: e.id, name: e.name, description: e.description }));
          const preamble = buildExpertTeamPreamble(entries);
          if (preamble) userPrompt = `${userPrompt}\n\n${preamble}`;
        }

        const filters = getOrchestratorRuntimeFilters(args.projectPath, orchestratorId);
        const orchestratorSkills = filters?.skills;
        const composerSkills = args.skillIds?.filter(Boolean) ?? [];
        const skillAllowlist =
          composerSkills.length > 0
            ? [...new Set([...(orchestratorSkills ?? []), ...composerSkills])]
            : orchestratorSkills;
        const { refreshProjectSkillsIntegrationIfNeeded } = await import("../services/project-skills-refresh");
        await refreshProjectSkillsIntegrationIfNeeded(args.projectPath, {
          profileSkillAllowlist: skillAllowlist,
        });
      } else if (args.projectPath && args.skillIds?.length) {
        const { refreshProjectSkillsIntegrationIfNeeded } = await import("../services/project-skills-refresh");
        await refreshProjectSkillsIntegrationIfNeeded(args.projectPath, {
          profileSkillAllowlist: args.skillIds,
        });
      }

      // Connect / apply credentials last — at most one spawn before session/new.
      try {
        await ensureConnected(extraEnv, provider);
      } catch (err: any) {
        log.error(`OpenCode initialize failed: ${err.message}`);
        clearPrepare();
        win.webContents.send("chat:complete", {
          tabId, sessionId: args.sessionId || "", success: false, error: err.message,
        });
        return;
      }

      const expertsSync = args.projectPath
        ? await import("../services/experts-sync")
        : null;
      const orchestratorMcpAllowlist =
        orchestratorId && args.projectPath && expertsSync
          ? expertsSync.getOrchestratorRuntimeFilters(
              args.projectPath,
              orchestratorId,
            )?.mcpServers
          : undefined;
      // @Expert MCP needs (e.g. literature-synthesizer → paper-search) load this
      // turn only — not at session/new.
      const expertMcpIds: string[] = [];
      if (args.projectPath && expertsSync && args.selectedExpertIds?.length) {
        for (const id of args.selectedExpertIds) {
          const mcps = expertsSync.getExpertRuntimeFilters(args.projectPath, id)?.mcpServers;
          if (mcps?.length) expertMcpIds.push(...mcps);
        }
      }
      const composerMcps = args.mcpServerAllowlist?.filter(Boolean) ?? [];
      const mergedMcp = [...new Set([
        ...(orchestratorMcpAllowlist ?? []),
        ...expertMcpIds,
        ...composerMcps,
      ])];
      const mcpServerAllowlist = mergedMcp.length > 0 ? mergedMcp : undefined;

      const assembledPrompt = promptManager.compose(promptCtx);
      const projectRulesPrompt = promptManager.composeProjectRules(promptCtx);
      const currentFingerprint = promptManager.computePromptFingerprint(promptCtx);
      if (assembledPrompt) {
        log.info(
          `System prompt assembled: ${assembledPrompt.length} chars ` +
          `(stable via OpenCode instructions, rules ${projectRulesPrompt.length})`,
        );
      } else {
        log.warn("Assembled prompt is EMPTY — agent will use OpenCode defaults only");
        win.webContents.send("chat:stream", {
          tabId, type: "system.promptEmpty", data: {},
        });
      }

      let sessionId = args.sessionId;
      let isFirstTurn = false;
      const existingSessionId = args.sessionId;
      if (!sessionId) {
        isFirstTurn = true;
        const model = modelId && provider
          ? formatOpenCodeModelRef(provider, modelId)
          : modelId || undefined;
        try {
          // ACP standard: session/new connects MCP — only when the user sends.
          emitChatPrepare(tabId, "creating_session");
          const session = await service.createSession(
            cwd,
            model,
            args.projectPath,
            { agentId: orchestratorId },
          );
          sessionId = session.id;
          const inflight = inflightChatSend.get(tabId);
          if (inflight) inflight.sessionId = sessionId;
          // Register before sessionCreated / further awaits so early ACP
          // session/update is not treated as an orphan subagent.
          registerTabSession(win, tabId, sessionId, args.projectPath);
          win.webContents.send("chat:sessionCreated", { tabId, sessionId });
        } catch (err: any) {
          log.error(`createSession failed: ${err.message}`);
          clearPrepare();
          finishInflightSend();
          win.webContents.send("chat:complete", {
            tabId, sessionId: "", success: false, error: err.message,
          });
          return;
        }
      }

      const bridge = getMapper(win);
      registerTabSession(win, tabId, sessionId, args.projectPath);
      // @Expert = this turn's Task allowlist + must-invoke (who must be Task'd).
      {
        const expertIds = args.selectedExpertIds?.filter(Boolean) ?? [];
        if (expertIds.length > 0) {
          setSessionTaskAllowlist(sessionId, expertIds);
        } else {
          clearSessionTaskAllowlist(sessionId);
        }
      }
      if (args.projectPath && sessionId) {
        syncIntensiveBibkeysForSession(args.projectPath, sessionId, args.intensivePaperIds);
      }

      const normalizedModelId = modelId
        ? normalizeOpenCodeModelId(provider, modelId)
        : "";
      const validatedEffort = normalizedModelId
        ? service.validateModelEffort(provider, normalizedModelId, thoughtLevel)
        : undefined;
      if (thoughtLevel && !validatedEffort) {
        log.warn(
          `thoughtLevel rejected for ${provider}/${normalizedModelId}: ${thoughtLevel}`,
        );
      }
      // OpenCode rejects the sentinel "default" — omit effort to use the model's implicit default.
      const effortForSend = validatedEffort;

      const sessionAgent = resolveSessionAgent(args.sessionAgent);
      // Plan wins over orchestrator for ACP agent key
      if (sessionAgent === "plan") {
        await service.applySessionAgent(sessionId, "plan");
      } else if (orchestratorId) {
        await service.applySessionAgent(sessionId, "build");
        try {
          await service.setConfigOption(sessionId, "agent", orchestratorId);
        } catch (err: any) {
          log.debug(`setConfigOption agent orchestrator failed: ${err.message}`);
        }
      } else {
        await service.applySessionAgent(sessionId, "build");
      }

      const citationsAppendix = buildSessionCitationsTurnAppendix(sessionId);
      const citeAuditAppendix = buildSessionCiteAuditTurnAppendix(sessionId);
      // Use the resolved sessionId (created above on first turn) — never args.sessionId,
      // or the appendix would literally say drafts/SESSION_ID.md and the model invents names.
      const planModeAppendix =
        sessionAgent === "plan" ? buildPlanModeTurnAppendix(sessionId) : "";
      const planDraftRedirect = service.consumePendingPlanDraftRedirect(sessionId);
      const turnContextAppendix = [
        citationsAppendix,
        citeAuditAppendix,
        planModeAppendix,
        planDraftRedirect
          ? `---\n**System note:** ${planDraftRedirect}\n---`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      if (turnContextAppendix) {
        userPrompt = `${userPrompt}\n\n${turnContextAppendix}`;
      }

      // ── Compute context breakdown for the ring indicator ──
      // Estimate token counts per prompt category (chars / 4 approximation).
      // The "conversation" bucket is computed from OpenCode's reported
      // input_tokens minus system prompt estimates — the difference is the
      // actual chat history that the model sees.
      const sysBreakdown = assembledPrompt
        ? promptManager.estimateTokenBreakdown(promptCtx)
        : {};
      const sysTokensEstimate = Object.values(sysBreakdown).reduce((a, b) => a + b, 0);

      const priorContext = existingSessionId && args.projectPath
        ? loadSessionContext(args.projectPath, existingSessionId)
        : null;
      const promptStale = Boolean(
        existingSessionId
        && priorContext?.promptFingerprint
        && priorContext.promptFingerprint !== currentFingerprint,
      );

      if (args.projectPath) {
        const { syncProjectPromptFile } = await import("../services/prompt-sync");
        const needsPromptSync = isFirstTurn || promptStale || !priorContext?.promptFingerprint;
        if (needsPromptSync) {
          syncProjectPromptFile(args.projectPath, promptCtx);
        }
        const { instructionsChanged } = service.applyProjectPromptIntegration(args.projectPath);
        // Skip reload when we just spawned (credential ensure / prewarm) —
        // the new process already reads instructions from disk.
        if (instructionsChanged && !service.wasSpawnedRecently()) {
          try {
            await service.reloadAfterSkillsIntegration();
          } catch (err: any) {
            log.warn(`OpenCode reload after prompt integration failed: ${err.message}`);
          }
        } else if (instructionsChanged) {
          log.info("Skip OpenCode reload after prompt integration (just spawned)", {
            spawnAgeMs: Date.now() - service.getLastSpawnAtMs(),
          });
        }
      }

      // Phase 1B: if the previous turn denied a builtin-Task delegation on the
      // orchestrator, prepend a one-shot redirect note so the LLM is nudged
      // toward platform tools instead of retrying Task. ACP permission
      // rejections can't carry a reason, so we surface it on the next turn.
      const denialRedirect = service.consumePendingTaskDenial(sessionId);
      if (denialRedirect) {
        userPrompt = `${userPrompt}\n\n---\n**System note:** ${denialRedirect}\n---`;
      }

      log.info(
        `Sending prompt: sessionId=${sessionId} tabId=${tabId} promptLen=${userPrompt.length} ` +
        `promptSync=${isFirstTurn || promptStale} ` +
        `model=${modelId ? formatOpenCodeModelRef(provider, modelId) : "(default)"} ` +
        `effort=${effortForSend ?? "(default)"} ` +
        `provider=${provider}`,
      );
      getMapper(win).clearTurnAccumulators();
      // Drop stale Task-link watchdogs from a prior turn — otherwise a 90s
      // task-link-timeout can abort this new prompt with opaque "Task cancelled".
      // Unlinked Tasks from a prior turn → structured superseded (not opaque cancel).
      getMapper(win).clearPendingTasksForTab(tabId);
      if (!isFirstTurn && args.projectPath) {
        await service.ensureSessionHydrated(sessionId, cwd, args.projectPath);
      }
      if (args.projectPath && sessionId) {
        const wantsMcp = (mcpServerAllowlist?.length ?? 0) > 0;
        if (wantsMcp) emitChatPrepare(tabId, "connecting_mcp");
        await service.ensureSessionMcps(
          sessionId,
          cwd,
          args.projectPath,
          mcpServerAllowlist,
        );
      }
      if (isSendCancelled()) {
        clearPrepare();
        return;
      }
      let usage = null;
      let planDraftMissingThisTurn = false;
      // Set by the turn watchdog's hard-timeout path (declared inside the try
      // below via closure) — hoisted so the catch can skip double-reporting.
      let turnSettledByWatchdog = false;
      let turnSettledByProviderError = false;
      try {
        let resources:
          | Array<
              | { uri: string; mimeType: string; text: string }
              | { uri: string; mimeType: string; blob: string }
            >
          | undefined;
        let attachmentNotes: string[] = [];
        if (args.promptFiles?.length) {
          const { materializePromptFiles } = await import("../services/prompt-file-attachments");
          const materialized = await materializePromptFiles(args.promptFiles);
          attachmentNotes = materialized.notes;
          resources = materialized.blocks.map((b) => b.resource);
          if (resources.length === 0) {
            const reason =
              attachmentNotes.join("；") || "附件无法读取或格式不受支持。";
            win.webContents.send("chat:complete", {
              tabId,
              sessionId: args.sessionId || "",
              success: false,
              error: reason,
            });
            return;
          }
          if (attachmentNotes.length) {
            log.info("prompt file attachment notes", { notes: attachmentNotes });
          }
        }

        let promptForModel = userPrompt;
        if (attachmentNotes.length) {
          promptForModel = [
            userPrompt,
            "",
            "---",
            "**Attachment notes:**",
            ...attachmentNotes.map((n) => `- ${n}`),
            "---",
          ].join("\n");
        }

        const promptOpts = {
          model: modelId ? formatOpenCodeModelRef(provider, modelId) : undefined,
          provider,
          effort: effortForSend,
          cwd,
          projectRoot: args.projectPath,
          projectRulesPrompt: projectRulesPrompt || undefined,
          images: args.promptImages?.map((img) => ({
            mimeType: img.mimeType,
            data: img.data,
            uri: img.uri,
          })),
          resources,
        };

        // After cancel, abort() clears the hydrate cache so sendPrompt's
        // internal session/load re-bind runs. Never mint a replacement
        // session here — interrupt must keep the same session/history.
        emitChatPrepare(tabId, isFirstSend ? "starting_model" : "waiting_model");
        const planDraftBefore =
          sessionAgent === "plan" && args.projectPath && sessionId
            ? snapshotSessionDraftMeta(args.projectPath, sessionId)
            : null;

        // Turn watchdog: OpenCode goes silent on the wire while retrying a
        // failed provider call, and never notifies the client when retries
        // are exhausted. Warn the UI on stall; auto-abort on hard timeout so
        // the turn can never hang forever without feedback.
        const stopWatchdog = service.startTurnWatchdog(sessionId!, {
          onStall: () => {
            emitChatPrepare(tabId, "stalled");
          },
          onProviderError: (message) => {
            // OpenCode keeps quota/rate-limit failures off the ACP wire — surface
            // the log line immediately and abort useless retries.
            turnSettledByProviderError = true;
            clearPrepare();
            win.webContents.send("chat:stream", {
              tabId,
              type: "session.error",
              data: { message },
            });
            void service.abortPrimarySession(sessionId!).catch(() => {});
          },
          onTimeout: (silentMs) => {
            turnSettledByWatchdog = true;
            void service.abortPrimarySession(sessionId!).catch(() => {});
            clearPrepare();
            win.webContents.send("chat:complete", {
              tabId,
              sessionId,
              success: false,
              error: `No response from the model for ${Math.round(silentMs / 1000)}s — the turn was stopped.`,
              errorCode: "turn_timeout",
            });
          },
        });

        let result: Awaited<ReturnType<typeof service.sendPrompt>>;
        try {
          result = await service.sendPrompt(sessionId, promptForModel, promptOpts);
        } finally {
          stopWatchdog();
        }
        if (turnSettledByWatchdog || turnSettledByProviderError) {
          // Watchdog / provider-error path already reported failure; skip the
          // success path that would overwrite it when the aborted prompt resolves.
          // Still attach provider error via complete if the stream event raced.
          if (turnSettledByProviderError && sessionId) {
            const providerError = service.takeSessionProviderError(sessionId);
            if (providerError) {
              win.webContents.send("chat:complete", {
                tabId,
                sessionId,
                success: false,
                error: providerError,
                errorCode: "provider_error",
              });
            }
          }
          return;
        }
        if (isSendCancelled()) return;
        // Model may still be thinking — keep phase until first stream chunk
        // clears it in the renderer. Clear here only on hard failure paths.
        if (planDraftBefore && args.projectPath && sessionId) {
          let planDraftAfter = snapshotSessionDraftMeta(args.projectPath, sessionId);
          if (sessionDraftMetaShowsWrite(planDraftBefore, planDraftAfter)) {
            service.clearPendingPlanDraftRedirect(sessionId);
          } else {
            // Chat-only dump — auto-kick one silent write turn so Plan UI can activate.
            const kickNote = planDraftMissingRedirectNote(sessionId);
            log.warn("Plan turn ended without updating session draft — auto-kicking write", {
              sessionId,
              draft: planDraftAfter.relativePath,
            });
            try {
              await service.sendPrompt(
                sessionId,
                `---\n**System note:** ${kickNote}\n---`,
                promptOpts,
              );
              planDraftAfter = snapshotSessionDraftMeta(args.projectPath, sessionId);
            } catch (kickErr: any) {
              log.warn("Plan draft auto-kick failed", { error: kickErr?.message });
            }
            if (sessionDraftMetaShowsWrite(planDraftBefore, planDraftAfter)) {
              service.clearPendingPlanDraftRedirect(sessionId);
            } else {
              service.setPendingPlanDraftRedirect(sessionId, kickNote);
              planDraftMissingThisTurn = true;
            }
          }
        }
        if (args.userDisplayContent?.length && args.projectPath && sessionId) {
          appendUserDisplay(args.projectPath, sessionId, args.userDisplayContent);
        }
        // ACP PromptResponse.usage (camelCase). Prefer usage_update for the
        // ring; map snake_case for footnotes + breakdown math.
        const acpUsage = (result as any)?.usage;
        if (acpUsage) {
          usage = mapAcpUsageToSnake(acpUsage);
          log.debug("ACP usage mapped", {
            acpUsage: {
              inputTokens: acpUsage.inputTokens,
              outputTokens: acpUsage.outputTokens,
              cachedReadTokens: acpUsage.cachedReadTokens,
              cachedWriteTokens: acpUsage.cachedWriteTokens,
              totalTokens: acpUsage.totalTokens,
            },
            mapped: usage,
          });
        } else {
          log.debug("No usage in PromptResponse — OpenCode/ACP may not support it yet");
        }
      } catch (err: any) {
        if (turnSettledByWatchdog || isSendCancelled()) return;
        const providerError = sessionId
          ? service.takeSessionProviderError(sessionId)
          : undefined;
        if (turnSettledByProviderError && !providerError) return;
        log.error(`sendPrompt failed: ${err.message}`);
        clearPrepare();
        win.webContents.send("chat:complete", {
          tabId,
          sessionId,
          success: false,
          error: providerError || err.message,
          errorCode: providerError ? "provider_error" : undefined,
        });
        return;
      }

      // ── OpenCode ring numbers + optional two-bucket Prism estimate ──
      const inputTokens = (usage as any)?.input_tokens ?? 0;
      const cacheCreation = (usage as any)?.cache_creation_input_tokens ?? 0;
      const cacheRead = (usage as any)?.cache_read_input_tokens ?? 0;
      const reportedTotal = inputTokens + cacheCreation + cacheRead;
      const lastUsageUpdate = getMapper(win).getLastUsageUpdate(sessionId);
      const promptUsed = resolveContextUsedFromPromptUsage(usage);
      const ringUsed =
        lastUsageUpdate && Date.now() - lastUsageUpdate.at < 60_000
          ? lastUsageUpdate.used
          : promptUsed;
      const ringSize =
        lastUsageUpdate && Date.now() - lastUsageUpdate.at < 60_000
          ? lastUsageUpdate.size
          : null;
      const ringSource =
        lastUsageUpdate && Date.now() - lastUsageUpdate.at < 60_000
          ? ("usage_update" as const)
          : promptUsed != null
            ? ("prompt_usage" as const)
            : null;

      // ── Two-bucket estimate (optional UI) ──
      // prism-side: chars/4 of Prism prompts + on-disk skills + mcp.json
      // session-rest: OpenCode used − prism-side (conversation, OC system/tools, cache…)
      // Do NOT invent Agent Base / Messages theater from cacheRead.
      let skillsTokens = 0;
      if (args.projectPath) {
        try {
          const skillsDir = path.join(args.projectPath, ".prismnext", "agent", "skills");
          if (fs.existsSync(skillsDir)) {
            for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
              if (!entry.isDirectory()) continue;
              const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
              if (!fs.existsSync(skillMd)) continue;
              const content = fs.readFileSync(skillMd, "utf-8");
              skillsTokens += Math.max(1, Math.round(content.length / 4));
            }
          }
        } catch { /* best-effort */ }
      }

      let mcpTokens = 0;
      if (args.projectPath) {
        try {
          const mcpPath = path.join(args.projectPath, ".prismnext", "agent", "mcp.json");
          if (fs.existsSync(mcpPath)) {
            const raw = fs.readFileSync(mcpPath, "utf-8");
            mcpTokens = Math.max(1, Math.round(raw.length / 3));
          }
        } catch { /* best-effort */ }
      }

      const prismSideEstimate = sysTokensEstimate + skillsTokens + mcpTokens;
      const breakdownUsed = ringUsed ?? (reportedTotal > 0 ? reportedTotal : 0);
      const fullBreakdown = buildTwoBucketBreakdown(breakdownUsed, prismSideEstimate);

      // Ring numbers: OpenCode only — never invent used from chars/4 estimates.
      const effectiveUsage =
        usage && reportedTotal > 0
          ? usage
          : ringUsed != null
            ? {
                input_tokens: ringUsed,
                output_tokens: (usage as any)?.output_tokens ?? 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                total_tokens: ringUsed,
              }
            : null;

      log.info(`Prompt complete: sessionId=${sessionId} ringUsed=${ringUsed} reportedTotal=${reportedTotal}`, {
        ringSource,
        ringSize,
        categories: Object.keys(fullBreakdown).length,
        samples: Object.fromEntries(
          Object.entries(fullBreakdown).filter(([, v]) => v > 0),
        ),
      });

      // Parent turn can end_turn while a Task is still "pending link" in Prism.
      // Drop that leftover 90s watchdog so it cannot abort the next message.
      getMapper(win).releasePendingTaskWatchdogsForTab(tabId);

      // Persist context — prefer OpenCode ring numbers when available.
      const prevCtx = loadSessionContext(args.projectPath, sessionId);
      persistSessionContext(args.projectPath, sessionId, {
        tokens: ringUsed ?? (reportedTotal > 0 ? reportedTotal : (prevCtx?.tokens ?? 0)),
        windowSize: ringSize ?? prevCtx?.windowSize ?? null,
        source: ringSource ?? prevCtx?.source,
        breakdown: fullBreakdown,
        schema: CONTEXT_CATEGORY_SCHEMA,
        updatedAt: Date.now(),
        hasSystemPromptBlock: false,
        promptFingerprint: currentFingerprint,
      });

      // @ experts must be Task'd (orchestrator must not role-play as them).
      // If a Task is still open at end_turn, defer the nudge until it settles.
      if (!isSendCancelled()) {
        const followUpOpts = {
          tabId,
          model: modelId ? formatOpenCodeModelRef(provider, modelId) : undefined,
          provider,
          cwd,
          projectRoot: args.projectPath,
          effort: effortForSend,
        };
        if (getMapper(win).hasOpenTaskToolsForTab(tabId)) {
          // ACP often skips Timeline-A / inject chunks — settle cards from SQLite now.
          getMapper(win).reconcileOpenBackgroundTasks(tabId);
          deferTaskAllowlistFollowUp(sessionId, followUpOpts);
          log.info(
            `task-allowlist-follow-up: deferred until Tasks settle sessionId=${sessionId}`,
          );
        } else {
          const missing = claimTaskAllowlistFollowUp(sessionId);
          if (missing.length > 0) {
            const followUp = formatTaskError("task_allowlist_not_invoked", {
              allowlist: missing,
            });
            log.info(
              `task-allowlist-follow-up: sessionId=${sessionId} missing=${missing.join(",")}`,
            );
            getMapper(win).clearTurnAccumulators();
            try {
              await service.sendPrompt(sessionId, followUp, followUpOpts);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              log.warn(`task-allowlist-follow-up failed: ${message}`);
            }
            const stillMissing = getSessionMissingTaskAllowlist(sessionId);
            if (stillMissing.length > 0) {
              service.setPendingTaskDenial(
                sessionId,
                formatTaskError("task_allowlist_not_invoked", {
                  allowlist: stillMissing,
                }),
              );
            }
          }
        }
      }

      // Renderer also clears prepare on first stream chunk; clear here so a
      // turn that finishes without visible parts does not leave a stuck label.
      clearPrepare();
      if (isSendCancelled()) return;

      // Background Tasks: parent may end_turn while children still run. OpenCode
      // then injects results and auto-resumes the parent. If we chat:complete now,
      // the renderer sets isStreaming=false and DROPS the resume stream — UI looks
      // finished until the tab is reopened. Hold the turn until joins + resume quiet.
      if (
        !isSendCancelled()
        && getMapper(win).hasBackgroundOpenTasksForTab(tabId)
      ) {
        log.info(
          `deferring chat:complete until background Tasks settle sessionId=${sessionId}`,
        );
        win.webContents.send("chat:stream", {
          tabId,
          type: "turn.awaitingBackground",
          data: { sessionId },
        });
        try {
          await getMapper(win).waitForBackgroundTurnSettle(tabId);
        } catch (err: unknown) {
          log.warn(
            `background turn settle failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
        if (isSendCancelled()) return;
      }

      // OpenCode can resolve a failed provider turn with a bare end_turn and
      // ZERO stream frames — or keep the real error only in opencode.log.
      const emptyTurn = !bridge.hadTurnContent();
      const providerError = sessionId
        ? service.takeSessionProviderError(sessionId)
        : undefined;
      if (providerError) {
        win.webContents.send("chat:complete", {
          tabId,
          sessionId,
          success: false,
          error: providerError,
          errorCode: "provider_error",
          tokenUsage: effectiveUsage,
          contextUsed: ringUsed,
          contextWindowSize: ringSize,
          contextSource: ringSource,
          contextBreakdown: fullBreakdown,
          categorySchema: CONTEXT_CATEGORY_SCHEMA,
          promptStale,
          planDraftMissing: planDraftMissingThisTurn,
        });
      } else if (emptyTurn) {
        win.webContents.send("chat:complete", {
          tabId,
          sessionId,
          success: false,
          errorCode: "emptyTurn",
          tokenUsage: effectiveUsage,
          contextUsed: ringUsed,
          contextWindowSize: ringSize,
          contextSource: ringSource,
          contextBreakdown: fullBreakdown,
          categorySchema: CONTEXT_CATEGORY_SCHEMA,
          promptStale,
          planDraftMissing: planDraftMissingThisTurn,
          emptyTurn: true,
        });
      } else {
        win.webContents.send("chat:complete", {
          tabId,
          sessionId,
          success: true,
          tokenUsage: effectiveUsage,
          contextUsed: ringUsed,
          contextWindowSize: ringSize,
          contextSource: ringSource,
          contextBreakdown: fullBreakdown,
          categorySchema: CONTEXT_CATEGORY_SCHEMA,
          promptStale,
          planDraftMissing: planDraftMissingThisTurn,
        });
      }
      } finally {
        finishInflightSend();
      }
    },
  );

  // ─── Answer Tool Question ───
  ipcMain.handle(
    "chat:answer",
    async (_event, args: { sessionId: string; answer: string }) => {
      await getService().sendAnswer(args.sessionId, args.answer);
    },
  );

  // ─── Answer prism‑question (file‑bridge, not ACP) ───
  // The prism‑question custom tool polls `<userData>/opencode-server/bridges/questions/<id>.answer.json`.
  // This handler writes the user's answer to that file so the blocking tool
  // can read it and return, unblocking the AI conversation.
  ipcMain.handle(
    "chat:answerQuestion",
    async (_event, args: { questionId: string; answer: string }) => {
      const aDir = getQuestionsBridgeRoot();
      const aFile = path.join(aDir, `${args.questionId}.answer.json`);
      try {
        fs.mkdirSync(aDir, { recursive: true });
        fs.writeFileSync(aFile, JSON.stringify({ answer: args.answer }), "utf-8");
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  );

  ipcMain.handle(
    "chat:readPendingQuestion",
    async (_event, args: { sessionId: string }) => {
      const sid = args.sessionId?.trim();
      if (!sid) return { ok: false as const };
      const qFile = path.join(getQuestionsBridgeRoot(), `${sid}.json`);
      try {
        if (!fs.existsSync(qFile)) return { ok: false as const };
        const raw = JSON.parse(fs.readFileSync(qFile, "utf-8")) as {
          question?: string;
          options?: unknown;
          multiSelect?: boolean;
        };
        return {
          ok: true as const,
          question: typeof raw.question === "string" ? raw.question : "",
          options: Array.isArray(raw.options) ? raw.options : [],
          multiSelect: raw.multiSelect === true,
        };
      } catch {
        return { ok: false as const };
      }
    },
  );

  // ─── Cancel ───
  ipcMain.handle(
    "chat:cancel",
    async (
      _event,
      args: {
        sessionId: string;
        /**
         * Abort child Task sessions of `sessionId` only (do not cancel the
         * parent turn). Used when Stop is pressed on a Task before Prism
         * linked the child session id.
         */
        childrenOnly?: boolean;
        /** Skip these child ids (other parallel Tasks still running). */
        excludeSessionIds?: string[];
      },
    ) => {
      const service = getService();

      if (args.childrenOnly) {
        const exclude = new Set(
          (args.excludeSessionIds ?? []).map((id) => id.trim()).filter(Boolean),
        );
        const children = service
          .listChildSessionIds(args.sessionId)
          .filter((id) => !exclude.has(id));
        for (const childId of children) {
          cancelAiCommandForSession(childId);
          service.releaseSessionPendingWork(childId);
          await service.abortSubAgentSession(childId);
        }
        log.info("chat:cancel childrenOnly", {
          parent: args.sessionId,
          aborted: children.length,
        });
        return { aborted: children };
      }

      cancelAiCommandForSession(args.sessionId);
      service.releaseSessionPendingWork(args.sessionId);

      for (const [tabId, inflight] of inflightChatSend.entries()) {
        if (inflight.sessionId !== args.sessionId) continue;
        inflight.cancelled = true;
        emitChatPrepare(tabId, null);
        inflight.win.webContents.send("chat:complete", {
          tabId,
          sessionId: args.sessionId,
          success: false,
          error: "Cancelled",
          errorCode: "cancelled",
        });
        break;
      }

      // Whole-turn cancel: abort the parent orchestrator (never used by Task Stop).
      await service.abortPrimarySession(args.sessionId);
      return { aborted: [args.sessionId] };
    },
  );

  /**
   * User Stop on a Task run panel (two-phase):
   * 1) Freeze panel + abort child via HTTP (never ACP-cancel / abort parent)
   * 2) Await parent Task tool_result rewrite to user_cancel (settlement truth)
   */
  ipcMain.handle(
    "chat:stopSubAgent",
    async (
      event,
      args: {
        parentSessionId: string;
        taskToolUseId: string;
        subSessionId?: string;
        message: string;
        excludeSessionIds?: string[];
      },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const service = getService();
      const parentSessionId = args.parentSessionId?.trim();
      const taskToolUseId = args.taskToolUseId?.trim();
      const message = args.message?.trim();
      if (!parentSessionId || !taskToolUseId || !message) {
        return { ok: false as const, settled: false, aborted: [] as string[], error: "missing_args" };
      }

      const mapper = win ? getMapper(win) : null;
      if (!mapper) {
        return { ok: false as const, settled: false, aborted: [] as string[], error: "abort_failed" };
      }
      // Freeze panel stream + keep userStopped until Task tool_result rewrite.
      const linkedChild = mapper.freezeUserStoppedSubAgent(taskToolUseId);
      const isBackground = mapper.isBackgroundOpenTask(taskToolUseId);

      // Background: parent Task tool already settled on "started" — do not wait
      // for a second tool_result. Abort child, then complete locally.
      if (isBackground) {
        const exclude = new Set(
          (args.excludeSessionIds ?? []).map((id) => id.trim()).filter(Boolean),
        );
        const collectCandidates = (): Set<string> => {
          const next = new Set<string>();
          const hint = args.subSessionId?.trim();
          if (hint) next.add(hint);
          if (linkedChild) next.add(linkedChild);
          const resolved = service.resolveChildSessionForTask(
            parentSessionId,
            taskToolUseId,
            hint,
          );
          if (resolved) next.add(resolved);
          if (next.size === 0) {
            for (const id of service.listChildSessionIds(parentSessionId)) {
              if (!exclude.has(id)) next.add(id);
            }
          }
          next.delete(parentSessionId);
          for (const id of exclude) next.delete(id);
          return next;
        };

        let candidates = collectCandidates();
        for (let attempt = 0; attempt < 5 && candidates.size === 0; attempt++) {
          await new Promise((r) => setTimeout(r, 200));
          candidates = collectCandidates();
        }

        const aborted: string[] = [];
        let anyAbortOk = false;
        for (const childId of candidates) {
          cancelAiCommandForSession(childId);
          service.releaseSessionPendingWork(childId);
          const result = await service.abortSubAgentSession(childId);
          if (result.ok) {
            anyAbortOk = true;
            aborted.push(childId);
          } else {
            log.warn("chat:stopSubAgent child abort failed", {
              childId,
              error: result.error ?? "abort_failed",
            });
          }
        }

        if (candidates.size === 0 || !anyAbortOk) {
          log.warn("chat:stopSubAgent background abort_failed", {
            parent: parentSessionId,
            taskToolUseId,
            candidates: [...candidates],
          });
          return {
            ok: false as const,
            settled: false,
            aborted,
            error: "abort_failed" as const,
          };
        }

        mapper.completeBackgroundTaskUserCancel(taskToolUseId, message);
        log.info("chat:stopSubAgent background", {
          parent: parentSessionId,
          taskToolUseId,
          linkedChild: linkedChild ?? null,
          aborted,
          settled: true,
        });
        return { ok: true as const, settled: true, aborted };
      }

      // Sync: Register settlement waiter BEFORE abort — OpenCode may finish the
      // parent Task immediately after HTTP abort (race if we wait afterward).
      const settlement = mapper.waitForUserStoppedTaskSettlement(taskToolUseId);

      const exclude = new Set(
        (args.excludeSessionIds ?? []).map((id) => id.trim()).filter(Boolean),
      );
      const collectCandidates = (): Set<string> => {
        const next = new Set<string>();
        const hint = args.subSessionId?.trim();
        if (hint) next.add(hint);
        if (linkedChild) next.add(linkedChild);
        const resolved = service.resolveChildSessionForTask(
          parentSessionId,
          taskToolUseId,
          hint,
        );
        if (resolved) next.add(resolved);
        if (next.size === 0) {
          for (const id of service.listChildSessionIds(parentSessionId)) {
            if (!exclude.has(id)) next.add(id);
          }
        }
        // Never abort the parent orchestrator from Task Stop.
        next.delete(parentSessionId);
        for (const id of exclude) next.delete(id);
        return next;
      };

      // Child session may not be in SQLite yet when Stop is pressed early.
      let candidates = collectCandidates();
      for (let attempt = 0; attempt < 5 && candidates.size === 0; attempt++) {
        await new Promise((r) => setTimeout(r, 200));
        candidates = collectCandidates();
      }

      const aborted: string[] = [];
      let anyAbortOk = false;
      for (const childId of candidates) {
        cancelAiCommandForSession(childId);
        service.releaseSessionPendingWork(childId);
        const result = await service.abortSubAgentSession(childId);
        if (result.ok) {
          anyAbortOk = true;
          aborted.push(childId);
        } else {
          log.warn("chat:stopSubAgent child abort failed", {
            childId,
            error: result.error ?? "abort_failed",
          });
        }
      }

      if (candidates.size === 0 || !anyAbortOk) {
        mapper.cancelUserStoppedSettlement(taskToolUseId, "abort_failed");
        void settlement.catch(() => {});
        log.warn("chat:stopSubAgent abort_failed", {
          parent: parentSessionId,
          taskToolUseId,
          candidates: [...candidates],
        });
        return {
          ok: false as const,
          settled: false,
          aborted,
          error: "abort_failed" as const,
        };
      }

      // Best-effort pre-write only — not the completion signal.
      void service
        .patchSessionToolOutput(parentSessionId, taskToolUseId, message)
        .catch(() => {});

      let settled = false;
      try {
        await settlement;
        settled = true;
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: unknown }).code)
            : "abort_failed";
        log.warn("chat:stopSubAgent settlement failed", {
          parent: parentSessionId,
          taskToolUseId,
          code,
        });
        return {
          ok: false as const,
          settled: false,
          aborted,
          error: "abort_failed" as const,
        };
      }

      log.info("chat:stopSubAgent", {
        parent: parentSessionId,
        taskToolUseId,
        linkedChild: linkedChild ?? null,
        aborted,
        settled,
      });
      return { ok: true as const, settled, aborted };
    },
  );

  /** Hydrate Task run-panel blocks from OpenCode SQLite (history sessions). */
  ipcMain.handle(
    "chat:getSubAgentActivity",
    async (
      _event,
      args: {
        parentSessionId: string;
        taskToolUseId: string;
        subSessionId?: string;
      },
    ) => {
      return getService().getSubAgentActivityForTask(args);
    },
  );

  // ─── Compact ───
  // Trigger OpenCode's native compaction agent to summarize old messages
  // and free context token space. Sends the literal "/compact" command
  // through session/prompt so OpenCode's compaction agent takes over.
  ipcMain.handle(
    "chat:compact",
    async (_event, args: { sessionId: string; projectPath: string }) => {
      await getService().sendCompact(args.sessionId, args.projectPath);
      clearSessionContextUsage(args.projectPath, args.sessionId);
      const tabId = resolveChatTabId(args.sessionId);
      if (tabId) {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send("chat:stream", {
            tabId,
            type: "session.usage",
            data: {
              used: null,
              size: null,
              source: null,
              cleared: true,
            },
          });
        }
      }
      return { ok: true as const };
    },
  );

  // ─── Permission Answer ───
  ipcMain.handle(
    "chat:answerPermission",
    async (
      _event,
      args: {
        permissionId: string;
        approved: boolean;
        toolCallId?: string;
        always?: boolean;
      },
    ) => {
      await getService().answerPermission(args.permissionId, args.approved, args.toolCallId, {
        always: args.always,
      });
    },
  );

  // ─── Pre-warm ───
  // Industry model: warm ACP + project config (skills/experts/prompts).
  // Do NOT mint empty sessions — session/new happens on first chat:send.
  ipcMain.handle(
    "chat:prewarm",
    async (_event, args: { projectPath?: string }) => {
      try {
        await ensureConnected();
        if (args.projectPath) {
          const { ensureProjectChatPrewarm } = await import("../services/project-chat-prewarm");
          await ensureProjectChatPrewarm(args.projectPath);
          const { commandRegistry } = await import("../commands/registry");
          commandRegistry.setProjectRoot(args.projectPath);
          commandRegistry.reload();
          const { emitAgentStatusChanged } = await import("../services/agent-status-notify");
          emitAgentStatusChanged(getService().getStatusSnapshot(args.projectPath));
        }
        return { ok: true as const };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`OpenCode pre-warm failed: ${message}`);
        if (args.projectPath) {
          try {
            const { emitAgentStatusChanged } = await import("../services/agent-status-notify");
            emitAgentStatusChanged(getService().getStatusSnapshot(args.projectPath));
          } catch { /* ignore */ }
        }
        return { ok: false as const, error: message };
      }
    },
  );

  // ─── Status ───
  // available === ACP connected+healthy only (never binary-on-disk alone).
  ipcMain.handle(
    "chat:status",
    async (_event, args?: { projectPath?: string }) => {
      const service = getService();
      const snap = service.getStatusSnapshot(args?.projectPath);
      if (snap.available) {
        const health = await service.healthCheck();
        return {
          ...snap,
          available: health.healthy,
          phase: health.healthy ? "ready" : "error",
          version: health.version || snap.version,
          error: health.healthy ? null : (snap.error || "Agent health check failed"),
        };
      }
      return snap;
    },
  );

  // Retry ACP spawn after failure (status-dot Retry).
  ipcMain.handle(
    "chat:ensureAgent",
    async (_event, args?: { projectPath?: string }) => {
      try {
        await ensureConnected();
        if (args?.projectPath) {
          const {
            ensureProjectChatPrewarm,
            invalidateProjectChatPrewarm,
            getProjectWarmPhase,
          } = await import("../services/project-chat-prewarm");
          if (getProjectWarmPhase(args.projectPath) === "error") {
            invalidateProjectChatPrewarm(args.projectPath);
          }
          await ensureProjectChatPrewarm(args.projectPath);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`chat:ensureAgent failed: ${message}`);
      }
      return getService().getStatusSnapshot(args?.projectPath);
    },
  );

  // ─── Session Management ───

  ipcMain.handle("session:list", async (_event, args: { projectPath?: string }) => {
    const service = getService();
    if (!service.getConnection()) {
      try {
        await service.initialize();
      } catch (err: any) {
        log.warn(`session:list — OpenCode not available: ${err.message}`);
        return [];
      }
    }
    if (args.projectPath) {
      return await service.listProjectSessions(args.projectPath);
    }
    return await service.listSessions(args.projectPath);
  });

  ipcMain.handle(
    "session:load",
    async (_event, args: { sessionId: string; projectPath?: string; cwd?: string }) => {
      const service = getService();
      if (!service.getConnection()) {
        try {
          await service.initialize();
        } catch (err: any) {
          throw new Error(`Cannot load session: OpenCode is not available — ${err.message}`);
        }
      }
      const cwd = args.cwd || args.projectPath || "";
      const messages = await service.getMessages(args.sessionId, cwd, args.projectPath);

      // UI history only — read SQLite. Do NOT session/load here: OpenCode replays
      // completed tool_call_update events and would re-trigger bash permission gates.

      return messages;
    },
  );

  ipcMain.handle(
    "session:loadWindow",
    async (
      _event,
      args: {
        sessionId: string;
        projectPath?: string;
        cwd?: string;
        offset: number;
        limit: number;
      },
    ) => {
      const service = getService();
      if (!service.getConnection()) {
        try {
          await service.initialize();
        } catch (err: any) {
          throw new Error(`Cannot load session: OpenCode is not available — ${err.message}`);
        }
      }
      const cwd = args.cwd || args.projectPath || "";
      return await service.getMessagesWindow(
        args.sessionId,
        cwd,
        args.projectPath,
        args.offset,
        args.limit,
      );
    },
  );


  ipcMain.handle("session:getDirectory", async (_event, args: { sessionId: string }) => {
    const service = getService();
    if (!service.getConnection()) {
      try {
        await service.initialize();
      } catch {
        return null;
      }
    }
    return await service.getSessionDirectory(args.sessionId);
  });

  ipcMain.handle(
    "session:rename",
    async (_event, args: { tabId: string; title: string; sessionId: string }) => {
      if (
        !args ||
        typeof args.tabId !== "string" ||
        typeof args.title !== "string" ||
        typeof args.sessionId !== "string" ||
        !args.sessionId
      ) {
        throw new Error(
          "session:rename requires { tabId: string; title: string; sessionId: string }",
        );
      }
      const service = getService();
      if (!service.getConnection()) {
        try {
          await service.initialize();
        } catch (err: any) {
          throw new Error(
            `Cannot rename session: OpenCode is not available — ${err.message}`,
          );
        }
      }
      await service.renameSession(args.sessionId, args.title);
    },
  );

  ipcMain.handle(
    "session:reassignDirectory",
    async (_event, args: { fromDirectory: string; toDirectory: string }) => {
      const service = getService();
      if (!service.getConnection()) {
        try {
          await service.initialize();
        } catch {
          return 0;
        }
      }
      return await service.reassignSessionsDirectory(args.fromDirectory, args.toDirectory);
    },
  );

  ipcMain.handle(
    "session:delete",
    async (_event, args: { sessionId: string; projectPath?: string }) => {
      sessionTruncationBackups.delete(args.sessionId);
      if (args.projectPath) {
        deleteSessionDisplays(args.projectPath, args.sessionId);
      }
      return await getService().deleteSession(args.sessionId);
    },
  );

  ipcMain.handle(
    "session:truncateToTurn",
    async (
      _event,
      args: {
        sessionId: string;
        projectPath: string;
        worktreePath?: string;
        turnIndex: number;
      },
    ) => {
      const service = getService();
      try {
        await ensureConnected();
      } catch (err: any) {
        throw new Error(`Cannot truncate session: OpenCode is not available — ${err.message}`);
      }

      const backup = await service.backupSessionMessages(args.sessionId);
      sessionTruncationBackups.set(args.sessionId, backup);
      if (args.projectPath) {
        const backup = getSessionDisplayBackup(args.projectPath, args.sessionId);
        if (backup) sessionDisplayBackups.set(args.sessionId, backup);
      }

      const result = await service.truncateSessionToTurn(args.sessionId, args.turnIndex);
      const cwd = args.worktreePath || args.projectPath || "";
      await service.initSession(args.sessionId, cwd);
      if (args.projectPath) {
        truncateUserDisplays(args.projectPath, args.sessionId, args.turnIndex + 1);
      }

      log.info(`Session truncated: sessionId=${args.sessionId} turnIndex=${args.turnIndex} removed=${result.removedCount}`);
      return result;
    },
  );

  ipcMain.handle(
    "session:undoTruncate",
    async (
      _event,
      args: {
        sessionId: string;
        projectPath: string;
        worktreePath?: string;
      },
    ) => {
      const backup = sessionTruncationBackups.get(args.sessionId);
      if (!backup) {
        throw new Error("No session backup available for undo");
      }

      const displayBackup = sessionDisplayBackups.get(args.sessionId);

      const service = getService();
      await service.restoreSessionFromBackup(backup);
      sessionTruncationBackups.delete(args.sessionId);
      sessionDisplayBackups.delete(args.sessionId);

      if (displayBackup && args.projectPath) {
        restoreSessionDisplayEntry(args.projectPath, args.sessionId, displayBackup);
      }

      const cwd = args.worktreePath || args.projectPath || "";
      await service.initSession(args.sessionId, cwd);

      log.info(`Session restore undone: sessionId=${args.sessionId}`);
      return { success: true };
    },
  );

  // ─── Session Context ───
  ipcMain.handle(
    "session:getContext",
    async (_event, args: { projectPath: string; sessionId: string }) => {
      return loadSessionContext(args.projectPath, args.sessionId);
    },
  );

  ipcMain.handle(
    "session:getUserDisplays",
    async (_event, args: { projectPath: string; sessionId: string }) => {
      return getUserDisplays(args.projectPath, args.sessionId);
    },
  );

  ipcMain.handle(
    "session:appendUserDisplay",
    async (
      _event,
      args: { projectPath: string; sessionId: string; content: UserDisplayContent },
    ) => {
      appendUserDisplay(args.projectPath, args.sessionId, args.content);
      return { success: true };
    },
  );

  ipcMain.handle(
    "session:getPlanEvents",
    async (_event, args: { projectPath: string; sessionId: string }) => {
      return getPlanEvents(args.projectPath, args.sessionId);
    },
  );

  ipcMain.handle(
    "session:getTurnMetas",
    async (_event, args: { projectPath: string; sessionId: string }) => {
      return getTurnMetas(args.projectPath, args.sessionId);
    },
  );

  ipcMain.handle(
    "session:upsertTurnMeta",
    async (
      _event,
      args: {
        projectPath: string;
        sessionId: string;
        turnIndex: number;
        meta: SessionTurnMeta;
      },
    ) => {
      upsertTurnMeta(args.projectPath, args.sessionId, args.turnIndex, args.meta);
      return { success: true };
    },
  );

  ipcMain.handle(
    "session:upsertPlanArtifact",
    async (
      _event,
      args: {
        projectPath: string;
        sessionId: string;
        event: Extract<PlanUiEvent, { kind: "plan-artifact" }>;
      },
    ) => {
      upsertPlanArtifactEvent(args.projectPath, args.sessionId, args.event);
      return { success: true };
    },
  );

  ipcMain.handle(
    "session:appendPlanDecision",
    async (
      _event,
      args: {
        projectPath: string;
        sessionId: string;
        event: Extract<PlanUiEvent, { kind: "plan-decision" }>;
      },
    ) => {
      appendPlanDecisionEvent(args.projectPath, args.sessionId, args.event);
      return { success: true };
    },
  );

  ipcMain.handle(
    "session:markPlanArtifactDiscarded",
    async (_event, args: { projectPath: string; sessionId: string }) => {
      markLatestPlanArtifactDiscarded(args.projectPath, args.sessionId);
      return { success: true };
    },
  );

  ipcMain.handle(
    "chat:describeImages",
    async (
      _event,
      args: {
        providerId: string;
        modelId: string;
        images: Array<{ name: string; mimeType: string; data: string; uri?: string }>;
      },
    ) => {
      const { describeImagesWithVisionFallback } = await import("../services/vision-fallback");
      return {
        descriptions: await describeImagesWithVisionFallback(
          args.providerId,
          args.modelId,
          args.images,
        ),
      };
    },
  );

  // ─── Config ───
  ipcMain.handle("chat:getProviders", async () => {
    return await getService().getProviders();
  });

  ipcMain.handle("chat:getEffortCatalog", async () => {
    const service = getService();
    await effortCatalog.ensureFresh(() => service.refreshEffortCatalog());
    return service.getEffortCatalogSnapshot();
  });

  ipcMain.handle("chat:getOpenCodeModelsCatalog", async () => {
    const service = getService();
    await effortCatalog.ensureFresh(() => service.refreshEffortCatalog());
    return service.getOpenCodeModelsCatalogSnapshot();
  });

  ipcMain.handle(
    "chat:fetchProviderModels",
    async (
      _event,
      args: { providerId: string; apiKey?: string; baseUrl?: string } | undefined,
    ) => {
      const providerId = args?.providerId?.trim() ?? "";
      return await getService().fetchProviderModels(
        providerId,
        args?.apiKey,
        args?.baseUrl,
      );
    },
  );

  ipcMain.handle(
    "chat:fetchOpenRouterModels",
    async (
      _event,
      args: { apiKey?: string; baseUrl?: string } | undefined,
    ) => {
      return await getService().fetchProviderModels(
        "openrouter",
        args?.apiKey,
        args?.baseUrl,
      );
    },
  );

  ipcMain.handle(
    "chat:getModelEffort",
    async (
      _event,
      args: { provider: string; modelId: string; fallback?: string[] },
    ) => {
      const service = getService();
      await effortCatalog.ensureFresh(() => service.refreshEffortCatalog());
      const modelId = normalizeOpenCodeModelId(args.provider, args.modelId);
      return service.resolveModelEffort(args.provider, modelId, args.fallback);
    },
  );

  ipcMain.handle(
    "chat:setAuth",
    async (_event, args: { provider: string; credentials: Record<string, string> }) => {
      await getService().setAuth(args.provider, args.credentials);
      effortCatalog.clear();
      void getService().refreshEffortCatalog().catch(() => {});
      return { success: true };
    },
  );

  // ─── Test Provider Connection ───
  ipcMain.handle(
    "chat:testConnection",
    async (_event, args: { provider: string; apiKey: string; baseUrl?: string }) => {
      const service = getService();
      return await service.testConnection(args.provider, args.apiKey, args.baseUrl);
    },
  );
}

export function disposeChat(): void {
  for (const mapper of mappers.values()) {
    mapper.stop();
  }
  mappers.clear();
}
