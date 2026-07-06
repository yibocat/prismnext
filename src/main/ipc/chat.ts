import * as path from "node:path";
import * as fs from "node:fs";
import { ipcMain, BrowserWindow, app } from "electron";
import { AcpService } from "../acp/service";
import type { SessionMessageBackup } from "../acp/service";
import { EventMapper } from "../acp/event-mapper";
import { createLogger } from "../services/logger";
import { promptManager } from "../prompts";
import { buildPromptContext } from "../prompts/context";
import { CONTEXT_CATEGORY_SCHEMA } from "../services/context-constants";
import {
  appendUserDisplay,
  deleteSessionDisplays,
  getUserDisplays,
  restoreUserDisplays,
  truncateUserDisplays,
  type UserDisplayContent,
} from "../services/session-display-store";
import { cancelAiCommandForSession } from "../services/ai-pty";
import { setSessionProjectRoot, setSessionIntensiveBibkeys } from "../services/chat-session-registry";
import { getPaper } from "../services/literature-service";
import {
  buildIntensiveReadingInstruction,
  type IntensivePaper,
} from "../prompts/per-turn/intensive-reading";
import { buildSessionCitationsTurnAppendix } from "../services/session-citations-context";
import { buildSessionCiteAuditTurnAppendix } from "../services/session-cite-audit-context";
import { getQuestionsBridgeRoot } from "../services/prism-bridge-paths";

const log = createLogger("chat-ipc", "agent");

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
const sessionDisplayBackups = new Map<string, UserDisplayContent[]>();

// ── Session context persistence ──────────────────────────────────

interface SessionContextData {
  tokens: number;
  breakdown: Record<string, number>;
  schema: { key: string; label: string; color: string; description?: string; order?: number }[];
  updatedAt: number;
  /** Fingerprint of stable system file content (OpenCode instructions). */
  promptFingerprint?: string;
  /** @deprecated Legacy flag — stable system no longer uses user content blocks. */
  hasSystemPromptBlock?: boolean;
}

function contextStorePath(projectRoot: string): string {
  return path.join(projectRoot, ".prismnext", "agent", "sessions-context.json");
}

function persistSessionContext(
  projectRoot: string,
  sessionId: string,
  data: SessionContextData,
): void {
  if (!projectRoot) return;
  try {
    const storePath = contextStorePath(projectRoot);
    let store: Record<string, SessionContextData> = {};
    if (fs.existsSync(storePath)) {
      store = JSON.parse(fs.readFileSync(storePath, "utf-8"));
    }
    store[sessionId] = data;
    // Prune entries older than 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [id, entry] of Object.entries(store)) {
      if (entry.updatedAt < cutoff) delete store[id];
    }
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
    log.debug(`Context persisted for session ${sessionId}`);
  } catch (err) {
    log.warn(`Failed to persist session context: ${(err as Error).message}`);
  }
}

function loadSessionContext(
  projectRoot: string,
  sessionId: string,
): SessionContextData | null {
  if (!projectRoot) return null;
  try {
    const storePath = contextStorePath(projectRoot);
    if (!fs.existsSync(storePath)) return null;
    const store = JSON.parse(fs.readFileSync(storePath, "utf-8"));
    return store[sessionId] ?? null;
  } catch {
    return null;
  }
}

/** Map provider IDs to the env var names OpenCode expects. */
function providerEnvKey(provider: string): string {
  const overrides: Record<string, string> = {
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
  };
  return overrides[provider.toLowerCase()] || `${provider.toUpperCase()}_API_KEY`;
}

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
 * extraEnv (API keys etc.) is passed through to opencode on first init;
 * subsequent calls are no-ops since the process is already running.
 */
async function ensureConnected(extraEnv?: Record<string, string>): Promise<void> {
  const service = getService();
  if (!service.getConnection()) {
    await service.initialize(extraEnv);
  }
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
        selectedExpertIds?: string[];
      },
    ) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");

      const service = getService();
      const cwd = args.worktreePath || args.projectPath || app.getPath("home");

      // Build env vars for API keys — passed to opencode process on first init
      const extraEnv: Record<string, string> = {};
      if (args.apiKey) {
        const envKey = providerEnvKey(args.provider || "anthropic");
        extraEnv[envKey] = args.apiKey;
      }
      if (args.baseUrl) {
        const provider = (args.provider || "anthropic").toUpperCase();
        extraEnv[`${provider}_BASE_URL`] = args.baseUrl;
      }

      // Auto-reconnect if process died (app-level ACP, normally already running).
      // Pass extraEnv so API keys reach the opencode process on first init.
      try {
        await ensureConnected(extraEnv);
      } catch (err: any) {
        log.error(`OpenCode initialize failed: ${err.message}`);
        win.webContents.send("chat:complete", {
          tabId, sessionId: args.sessionId || "", success: false, error: err.message,
        });
        return;
      }

      // ── Assemble system prompt (Prism layers) ──
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
      let modelId = args.model;
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
        if (orchestrator?.thoughtLevel) thoughtLevel = orchestrator.thoughtLevel;

        const orchestratorRuleAllowlist = getOrchestratorRuntimeFilters(
          args.projectPath,
          orchestratorId,
        )?.rules;

        promptCtx = await buildPromptContext(args.projectPath, {
          ruleAllowlist: orchestratorRuleAllowlist,
        });

        const { refreshProjectExpertsIntegration } = await import("../services/project-experts-refresh");
        try {
          await refreshProjectExpertsIntegration(args.projectPath, { promptCtx });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`Experts integration refresh failed: ${message}`);
          win.webContents.send("chat:complete", {
            tabId,
            sessionId: args.sessionId || "",
            success: false,
            error: `Expert configuration could not be synced: ${message}`,
          });
          return;
        }

        // Experts sync is write-only; re-ensure ACP after any concurrent reload paths.
        await ensureConnected(extraEnv);

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
        const { refreshProjectSkillsIntegration } = await import("../services/project-skills-refresh");
        await refreshProjectSkillsIntegration(args.projectPath, {
          profileSkillAllowlist: skillAllowlist,
        });
      } else if (args.projectPath && args.skillIds?.length) {
        const { refreshProjectSkillsIntegration } = await import("../services/project-skills-refresh");
        await refreshProjectSkillsIntegration(args.projectPath, {
          profileSkillAllowlist: args.skillIds,
        });
      }

      const orchestratorMcpAllowlist =
        orchestratorId && args.projectPath
          ? (await import("../services/experts-sync")).getOrchestratorRuntimeFilters(
              args.projectPath,
              orchestratorId,
            )?.mcpServers
          : undefined;
      const composerMcps = args.mcpServerAllowlist?.filter(Boolean) ?? [];
      const mcpServerAllowlist =
        composerMcps.length > 0
          ? [...new Set([...(orchestratorMcpAllowlist ?? []), ...composerMcps])]
          : orchestratorMcpAllowlist;

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
          ? `${provider}/${modelId}`
          : modelId || undefined;
        const session = await service.createSession(
          cwd,
          model,
          args.projectPath,
          {
            mcpServerAllowlist: mcpServerAllowlist?.length ? mcpServerAllowlist : undefined,
            agentId: orchestratorId,
          },
        );
        sessionId = session.id;
        win.webContents.send("chat:sessionCreated", { tabId, sessionId });
      } else if (sessionId && composerMcps.length > 0 && args.projectPath) {
        await service.reloadSessionMcps(
          sessionId,
          cwd,
          args.projectPath,
          mcpServerAllowlist ?? composerMcps,
        );
      }

      const bridge = getMapper(win);
      registerTabSession(win, tabId, sessionId, args.projectPath);
      if (args.projectPath && sessionId) {
        syncIntensiveBibkeysForSession(args.projectPath, sessionId, args.intensivePaperIds);
      }

      // Set thought level if specified via ACP session/set_config_option.
      if (thoughtLevel) {
        try {
          await service.setConfigOption(sessionId, "thought_level", thoughtLevel);
        } catch (err: any) {
          log.debug(`setConfigOption thought_level not supported by this OpenCode version: ${err.message}`);
        }
      }

      if (orchestratorId) {
        try {
          await service.setConfigOption(sessionId, "agent", orchestratorId);
        } catch (err: any) {
          log.debug(`setConfigOption agent not supported by this OpenCode version: ${err.message}`);
        }
      }

      const citationsAppendix = buildSessionCitationsTurnAppendix(sessionId);
      const citeAuditAppendix = buildSessionCiteAuditTurnAppendix(sessionId);
      const turnContextAppendix = [citationsAppendix, citeAuditAppendix].filter(Boolean).join("\n\n");
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
        if (instructionsChanged) {
          try {
            await service.reloadAfterSkillsIntegration();
          } catch (err: any) {
            log.warn(`OpenCode reload after prompt integration failed: ${err.message}`);
          }
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
        `promptSync=${isFirstTurn || promptStale}`,
      );
      getMapper(win).clearTurnAccumulators();
      if (!isFirstTurn && args.projectPath) {
        await service.ensureSessionHydrated(sessionId, cwd, args.projectPath);
      }
      let usage = null;
      try {
        const result = await service.sendPrompt(sessionId, userPrompt, {
          model: modelId,
          provider,
          projectRulesPrompt: projectRulesPrompt || undefined,
        });
        if (args.userDisplayContent?.length && args.projectPath && sessionId) {
          appendUserDisplay(args.projectPath, sessionId, args.userDisplayContent);
        }
        // ACP PromptResponse.usage uses camelCase: { inputTokens, outputTokens, ... }
        // Map to snake_case for backward compat with renderer token formatting
        const acpUsage = (result as any)?.usage;
        if (acpUsage) {
          usage = {
            input_tokens: acpUsage.inputTokens ?? 0,
            output_tokens: acpUsage.outputTokens ?? 0,
            cache_creation_input_tokens: acpUsage.cachedWriteTokens ?? 0,
            cache_read_input_tokens: acpUsage.cachedReadTokens ?? 0,
          };
          log.debug("ACP usage mapped", { acpUsage: { inputTokens: acpUsage.inputTokens, outputTokens: acpUsage.outputTokens, cachedReadTokens: acpUsage.cachedReadTokens, cachedWriteTokens: acpUsage.cachedWriteTokens }, mapped: usage });
        } else {
          log.debug("No usage in PromptResponse — OpenCode/ACP may not support it yet");
        }
      } catch (err: any) {
        log.error(`sendPrompt failed: ${err.message}`);
        win.webContents.send("chat:complete", {
          tabId, sessionId, success: false, error: err.message,
        });
        return;
      }

      // ── Build categorized breakdown ──
      // Categories (sum MUST equal totalUsed):
      //   1-4: Prism system prompt layers (chars/4 estimate)
      //   5:   Skills — .prismnext/agent/skills/ (file sizes / 4)
      //   6:   MCP Tools — .prismnext/agent/mcp.json config
      //   7:   Agent Base — OpenCode's own built-in prompt + tool defs +
      //        any conversation content cached beyond what Prism tracks
      //   8:   Messages — actual conversation tokens (remainder)
      //
      //   Formula: totalUsed = sum(sysBreakdown) + skills + mcpTools + agentBase + messages
      //
      //   On turn 1: cacheRead=0 so agentBase=0; messages = totalUsed - knownStatic.
      //     This avoids double-counting: system prompt is counted in sysBreakdown,
      //     not duplicated in messages (which would happen with inputTokens+cacheCreation).
      //   On later turns: cacheRead grows as OpenCode caches more conversation;
      //     agentBase = cacheRead - knownStatic captures the cached portion beyond
      //     what Prism explicitly tracks.
      const inputTokens = (usage as any)?.input_tokens ?? 0;
      const cacheCreation = (usage as any)?.cache_creation_input_tokens ?? 0;
      const cacheRead = (usage as any)?.cache_read_input_tokens ?? 0;
      const reportedTotal = inputTokens + cacheCreation + cacheRead;

      // ── Estimate Skills tokens ──
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

      // ── Estimate MCP Tools tokens ──
      let mcpTokens = 0;
      if (args.projectPath) {
        try {
          const mcpPath = path.join(args.projectPath, ".prismnext", "agent", "mcp.json");
          if (fs.existsSync(mcpPath)) {
            const raw = fs.readFileSync(mcpPath, "utf-8");
            // MCP tool definitions are roughly the JSON config × 2
            // (OpenCode expands each server entry into tool schemas)
            mcpTokens = Math.max(1, Math.round(raw.length / 3));
          }
        } catch { /* best-effort */ }
      }

      // Static known portions (Prism prompts + skills + MCP).
      // These are chars/4 estimates — not exact, but proportions are what matter.
      const knownStatic = sysTokensEstimate + skillsTokens + mcpTokens;

      // Agent Base: cached tokens NOT explained by Prism's static estimates.
      // On turn 1 (cacheRead=0) this is 0. On later turns, it captures:
      //   - OpenCode's own built-in system prompt & tool definitions
      //   - Any conversation content OpenCode chooses to cache
      //
      // When cacheRead < knownStatic (turn 1), agentBase = 0 (no mystery cache yet).
      // When cacheRead > knownStatic (later turns), agentBase captures the gap.
      const agentBase = Math.max(0, cacheRead - knownStatic);

      // Messages: the remainder after accounting for static + agent base.
      // This is the actual conversation — user messages, assistant responses,
      // tool calls, etc. — whether cached or uncached.
      //
      // Guarantee: knownStatic + agentBase + messages = reportedTotal
      const messagesTokens = Math.max(0, reportedTotal - knownStatic - agentBase);

      const fullBreakdown: Record<string, number> = {
        ...sysBreakdown,
        skills: skillsTokens,
        "mcp-tools": mcpTokens,
        "agent-base": agentBase,
        messages: messagesTokens,
      };

      // Total used tokens: prefer OpenCode's report, fall back to our estimate
      const totalUsed = reportedTotal > 0
        ? reportedTotal
        : Object.values(fullBreakdown).reduce((a, b) => a + b, 0);

      // Synthesize a tokenUsage object for the renderer when OpenCode doesn't
      // provide one, so the context ring always has data to display.
      const effectiveUsage = (usage && reportedTotal > 0)
        ? usage
        : { input_tokens: totalUsed, output_tokens: 0 };

      log.info(`Prompt complete: sessionId=${sessionId} totalUsed=${totalUsed}`, {
        categories: Object.keys(fullBreakdown).length,
        samples: Object.fromEntries(
          Object.entries(fullBreakdown).filter(([, v]) => v > 0),
        ),
      });

      // Persist context breakdown per session so it survives app restarts
      persistSessionContext(args.projectPath, sessionId, {
        tokens: totalUsed,
        breakdown: fullBreakdown,
        schema: CONTEXT_CATEGORY_SCHEMA,
        updatedAt: Date.now(),
        hasSystemPromptBlock: false,
        promptFingerprint: currentFingerprint,
      });

      win.webContents.send("chat:complete", {
        tabId, sessionId, success: true, tokenUsage: effectiveUsage,
        contextBreakdown: fullBreakdown,
        categorySchema: CONTEXT_CATEGORY_SCHEMA,
        promptStale,
      });
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

  // ─── Cancel ───
  ipcMain.handle(
    "chat:cancel",
    async (_event, args: { sessionId: string }) => {
      cancelAiCommandForSession(args.sessionId);
      getService().releaseSessionPendingWork(args.sessionId);
      await getService().abort(args.sessionId);
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
    },
  );

  // ─── Permission Answer ───
  ipcMain.handle(
    "chat:answerPermission",
    async (_event, args: { permissionId: string; approved: boolean; toolCallId?: string }) => {
      await getService().answerPermission(args.permissionId, args.approved, args.toolCallId);
    },
  );

  // ─── Pre-warm ───
  // At project open: ensure ACP process alive + pre-scan agent config
  // (skills dirs, MCP servers). Session creation is deferred to first
  // prompt to avoid polluting the session list with empty entries.
  ipcMain.handle(
    "chat:prewarm",
    async (_event, args: { projectPath?: string }) => {
      try {
        await ensureConnected();
        if (args.projectPath) {
          const { refreshProjectSkillsIntegrationWithReload } = await import("../services/project-skills-refresh");
          await refreshProjectSkillsIntegrationWithReload(args.projectPath);
          // Set project root for command registry (scan user commands)
          const { commandRegistry } = await import("../commands/registry");
          commandRegistry.setProjectRoot(args.projectPath);
          commandRegistry.reload();
        }
      } catch (err: any) {
        log.debug(`OpenCode pre-warm skipped: ${err.message}`);
      }
      return { sessionId: null };
    },
  );

  // ─── Status ───
  ipcMain.handle("chat:status", async () => {
    const service = getService();
    if (service.getConnection()) {
      const health = await service.healthCheck();
      return { available: health.healthy, version: health.version };
    }
    const binaryAvailable = service.isBinaryAvailable();
    return {
      available: binaryAvailable,
      version: binaryAvailable ? "available" : "",
    };
  });

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
        sessionDisplayBackups.set(
          args.sessionId,
          getUserDisplays(args.projectPath, args.sessionId),
        );
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
        restoreUserDisplays(args.projectPath, args.sessionId, displayBackup);
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

  // ─── Config ───
  ipcMain.handle("chat:getProviders", async () => {
    return await getService().getProviders();
  });

  ipcMain.handle(
    "chat:setAuth",
    async (_event, args: { provider: string; credentials: Record<string, string> }) => {
      await getService().setAuth(args.provider, args.credentials);
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
