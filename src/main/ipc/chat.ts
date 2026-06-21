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

const log = createLogger("chat-ipc", "agent");

/** Full SQLite snapshot before session:truncateToTurn — used by session:undoTruncate. */
const sessionTruncationBackups = new Map<string, SessionMessageBackup>();

// ── Session context persistence ──────────────────────────────────

interface SessionContextData {
  tokens: number;
  breakdown: Record<string, number>;
  schema: { key: string; label: string; color: string; description?: string; order?: number }[];
  updatedAt: number;
  /** The first user message in this session has a system-prompt content block
   *  that should be stripped from displayed history. Set on session creation. */
  hasSystemPromptBlock?: boolean;
  /** Fingerprint of prompt config when this session last received a system prompt. */
  promptFingerprint?: string;
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
      // Main process owns prompt assembly — renderer never passes systemPrompt.
      // Delivery: first-turn content block in sendPrompt() only.
      const promptCtx = await buildPromptContext(args.projectPath);
      const assembledPrompt = promptManager.compose(promptCtx);
      const currentFingerprint = promptManager.computePromptFingerprint(promptCtx);
      if (assembledPrompt) {
        log.info(`System prompt assembled: ${assembledPrompt.length} chars`);
      } else {
        log.warn("Assembled prompt is EMPTY — agent will use OpenCode defaults only");
        // Notify renderer so UI can show a warning
        win.webContents.send("chat:stream", {
          tabId, type: "system.promptEmpty", data: {},
        });
      }

      // Create or reuse session.
      // isFirstTurn: inject assembled prompt as first content block on turn 1
      // only. Subsequent turns skip re-injection to save tokens.
      let sessionId = args.sessionId;
      let isFirstTurn = false;
      const existingSessionId = args.sessionId;
      if (!sessionId) {
        isFirstTurn = true;
        const model = args.model && args.provider
          ? `${args.provider}/${args.model}`
          : args.model || undefined;
        const session = await service.createSession(
          cwd, model, args.projectPath,
        );
        sessionId = session.id;
        win.webContents.send("chat:sessionCreated", { tabId, sessionId });
      }

      const bridge = getMapper(win);
      bridge.registerSession(sessionId, tabId);
      bridge.start();

      // Set thought level if specified via ACP session/set_config_option.
      if (args.thoughtLevel) {
        try {
          await service.setConfigOption(sessionId, "thought_level", args.thoughtLevel);
        } catch (err: any) {
          log.debug(`setConfigOption thought_level not supported by this OpenCode version: ${err.message}`);
        }
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
      // First turn of a new session, or prompt config changed since last injection.
      const injectSystemPrompt = isFirstTurn || promptStale;

      log.info(`Sending prompt: sessionId=${sessionId} tabId=${tabId} promptLen=${args.prompt.length} injectSystem=${injectSystemPrompt}`);
      let usage = null;
      try {
        const result = await service.sendPrompt(sessionId, args.prompt, {
          model: args.model,
          provider: args.provider,
          systemPrompt: assembledPrompt || undefined,
          injectSystemPrompt,
        });
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
        hasSystemPromptBlock: injectSystemPrompt,
        promptFingerprint: injectSystemPrompt
          ? currentFingerprint
          : (priorContext?.promptFingerprint ?? currentFingerprint),
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
  // The prism‑question custom tool polls ~/.prism‑questions/<id>.answer.json.
  // This handler writes the user's answer to that file so the blocking tool
  // can read it and return, unblocking the AI conversation.
  ipcMain.handle(
    "chat:answerQuestion",
    async (_event, args: { questionId: string; answer: string }) => {
      const os = await import("node:os");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const aDir = path.join(os.homedir(), ".prism-questions");
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
    async (_event, args: { permissionId: string; approved: boolean }) => {
      await getService().answerPermission(args.permissionId, args.approved);
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
          const { syncProjectSkillsIntegration } = await import("../services/skills-sync");
          syncProjectSkillsIntegration(args.projectPath);
          getService().prewarmProject(args.projectPath);
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
    return await service.listSessions(args.projectPath);
  });

  ipcMain.handle(
    "session:load",
    async (_event, args: { sessionId: string; projectPath?: string }) => {
      const service = getService();
      if (!service.getConnection()) {
        try {
          await service.initialize();
        } catch (err: any) {
          throw new Error(`Cannot load session: OpenCode is not available — ${err.message}`);
        }
      }
      const messages = await service.getMessages(args.sessionId, args.projectPath || "");

      // If messages came from SQLite (fast path), fire-and-forget ACP
      // session/load to initialize session state for continued conversation
      if (service.getConnection()) {
        service.initSession(args.sessionId, args.projectPath || "").catch(() => {});
      }

      return messages;
    },
  );

  ipcMain.handle(
    "session:delete",
    async (_event, args: { sessionId: string }) => {
      sessionTruncationBackups.delete(args.sessionId);
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

      const result = await service.truncateSessionToTurn(args.sessionId, args.turnIndex);
      const cwd = args.worktreePath || args.projectPath || "";
      await service.initSession(args.sessionId, cwd);

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

      const service = getService();
      await service.restoreSessionFromBackup(backup);
      sessionTruncationBackups.delete(args.sessionId);

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
