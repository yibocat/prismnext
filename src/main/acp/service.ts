import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, accessSync, constants, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  isPrimaryOpenCodeStreamError,
  openCodeLogEndOffset,
  parseOpenCodeStreamErrorLine,
  readOpenCodeLogDelta,
} from "./opencode-log-errors";
import { homedir } from "node:os";
import { Readable, Writable } from "node:stream";
import { app } from "electron";
import {
  ClientSideConnection,
  ndJsonStream,
} from "@agentclientprotocol/sdk";
import { createLogger } from "../services/logger";
import { getBuiltinToolFiles, BUILTIN_TOOLS, readBridgePathsSource, readPermissionBridgePollSource } from "../tools";
import {
  buildOpencodeToolDescription,
  patchToolDescription,
} from "../tools/tool-description";
import { buildPermissionOutcome, type PermissionResponse } from "./permission";
import {
  getSessionProjectRoot,
  getSessionTaskAllowlist,
  resolveChatTabId,
} from "../services/chat-session-registry";
import { mcpJsonToAcpServers, type AcpMcpServer } from "./mcp-transform";
import { ensureDefaultMcpServers, isEagerMcpServer, mergeMcpAllowlist, mcpAllowlistSetsEqual } from "../services/project-mcp-defaults";
import {
  getPermissionRulesForMode,
  resolvePermissionMode,
  resolveEffectiveAgentTerminalMode,
  extractPermissionToolName,
  resolvePermissionAction,
  resolveBridgeToolCallSyncAction,
  buildPermissionRulesFromSettings,
  type PermissionMode,
} from "../services/permission-modes";
import {
  extractTaskSubagentType,
  resolveTaskPermissionDenial,
} from "../services/task-orchestrator-gate";
import { emitChatStream } from "../services/chat-stream-notify";
import { addBashAllowAlwaysFromCommand, addToolAllowAlways, getSettings } from "../services/settings";
import { sanitizeSkillPermissionMap, skillPermissionNeedsRepair } from "../services/skills-sync";
import {
  buildEnabledToolsConfig,
  ensurePlanAgentPermissionConfig,
  ensureSubagentModelConfig,
} from "../services/opencode-tools-config";
import {
  isOpenCodeCatalogProvider,
  OPENCODE_API_KEY_ENV,
  OPENCODE_GO_PROVIDER_ID,
  providerApiKeyEnvVar,
  resolveModelsListUrl,
} from "../../shared/opencode-provider";
import {
  modelsDevCachePath,
  syncOpenCodeGoEffortVariants,
} from "./opencode-go-effort-sync";
import {
  probeBundledOpencodeVersionSync,
  shouldSkipEffortVariantConfigSync,
} from "../services/opencode-binary";
import {
  mergeOpencodeInstructions,
  PRISM_OPENCODE_INSTRUCTIONS,
} from "../services/prompt-sync";
import { diffCredentialEnvKeys } from "./credential-env";
import { messageIdsAfterTurn } from "../../shared/chat-turns";
import { buildSubAgentActivityBlocks } from "../../shared/opencode-session-activity";
import {
  approveCustomToolJob,
  denyBashJob,
  executeApprovedBashJob,
  extractBashCommandFromInput,
  isRunnableBashCommand,
  readBashPermissionStatus,
  registerCustomToolJobIntent,
  type ApprovedBashJob,
} from "../services/bash-permission-bridge";
import { PERMISSION_TIMEOUT_MS } from "../../shared/permission-timeouts";
import {
  isDirectLatexCompileBashCommand,
  latexCompileBashBlockMessage,
  latexCompileBashRedirectNote,
} from "../../shared/latex-compile-bash";
import { resolveOpencodeBinaryPath } from "../services/opencode-binary";
import {
  getPlanPermissionOverride,
  isProjectRulePath,
  isResearchBriefPath,
  planDraftPathRedirectNote,
  projectRuleEditRedirectNote,
  researchBriefEditRedirectNote,
  resolveSessionAgent,
  type SessionAgent,
} from "../../shared/session-agent";
import {
  buildModelsCatalogFromModelsDevCache,
  PRISM_LAZY_FETCH_CATALOG_PROVIDERS,
  type OpenCodeModelsCatalogSnapshot,
  type CatalogModelRow,
} from "../../shared/opencode-models-catalog";
import {
  OPENROUTER_PROVIDER_ID,
  parseOpenRouterApiModels,
  type OpenRouterModelRow,
} from "../../shared/openrouter-models";
import { isLazyCatalogProvider } from "../../shared/lazy-provider-catalog";
import { normalizeOpenCodeModelId } from "../../shared/opencode-provider";
import { effortCatalog } from "./effort-catalog";
import {
  OPENCODE_DEFAULT_VARIANT,
  appendEffortToRuntimeModelRef,
  prismModelFromRuntimeRef,
  type OpencodeSessionConfigOption,
} from "../../shared/opencode-effort";
import {
  isResearchPlanDraftPath,
  planDraftMissingRedirectNote,
} from "../../shared/research-plan";
import { sessionHasPendingPlanDraft } from "../services/research-plan-service";

const CUSTOM_GATED_TOOLS = new Set(["delete", "move"]);

const log = createLogger("acp-service", "agent");

// ── Constants ──
const SIGKILL_GRACE_MS = 5_000;
/** Files smaller than this are assumed to be auto-generated config stubs. */
const MIN_CUSTOM_CONFIG_LENGTH = 60;

/** ACP tool-call statuses that close a tool call (watchdog busy tracking). */
const WATCHDOG_TERMINAL_TOOL_STATUS = new Set([
  "completed",
  "failed",
  "error",
  "cancelled",
  "canceled",
]);

export interface SessionInfo {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  /** OpenCode session cwd — project root or a worktree path. */
  directory?: string;
}

export interface SessionPartBackup {
  id: string;
  message_id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  data: string;
}

export interface SessionMessageRowBackup {
  id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  data: string;
  parts: SessionPartBackup[];
}

export interface SessionMessageBackup {
  sessionId: string;
  messages: SessionMessageRowBackup[];
}

/**
 * AcpService — singleton managing the OpenCode ACP subprocess.
 *
 * App-level: spawns `opencode acp` once at startup. All projects share this
 * single process. Session data lives under <userData>/opencode-server/.
 *
 * Communicates via JSON-RPC 2.0 over stdio using @agentclientprotocol/sdk.
 */
export class AcpService {
  private static instance: AcpService;
  private conn: ClientSideConnection | null = null;
  private proc: ChildProcess | null = null;
  /** Current working directory for session operations (may be a worktree). */
  private projectPath: string = "";
  private notificationHandlers: Array<(method: string, params: any) => void> = [];
  private killTimers: Array<ReturnType<typeof setTimeout>> = [];
  private pendingPermissions = new Map<string, {
    resolve: (value: PermissionResponse) => void;
    timer: ReturnType<typeof setTimeout>;
    options: Array<{ optionId: string; kind: string; name?: string }>;
    toolCallId?: string;
    toolName?: string;
    sessionId?: string;
    tabId?: string;
    bashCommand?: string;
    bashCwd?: string;
  }>();
  /** Bash jobs awaiting UI when OpenCode custom bash runs without ACP permission. */
  private bashJobContext = new Map<string, ApprovedBashJob>();
  private emittedBashUi = new Set<string>();
  /** toolCallIds that were auto-allowed before real command arrived — execute on backfill. */
  private bashAutoApproved = new Set<string>();
  /** Custom delete/move jobs awaiting UI when execute() starts before ACP permission. */
  private customToolJobContext = new Map<string, {
    sessionId: string;
    chatTabId: string;
    toolCallId: string;
    toolName: string;
  }>();
  private emittedCustomToolUi = new Set<string>();
  /** Auto-deny timers for synthetic permission gates (bash-gate-*, delete-gate-*). */
  private syntheticPermissionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectBaseDelay = 1000;
  /**
   * Last time any session/update frame arrived per session. OpenCode goes
   * completely silent on the wire while it retries a failed provider call
   * (rate limit / quota / 5xx) — these timestamps let the turn watchdog
   * distinguish "model still working" from "upstream silently retrying".
   */
  private sessionActivityAt = new Map<string, number>();
  /**
   * Open tool calls per primary-session subtree ("s1", "s1:tool1", ...), keyed
   * by primary session id with each key namespaced by the emitting session.
   * While any tool is running (Task subagents, long bash, MinerU parses) the
   * turn watchdog uses the busy-tier hard timeout instead of the idle one —
   * silence is expected there and must not kill legitimate long tasks.
   */
  private subtreeRunningToolKeys = new Map<string, Set<string>>();
  /**
   * Provider stream errors scraped from opencode.log (quota / rate limit / 5xx).
   * OpenCode often never forwards these over ACP.
   */
  private sessionProviderErrors = new Map<string, string>();
  /** Byte offset into opencode.log for the active turn's error watch. */
  private opencodeLogWatchOffset = 0;
  /** MCP server names already pushed to OpenCode for each session (lazy-load dedupe). */
  private sessionLoadedMcpNames = new Map<string, Set<string>>();
  /** Stored API keys from last chat:send — reused on reconnect. */
  private lastExtraEnv: Record<string, string> = {};
  /** Env actually baked into the running OpenCode child (keys only take effect at spawn). */
  private bakedExtraEnv: Record<string, string> = {};
  /** When the current OpenCode child was spawned (ms). Fresh processes already see disk agents. */
  private lastSpawnAt = 0;
  /** ACP lifecycle for status dot / welcome — never “available” from binary alone. */
  private lifecyclePhase: import("../../shared/agent-status").AgentLifecyclePhase = "starting";
  private lastInitError: string | null = null;
  /** Suppress exit-handler lifecycle updates while we intentionally replace the child. */
  private suppressExitLifecycle = false;
  /**
   * Single-flight for initialize(). App startup and renderer `chat:prewarm` can
   * overlap after `createWindow()`; without this, a second call `shutdown()`s the
   * child mid-handshake → "ACP connection closed".
   */
  private initInflight: Promise<void> | null = null;
  /** Cached agent config from project prewarm — avoids re-reading on session create. */
  private cachedAgentConfig: {
    projectRoot: string;
    mcpServers: AcpMcpServer[];
    additionalDirectories: string[];
  } | null = null;

  /** Session IDs that are sub-agent sessions (created by the task tool).
   *  These are filtered from the sidebar session list. Persisted to disk
   *  so filtering survives app restarts. */
  private subAgentSessions = new Set<string>();
  /** Suppress bash/custom permission side effects while OpenCode session/load replays history. */
  private sessionReplaySuppress = 0;
  /** Sessions already hydrated in this OpenCode process (session/load done once). */
  private opencodeHydratedSessions = new Set<string>();
  /** Cached OpenCode local HTTP control-plane base (e.g. http://127.0.0.1:4096). */
  private openCodeHttpBase: string | null = null;
  /** Phase 1B: one-shot redirect note injected into the next chat:send after a
   *  builtin-Task delegation is denied on the orchestrator, so the agent is
   *  nudged toward platform tools (citation-health, literature-*) instead of
   *  retrying Task. ACP permission rejections can't carry a reason string, so
   *  we surface it on the next turn. */
  private pendingTaskDenialRedirect = new Map<string, string>();
  /** Plan turn ended without writing the session draft — hard note on next send. */
  private pendingPlanDraftRedirect = new Map<string, string>();
  /** Per-session OpenCode agent identity (build | plan). Defaults to build. */
  private sessionAgents = new Map<string, SessionAgent>();

  /** Phase 1B: consume (and clear) the pending task-denial redirect for a session. */
  consumePendingTaskDenial(sessionId: string | undefined | null): string | null {
    if (!sessionId) return null;
    const note = this.pendingTaskDenialRedirect.get(sessionId);
    if (note) {
      this.pendingTaskDenialRedirect.delete(sessionId);
      return note;
    }
    return null;
  }

  /** Stash a one-shot note for the next chat:send (ACP denies can't carry reasons). */
  setPendingTaskDenial(sessionId: string, note: string): void {
    const id = sessionId?.trim();
    if (!id || !note.trim()) return;
    this.pendingTaskDenialRedirect.set(id, note.trim());
  }

  setPendingPlanDraftRedirect(sessionId: string, note: string): void {
    const id = sessionId?.trim();
    if (!id || !note.trim()) return;
    this.pendingPlanDraftRedirect.set(id, note.trim());
  }

  clearPendingPlanDraftRedirect(sessionId: string): void {
    const id = sessionId?.trim();
    if (id) this.pendingPlanDraftRedirect.delete(id);
  }

  hasPendingPlanDraftRedirect(sessionId: string | undefined | null): boolean {
    if (!sessionId) return false;
    return this.pendingPlanDraftRedirect.has(sessionId);
  }

  consumePendingPlanDraftRedirect(sessionId: string | undefined | null): string | null {
    if (!sessionId) return null;
    const note = this.pendingPlanDraftRedirect.get(sessionId);
    if (note) {
      this.pendingPlanDraftRedirect.delete(sessionId);
      return note;
    }
    return null;
  }

  /** True while session/load is replaying stored tool updates — skip live bash gates. */
  isSessionReplaySuppressed(): boolean {
    return this.sessionReplaySuppress > 0;
  }

  static getInstance(): AcpService {
    if (!AcpService.instance) {
      AcpService.instance = new AcpService();
    }
    return AcpService.instance;
  }

  getConnection(): ClientSideConnection | null {
    return this.conn;
  }

  /** Epoch ms of the last successful OpenCode spawn (0 if none). */
  getLastSpawnAtMs(): number {
    return this.lastSpawnAt;
  }

  /**
   * True when OpenCode was spawned within `withinMs` — fresh children already
   * read agent/skill/instruction files from disk, so an immediate reload is wasteful.
   */
  wasSpawnedRecently(withinMs = 8_000): boolean {
    return this.lastSpawnAt > 0 && Date.now() - this.lastSpawnAt < withinMs;
  }

  /**
   * Preview whether `initialize(extraEnv)` would restart a live child for
   * credential changes. Merges/hydrates the same way as initialize (side-effect:
   * fills `lastExtraEnv`) but does not spawn.
   */
  wouldRestartForCredentials(extraEnv?: Record<string, string>): boolean {
    if (!this.conn || !this.proc) return false;
    if (extraEnv) {
      for (const [k, v] of Object.entries(extraEnv)) {
        if (typeof v === "string" && v.trim()) this.lastExtraEnv[k] = v.trim();
      }
    }
    const serverDir = this.getServerDataDir();
    mkdirSync(serverDir, { recursive: true });
    this.ensureOpenCodeAuthUnderXdg(serverDir);
    this.hydrateCredentialEnv(serverDir);
    return diffCredentialEnvKeys(this.bakedExtraEnv, this.lastExtraEnv).length > 0;
  }

  getLifecyclePhase(): import("../../shared/agent-status").AgentLifecyclePhase {
    return this.lifecyclePhase;
  }

  getLastInitError(): string | null {
    return this.lastInitError;
  }

  /**
   * Snapshot for chat:status / chat:agentStatus. `available` requires a live
   * connection — binary-on-disk alone is never enough.
   */
  getStatusSnapshot(projectPath?: string): import("../../shared/agent-status").AgentStatusSnapshot {
    const binaryPresent = this.isBinaryAvailable();
    const connected = Boolean(this.conn && this.proc);
    let phase = this.lifecyclePhase;
    if (connected && phase !== "starting") {
      phase = "ready";
    } else if (!connected && phase === "ready") {
      phase = this.lastInitError ? "error" : "stopped";
    }
    const available = connected && phase === "ready";
    let projectWarm: boolean | null = null;
    let projectWarmPhase: import("../../shared/agent-status").ProjectWarmPhase | null = null;
    let projectWarmError: string | null = null;
    if (projectPath?.trim()) {
      try {
        // Lazy require avoids circular import with project-chat-prewarm → AcpService.
        const prewarm = require("../services/project-chat-prewarm") as {
          getProjectWarmPhase: (root: string) => import("../../shared/agent-status").ProjectWarmPhase;
          getProjectWarmError: (root: string) => string | null;
        };
        projectWarmPhase = prewarm.getProjectWarmPhase(projectPath.trim());
        projectWarm = projectWarmPhase === "ready";
        projectWarmError = prewarm.getProjectWarmError(projectPath.trim());
      } catch {
        projectWarmPhase = "none";
        projectWarm = false;
        projectWarmError = null;
      }
    }
    return {
      phase,
      available,
      version: available ? "connected" : "",
      error: phase === "error" ? this.lastInitError : null,
      binaryPresent,
      projectWarm,
      projectWarmPhase,
      projectWarmError,
    };
  }

  private setLifecycle(
    phase: import("../../shared/agent-status").AgentLifecyclePhase,
    error: string | null = null,
  ): void {
    const prev = this.lifecyclePhase;
    const prevErr = this.lastInitError;
    this.lifecyclePhase = phase;
    this.lastInitError = phase === "error" ? error : null;
    if (prev === phase && prevErr === this.lastInitError) return;
    try {
      const { emitAgentStatusChanged } = require("../services/agent-status-notify") as {
        emitAgentStatusChanged: (s: import("../../shared/agent-status").AgentStatusSnapshot) => void;
      };
      emitAgentStatusChanged(this.getStatusSnapshot());
    } catch {
      /* windows may not be ready yet */
    }
  }

  /** Public retry entry for status-dot / IPC — clears error and re-initializes. */
  async ensureAgentRunning(extraEnv?: Record<string, string>): Promise<import("../../shared/agent-status").AgentStatusSnapshot> {
    try {
      await this.initialize(extraEnv);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.setLifecycle("error", message);
      throw err;
    }
    return this.getStatusSnapshot();
  }

  getProjectPath(): string {
    return this.projectPath;
  }

  /** Global data directory for the OpenCode server process. */
  private getServerDataDir(): string {
    return join(app.getPath("userData"), "opencode-server");
  }

  /** Path to the SQLite database where OpenCode stores session metadata. */
  private getDbPath(): string {
    return join(this.getServerDataDir(), "opencode", "opencode.db");
  }

  /**
   * OpenCode looks for auth under `$XDG_DATA_HOME/opencode/auth.json`.
   * prismnext remaps XDG to `<userData>/opencode-server/`, so CLI auth at
   * `~/.local/share/opencode/auth.json` is invisible unless we copy it.
   */
  private ensureOpenCodeAuthUnderXdg(serverDir: string): void {
    const destDir = join(serverDir, "opencode");
    const dest = join(destDir, "auth.json");
    if (existsSync(dest)) return;

    const candidates = [
      join(homedir(), ".local", "share", "opencode", "auth.json"),
      join(homedir(), ".config", "opencode", "auth.json"),
    ];
    for (const src of candidates) {
      if (!existsSync(src)) continue;
      try {
        mkdirSync(destDir, { recursive: true });
        copyFileSync(src, dest);
        log.info("Seeded OpenCode auth.json into XDG data dir from CLI install");
        return;
      } catch (err: any) {
        log.warn(`Failed to seed OpenCode auth.json from ${src}: ${err.message}`);
      }
    }
  }

  /** Merge decrypted settings keys + auth.json into lastExtraEnv before spawn. */
  private hydrateCredentialEnv(serverDir: string): void {
    try {
      const settings = getSettings() as Record<string, unknown>;
      const aiApiKeys = (settings.aiApiKeys as Record<string, string>) || {};
      const aiBaseUrls = (settings.aiBaseUrls as Record<string, string>) || {};
      for (const [provider, apiKey] of Object.entries(aiApiKeys)) {
        if (!apiKey?.trim()) continue;
        const envKey = providerApiKeyEnvVar(provider);
        if (!this.lastExtraEnv[envKey]?.trim()) {
          this.lastExtraEnv[envKey] = apiKey.trim();
        }
        const baseKey = `${provider.replace(/-/g, "_").toUpperCase()}_BASE_URL`;
        if (
          aiBaseUrls[provider]?.trim() &&
          !isOpenCodeCatalogProvider(provider) &&
          !this.lastExtraEnv[baseKey]?.trim()
        ) {
          this.lastExtraEnv[baseKey] = aiBaseUrls[provider].trim();
        }
      }
    } catch (err: any) {
      log.warn(`hydrateCredentialEnv from settings failed: ${err.message}`);
    }

    if (this.lastExtraEnv[OPENCODE_API_KEY_ENV]) return;

    const authPaths = [
      join(serverDir, "opencode", "auth.json"),
      join(homedir(), ".local", "share", "opencode", "auth.json"),
    ];
    for (const authPath of authPaths) {
      if (!existsSync(authPath)) continue;
      try {
        const raw = JSON.parse(readFileSync(authPath, "utf8")) as Record<
          string,
          { type?: string; key?: string }
        >;
        const key =
          raw["opencode-go"]?.key?.trim() ||
          raw["opencode"]?.key?.trim() ||
          raw["opencode-zen"]?.key?.trim();
        if (key) {
          this.lastExtraEnv[OPENCODE_API_KEY_ENV] = key;
          log.info("Hydrated OPENCODE_API_KEY from OpenCode auth.json");
          return;
        }
      } catch (err: any) {
        log.warn(`Failed reading OpenCode auth.json at ${authPath}: ${err.message}`);
      }
    }
  }

  /** Positive parent_id only — never cache null (child rows often commit parent_id late). */
  private sessionParentCache = new Map<string, string>();

  /**
   * OpenCode session.parent_id (or null for root / not-yet-linked child sessions).
   * Important: do NOT cache null. Task subagent session/update often arrives
   * before SQLite writes parent_id; caching null permanently caused
   * task-link-timeout (child never links to the parent chat tab).
   */
  getSessionParentId(sessionId: string): string | null {
    const id = sessionId?.trim();
    if (!id) return null;
    const cached = this.sessionParentCache.get(id);
    if (cached) return cached;
    let parent: string | null = null;
    try {
      const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
      const db = new DatabaseSync(this.getDbPath(), { readOnly: true });
      try {
        const row = db
          .prepare("SELECT parent_id FROM session WHERE id = ?")
          .get(id) as { parent_id?: string | null } | undefined;
        parent = row?.parent_id?.trim() || null;
      } finally {
        db.close();
      }
    } catch {
      parent = null;
    }
    if (parent) this.sessionParentCache.set(id, parent);
    return parent;
  }

  /**
   * Parts for a session (assistant activity stream), oldest first.
   * Used when ACP does not forward subagent session/update notifications.
   */
  listSessionActivityParts(
    sessionId: string,
  ): Array<{ id: string; role: string; data: Record<string, unknown> }> {
    const id = sessionId?.trim();
    if (!id) return [];
    try {
      const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
      const db = new DatabaseSync(this.getDbPath(), { readOnly: true });
      try {
        const rows = db
          .prepare(
            `SELECT p.id AS part_id, p.data AS part_data, m.data AS message_data
             FROM part p
             JOIN message m ON m.id = p.message_id
             WHERE p.session_id = ?
             ORDER BY p.time_created ASC`,
          )
          .all(id) as Array<{
            part_id?: string;
            part_data?: string;
            message_data?: string;
          }>;
        const out: Array<{ id: string; role: string; data: Record<string, unknown> }> = [];
        for (const row of rows) {
          const partId = row.part_id?.trim();
          if (!partId) continue;
          let partData: Record<string, unknown>;
          try {
            partData = JSON.parse(row.part_data || "{}") as Record<string, unknown>;
          } catch {
            continue;
          }
          let role = "assistant";
          try {
            const msg = JSON.parse(row.message_data || "{}") as { role?: string };
            if (typeof msg.role === "string" && msg.role.trim()) {
              role = msg.role.trim().toLowerCase();
            }
          } catch {
            /* keep assistant */
          }
          out.push({ id: partId, role, data: partData });
        }
        return out;
      } finally {
        db.close();
      }
    } catch {
      return [];
    }
  }

  /**
   * Child OpenCode sessions for a parent (Task subagents). Used to link when
   * session/update races ahead of Task enqueue or parent_id commits late.
   */
  listChildSessionIds(parentSessionId: string): string[] {
    const parent = parentSessionId?.trim();
    if (!parent) return [];
    try {
      const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
      const db = new DatabaseSync(this.getDbPath(), { readOnly: true });
      try {
        const rows = db
          .prepare(
            `SELECT id FROM session
             WHERE parent_id = ?
               AND time_archived IS NULL
             ORDER BY time_created ASC`,
          )
          .all(parent) as Array<{ id?: string }>;
        const ids: string[] = [];
        for (const row of rows) {
          const id = row?.id?.trim();
          if (!id) continue;
          ids.push(id);
          this.sessionParentCache.set(id, parent);
        }
        return ids;
      } finally {
        db.close();
      }
    } catch {
      return [];
    }
  }

  /**
   * Task tool callIDs on a parent session, oldest first.
   * Used to map Task tool_use id → child subagent session by index.
   */
  listParentTaskToolCallIds(parentSessionId: string): string[] {
    const parts = this.listSessionActivityParts(parentSessionId);
    const ids: string[] = [];
    for (const row of parts) {
      const d = row.data;
      const type = String(d.type || "");
      if (type !== "tool" && type !== "tool_use") continue;
      const toolName = (
        (typeof d.tool === "string" ? d.tool : "")
        || (d.tool as { name?: string } | undefined)?.name
        || String(d.name || "")
        || String(d.title || "")
      ).toLowerCase();
      if (toolName !== "task") continue;
      const callId = String(d.callID || d.id || "").trim();
      if (callId) ids.push(callId);
    }
    return ids;
  }

  /**
   * Resolve the OpenCode child session for a parent Task tool_use.
   * Prefer an explicit hint, then single-child, then Task-index ↔ child-index.
   */
  resolveChildSessionForTask(
    parentSessionId: string,
    taskToolUseId: string,
    hintSubSessionId?: string,
  ): string | null {
    const parent = parentSessionId?.trim();
    const toolId = taskToolUseId?.trim();
    if (!parent || !toolId) return null;
    const children = this.listChildSessionIds(parent);
    if (children.length === 0) return null;
    const hint = hintSubSessionId?.trim();
    if (hint && children.includes(hint)) return hint;
    if (children.length === 1) return children[0]!;
    const taskIds = this.listParentTaskToolCallIds(parent);
    const idx = taskIds.indexOf(toolId);
    if (idx >= 0 && idx < children.length) return children[idx]!;
    return null;
  }

  /**
   * Hydrate Task run-panel activity from OpenCode SQLite (history / after reload).
   */
  getSubAgentActivityForTask(args: {
    parentSessionId: string;
    taskToolUseId: string;
    subSessionId?: string;
  }): {
    subSessionId: string | null;
    blocks: Array<Record<string, unknown>>;
    status: "done" | "error" | "running";
    error?: string;
  } {
    const parent = args.parentSessionId?.trim();
    const toolId = args.taskToolUseId?.trim();
    if (!parent || !toolId) {
      return { subSessionId: null, blocks: [], status: "done" };
    }

    let parentToolStatus: "done" | "error" | "running" = "done";
    let parentToolError: string | undefined;
    let parentToolOutput = "";
    for (const row of this.listSessionActivityParts(parent)) {
      const d = row.data;
      const type = String(d.type || "");
      if (type !== "tool" && type !== "tool_use") continue;
      const callId = String(d.callID || d.id || "").trim();
      if (callId !== toolId) continue;
      const state = d.state as {
        status?: string;
        output?: unknown;
      } | undefined;
      const st = String(state?.status || "").toLowerCase();
      const output =
        typeof state?.output === "string"
          ? state.output
          : state?.output == null
            ? ""
            : JSON.stringify(state.output);
      parentToolOutput = output;
      if (st === "pending" || st === "running" || st === "in_progress") {
        parentToolStatus = "running";
      } else if (
        st === "error"
        || st === "failed"
        || st === "cancelled"
        || st === "canceled"
        || st === "aborted"
      ) {
        parentToolStatus = "error";
        if (output.trim()) parentToolError = output.trim();
      } else {
        parentToolStatus = "done";
      }
      break;
    }

    const child = this.resolveChildSessionForTask(parent, toolId, args.subSessionId);
    if (!child) {
      // No child session — surface the parent's Task result so the panel is not blank.
      if (parentToolOutput.trim()) {
        return {
          subSessionId: null,
          blocks: [{ type: "text", text: parentToolOutput }],
          status: parentToolStatus === "running" ? "done" : parentToolStatus,
          error: parentToolError,
        };
      }
      return { subSessionId: null, blocks: [], status: parentToolStatus };
    }

    const blocks = buildSubAgentActivityBlocks(this.listSessionActivityParts(child));
    return {
      subSessionId: child,
      blocks,
      status: parentToolStatus,
      error: parentToolError,
    };
  }

  /** Parent orchestrator session for citation staging when tools run in a Task sub-session. */
  resolveCitationStagingSessionId(sessionId: string): string {
    const parent = this.getSessionParentId(sessionId);
    return parent || sessionId;
  }

  /** @internal */
  clearSessionParentCacheForTests(): void {
    this.sessionParentCache.clear();
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  /**
   * Initialize the ACP connection. Spawns opencode acp as a persistent
   * child process. XDG directories are routed to <userData>/opencode-server/
   * so all session data lives at the app level — one process serves all
   * projects, with zero cold-start on project switch.
   */
  async initialize(extraEnv?: Record<string, string>): Promise<void> {
    // Merge into stored env — preserves keys from other providers across reconnects.
    // Always trim so startup vs first-send whitespace cannot force a false restart.
    if (extraEnv) {
      for (const [k, v] of Object.entries(extraEnv)) {
        if (typeof v === "string" && v.trim()) this.lastExtraEnv[k] = v.trim();
      }
    }

    for (;;) {
      // Join any in-flight attempt (do not start a parallel spawn/shutdown race).
      while (this.initInflight) {
        try {
          await this.initInflight;
        } catch {
          // Shared attempt failed — fall through and retry if still needed.
        }
      }

      // Route OpenCode's XDG directories to the app-level data folder.
      const serverDir = this.getServerDataDir();
      mkdirSync(serverDir, { recursive: true });
      this.ensureOpenCodeAuthUnderXdg(serverDir);
      // Fill missing keys from settings / CLI auth.json before deciding whether
      // the running child already has the right credentials baked in.
      this.hydrateCredentialEnv(serverDir);

      // API keys / base URLs only apply at spawn. If credentials arrived after the
      // process was already warm (or changed), restart so OpenCode can use them —
      // otherwise session/set_model to opencode-go/* silently falls back to big-pickle.
      const credentialDiffs = diffCredentialEnvKeys(this.bakedExtraEnv, this.lastExtraEnv);
      const credentialDelta = credentialDiffs.length > 0;

      if (this.conn && this.proc && !credentialDelta) {
        this.setLifecycle("ready");
        return;
      }

      if (this.conn && this.proc && credentialDelta) {
        log.info("Restarting OpenCode to apply updated provider credentials", {
          changedKeys: credentialDiffs,
        });
      }

      // Another caller may have started while we hydrated — join them.
      if (this.initInflight) continue;

      const run = this.initializeExclusive();
      this.initInflight = run.finally(() => {
        this.initInflight = null;
      });
      await run;
      return;
    }
  }

  /** Exclusive spawn + ACP handshake (callers must go through initialize()). */
  private async initializeExclusive(): Promise<void> {
    this.setLifecycle("starting");
    this.suppressExitLifecycle = true;
    try {
      await this.shutdown();
    } catch {
      /* best-effort before respawn */
    }

    try {
    // Resolve the opencode binary — use full path for reliability
    const binaryPath = this.resolveBinaryPath();

    if (!existsSync(binaryPath)) {
      const msg =
        `OpenCode binary not found at ${binaryPath}. ` +
        "Install it from https://opencode.ai";
      this.setLifecycle("error", msg);
      throw new Error(msg);
    }

    // Verify the binary is executable (existsSync doesn't check +x)
    try {
      accessSync(binaryPath, constants.X_OK);
    } catch {
      const msg =
        `OpenCode binary is not executable: ${binaryPath}\n` +
        "Fix: chmod +x " + binaryPath;
      this.setLifecycle("error", msg);
      throw new Error(msg);
    }

    // Load previously persisted sub-agent session IDs
    this.loadSubAgentSessions();

    // Sync prism-next's built-in custom tools so OpenCode can discover them.
    this.repairOpencodeServerConfigs();

    // Write default OpenCode config to enable ALL built-in tools.  OpenCode
    // disables websearch, question, etc. by default (privacy-first).  We
    // enable everything so the AI has the full toolbox available.
    this.writeDefaultConfig();
    this.applyBuiltinToolsConfig();
    this.applyOpenCodeGoEffortVariantsConfig();
    const settings = getSettings() as Record<string, unknown>;
    const permMode = resolvePermissionMode(settings.permissionMode as string | undefined);
    this.applyPermissionMode(permMode);
    const terminalMode = resolveEffectiveAgentTerminalMode(
      permMode,
      settings.agentTerminalMode as string | undefined,
    );
    await this.applyAgentTerminalMode(terminalMode);
    await this.syncBuiltinTools();

    // Ensure PATH includes standard system dirs. Electron dev mode may strip
    // them, causing spawn ENOENT for valid binaries.
    const delim = process.platform === "win32" ? ";" : ":";
    const systemPaths = process.platform === "win32"
      ? [process.env.SystemRoot ? `${process.env.SystemRoot}\\system32` : "C:\\Windows\\system32"]
      : ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
    const safePath = [...systemPaths, process.env.PATH].filter(Boolean).join(delim);

    const { getPrismBridgeEnv } = await import("../services/prism-bridge-paths");
    const env = {
      ...process.env,
      PATH: safePath,
      ...this.lastExtraEnv,
      ...getPrismBridgeEnv(),
      XDG_DATA_HOME: this.getServerDataDir(),
      XDG_CONFIG_HOME: join(this.getServerDataDir(), "config"),
      XDG_CACHE_HOME: join(this.getServerDataDir(), "cache"),
      XDG_STATE_HOME: join(this.getServerDataDir(), "state"),
      // Enable OpenCode's built-in websearch (disabled by default)
      OPENCODE_ENABLE_EXA: "1",
      // Background Task (P1): Task(..., background: true) early-return + inject join
      OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS: "true",
    };

    const serverDir = this.getServerDataDir();
    log.info(`Spawning opencode acp (data: ${serverDir})`, {
      credentialEnvKeys: Object.keys(this.lastExtraEnv).filter((k) =>
        /API_KEY|BASE_URL/i.test(k),
      ),
    });
    try {
      this.proc = spawn(binaryPath, ["acp"], {
        cwd: serverDir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.lastSpawnAt = Date.now();
      this.bakedExtraEnv = Object.fromEntries(
        Object.entries(this.lastExtraEnv)
          .filter(([, v]) => typeof v === "string" && v.trim())
          .map(([k, v]) => [k, v.trim()]),
      );
    } catch (err: any) {
      log.error(`Failed to spawn opencode: ${err.message}`);
      this.proc = null;
      this.bakedExtraEnv = {};
      this.lastSpawnAt = 0;
      this.setLifecycle("error", `Failed to start OpenCode: ${err.message}`);
      throw new Error(`Failed to start OpenCode: ${err.message}`);
    }

    // Handle async spawn errors (e.g. ENOENT) — without this they become
    // uncaught exceptions that crash the app.
    this.proc.on("error", (err: Error) => {
      log.error(`OpenCode process error: ${err.message}`);
      this.conn = null;
      this.proc = null;
      this.bakedExtraEnv = {};
      if (!this.suppressExitLifecycle) {
        this.setLifecycle("error", err.message);
      }
    });

    // Pipe stderr through for debugging
    if (this.proc.stderr) {
      let stderrBuf = "";
      this.proc.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.includes("\n")) {
          log.debug(`[opencode stderr] ${stderrBuf.trim()}`);
          stderrBuf = "";
        }
      });
    }

    // Convert Node.js stdio streams to Web Streams for ClientSideConnection
    const stdoutWeb = Readable.toWeb(this.proc.stdout!) as ReadableStream<Uint8Array>;
    const stdinWeb = Writable.toWeb(this.proc.stdin!) as WritableStream<Uint8Array>;

    this.conn = new ClientSideConnection(
      () => ({
        requestPermission: async (params) => {
          // ACP's RequestPermissionRequest carries no client-facing id — the
          // permission id is generated here (the agent provides sessionId +
          // toolCall, not a permission id). Earlier code read `params.id` /
          // `params.permissionId`, which don't exist on the schema and were
          // always undefined.
          const permissionId = `perm-${Date.now()}`;
          const options = Array.isArray(params.options) ? params.options : [];
          if (this.sessionReplaySuppress > 0) {
            log.debug(`permission:replay-suppressed id=${permissionId}`);
            return buildPermissionOutcome(options, false);
          }
          const settings = getSettings() as Record<string, unknown>;
          const mode = resolvePermissionMode(settings.permissionMode as string | undefined);
          const toolName = extractPermissionToolName(params as Record<string, unknown>);
          const sessionId =
            (params as { sessionId?: string }).sessionId
            || (params as { session?: { id?: string } }).session?.id;

          if (toolName === "task" && sessionId) {
            const subagent = extractTaskSubagentType(params as Record<string, unknown>);
            // Nested deny must not wait on markSubAgentSession — child rows often
            // have parent_id before Prism links/marks the session.
            const parentId = this.getSessionParentId(sessionId);
            const isNested =
              this.isSubAgentSession(sessionId) || !!parentId;
            if (isNested && !this.isSubAgentSession(sessionId)) {
              this.markSubAgentSession(sessionId);
            }
            const denial = resolveTaskPermissionDenial({
              isSubAgentSession: isNested,
              subagentId: subagent,
              sessionAgent: this.getSessionAgent(sessionId),
              taskAllowlist: getSessionTaskAllowlist(sessionId),
            });
            const deniedMsg = denial?.message ?? null;
            if (deniedMsg) {
              log.info(
                `permission:task-deny sessionId=${sessionId} code=${denial!.code} subagent=${subagent ?? "(none)"}`,
              );
              // Phase 1B: stash a redirect note for the next chat:send — the LLM
              // only gets a generic permission rejection, so we re-surface the
              // guidance on the next turn.
              this.pendingTaskDenialRedirect.set(sessionId, deniedMsg);
              const tabId = resolveChatTabId(sessionId);
              const toolCallId =
                (params as { toolCallId?: string }).toolCallId
                || (params as { tool_call_id?: string }).tool_call_id
                || (params as { callID?: string }).callID
                || ((params as { toolCall?: { toolCallId?: string; id?: string } }).toolCall?.toolCallId)
                || ((params as { toolCall?: { id?: string } }).toolCall?.id);
              // Surface a clear UI error immediately — OpenCode only returns
              // opaque {"error":"Task cancelled"} after we reject permission.
              if (tabId && toolCallId) {
                const tc = (params as { toolCall?: { rawInput?: unknown; input?: unknown } }).toolCall;
                const toolInput =
                  (tc?.rawInput && typeof tc.rawInput === "object"
                    ? tc.rawInput
                    : tc?.input && typeof tc.input === "object"
                      ? tc.input
                      : {}) as Record<string, unknown>;
                emitChatStream(tabId, "message.part.updated", {
                  part: {
                    type: "tool",
                    id: toolCallId,
                    name: "task",
                    input: toolInput,
                    title: "task",
                    kind: "think",
                    status: "failed",
                  },
                });
                emitChatStream(tabId, "message.updated", {
                  message: {
                    content: [{
                      type: "tool_result",
                      tool_use_id: toolCallId,
                      content: deniedMsg,
                      is_error: true,
                      status: "failed",
                      name: "task",
                    }],
                  },
                });
                emitChatStream(tabId, "subAgent.completed", {
                  taskToolUseId: toolCallId,
                  status: "error",
                  error: deniedMsg,
                });
              }
              return buildPermissionOutcome(options, false);
            }
          }

          const bashCommand = this.extractBashCommandFromPermissionParams(
            params as Record<string, unknown>,
          );
          const bashCwd =
            (params as { directory?: string }).directory
            || (params as { cwd?: string }).cwd
            || this.projectPath;
          const toolCallIdEarly =
            (params as { toolCallId?: string }).toolCallId
            || (params as { tool_call_id?: string }).tool_call_id
            || (params as { callID?: string }).callID
            || ((params as { toolCall?: { id?: string; toolCallId?: string } }).toolCall?.toolCallId)
            || ((params as { toolCall?: { id?: string } }).toolCall?.id);

          // Hard block: shell TeX engines pollute manuscript; must use latex-compile.
          if (
            bashCommand
            && isDirectLatexCompileBashCommand(bashCommand)
            && (
              this.isBashTool(toolName)
              || /bash|shell|terminal|command/.test(toolName)
            )
          ) {
            log.info(
              `permission:latex-compile-bash-deny id=${permissionId} cmd=${bashCommand.slice(0, 80)}`,
            );
            if (sessionId) {
              this.pendingTaskDenialRedirect.set(sessionId, latexCompileBashRedirectNote());
            }
            if (sessionId && toolCallIdEarly) {
              denyBashJob(sessionId, toolCallIdEarly, latexCompileBashBlockMessage());
            }
            return buildPermissionOutcome(options, false);
          }

          const sessionAgent = sessionId ? this.getSessionAgent(sessionId) : undefined;
          const editFilePath = this.extractFilePathFromPermissionParams(
            params as Record<string, unknown>,
          );
          const planDraftPending =
            sessionAgent === "plan"
            && sessionId
            && this.projectPath
              ? sessionHasPendingPlanDraft(this.projectPath, sessionId)
              : false;
          const movePaths = this.extractMovePathsFromPermissionParams(
            params as Record<string, unknown>,
          );
          const planPermCtx = {
            filePath: editFilePath,
            projectRoot: this.projectPath,
            sessionId: sessionId ?? null,
            bashCommand,
            bashCwd: bashCwd,
            sourcePath: movePaths.source,
            destinationPath: movePaths.destination,
            planDraftPending,
          };
          const permRules = buildPermissionRulesFromSettings(
            getSettings() as Record<string, unknown>,
          );
          let action = resolvePermissionAction(
            mode,
            toolName,
            sessionAgent,
            planPermCtx,
            permRules,
          );
          const tabId = sessionId ? resolveChatTabId(sessionId) : undefined;
          const toolCallId =
            (params as { toolCallId?: string }).toolCallId
            || (params as { tool_call_id?: string }).tool_call_id
            || (params as { callID?: string }).callID
            || ((params as { toolCall?: { id?: string; toolCallId?: string } }).toolCall?.toolCallId)
            || ((params as { toolCall?: { id?: string } }).toolCall?.id);

          if (action === "allow") {
            log.debug(`permission:auto-allow id=${permissionId} mode=${mode} tool=${toolName || "?"} toolCallId=${toolCallId ?? "(none)"}`);
            if (
              this.isBashTool(toolName)
              && sessionId
              && toolCallId
              && isRunnableBashCommand(bashCommand)
            ) {
              // tool_call sync may have already unblocked the bridge in Auto mode.
              if (!readBashPermissionStatus(sessionId, toolCallId)) {
                this.runApprovedBash({
                  sessionId,
                  chatTabId: tabId || sessionId,
                  toolCallId,
                  command: bashCommand,
                  cwd: bashCwd || process.cwd(),
                  projectRoot: this.projectPath || undefined,
                });
              }
            } else if (this.isBashTool(toolName) && sessionId && toolCallId) {
              // Auto-allow arrived before real command — remember context, wait for backfill.
              this.bashJobContext.set(toolCallId, {
                sessionId,
                chatTabId: tabId || sessionId,
                toolCallId,
                command: bashCommand,
                cwd: bashCwd || process.cwd(),
                projectRoot: this.projectPath || undefined,
              });
              this.bashAutoApproved.add(toolCallId);
            }
            return buildPermissionOutcome(options, true);
          }
          if (action === "deny") {
            log.debug(`permission:auto-deny id=${permissionId} mode=${mode} tool=${toolName || "?"} toolCallId=${toolCallId ?? "(none)"}`);
            if (
              sessionAgent === "plan"
              && sessionId
              && editFilePath
              && getPlanPermissionOverride(toolName, planPermCtx) === "deny"
              && isResearchPlanDraftPath(editFilePath, this.projectPath)
            ) {
              // Model invented drafts/<title>.md — hard-redirect next turn to canonical path.
              const note = planDraftMissingRedirectNote(sessionId);
              this.setPendingPlanDraftRedirect(sessionId, note);
              this.pendingTaskDenialRedirect.set(
                sessionId,
                planDraftPathRedirectNote(sessionId),
              );
            }
            if (
              sessionId
              && editFilePath
              && isResearchBriefPath(editFilePath, this.projectPath)
            ) {
              this.pendingTaskDenialRedirect.set(
                sessionId,
                researchBriefEditRedirectNote(),
              );
            }
            if (
              sessionId
              && editFilePath
              && isProjectRulePath(editFilePath, this.projectPath)
            ) {
              this.pendingTaskDenialRedirect.set(
                sessionId,
                projectRuleEditRedirectNote(),
              );
            }
            if (this.isBashTool(toolName) && sessionId && toolCallId) {
              denyBashJob(sessionId, toolCallId);
            }
            if (this.isCustomGatedTool(toolName) && sessionId && toolCallId) {
              denyBashJob(sessionId, toolCallId);
              this.customToolJobContext.delete(toolCallId);
              this.emittedCustomToolUi.delete(toolCallId);
            }
            return buildPermissionOutcome(options, false);
          }

          if (this.isCustomGatedTool(toolName) && sessionId && toolCallId) {
            registerCustomToolJobIntent({ sessionId, toolCallId, toolName: toolName.toLowerCase() });
            this.customToolJobContext.set(toolCallId, {
              sessionId,
              chatTabId: tabId || sessionId,
              toolCallId,
              toolName: toolName.toLowerCase(),
            });
          }

          if (this.isBashTool(toolName) && toolCallId && sessionId) {
            this.bashJobContext.set(toolCallId, {
              sessionId,
              chatTabId: tabId || sessionId,
              toolCallId,
              command: bashCommand,
              cwd: bashCwd || process.cwd(),
              projectRoot: this.projectPath || undefined,
            });
          }

          log.info(`permission:prompt id=${permissionId} tool=${toolName || "?"} sessionId=${sessionId ?? "(none)"} tabId=${tabId ?? "(none)"} toolCallId=${toolCallId ?? "(none)"}`);
          const skipUiEmit = !!(
            toolCallId
            && (this.emittedBashUi.has(toolCallId) || this.emittedCustomToolUi.has(toolCallId))
          );
          if (!skipUiEmit) {
            this.emitNotification("session/permission", {
              ...params,
              id: permissionId,
              sessionId,
              tabId,
              toolCallId,
              toolName,
            });
          } else if (toolCallId) {
            log.info(`permission:bash-acp-linked toolCallId=${toolCallId} acpId=${permissionId}`);
          }
          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              this.pendingPermissions.delete(permissionId);
              if (this.isBashTool(toolName) && sessionId && toolCallId) {
                denyBashJob(sessionId, toolCallId);
                this.bashJobContext.delete(toolCallId);
                this.emittedBashUi.delete(toolCallId);
                this.bashAutoApproved.delete(toolCallId);
              }
              if (this.isCustomGatedTool(toolName) && sessionId && toolCallId) {
                denyBashJob(sessionId, toolCallId);
                this.customToolJobContext.delete(toolCallId);
                this.emittedCustomToolUi.delete(toolCallId);
              }
              log.warn(`permission:timeout id=${permissionId} toolCallId=${toolCallId ?? "(none)"}`);
              resolve({ outcome: { outcome: "cancelled" as const } });
            }, PERMISSION_TIMEOUT_MS);
            this.pendingPermissions.set(permissionId, {
              resolve,
              timer,
              options: Array.isArray(params.options) ? params.options : [],
              toolCallId,
              toolName,
              sessionId,
              tabId,
              bashCommand,
              bashCwd,
            });
          });
        },
        sessionUpdate: async (params) => {
          this.emitNotification("session/update", params);
        },
      }),
      ndJsonStream(stdinWeb, stdoutWeb),
    );

    // Handle process exit — auto-reconnect with exponential backoff
    const currentPid = this.proc.pid;
    this.proc.on("exit", async (code, signal) => {
      if (this.proc?.pid !== currentPid) return;

      log.info(`OpenCode process exited (pid=${currentPid} code=${code} signal=${signal})`);
      this.conn = null;
      this.proc = null;
      this.opencodeHydratedSessions.clear();

      if (this.suppressExitLifecycle) {
        return;
      }

      const wasUnexpected = code !== 0 && code !== null;
      if (!wasUnexpected) {
        this.reconnectAttempts = 0;
        this.setLifecycle("stopped");
        return;
      }

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        log.error("Max reconnect attempts reached — giving up");
        this.reconnectAttempts = 0;
        this.setLifecycle("error", "OpenCode process crashed and could not be restarted");
        this.emitNotification("agent/connectionLost", {
          error: "OpenCode process crashed and could not be restarted",
        });
        return;
      }

      const delay = this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts);
      this.reconnectAttempts++;
      this.setLifecycle("starting");
      log.warn(
        `OpenCode crashed — reconnecting in ${delay}ms ` +
        `(attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );

      await new Promise((r) => setTimeout(r, delay));
      try {
        await this.initialize();
        this.reconnectAttempts = 0;
        log.info("OpenCode reconnected successfully");
        this.emitNotification("agent/reconnected", {});
      } catch (err: any) {
        log.error(`Reconnect attempt ${this.reconnectAttempts} failed: ${err.message}`);
        this.setLifecycle("error", `Reconnection failed: ${err.message}`);
        this.emitNotification("agent/connectionLost", {
          error: `Reconnection failed: ${err.message}`,
        });
      }
    });

    // ACP initialize handshake
    try {
      const result = await this.conn.extMethod("initialize", {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
          // Declare interactive support so OpenCode enables the question tool
          userInteraction: { question: true },
        },
        clientInfo: {
          name: "prism-next",
          version: app.getVersion(),
        },
      });
      log.info(`OpenCode ACP initialized: ${JSON.stringify(result).slice(0, 200)}`);
      this.setLifecycle("ready");
      void this.refreshEffortCatalog().catch(() => {});
    } catch (err: any) {
      log.error(`ACP initialize failed: ${err.message}`);
      await this.shutdown();
      this.setLifecycle("error", `OpenCode ACP handshake failed: ${err.message}`);
      throw new Error(`OpenCode ACP handshake failed: ${err.message}`);
    }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.lifecyclePhase !== "error") {
        this.setLifecycle("error", message);
      }
      throw err instanceof Error ? err : new Error(message);
    } finally {
      this.suppressExitLifecycle = false;
    }
  }

  async shutdown(): Promise<void> {
    for (const t of this.killTimers) clearTimeout(t);
    this.killTimers = [];

    if (this.conn && this.proc) {
      log.info("Shutting down OpenCode ACP connection");
      try {
        this.conn.extNotification("exit", {});
      } catch { /* best-effort — process may already be dead */ }

      const proc = this.proc;
      try { proc.kill("SIGTERM"); } catch { /* best-effort */ }

      // SIGKILL fallback after 5s if the process hasn't exited gracefully
      const killTimer = setTimeout(() => {
        try {
          if (proc.exitCode === null && proc.signalCode === null) {
            log.warn("OpenCode did not exit after SIGTERM — sending SIGKILL");
            proc.kill("SIGKILL");
          }
        } catch { /* SIGKILL may fail if process already exited */ }
      }, SIGKILL_GRACE_MS);
      this.killTimers.push(killTimer);
    }

    this.conn = null;
    this.proc = null;
    this.bakedExtraEnv = {};
    effortCatalog.clear();
  }

  async healthCheck(): Promise<{ healthy: boolean; version: string }> {
    if (!this.conn) return { healthy: false, version: "" };
    try {
      const result = await this.conn.extMethod("ping", {});
      return {
        healthy: true,
        version: (result as any)?.version || "unknown",
      };
    } catch {
      // ping may not be supported by all ACP implementations (OpenCode doesn't
      // implement it yet). If the process is still alive, report healthy —
      // the connection can still handle session/prompt and other methods.
      if (this.proc && this.proc.exitCode === null && this.proc.signalCode === null) {
        return { healthy: true, version: "connected" };
      }
      return { healthy: false, version: "" };
    }
  }

  // ─── Session Management ─────────────────────────────────────

  /**
   * Pre-scan project agent config at project-open time.
   * Caches the result so session creation (first chat) is instant.
   */
  /**
   * Read agent config from .prismnext/agent/ on disk.
   * Used by both prewarmProject (cache) and loadProjectAgentConfig (fallback).
   */
  private readAgentConfig(projectRoot: string): {
    mcpServers: AcpMcpServer[];
    additionalDirectories: string[];
  } {
    const agentDir = join(projectRoot, ".prismnext", "agent");

    // Ensure mcp.json exists; strip legacy Paper Search MCP if present.
    try {
      ensureDefaultMcpServers(agentDir);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`ensureDefaultMcpServers failed: ${message}`);
    }

    const additionalDirectories: string[] = [];
    const skillsDir = join(agentDir, "skills");
    if (existsSync(skillsDir)) {
      additionalDirectories.push(skillsDir);
    }

    let mcpServers: AcpMcpServer[] = [];
    const mcpPath = join(agentDir, "mcp.json");
    if (existsSync(mcpPath)) {
      try {
        const raw = readFileSync(mcpPath, "utf-8");
        const config = JSON.parse(raw);
        mcpServers = mcpJsonToAcpServers(config.mcpServers);
      } catch (err: any) {
        log.warn(`Failed to load ${mcpPath}: ${err.message}`);
      }
    }

    return { mcpServers, additionalDirectories };
  }

  prewarmProject(projectRoot: string): void {
    const { mcpServers, additionalDirectories } = this.readAgentConfig(projectRoot);
    this.cachedAgentConfig = { projectRoot, mcpServers, additionalDirectories };
    log.info("Project agent config cached", {
      projectRoot,
      skillsActive: additionalDirectories.length > 0,
      mcpServers: mcpServers.length,
      mcpNames: mcpServers.map((s) => s.name),
    });
    void import("../services/project-experts-refresh")
      .then(({ refreshProjectExpertsIntegration }) =>
        refreshProjectExpertsIntegration(projectRoot),
      )
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Experts integration refresh failed during prewarm: ${message}`);
      });
  }

  /**
   * Merge per-project skill discovery into app-level OpenCode config
   * (`userData/opencode-server/config/opencode/opencode.json`), not the project tree.
   * skills.paths use forward slashes — valid on Windows, macOS, and Linux.
   */
  applyProjectSkillsIntegration(
    projectRoot: string,
    patch: { skillsPaths: string[]; skillPermissions: Record<string, string> },
  ): { configPath: string; changed: boolean } {
    const primaryPath = join(this.getServerDataDir(), "config", "opencode", "opencode.json");
    let anyChanged = false;
    for (const p of this.getOpencodeConfigPaths()) {
      try {
        let config: Record<string, unknown> = {};
        if (existsSync(p)) {
          try {
            config = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn(`Skipping invalid OpenCode config ${p}: ${message}`);
            continue;
          }
        }

        if (!config.$schema) {
          config.$schema = "https://opencode.ai/config.json";
        }

        const existingSkills = (config.skills as Record<string, unknown> | undefined) ?? {};
        const nextSkills: Record<string, unknown> = {
          ...existingSkills,
          paths: patch.skillsPaths,
        };
        delete nextSkills.urls;

        const existingPermission = (config.permission as Record<string, unknown> | undefined) ?? {};
        const nextPermission = {
          ...existingPermission,
          skill: sanitizeSkillPermissionMap(existingPermission.skill, patch.skillPermissions),
        };

        const nextConfig: Record<string, unknown> = {
          ...config,
          skills: nextSkills,
          permission: nextPermission,
        };

        const prevSerialized = JSON.stringify(config, null, 2);
        const nextSerialized = JSON.stringify(nextConfig, null, 2);
        if (prevSerialized === nextSerialized) {
          continue;
        }
        anyChanged = true;

        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, nextSerialized, "utf-8");
        log.info("Applied project skills integration", {
          projectRoot,
          configPath: p,
          skillsPaths: patch.skillsPaths,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to apply project skills to ${p}: ${message}`);
      }
    }
    return { configPath: primaryPath, changed: anyChanged };
  }

  /**
   * Merge prismnext instruction paths into app-level OpenCode config.
   * OpenCode reads `instructions` at process start — restart when paths change.
   */
  applyProjectPromptIntegration(_projectRoot: string): {
    configPath: string;
    instructionsChanged: boolean;
  } {
    const primaryPath = join(this.getServerDataDir(), "config", "opencode", "opencode.json");
    let instructionsChanged = false;

    for (const p of this.getOpencodeConfigPaths()) {
      try {
        let config: Record<string, unknown> = {};
        if (existsSync(p)) {
          try {
            config = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn(`Skipping invalid OpenCode config ${p}: ${message}`);
            continue;
          }
        }

        if (!config.$schema) {
          config.$schema = "https://opencode.ai/config.json";
        }

        const merged = mergeOpencodeInstructions(config);
        if (merged.changed) {
          instructionsChanged = true;
          mkdirSync(dirname(p), { recursive: true });
          writeFileSync(p, JSON.stringify(merged.config, null, 2), "utf-8");
          log.info("Applied project prompt integration", {
            configPath: p,
            instructions: PRISM_OPENCODE_INSTRUCTIONS,
            changed: true,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to apply project prompt integration to ${p}: ${message}`);
      }
    }

    return { configPath: primaryPath, instructionsChanged };
  }

  /** Restart OpenCode so skills.paths / permission.skill changes are picked up. */
  async reloadAfterSkillsIntegration(): Promise<void> {
    if (!this.conn) return;
    log.info("Restarting OpenCode to apply skills integration");
    this.suppressExitLifecycle = true;
    try {
      await this.shutdown();
      await this.initialize();
    } finally {
      this.suppressExitLifecycle = false;
    }
  }

  /** Restart OpenCode so synced expert/orchestrator agent definitions are picked up. */
  async reloadAfterExpertsIntegration(): Promise<void> {
    if (!this.conn) return;
    log.info("Restarting OpenCode to apply experts integration");
    this.suppressExitLifecycle = true;
    try {
      await this.shutdown();
      await this.initialize();
    } finally {
      this.suppressExitLifecycle = false;
    }
  }

  /**
   * Sync prism-next's built-in custom tools to the directory OpenCode scans.
   *
   * ## How prism‑next custom tools work
   *
   * prism-next only syncs built-in tools into the app-level config directory.
   * We intentionally do not write project-level `.opencode/` tools/config.
   *
   * prism-next sets `XDG_CONFIG_HOME` to `<userData>/opencode-server/config/`,
   * so the tools directory resolves to:
   *   `<userData>/opencode-server/config/opencode/tools/`
   *
   * On **every app startup**, this method copies the built-in tool files from
   * `src/main/tools/` (the dev-authorised source of truth) into that directory.
   * This means OpenCode picks them up automatically — no user configuration
   * needed, no MCP layer, no extra processes.
   *
   * ## Adding a new prism‑next built-in tool
   *
   *   1. Create `src/main/tools/<tool-name>.ts` using `@opencode-ai/plugin`'s
   *      `tool()` helper (see template inline docs in that directory).
   *   2. Add its metadata to `BUILTIN_TOOLS` in `src/main/tools/index.ts`.
   *   3. Add a Widget in `src/renderer/components/modules/chat/tools/` and
   *      register it in the `CUSTOM_TOOL_WIDGETS` map in `tools/index.tsx`.
   *
   * The file name (minus `.ts`) **is** the tool name as OpenCode sees it.
   * A custom tool can even override a built-in OpenCode tool — e.g. naming
   * a file `bash.ts` replaces the built-in bash tool entirely.
   *
   * @see src/main/tools/index.ts — tool registry + metadata
   * @see src/renderer/components/modules/chat/tools/index.tsx — Widget registry
   */
  async syncBuiltinTools(): Promise<void> {
    const serverDir = this.getServerDataDir();
    // OpenCode resolves tools at $XDG_CONFIG_HOME/opencode/tools/
    const toolsDir = join(serverDir, "config", "opencode", "tools");
    mkdirSync(toolsDir, { recursive: true });

    const bridgeContent = readBridgePathsSource();
    if (bridgeContent) {
      const bridgeDest = join(toolsDir, "bridge-paths.ts");
      if (!existsSync(bridgeDest) || readFileSync(bridgeDest, "utf-8") !== bridgeContent) {
        writeFileSync(bridgeDest, bridgeContent, "utf-8");
      }
    } else {
      log.error("bridge-paths.ts missing from tools source — custom OpenCode tools will fail to load");
    }

    const pollContent = readPermissionBridgePollSource();
    if (pollContent) {
      const pollDest = join(toolsDir, "permission-bridge-poll.ts");
      if (!existsSync(pollDest) || readFileSync(pollDest, "utf-8") !== pollContent) {
        writeFileSync(pollDest, pollContent, "utf-8");
      }
    } else {
      log.error("permission-bridge-poll.ts missing from tools source — gated tools will fail to load");
    }

    const files = getBuiltinToolFiles();
    if (files.length === 0) {
      log.debug("No built-in tools to sync — directory is empty");
      return;
    }

    let synced = 0;
    const { getSettings } = await import("../services/settings");
    const agentTerminalMode = (getSettings().agentTerminalMode as string) || "pty";

    const metaByName = new Map(BUILTIN_TOOLS.map((t) => [t.name, t]));

    for (const { name, content } of files) {
      const dest = join(toolsDir, `${name}.ts`);

      if (name === "bash" && agentTerminalMode !== "pty") {
        if (existsSync(dest)) {
          try { unlinkSync(dest); } catch {}
          log.info("Removed prismnext bash tool (mirror mode uses OpenCode built-in)");
        }
        continue;
      }

      const meta = metaByName.get(name);
      const syncedContent = meta
        ? patchToolDescription(content, buildOpencodeToolDescription(meta))
        : content;

      try {
        // Write tool file (idempotent — only overwrites if content differs)
        if (existsSync(dest)) {
          const existing = readFileSync(dest, "utf-8");
          if (existing === syncedContent) continue; // unchanged
        }
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, syncedContent, "utf-8");
        synced++;
      } catch (err: any) {
        log.warn(`Failed to sync tool "${name}": ${err.message}`);
      }
    }

    if (synced > 0) {
      log.info(`Synced ${synced} built-in tool(s) to ${toolsDir}`);
      if (this.conn || this.proc) {
        log.info("Built-in tool files changed — OpenCode restart required on next initialize");
      }
    } else {
      log.debug("Built-in tools already up-to-date");
    }

    const currentNames = new Set(files.map((f) => f.name));
    // Shared import helpers — not in getBuiltinToolFiles() but must not be treated as stale.
    if (bridgeContent) currentNames.add("bridge-paths");
    if (pollContent) currentNames.add("permission-bridge-poll");
    for (const entry of readdirSync(toolsDir)) {
      if (!entry.endsWith(".ts") || entry === "index.ts") continue;
      const name = entry.replace(/\.ts$/, "");
      if (currentNames.has(name)) continue;
      const stalePath = join(toolsDir, entry);
      try {
        unlinkSync(stalePath);
        synced++;
        log.info(`Removed stale OpenCode tool file: ${entry}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to remove stale tool "${entry}": ${message}`);
      }
    }
  }

  private getOpencodeConfigPaths(): string[] {
    return [
      join(this.getServerDataDir(), "config", "opencode", "opencode.json"),
      join(this.getServerDataDir(), "config", "opencode", "opencode.jsonc"),
      join(this.getServerDataDir(), "opencode", "opencode.json"),
    ];
  }

  /**
   * Fix corrupted `permission.skill` maps in app-level OpenCode config.
   * Runs automatically on every OpenCode spawn — users never edit Application Support manually.
   *
   * Handles legacy numeric-key corruption (string spread bug) and string-form
   * skill permission. Intentional per-skill allow/deny maps from
   * `applyProjectSkillsIntegration` are left intact (stale denies are cleared
   * there via sanitize + patch, not by wiping on every spawn).
   */
  /**
   * Inject opencode-go variants into opencode.json on OpenCode ≤1.17.x only.
   * ≥1.18 builds variants from models.dev `reasoning_options` at runtime.
   */
  applyOpenCodeGoEffortVariantsConfig(): void {
    const version = probeBundledOpencodeVersionSync();
    const skipSync = shouldSkipEffortVariantConfigSync(version);
    if (skipSync) {
      log.info(
        `OpenCode ${version ?? "unknown"} — skipping effort variant config sync (catalog-native variants)`,
      );
    }
    const changed = syncOpenCodeGoEffortVariants(
      this.getOpencodeConfigPaths(),
      modelsDevCachePath(this.getServerDataDir()),
      { enabled: !skipSync },
    );
    if (changed) {
      effortCatalog.clear();
    }
  }

  repairOpencodeServerConfigs(): void {
    for (const p of this.getOpencodeConfigPaths()) {
      if (!existsSync(p)) continue;
      try {
        const config = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
        const permission = config.permission as Record<string, unknown> | undefined;
        if (!permission) continue;

        const before = permission.skill;
        // Only fix corruption / string form. Do NOT wipe intentional per-skill
        // allow/deny maps — those are written by applyProjectSkillsIntegration
        // and must survive spawn so we can sync-before-start without a reload.
        const needsRepair =
          skillPermissionNeedsRepair(before)
          || typeof before === "string";
        if (!needsRepair) continue;

        permission.skill = sanitizeSkillPermissionMap(before, {});
        writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
        log.info("Repaired OpenCode permission.skill in app config", { path: p });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to repair OpenCode config ${p}: ${message}`);
      }
    }
  }

  /**
   * Merge enabled tools into all OpenCode config files on every startup.
   * Ensures new prismnext custom tools (delete, move, …) are visible to the model
   * even when opencode.json already exists on disk.
   */
  applyBuiltinToolsConfig(overrides?: Record<string, boolean>): void {
    for (const p of this.getOpencodeConfigPaths()) {
      try {
        let config: Record<string, unknown> = {};
        if (existsSync(p)) {
          try {
            config = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn(`Skipping invalid OpenCode config ${p}: ${message}`);
            continue;
          }
        }
        if (!config.$schema) {
          config.$schema = "https://opencode.ai/config.json";
        }
        config.tools = buildEnabledToolsConfig(
          config.tools as Record<string, unknown> | undefined,
          overrides,
        );
        const settings = getSettings() as Record<string, unknown>;
        const next = ensureSubagentModelConfig(
          ensurePlanAgentPermissionConfig(config),
          settings.aiSubagentModel as string | null | undefined,
        );
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, JSON.stringify(next, null, 2), "utf-8");
        log.info(`Applied built-in tools config to ${p}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to apply built-in tools to ${p}: ${message}`);
      }
    }
  }

  /**
   * Merge permission rules for the given mode into all OpenCode config files.
   * Called on startup and whenever the user changes permission mode in settings.
   */
  applyPermissionMode(mode: PermissionMode | string | undefined): void {
    const resolved = resolvePermissionMode(mode);
    const permissions = getPermissionRulesForMode(resolved);

    for (const p of this.getOpencodeConfigPaths()) {
      try {
        let config: Record<string, unknown> = {};
        if (existsSync(p)) {
          try {
            config = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
          } catch (err: any) {
            log.warn(`Skipping invalid OpenCode config ${p}: ${err.message}`);
            continue;
          }
        }

        if (!config.$schema) {
          config.$schema = "https://opencode.ai/config.json";
        }

        const { skill: toolSkillRule, ...toolRules } = permissions;
        const existingPermission = (config.permission as Record<string, unknown> | undefined) ?? {};
        const existingSkillPerm = existingPermission.skill;
        const hasSkillMap =
          existingSkillPerm &&
          typeof existingSkillPerm === "object" &&
          !Array.isArray(existingSkillPerm);

        config.permission = {
          ...existingPermission,
          ...toolRules,
        };

        if (hasSkillMap) {
          (config.permission as Record<string, unknown>).skill = sanitizeSkillPermissionMap(
            existingSkillPerm,
            {},
          );
        } else if (toolSkillRule) {
          (config.permission as Record<string, unknown>).skill = toolSkillRule;
        }

        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
        log.info(`Applied permission mode "${resolved}" to ${p}`);
      } catch (err: any) {
        log.warn(`Failed to apply permission mode to ${p}: ${err.message}`);
      }
    }
  }

  /**
   * Restart the OpenCode subprocess so it picks up permission config changes.
   * OpenCode reads opencode.json at process start and does not hot-reload it.
   */
  async reloadAfterPermissionModeChange(): Promise<void> {
    if (!this.proc && !this.conn) return;
    log.info("Restarting OpenCode to apply permission mode change");
    await this.shutdown();
    await this.initialize();
  }

  /** Restart OpenCode so custom tools (e.g. prismnext bash) are picked up. */
  async reloadAfterToolsChange(): Promise<void> {
    if (!this.proc && !this.conn) return;
    log.info("Restarting OpenCode to apply agent terminal mode / tools change");
    await this.shutdown();
    await this.initialize();
  }

  async applyAgentTerminalMode(mode: string | undefined): Promise<void> {
    const resolved = (mode as string) || "pty";
    const enableBuiltinBash = resolved !== "pty";
    this.applyBuiltinToolsConfig({ bash: enableBuiltinBash });
  }

  /**
   * Write a default `opencode.json` enabling ALL built-in tools.
   *
   * OpenCode disables websearch, question, and several other tools by
   * default (privacy-first approach).  Without an explicit config, the AI
   * simply cannot see or call these tools.  We write a minimal config that
   * enables everything so the full toolbox is available.
   *
   * Path: `<userData>/opencode-server/config/opencode/opencode.json`
   * (because XDG_CONFIG_HOME = <userData>/opencode-server/config/)
   */
  private writeDefaultConfig(): void {
    const settings = getSettings() as Record<string, unknown>;
    const defaultConfig = ensureSubagentModelConfig(
      ensurePlanAgentPermissionConfig({
        $schema: "https://opencode.ai/config.json",
        tools: buildEnabledToolsConfig(),
        permission: {
          edit: "ask",
          bash: "ask",
          webfetch: "allow",
          websearch: "allow",
          question: "allow",
          task: "allow",
          skill: "allow",
        },
        // Auto-compaction: OpenCode's native compaction agent automatically
        // summarizes old conversation history when context reaches 70% of the
        // model's limit. Users can also trigger compaction manually via /compact.
        compaction: {
          auto: true,
          threshold: 0.85,
          prune: true,
        },
        instructions: [...PRISM_OPENCODE_INSTRUCTIONS],
      }),
      settings.aiSubagentModel as string | null | undefined,
    );

    const configStr = JSON.stringify(defaultConfig, null, 2);

    // OpenCode reads config from multiple locations depending on version:
    //   $XDG_CONFIG_HOME/opencode/opencode.json(c)
    //   $XDG_DATA_HOME/opencode/opencode.json
    // We write to all known locations, skipping only if user has meaningful
    // custom content (more than just the $schema stub).
    for (const p of this.getOpencodeConfigPaths()) {
      try {
        // Skip if user already has meaningful custom config (more than just schema)
        if (existsSync(p)) {
          const existing = readFileSync(p, "utf-8").trim();
          if (existing.length > MIN_CUSTOM_CONFIG_LENGTH) {
            log.debug(`OpenCode config exists with custom content: ${p}`);
            continue;
          }
        }
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, configStr, "utf-8");
        log.info(`Wrote default OpenCode config: ${p}`);
      } catch (err: any) {
        log.warn(`Failed to write OpenCode config ${p}: ${err.message}`);
      }
    }
  }

  /** Load project-level agent config. Uses cache from prewarmProject when available. */
  private loadProjectAgentConfig(
    projectRoot: string,
    options?: { mcpServerAllowlist?: string[]; eagerOnly?: boolean },
  ): {
    mcpServers: AcpMcpServer[];
    additionalDirectories: string[];
  } {
    const base =
      this.cachedAgentConfig?.projectRoot === projectRoot
        ? {
            mcpServers: this.cachedAgentConfig.mcpServers,
            additionalDirectories: this.cachedAgentConfig.additionalDirectories,
          }
        : this.readAgentConfig(projectRoot);

    if (options?.eagerOnly) {
      return {
        ...base,
        mcpServers: base.mcpServers.filter((s) => isEagerMcpServer(s.name)),
      };
    }

    // Empty allowlist = load none (not "all"). Undefined = full project set.
    if (options?.mcpServerAllowlist !== undefined) {
      const allow = new Set(options.mcpServerAllowlist);
      return {
        ...base,
        mcpServers: base.mcpServers.filter((s) => allow.has(s.name)),
      };
    }

    return base;
  }

  /**
   * Create a session for the given project directory.
   * The cwd parameter tells OpenCode which project this session belongs to.
   * System prompt is NOT set here — delivery is via sendPrompt() first-turn
   * content block only (avoids double injection with session/new).
   */
  async createSession(
    cwd: string,
    model?: string,
    projectRoot?: string,
    options?: { mcpServerAllowlist?: string[]; agentId?: string },
  ): Promise<SessionInfo> {
    if (!this.conn) throw new Error("AcpService not initialized");

    this.projectPath = cwd;
    const root = projectRoot || cwd;
    // session/new: no MCP (incl. built-in paper-search). Connect on demand via
    // ensureSessionMcps / session/load when composer or orchestrator allowlists it.
    const { mcpServers, additionalDirectories } = this.loadProjectAgentConfig(root, {
      eagerOnly: true,
    });

    const params: any = { cwd, mcpServers };
    if (options?.agentId) {
      params.agent = options.agentId;
    }
    if (additionalDirectories.length > 0) {
      params.additionalDirectories = additionalDirectories;
    }

    log.info("Creating ACP session", {
      cwd,
      mcpCount: mcpServers.length,
      mcpNames: mcpServers.map((s) => s.name),
      mcpMode: "lazy",
    });

    const result = await this.conn.extMethod("session/new", params);

    const sessionId = (result as any)?.sessionId || (result as any)?.id;
    if (!sessionId) throw new Error("session/new did not return a sessionId");
    this.opencodeHydratedSessions.add(sessionId);
    this.sessionLoadedMcpNames.set(sessionId, new Set(mcpServers.map((s) => s.name)));

    // Set the model via standard ACP session/set_model
    if (model) {
      await this.applySessionModel(sessionId, model);
    } else {
      log.warn("session/new without model — OpenCode will keep its default (often opencode/big-pickle)");
    }

    return {
      id: sessionId,
      title: "New Chat",
      lastModified: Date.now(),
      createdAt: Date.now(),
    };
  }

  /** OpenCode rejected the session id (lost after cancel/restart/cwd change). */
  static isSessionNotFoundError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /session not found/i.test(msg);
  }

  /**
   * Drop the "already hydrated" cache and force ACP session/load.
   * @returns true if OpenCode accepted the load (session is usable again).
   */
  async forceRehydrateSession(
    sessionId: string,
    cwd: string,
    projectRoot?: string,
  ): Promise<boolean> {
    this.opencodeHydratedSessions.delete(sessionId);
    await this.initSession(sessionId, cwd, projectRoot);
    return this.opencodeHydratedSessions.has(sessionId);
  }

  /**
   * Apply model via ACP session/set_model. Throws on failure so callers do not
   * silently fall through to OpenCode's free default (opencode/big-pickle).
   */
  private async applySessionModel(sessionId: string, modelId: string): Promise<void> {
    if (!this.conn) throw new Error("AcpService not initialized");
    try {
      await this.conn.extMethod("session/set_model", { sessionId, modelId });
      log.info(`session/set_model ok: ${modelId}`);
      await this.syncEffortCatalogForSessionModel(sessionId, modelId);
    } catch (err: any) {
      const detail = err?.message || String(err);
      log.warn(`session/set_model failed for ${modelId}: ${detail}`);
      if (AcpService.isSessionNotFoundError(err)) {
        throw new Error(
          `Session not found in OpenCode ACP map (${sessionId}). ` +
            `The chat should still exist — retry will re-bind via session/load without discarding history.`,
        );
      }
      const missingCatalog =
        /model not found/i.test(detail) &&
        (modelId.startsWith("opencode-go/") || modelId.startsWith("opencode/"));
      const hint = missingCatalog
        ? " OpenCode Go/Zen models need a valid OPENCODE_API_KEY — re-save the key in Settings → AI, then restart prismnext."
        : "";
      throw new Error(`Failed to switch model to ${modelId}: ${detail}.${hint}`);
    }
  }

  /**
   * Set a session configuration option via ACP.
   * Reasoning depth uses configId `"effort"` (category `thought_level`).
   */
  async setConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<{ configOptions?: OpencodeSessionConfigOption[] }> {
    if (!this.conn) throw new Error("AcpService not initialized");
    const result = await this.conn.extMethod("session/set_config_option", {
      sessionId,
      configId,
      value,
    });
    const configOptions = (result as { configOptions?: OpencodeSessionConfigOption[] })
      ?.configOptions;
    if (configOptions?.length && configId === "effort") {
      // Effort options are model-scoped; caller may ingest with explicit model ref.
    }
    return { configOptions };
  }

  /** Probe effort variants for the session's current model (catalog ingest only). */
  async syncEffortCatalogForSessionModel(
    sessionId: string,
    modelRef: string,
  ): Promise<void> {
    const prism = prismModelFromRuntimeRef(modelRef);
    if (!prism) return;
    const cached = effortCatalog.getEfforts(prism.providerId, prism.modelId);
    if (cached?.length) return;
    if (!this.conn) return;
    try {
      const { configOptions } = await this.setConfigOption(
        sessionId,
        "effort",
        cached?.[0] ?? "high",
      );
      effortCatalog.ingestConfigOptions(
        prism.providerId,
        prism.modelId,
        configOptions,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.debug(
        `syncEffortCatalogForSessionModel ${modelRef}: ${message}`,
      );
    }
  }

  async refreshEffortCatalog(): Promise<void> {
    let ingested = 0;
    if (this.conn) {
      try {
        const result = await this.conn.extMethod("providers/list", {});
        ingested = effortCatalog.ingestProvidersList(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.debug(`providers/list unavailable (${message}) — trying models.json cache`);
      }
    }
    if (ingested === 0) {
      this.applyOpenCodeGoEffortVariantsConfig();
      ingested = this.refreshEffortCatalogFromModelsCache();
    }
    if (ingested === 0) {
      log.warn("Effort catalog refresh returned 0 models (providers/list + models.json)");
    }
  }

  private refreshEffortCatalogFromModelsCache(): number {
    const raw = this.readModelsDevCacheRaw();
    if (!raw) return 0;
    return effortCatalog.ingestModelsDevCache(raw);
  }

  getEffortCatalogSnapshot() {
    return effortCatalog.getSnapshot();
  }

  getOpenCodeModelsCatalogSnapshot(): OpenCodeModelsCatalogSnapshot {
    const raw = this.readModelsDevCacheRaw();
    const entries = raw ? buildModelsCatalogFromModelsDevCache(raw) : {};
    return { entries, fetchedAt: Date.now() };
  }

  /**
   * Lazy provider model list for Settings.
   * OpenRouter: live API when key present, else models.json.
   * openai / anthropic / google / deepseek: models.json only (richer metadata).
   */
  async fetchProviderModels(
    providerId: string,
    apiKey?: string,
    baseUrl?: string,
  ): Promise<{ models: OpenRouterModelRow[]; source: "api" | "cache" }> {
    const id = providerId.trim();
    if (!isLazyCatalogProvider(id)) {
      return { models: [], source: "cache" };
    }

    if (id === OPENROUTER_PROVIDER_ID) {
      return this.fetchOpenRouterModels(apiKey, baseUrl);
    }

    return this.fetchProviderModelsFromCache(id);
  }

  /**
   * Lazy OpenRouter model list for Settings: prefer live API when a key is present,
   * else fall back to OpenCode `models.json` openrouter section.
   */
  async fetchOpenRouterModels(
    apiKey?: string,
    baseUrl?: string,
  ): Promise<{ models: OpenRouterModelRow[]; source: "api" | "cache" }> {
    const key = apiKey?.trim() ?? "";
    if (key && !/[^\u0000-\u00ff]/.test(key)) {
      try {
        const base = (baseUrl?.trim() || "https://openrouter.ai/api/v1").replace(
          /\/+$/,
          "",
        );
        const listUrl = /\/v\d+$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
        const res = await fetch(listUrl, {
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const body = (await res.json()) as unknown;
          const models = parseOpenRouterApiModels(body);
          if (models.length > 0) {
            return { models, source: "api" };
          }
        } else {
          log.warn(
            `fetchOpenRouterModels API ${res.status} from ${listUrl}; falling back to cache`,
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`fetchOpenRouterModels API failed: ${message}; falling back to cache`);
      }
    }

    return this.fetchProviderModelsFromCache(OPENROUTER_PROVIDER_ID);
  }

  private fetchProviderModelsFromCache(
    providerId: string,
  ): { models: OpenRouterModelRow[]; source: "cache" } {
    const raw = this.readModelsDevCacheRaw();
    const entries = raw
      ? buildModelsCatalogFromModelsDevCache(raw, PRISM_LAZY_FETCH_CATALOG_PROVIDERS)
      : {};
    const cached: CatalogModelRow[] = entries[providerId] ?? [];
    return {
      models: cached.map((row) => ({
        id: normalizeOpenCodeModelId(providerId, row.id),
        name: row.name,
        contextWindow: row.contextWindow,
        capabilities: row.capabilities,
        description: row.description,
      })),
      source: "cache",
    };
  }

  private readModelsDevCacheRaw(): unknown | null {
    const cachePath = join(
      this.getServerDataDir(),
      "cache",
      "opencode",
      "models.json",
    );
    if (!existsSync(cachePath)) {
      log.debug(`models.json cache missing: ${cachePath}`);
      return null;
    }
    try {
      return JSON.parse(readFileSync(cachePath, "utf8")) as unknown;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Failed to read models.json cache: ${message}`);
      return null;
    }
  }

  resolveModelEffort(prismProviderId: string, modelId: string, fallback?: string[] | null) {
    return effortCatalog.resolveModelEffort(prismProviderId, modelId, fallback);
  }

  validateModelEffort(
    prismProviderId: string,
    modelId: string,
    effort: string | undefined,
    fallback?: string[] | null,
  ): string | undefined {
    return effortCatalog.validateEffort(
      prismProviderId,
      modelId,
      effort,
      fallback,
    );
  }

  setSessionAgent(sessionId: string, agent: SessionAgent): void {
    this.sessionAgents.set(sessionId, resolveSessionAgent(agent));
  }

  getSessionAgent(sessionId: string): SessionAgent {
    return this.sessionAgents.get(sessionId) ?? "build";
  }

  async applySessionAgent(sessionId: string, agent: SessionAgent): Promise<void> {
    const resolved = resolveSessionAgent(agent);
    this.setSessionAgent(sessionId, resolved);
    try {
      await this.setConfigOption(sessionId, "agent", resolved);
    } catch (err: any) {
      log.debug(`setConfigOption agent=${resolved} failed: ${err.message}`);
    }
  }

  /**
   * Test a provider connection by making a direct HTTP request to the provider's API.
   * Does NOT go through OpenCode — validates the API key directly.
   */
  async testConnection(
    provider: string,
    apiKey: string,
    baseUrl?: string,
  ): Promise<{ success: boolean; models?: string[] }> {
    const key = apiKey.trim();
    if (!key) {
      log.warn(`testConnection: empty apiKey for ${provider}`);
      return { success: false };
    }
    // Fetch headers must be ByteString (Latin-1); Chinese paste into the key field
    // previously surfaced as an opaque "Cannot convert argument to a ByteString".
    if (/[^\u0000-\u00ff]/.test(key)) {
      log.warn(
        `testConnection failed for ${provider}: API key contains non-ASCII characters (check paste)`,
      );
      return { success: false };
    }

    const endpoints: Record<string, { url: string; header: string; prefix: string }> = {
      anthropic: {
        url: baseUrl || "https://api.anthropic.com",
        header: "x-api-key",
        prefix: "",
      },
      openai: {
        url: baseUrl || "https://api.openai.com",
        header: "Authorization",
        prefix: "Bearer ",
      },
      google: {
        url: "https://generativelanguage.googleapis.com", // uses query param, handled specially
        header: "",
        prefix: "",
      },
      deepseek: {
        url: baseUrl || "https://api.deepseek.com",
        header: "Authorization",
        prefix: "Bearer ",
      },
      openrouter: {
        url: baseUrl || "https://openrouter.ai/api",
        header: "Authorization",
        prefix: "Bearer ",
      },
      groq: {
        url: baseUrl || "https://api.groq.com/openai",
        header: "Authorization",
        prefix: "Bearer ",
      },
      mistral: {
        url: baseUrl || "https://api.mistral.ai",
        header: "Authorization",
        prefix: "Bearer ",
      },
      // Bases already include /v1 — do not append another /v1 (see resolveModelsListUrl).
      "opencode-go": {
        url: baseUrl || "https://opencode.ai/zen/go/v1",
        header: "Authorization",
        prefix: "Bearer ",
      },
      "opencode-zen": {
        url: baseUrl || "https://opencode.ai/zen/v1",
        header: "Authorization",
        prefix: "Bearer ",
      },
      opencode: {
        url: baseUrl || "https://opencode.ai/zen/v1",
        header: "Authorization",
        prefix: "Bearer ",
      },
    };

    const ep = endpoints[provider];
    if (!ep && !baseUrl) {
      log.warn(`testConnection: unknown provider ${provider} and no baseUrl`);
      return { success: false };
    }

    try {
      // Google uses API key as query parameter
      if (provider === "google") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
        const res = await fetch(url);
        const data = await res.json() as any;
        const models = data?.models?.map((m: any) => m.name?.replace("models/", "")) || undefined;
        return { success: res.ok, models };
      }

      const base = ep?.url || baseUrl!;
      const listUrl = resolveModelsListUrl(base);
      const headers: Record<string, string> = {};
      if (ep?.header && ep?.prefix !== undefined) {
        headers[ep.header] = ep.prefix + key;
      } else {
        headers["Authorization"] = `Bearer ${key}`;
      }
      // OpenCode Go/Zen also accept x-api-key (same subscription key for both).
      if (
        provider === "opencode-go"
        || provider === "opencode-zen"
        || provider === "opencode"
      ) {
        headers["x-api-key"] = key;
      }

      const res = await fetch(listUrl, { headers });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        const preview = (await res.text()).slice(0, 80);
        log.warn(
          `testConnection failed for ${provider}: non-JSON from ${listUrl} (${res.status}) ${preview}`,
        );
        return { success: false };
      }
      const data = await res.json() as any;
      const models = data?.data?.map((m: any) => m.id) || data?.models?.map((m: any) => m.id || m.name) || undefined;
      return { success: res.ok, models };
    } catch (err: any) {
      log.warn(`testConnection failed for ${provider}: ${err.message}`);
      return { success: false };
    }
  }

  /**
   * List sessions for a given project directory.
   * Queries OpenCode's SQLite database directly.
   *
   * Generic "New Chat" titles from OpenCode are replaced on the renderer
   * side with tab titles (first user message text). This avoids fragile
   * SQLite-level message extraction with timing issues.
   */
  async listSessions(projectPath?: string): Promise<SessionInfo[]> {
    const dir = projectPath || this.projectPath;
    try {
      return await this.withDb((db) => {
        // UX: only list sessions that have at least one message (empty drafts stay off history).
        const rows = db.prepare(
          `SELECT s.id, s.title, s.time_created, s.time_updated
           FROM session s
           WHERE s.directory = ?
             AND s.time_archived IS NULL
             AND s.parent_id IS NULL
             AND EXISTS (SELECT 1 FROM message m WHERE m.session_id = s.id)
           ORDER BY s.time_updated DESC`,
        ).all(dir) as Array<{
          id: string; title: string; time_created: number; time_updated: number;
        }>;
        return rows
          .filter((r: any) => !this.subAgentSessions.has(r.id))
          .map((r: any) => ({
            id: r.id,
            title: r.title || r.id,
            lastModified: r.time_updated,
            createdAt: r.time_created,
            directory: dir,
          }));
      }, { readonly: true });
    } catch (err: any) {
      log.warn(`Failed to list sessions from SQLite: ${err.message}`);
      return [];
    }
  }

  /** Empty (no messages), non-archived parent sessions for a directory. */
  private async listEmptySessionIds(projectPath: string): Promise<string[]> {
    const dir = projectPath;
    try {
      return await this.withDb((db) => {
        const rows = db.prepare(
          `SELECT s.id FROM session s
           WHERE s.directory = ?
             AND s.time_archived IS NULL
             AND s.parent_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM message m WHERE m.session_id = s.id)
           ORDER BY s.time_updated DESC`,
        ).all(dir) as Array<{ id: string }>;
        return rows.map((r) => r.id).filter((id) => !this.subAgentSessions.has(id));
      }, { readonly: true });
    } catch (err: any) {
      log.warn(`Failed to list empty sessions: ${err.message}`);
      return [];
    }
  }

  /** Delete leftover empty sessions so they never clutter history. */
  async purgeEmptySessions(projectPath: string): Promise<number> {
    const empties = await this.listEmptySessionIds(projectPath);
    let n = 0;
    for (const id of empties) {
      const result = await this.deleteSession(id);
      if (result.success) n++;
    }
    if (n > 0) {
      log.info("Purged unused empty sessions", { projectPath, purged: n });
    }
    return n;
  }

  /** List sessions for the project root and every prismnext worktree checkout. */
  async listProjectSessions(projectRoot: string): Promise<SessionInfo[]> {
    const { listWorktrees } = await import("../services/worktree");
    const directories = new Set<string>([projectRoot]);
    try {
      const worktrees = await listWorktrees(projectRoot);
      for (const wt of worktrees) directories.add(wt.path);
    } catch {
      // Non-fatal — still return local sessions
    }

    try {
      const stored = await this.listWorktreeSessionDirectories(projectRoot);
      for (const dir of stored) directories.add(dir);
    } catch {
      // Non-fatal
    }

    const byId = new Map<string, SessionInfo>();
    for (const dir of directories) {
      const sessions = await this.listSessions(dir);
      for (const session of sessions) {
        if (!byId.has(session.id)) byId.set(session.id, session);
      }
    }
    return [...byId.values()].sort((a, b) => b.lastModified - a.lastModified);
  }

  /** Distinct session directories under .prismnext/worktrees/ (includes closed worktrees). */
  private async listWorktreeSessionDirectories(projectRoot: string): Promise<string[]> {
    const prefix = join(projectRoot, ".prismnext", "worktrees") + "/";
    try {
      return await this.withDb((db) => {
        const rows = db.prepare(
          `SELECT DISTINCT directory FROM session
           WHERE directory LIKE ?
             AND time_archived IS NULL
             AND parent_id IS NULL`,
        ).all(prefix + "%") as Array<{ directory: string }>;
        return rows.map((r) => r.directory).filter(Boolean);
      }, { readonly: true });
    } catch {
      return [];
    }
  }

  /** Move sessions from a removed worktree directory to the project root. */
  async reassignSessionsDirectory(fromDirectory: string, toDirectory: string): Promise<number> {
    if (!fromDirectory || !toDirectory) return 0;
    const { resolve, join, sep } = await import("node:path");
    const projectRoot = resolve(toDirectory);
    const from = resolve(fromDirectory);
    if (from === projectRoot) return 0;

    const worktreesPrefix = join(projectRoot, ".prismnext", "worktrees") + sep;
    const closingName = from.startsWith(worktreesPrefix)
      ? from.slice(worktreesPrefix.length).split(/[/\\]/)[0]
      : null;
    if (!closingName) return 0;

    try {
      return await this.withDb((db) => {
        const rows = db.prepare(
          `SELECT id, directory FROM session
           WHERE time_archived IS NULL AND parent_id IS NULL`,
        ).all() as Array<{ id: string; directory: string }>;
        const update = db.prepare(`UPDATE session SET directory = ? WHERE id = ?`);
        let changes = 0;
        for (const row of rows) {
          if (!row.directory) continue;
          const rowDir = resolve(row.directory);
          if (!rowDir.startsWith(worktreesPrefix)) continue;
          const rowName = rowDir.slice(worktreesPrefix.length).split(/[/\\]/)[0];
          if (rowName !== closingName) continue;
          update.run(projectRoot, row.id);
          changes++;
        }
        return changes;
      });
    } catch (err: any) {
      log.warn(`reassignSessionsDirectory failed: ${err.message}`);
      return 0;
    }
  }

  async getSessionDirectory(sessionId: string): Promise<string | null> {
    try {
      return await this.withDb((db) => {
        const row = db.prepare(
          `SELECT directory FROM session WHERE id = ?`,
        ).get(sessionId) as { directory?: string } | undefined;
        return row?.directory ?? null;
      }, { readonly: true });
    } catch (err: any) {
      log.debug(`getSessionDirectory failed for ${sessionId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Persist a new title for an OpenCode session.
   *
   * Goes through `this.withDb` — the same path `listSessions` and
   * `reassignSessionsDirectory` use — so all session-table mutations stay
   * in one place. `time_updated` is bumped so the renamed session floats
   * to the top of the sidebar list (matches user intent: this is the one
   * they just cared about).
   */
  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.withDb((db) => {
      db
        .prepare("UPDATE session SET title = ?, time_updated = ? WHERE id = ?")
        .run(title, Date.now(), sessionId);
    });
  }

  /** Fire-and-forget ACP session/load to init session state for continued conversation. */
  async initSession(sessionId: string, cwd: string, projectRoot?: string): Promise<void> {
    if (!this.conn) return;
    const root = projectRoot || cwd;
    const { mcpServers } = this.loadProjectAgentConfig(root, { eagerOnly: true });
    this.sessionReplaySuppress++;
    try {
      await this.withNotificationCollector(
        () => {}, // discard — just need the side effect of initializing session state
        () => this.conn!.extMethod("session/load", { sessionId, cwd, mcpServers }),
      );
      this.opencodeHydratedSessions.add(sessionId);
      this.sessionLoadedMcpNames.set(sessionId, new Set(mcpServers.map((s) => s.name)));
    } catch (err: any) {
      // Visible: failed re-bind after cancel is the main "session not found" cause.
      log.warn(`session/load failed for ${sessionId}: ${err.message}`);
    } finally {
      this.sessionReplaySuppress = Math.max(0, this.sessionReplaySuppress - 1);
    }
  }

  /**
   * Hydrate OpenCode/ACP in-memory session state before prompting.
   * Skips if already bound in this process — except after abort(), which
   * clears the cache so the same session is re-bound via session/load
   * without creating a new id.
   */
  async ensureSessionHydrated(sessionId: string, cwd: string, projectRoot?: string): Promise<void> {
    if (!this.conn || this.opencodeHydratedSessions.has(sessionId)) return;
    await this.initSession(sessionId, cwd, projectRoot);
  }

  /**
   * Ensure the session has the requested MCP servers connected (lazy load).
   * Skips session/load when the loaded set already matches.
   */
  async ensureSessionMcps(
    sessionId: string,
    cwd: string,
    projectRoot: string,
    allowlist?: string[] | null,
  ): Promise<void> {
    // undefined / empty allowlist → connect nothing this turn (lazy MCP).
    const desired = mergeMcpAllowlist(allowlist);
    const loaded = this.sessionLoadedMcpNames.get(sessionId);
    if (loaded && mcpAllowlistSetsEqual([...loaded], desired)) {
      return;
    }
    if (desired.length === 0 && (!loaded || loaded.size === 0)) {
      this.sessionLoadedMcpNames.set(sessionId, new Set());
      return;
    }
    await this.reloadSessionMcps(sessionId, cwd, projectRoot, desired);
    this.sessionLoadedMcpNames.set(sessionId, new Set(desired));
  }

  /**
   * Reload MCP tool definitions for an existing session.
   * - `undefined` allowlist → full project MCP set
   * - `[]` → load none
   * - non-empty → filter to those ids
   */
  async reloadSessionMcps(
    sessionId: string,
    cwd: string,
    projectRoot: string,
    mcpServerAllowlist?: string[],
  ): Promise<void> {
    if (!this.conn) return;
    const { mcpServers } = this.loadProjectAgentConfig(
      projectRoot,
      mcpServerAllowlist !== undefined ? { mcpServerAllowlist } : undefined,
    );
    log.info("Reloading session MCP servers", {
      sessionId,
      allowlist:
        mcpServerAllowlist === undefined
          ? "(all)"
          : mcpServerAllowlist.length
            ? mcpServerAllowlist
            : "(none)",
      loaded: mcpServers.map((s) => s.name),
    });
    await this.withNotificationCollector(
      () => {},
      async () => {
        this.sessionReplaySuppress++;
        try {
          await this.conn!.extMethod("session/load", { sessionId, cwd, mcpServers });
        } finally {
          this.sessionReplaySuppress = Math.max(0, this.sessionReplaySuppress - 1);
        }
      },
    ).catch((err: any) => {
      log.warn(`session/load (MCP reload) failed for ${sessionId}: ${err.message}`);
    });
  }

  /**
   * Re-read mcp.json (incl. built-in ensure) and push MCP set into all open
   * sessions for this project via session/load.
   */
  async applyProjectMcpConfig(projectRoot: string): Promise<{ reloadedSessions: number }> {
    const { listSessionsForProject } = await import("../services/chat-session-registry");
    this.cachedAgentConfig = null;
    this.prewarmProject(projectRoot);
    const sessions = listSessionsForProject(projectRoot);
    let reloadedSessions = 0;
    for (const sessionId of sessions) {
      await this.reloadSessionMcps(sessionId, projectRoot, projectRoot);
      reloadedSessions++;
    }
    log.info("Applied project MCP config", { projectRoot, reloadedSessions });
    return { reloadedSessions };
  }

  async getMessages(sessionId: string, cwd: string, projectRoot?: string): Promise<any[]> {
    // Read messages directly from SQLite — instant, no ACP replay overhead.
    let sqliteMessages: any[] | null = null;
    try {
      sqliteMessages = await this.withDb((db) => {
        const msgRows = db.prepare(
          `SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created`
        ).all(sessionId) as Array<{ id: string; data: string }>;
        if (msgRows.length === 0) return null;
        const messages: any[] = [];
        for (const m of msgRows) {
          const msgData = JSON.parse(m.data || "{}");
          const partRows = db.prepare(
            `SELECT id, data FROM part WHERE message_id = ? ORDER BY time_created`
          ).all(m.id) as Array<{ id: string; data: string }>;
          const parts = partRows
            .map((p) => JSON.parse(p.data || "{}"))
            .filter((p: any) =>
              p.type !== "step-start"
              && p.type !== "step-finish"
              && p.type !== "patch",
            );
          messages.push({ info: { role: msgData.role || "user" }, parts });
        }
        return messages;
      }, { readonly: true });
    } catch (err: any) {
      log.debug(`SQLite read failed for session ${sessionId}, falling back to ACP: ${err.message}`);
    }
    if (sqliteMessages) return sqliteMessages;

    // Fallback: ACP session/load
    if (!this.conn) throw new Error("AcpService not initialized");
    const root = projectRoot || cwd;
    const { mcpServers } = this.loadProjectAgentConfig(root, { eagerOnly: true });
    const messages: any[] = [];
    await this.withNotificationCollector(
      (method, params) => {
        if (method === "session/update" && params?.sessionId === sessionId) {
          messages.push(params.update || params);
        }
      },
      () => this.conn!.extMethod("session/load", { sessionId, cwd, mcpServers }),
    );
    return messages;
  }


  /** Load a window of messages from the tail of a session.
   *  offset = how many messages to skip from the tail (0 = most recent).
   *  limit = max messages to return.
   *  Returns parsed messages in chronological order (oldest first). */
  async getMessagesWindow(
    sessionId: string,
    cwd: string,
    projectRoot: string | undefined,
    offset: number,
    limit: number,
  ): Promise<{ messages: any[]; totalMessages: number }> {
    const result = await this.withDb((db) => {
      // Count total messages
      const countRow = db.prepare(
        `SELECT COUNT(*) as cnt FROM message WHERE session_id = ?`,
      ).get(sessionId) as { cnt: number };
      const totalMessages = countRow.cnt;

      if (totalMessages === 0) return { messages: [], totalMessages: 0 };

      // Window from the tail: skip oldest rows, take `limit` most recent
      const sqlOffset = Math.max(0, totalMessages - offset - limit);
      const msgRows = db.prepare(
        `SELECT id, data FROM message WHERE session_id = ?
         ORDER BY time_created
         LIMIT ? OFFSET ?`,
      ).all(sessionId, limit, sqlOffset) as Array<{ id: string; data: string }>;

      if (msgRows.length === 0) return { messages: [], totalMessages };

      const messages: any[] = [];
      for (const m of msgRows) {
        const msgData = JSON.parse(m.data || "{}");
        const partRows = db.prepare(
          `SELECT id, data FROM part WHERE message_id = ? ORDER BY time_created`,
        ).all(m.id) as Array<{ id: string; data: string }>;
        const parts = partRows
          .map((p) => JSON.parse(p.data || "{}"))
          .filter((p: any) =>
            p.type !== "step-start"
            && p.type !== "step-finish"
            && p.type !== "patch",
          );
        messages.push({ info: { role: msgData.role || "user" }, parts });
      }
      return { messages, totalMessages };
    }, { readonly: true });

    return result;
  }

  /** Mark a session as a sub-agent session (created by the task tool).
   *  Sub-agent sessions are hidden from the sidebar session list. */
  markSubAgentSession(sessionId: string): void {
    if (this.subAgentSessions.has(sessionId)) return;
    this.subAgentSessions.add(sessionId);
    this.persistSubAgentSessions();
    log.info(`Marked sub-agent session: ${sessionId}`);
  }

  isSubAgentSession(sessionId: string): boolean {
    return this.subAgentSessions.has(sessionId);
  }

  /**
   * OpenCode `session.agent` for a child (e.g. `explore`, `literature-synthesizer`).
   * Used to bind Task tool_use ↔ child without FIFO guesswork.
   */
  getSessionAgentName(sessionId: string): string | null {
    const id = sessionId?.trim();
    if (!id) return null;
    try {
      const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
      const db = new DatabaseSync(this.getDbPath(), { readOnly: true });
      try {
        const row = db
          .prepare("SELECT agent FROM session WHERE id = ?")
          .get(id) as { agent?: string | null } | undefined;
        const agent = row?.agent?.trim();
        return agent || null;
      } finally {
        db.close();
      }
    } catch {
      return null;
    }
  }

  /** Persist sub-agent session IDs to disk for survival across restarts. */
  private subAgentSessionsPath(): string {
    return join(this.getServerDataDir(), "prism-subagent-sessions.json");
  }

  private persistSubAgentSessions(): void {
    try {
      writeFileSync(
        this.subAgentSessionsPath(),
        JSON.stringify([...this.subAgentSessions]),
        "utf-8",
      );
    } catch (err: any) {
      log.warn(`Failed to persist sub-agent sessions: ${err.message}`);
    }
  }

  private loadSubAgentSessions(): void {
    try {
      const p = this.subAgentSessionsPath();
      if (existsSync(p)) {
        const data = JSON.parse(readFileSync(p, "utf-8"));
        if (Array.isArray(data)) {
          this.subAgentSessions = new Set(data);
          log.info(`Loaded ${this.subAgentSessions.size} sub-agent session IDs`);
        }
      }
    } catch (err: any) {
      log.warn(`Failed to load sub-agent sessions: ${err.message}`);
    }
  }

  /**
   * Temporarily register a notification collector, execute fn, then unregister.
   * Ensures the collector is always removed even if fn throws.
   */
  private async withNotificationCollector<T>(
    collect: (method: string, params: any) => void,
    fn: () => Promise<T>,
  ): Promise<T> {
    this.notificationHandlers.push(collect);
    try {
      return await fn();
    } finally {
      const idx = this.notificationHandlers.indexOf(collect);
      if (idx !== -1) this.notificationHandlers.splice(idx, 1);
    }
  }

  /** Open the session SQLite database, execute fn, then close. */
  private async withDb<T>(
    fn: (db: any) => T,
    opts?: { readonly?: boolean },
  ): Promise<T> {
    const { DatabaseSync } = await import("node:sqlite");
    const dbPath = this.getDbPath();
    const db = new DatabaseSync(dbPath, { readOnly: opts?.readonly ?? false });
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  async deleteSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.withDb((db) => {
        db.prepare("UPDATE session SET time_archived = ? WHERE id = ?").run(Date.now(), sessionId);
      });
      this.sessionAgents.delete(sessionId);
      return { success: true };
    } catch (err: any) {
      log.error(`Failed to delete session ${sessionId}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ─── Session truncation (restore-to-turn) ───────────────────

  async backupSessionMessages(sessionId: string): Promise<SessionMessageBackup> {
    return await this.withDb((db) => {
      const msgRows = db.prepare(
        `SELECT id, session_id, time_created, time_updated, data
         FROM message WHERE session_id = ? ORDER BY time_created`,
      ).all(sessionId) as Array<{
        id: string;
        session_id: string;
        time_created: number;
        time_updated: number;
        data: string;
      }>;

      const messages: SessionMessageRowBackup[] = msgRows.map((m) => {
        const partRows = db.prepare(
          `SELECT id, message_id, session_id, time_created, time_updated, data
           FROM part WHERE message_id = ? ORDER BY time_created`,
        ).all(m.id) as SessionPartBackup[];
        return { ...m, parts: partRows };
      });

      return { sessionId, messages };
    }, { readonly: true });
  }

  async truncateSessionToTurn(
    sessionId: string,
    turnIndex: number,
  ): Promise<{ removedCount: number }> {
    return await this.withDb((db) => {
      const msgRows = db.prepare(
        `SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created`,
      ).all(sessionId) as Array<{ id: string; data: string }>;

      const rows = msgRows.map((m) => {
        const msgData = JSON.parse(m.data || "{}");
        const partRows = db.prepare(
          `SELECT data FROM part WHERE message_id = ? ORDER BY time_created`,
        ).all(m.id) as Array<{ data: string }>;
        const parts = partRows.map((p) => JSON.parse(p.data || "{}"));
        return { id: m.id, role: msgData.role || "user", parts };
      });

      const removeIds = messageIdsAfterTurn(rows, turnIndex);
      if (removeIds.length === 0) return { removedCount: 0 };

      const delPart = db.prepare("DELETE FROM part WHERE message_id = ?");
      const delMsg = db.prepare("DELETE FROM message WHERE id = ?");
      for (const id of removeIds) {
        delPart.run(id);
        delMsg.run(id);
      }

      db.prepare("UPDATE session SET time_updated = ? WHERE id = ?").run(Date.now(), sessionId);
      return { removedCount: removeIds.length };
    });
  }

  /**
   * Update a completed tool part's `state.output` in OpenCode SQLite.
   * Used after Task completion to inject Session citations into the stored result.
   */
  async patchSessionToolOutput(
    sessionId: string,
    toolCallId: string,
    output: string,
  ): Promise<boolean> {
    const sid = sessionId?.trim();
    const callId = toolCallId?.trim();
    const text = output?.trim();
    if (!sid || !callId || !text) return false;

    const { writeToolOutputIntoPartData } = await import("../services/session-citations-context");

    try {
      return await this.withDb((db) => {
        const rows = db.prepare(
          `SELECT id, data FROM part WHERE session_id = ? ORDER BY time_created`,
        ).all(sid) as Array<{ id: string; data: string }>;

        for (const row of rows) {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(row.data || "{}") as Record<string, unknown>;
          } catch {
            continue;
          }
          if (parsed.type !== "tool") continue;
          const partCallId = String(parsed.callID || parsed.id || "");
          if (partCallId !== callId) continue;

          if (!writeToolOutputIntoPartData(parsed, text)) return true;

          const now = Date.now();
          db.prepare("UPDATE part SET data = ?, time_updated = ? WHERE id = ?").run(
            JSON.stringify(parsed),
            now,
            row.id,
          );
          db.prepare("UPDATE session SET time_updated = ? WHERE id = ?").run(now, sid);
          return true;
        }
        return false;
      });
    } catch (err) {
      log.warn(
        `patchSessionToolOutput failed session=${sid} tool=${callId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  async restoreSessionFromBackup(backup: SessionMessageBackup): Promise<void> {
    const { sessionId } = backup;
    await this.withDb((db) => {
      const existing = db.prepare(
        "SELECT id FROM message WHERE session_id = ?",
      ).all(sessionId) as Array<{ id: string }>;
      const delPart = db.prepare("DELETE FROM part WHERE message_id = ?");
      const delMsg = db.prepare("DELETE FROM message WHERE id = ?");
      for (const row of existing) {
        delPart.run(row.id);
        delMsg.run(row.id);
      }

      const insMsg = db.prepare(
        `INSERT INTO message (id, session_id, time_created, time_updated, data)
         VALUES (?, ?, ?, ?, ?)`,
      );
      const insPart = db.prepare(
        `INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );

      for (const m of backup.messages) {
        insMsg.run(m.id, m.session_id, m.time_created, m.time_updated, m.data);
        for (const p of m.parts) {
          insPart.run(
            p.id,
            p.message_id,
            p.session_id,
            p.time_created,
            p.time_updated,
            p.data,
          );
        }
      }

      db.prepare("UPDATE session SET time_updated = ? WHERE id = ?").run(Date.now(), sessionId);
    });
  }

  // ─── Chat ───────────────────────────────────────────────────

  async sendPrompt(
    sessionId: string,
    prompt: string,
    opts?: {
      model?: string;
      provider?: string;
      /** Used to rehydrate if OpenCode dropped the session after cancel/restart. */
      cwd?: string;
      projectRoot?: string;
      /** Project rules — read fresh each turn; always injected when non-empty. */
      projectRulesPrompt?: string;
      /** Vision images appended after the text prompt (ACP ContentBlock::Image). */
      images?: Array<{ mimeType: string; data: string; uri?: string }>;
      /**
       * File attachments as ACP `resource` blocks (text or blob).
       * Prefer materialized resources over bare resource_link so OpenCode/LLM actually get content.
       */
      resources?: Array<
        | { uri: string; mimeType: string; text: string }
        | { uri: string; mimeType: string; blob: string }
      >;
      /** Validated OpenCode effort variant id, or `"default"` to clear. Applied after set_model. */
      effort?: string;
    },
  ): Promise<{ usage?: any }> {
    if (!this.conn) throw new Error("AcpService not initialized");

    type PromptBlock =
      | { type: "text"; text: string; _meta?: Record<string, unknown> }
      | { type: "image"; mimeType: string; data: string; uri?: string }
      | {
          type: "resource";
          resource:
            | { uri: string; mimeType: string; text: string }
            | { uri: string; mimeType: string; blob: string };
        };

    const content: PromptBlock[] = [];

    const rules = opts?.projectRulesPrompt?.trim();
    if (rules) {
      content.push({
        type: "text",
        text: rules,
        _meta: { prism: "project-rules" },
      });
      log.info(`Project rules injected: ${rules.length} chars`);
    }

    let promptText = prompt;
    if (!promptText.trim() && (opts?.resources?.length || opts?.images?.length)) {
      promptText = "Please review the attached file(s).";
    }
    content.push({ type: "text", text: promptText });

    for (const img of opts?.images ?? []) {
      content.push({
        type: "image",
        mimeType: img.mimeType,
        data: img.data,
        uri: img.uri,
      });
    }

    for (const resource of opts?.resources ?? []) {
      content.push({ type: "resource", resource });
    }

    const applyModelIfNeeded = async () => {
      if (!opts?.model) return;
      let modelId = opts.model.includes("/")
        ? opts.model
        : `${opts.provider || "anthropic"}/${opts.model}`;
      modelId = appendEffortToRuntimeModelRef(modelId, opts.effort);
      await this.applySessionModel(sessionId, modelId);
    };

    const applyEffortIfNeeded = async () => {
      const effort = opts?.effort?.trim();
      if (!effort || effort === OPENCODE_DEFAULT_VARIANT) return;
      // Validated effort is applied via `provider/model/<effort>` on set_model (OpenCode 1.18+).
    };

    const runPrompt = async () => {
      await applyModelIfNeeded();
      await applyEffortIfNeeded();
      log.info(
        `session/prompt: sessionId=${sessionId} userLen=${promptText.length} blocks=${content.length} images=${opts?.images?.length ?? 0} resources=${opts?.resources?.length ?? 0}`,
      );
      const promptResult = await this.conn!.prompt({ sessionId, prompt: content });
      log.info(`session/prompt complete: ${JSON.stringify(promptResult).slice(0, 200)}`);
      return promptResult as any;
    };

    try {
      return await runPrompt();
    } catch (err: any) {
      if (!AcpService.isSessionNotFoundError(err) || !opts?.cwd) throw err;
      log.warn(`session gone during prompt — force rehydrate then retry`, {
        sessionId,
        detail: err?.message,
      });
      const ok = await this.forceRehydrateSession(sessionId, opts.cwd, opts.projectRoot);
      if (!ok) throw err;
      return await runPrompt();
    }
  }

  async sendAnswer(sessionId: string, answer: string): Promise<{ usage?: any }> {
    return this.sendPrompt(sessionId, answer);
  }

  /** Trigger OpenCode's native compaction agent. Sends the literal
   *  "/compact" command via session/prompt. OpenCode recognizes this as
   *  a slash command, runs its compaction agent internally, and returns
   *  a summary message. Old conversation history is replaced with the
   *  summary — context tokens are truly freed. */
  async sendCompact(sessionId: string, projectPath: string): Promise<void> {
    if (!this.conn) throw new Error("AcpService not initialized");

    log.info(`Compacting session ${sessionId}`);

    await this.conn.extMethod("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: "/compact" }],
      cwd: projectPath,
    });
  }

  /**
   * Discover OpenCode's local HTTP control plane.
   * Env → probe :4096 /global/health → null (fail closed for subagent abort).
   */
  private async ensureOpenCodeHttpBase(): Promise<string | null> {
    if (this.openCodeHttpBase) return this.openCodeHttpBase;
    const candidates: string[] = [];
    const fromEnv = process.env.OPENCODE_SERVER_URL?.trim();
    if (fromEnv) candidates.push(fromEnv.replace(/\/$/, ""));
    const port = process.env.OPENCODE_PORT?.trim();
    if (port) candidates.push(`http://127.0.0.1:${port}`);
    candidates.push("http://127.0.0.1:4096");
    const seen = new Set<string>();
    for (const base of candidates) {
      if (!base || seen.has(base)) continue;
      seen.add(base);
      try {
        const res = await fetch(`${base}/global/health`, {
          signal: AbortSignal.timeout(800),
        });
        if (res.ok) {
          this.openCodeHttpBase = base;
          log.info(`OpenCode HTTP control plane: ${base}`);
          return base;
        }
      } catch {
        /* try next */
      }
    }
    log.warn("OpenCode HTTP control plane not reachable");
    return null;
  }

  private resolveAbortDirectory(sessionId: string): string | undefined {
    const direct = getSessionProjectRoot(sessionId);
    if (direct) return direct;
    const parent = this.getSessionParentId(sessionId);
    if (parent) {
      const fromParent = getSessionProjectRoot(parent);
      if (fromParent) return fromParent;
    }
    try {
      const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
      const db = new DatabaseSync(this.getDbPath(), { readOnly: true });
      try {
        const row = db
          .prepare("SELECT directory FROM session WHERE id = ?")
          .get(sessionId) as { directory?: string } | undefined;
        const dir = row?.directory?.trim();
        return dir || undefined;
      } finally {
        db.close();
      }
    } catch {
      return undefined;
    }
  }

  private prepareAbort(sessionId: string): string | null {
    const sid = sessionId?.trim();
    if (!sid) return null;
    this.releaseSessionPendingWork(sid);
    this.opencodeHydratedSessions.delete(sid);
    return sid;
  }

  private async acpCancelSession(sid: string): Promise<boolean> {
    if (!this.conn) {
      log.warn(`ACP session/cancel skipped — no connection session=${sid}`);
      return false;
    }
    try {
      await this.conn.cancel({ sessionId: sid });
      log.info(`session/cancel sent session=${sid}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to ACP-cancel session ${sid}: ${msg}`);
      return false;
    }
  }

  /**
   * POST /session/:id/abort — required for Task children (not in ACPSessionManager).
   */
  async abortViaHttp(
    sessionId: string,
    directory?: string,
  ): Promise<{ ok: boolean; error?: "abort_failed" | "unreachable" }> {
    const sid = sessionId?.trim();
    if (!sid) return { ok: false, error: "abort_failed" };
    const base = await this.ensureOpenCodeHttpBase();
    if (!base) return { ok: false, error: "unreachable" };
    const dir = directory?.trim() || this.resolveAbortDirectory(sid);
    const url = new URL(`/session/${encodeURIComponent(sid)}/abort`, `${base}/`);
    if (dir) url.searchParams.set("directory", dir);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        log.warn(`HTTP session abort failed session=${sid} status=${res.status}`);
        return { ok: false, error: "abort_failed" };
      }
      log.info(`HTTP session/abort ok session=${sid}`);
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`HTTP session abort error session=${sid}: ${msg}`);
      return { ok: false, error: "abort_failed" };
    }
  }

  /**
   * Abort an orchestrator / primary ACP session (session/new|load).
   * Used by chat:cancel and turn watchdog — cancels the whole turn.
   */
  async abortPrimarySession(
    sessionId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const sid = this.prepareAbort(sessionId);
    if (!sid) return { ok: false, error: "missing_id" };
    const acpOk = await this.acpCancelSession(sid);
    // Belt-and-suspenders: HTTP abort also stops the backing session.
    await this.abortViaHttp(sid);
    return acpOk ? { ok: true } : { ok: false, error: "abort_failed" };
  }

  /**
   * Abort a Task child / subagent session. HTTP abort is required; ACP cancel
   * is a no-op for unregistered children and must not be relied on.
   * Never call this with the parent orchestrator session id from Task Stop.
   */
  async abortSubAgentSession(
    sessionId: string,
  ): Promise<{ ok: boolean; error?: "abort_failed" | "unreachable" | "missing_id" }> {
    const sid = this.prepareAbort(sessionId);
    if (!sid) return { ok: false, error: "missing_id" };
    const http = await this.abortViaHttp(sid);
    // Optional ACP cancel — harmless no-op when child is not ACP-registered.
    void this.acpCancelSession(sid);
    return http;
  }

  /**
   * Compatibility wrapper: route by subagent vs primary.
   * Prefer abortPrimarySession / abortSubAgentSession at call sites.
   */
  async abort(sessionId: string): Promise<void> {
    const sid = sessionId?.trim();
    if (!sid) return;
    if (this.isSubAgentSession(sid) || this.getSessionParentId(sid)) {
      await this.abortSubAgentSession(sid);
      return;
    }
    await this.abortPrimarySession(sid);
  }

  /**
   * Deny in-flight bridge jobs and resolve pending ACP permissions for a session.
   * Called on cancel/abort so blocked custom tools (delete, bash) unblock promptly.
   */
  releaseSessionPendingWork(sessionId: string): void {
    for (const [permissionId, entry] of this.pendingPermissions.entries()) {
      if (entry.sessionId !== sessionId) continue;
      clearTimeout(entry.timer);
      entry.resolve(buildPermissionOutcome(entry.options, false));
      this.pendingPermissions.delete(permissionId);
      log.info(`permission:release-session id=${permissionId} sessionId=${sessionId}`);
    }

    for (const [toolCallId, ctx] of this.bashJobContext.entries()) {
      if (ctx.sessionId !== sessionId) continue;
      denyBashJob(ctx.sessionId, toolCallId);
      this.bashJobContext.delete(toolCallId);
      this.emittedBashUi.delete(toolCallId);
      this.bashAutoApproved.delete(toolCallId);
      this.clearSyntheticPermissionTimeout(`bash-gate-${toolCallId}`);
    }

    for (const [toolCallId, ctx] of this.customToolJobContext.entries()) {
      if (ctx.sessionId !== sessionId) continue;
      denyBashJob(ctx.sessionId, toolCallId);
      this.customToolJobContext.delete(toolCallId);
      this.emittedCustomToolUi.delete(toolCallId);
      this.clearSyntheticPermissionTimeout(`${ctx.toolName}-gate-${toolCallId}`);
    }
  }

  async answerPermission(
    permissionId: string,
    approved: boolean,
    toolCallId?: string,
    opts?: { always?: boolean },
  ): Promise<void> {
    let resolvedId = permissionId;
    let pending = this.pendingPermissions.get(permissionId);
    if (!pending && toolCallId) {
      for (const [id, entry] of this.pendingPermissions.entries()) {
        if (entry.toolCallId === toolCallId) {
          resolvedId = id;
          pending = entry;
          break;
        }
      }
    }

    const resolvedToolCallId = pending?.toolCallId || toolCallId;
    const bashCtx = resolvedToolCallId
      ? (this.bashJobContext.get(resolvedToolCallId)
        ?? (pending?.sessionId && pending.toolCallId
          ? {
              sessionId: pending.sessionId,
              chatTabId: pending.tabId || pending.sessionId,
              toolCallId: pending.toolCallId,
              command: pending.bashCommand || "",
              cwd: pending.bashCwd || this.projectPath || process.cwd(),
            }
          : undefined))
      : undefined;

    if (pending) {
      clearTimeout(pending.timer);
      this.pendingPermissions.delete(resolvedId);
      const preferAlways = Boolean(approved && opts?.always);
      if (preferAlways && pending.toolName) {
        const isBash =
          this.isBashTool(pending.toolName) ||
          pending.toolName === "experiment-run" ||
          /bash|shell|terminal|command/.test(pending.toolName);
        const cmd = pending.bashCommand || bashCtx?.command || "";
        if (isBash && cmd.trim()) {
          addBashAllowAlwaysFromCommand(cmd);
        } else if (!isBash) {
          addToolAllowAlways(pending.toolName);
        }
      }
      log.info(
        `permission:answer id=${resolvedId} approved=${approved} always=${preferAlways} toolCallId=${pending.toolCallId ?? "(none)"}`,
      );
      pending.resolve(buildPermissionOutcome(pending.options, approved, { preferAlways }));
    } else {
      log.warn(`permission:answer-miss id=${permissionId} toolCallId=${toolCallId ?? "(none)"} approved=${approved}`);
    }

    if (resolvedToolCallId) {
      this.clearSyntheticPermissionTimeout(`bash-gate-${resolvedToolCallId}`);
      for (const tool of CUSTOM_GATED_TOOLS) {
        this.clearSyntheticPermissionTimeout(`${tool}-gate-${resolvedToolCallId}`);
      }
    }
    this.clearSyntheticPermissionTimeout(permissionId);

    if (bashCtx) {
      if (approved && isRunnableBashCommand(bashCtx.command)) {
        this.runApprovedBash(bashCtx);
      } else if (approved && bashCtx.toolCallId) {
        // Command not yet known (early tool_call only had a title). Wait for backfill
        // to drive syncBashPermissionFromToolCall again; keep context for later answer.
        log.info(`permission:bash-wait-command toolCallId=${bashCtx.toolCallId} approved=1 command=${JSON.stringify(bashCtx.command)}`);
      } else if (!approved) {
        denyBashJob(bashCtx.sessionId, bashCtx.toolCallId);
      }
      if (!approved) {
        this.bashJobContext.delete(bashCtx.toolCallId);
        this.emittedBashUi.delete(bashCtx.toolCallId);
        this.bashAutoApproved.delete(bashCtx.toolCallId);
      }
    }

    const customCtx = resolvedToolCallId
      ? this.customToolJobContext.get(resolvedToolCallId)
      : undefined;
    if (customCtx) {
      if (approved) {
        approveCustomToolJob(customCtx.sessionId, customCtx.toolCallId);
        log.info(`permission:custom-tool-approved tool=${customCtx.toolName} toolCallId=${customCtx.toolCallId}`);
      } else {
        denyBashJob(customCtx.sessionId, customCtx.toolCallId);
        this.emittedCustomToolUi.delete(customCtx.toolCallId);
      }
      this.customToolJobContext.delete(customCtx.toolCallId);
    }
  }

  /**
   * OpenCode custom bash may invoke execute() before ACP requestPermission —
   * and when `permission.bash` is already "allow" (Auto mode), OpenCode often
   * skips requestPermission entirely. Custom bash.ts still polls the bridge
   * for permission.json, so we must auto-approve + run (or deny) from tool_call.
   * Ask / Edit auto still emit the synthetic PermissionGatePanel.
   */
  syncBashPermissionFromToolCall(args: {
    sessionId: string;
    tabId: string;
    toolCallId: string;
    command: string;
    cwd?: string;
  }): void {
    if (this.sessionReplaySuppress > 0) {
      log.debug(`permission:bash-tool-call replay-suppressed toolCallId=${args.toolCallId}`);
      return;
    }
    const { toolCallId, sessionId, tabId, command } = args;
    if (!toolCallId || !isRunnableBashCommand(command)) {
      log.debug(`permission:bash-tool-call waiting-for-command toolCallId=${toolCallId || "(none)"} command=${JSON.stringify(command)}`);
      return;
    }

    if (isDirectLatexCompileBashCommand(command)) {
      log.info(
        `permission:latex-compile-bash-deny-tool-call toolCallId=${toolCallId} cmd=${command.slice(0, 80)}`,
      );
      this.pendingTaskDenialRedirect.set(sessionId, latexCompileBashRedirectNote());
      denyBashJob(sessionId, toolCallId, latexCompileBashBlockMessage());
      this.bashJobContext.delete(toolCallId);
      this.bashAutoApproved.delete(toolCallId);
      return;
    }

    // If we already approved (auto-allow arrived before real command) — execute now.
    const existing = this.bashJobContext.get(toolCallId);
    if (existing && this.bashAutoApproved.has(toolCallId)) {
      const updated = { ...existing, command: command.trim() };
      this.bashJobContext.set(toolCallId, updated);
      log.info(`permission:bash-backfill-execute toolCallId=${toolCallId} command=${command.trim()}`);
      this.runApprovedBash(updated);
      this.bashJobContext.delete(toolCallId);
      this.bashAutoApproved.delete(toolCallId);
      return;
    }

    const mode = resolvePermissionMode(
      (getSettings() as Record<string, unknown>).permissionMode as string | undefined,
    );
    const permRules = buildPermissionRulesFromSettings(
      getSettings() as Record<string, unknown>,
    );
    const cwd = args.cwd || this.projectPath || process.cwd();
    const action = resolvePermissionAction(mode, "bash", this.getSessionAgent(sessionId), {
      projectRoot: this.projectPath || undefined,
      bashCommand: command.trim(),
      bashCwd: cwd,
      sessionId,
    }, permRules);
    const syncAction =
      action === "allow" ? "auto_allow" : action === "deny" ? "deny" : "prompt";
    const job: ApprovedBashJob = {
      sessionId,
      chatTabId: tabId,
      toolCallId,
      command: command.trim(),
      cwd,
      projectRoot: this.projectPath || undefined,
    };

    if (syncAction === "auto_allow") {
      // Do NOT silently return — that left PTY bash polling permission.json forever
      // with no UI (Auto mode + OpenCode skipping ACP requestPermission).
      if (readBashPermissionStatus(sessionId, toolCallId)) {
        log.debug(`permission:bash-tool-call already-settled toolCallId=${toolCallId}`);
        return;
      }
      log.info(`permission:bash-tool-call auto-execute toolCallId=${toolCallId} mode=${mode}`);
      this.runApprovedBash(job);
      return;
    }
    if (syncAction === "deny") {
      if (readBashPermissionStatus(sessionId, toolCallId)) return;
      log.info(`permission:bash-tool-call auto-deny toolCallId=${toolCallId} mode=${mode}`);
      denyBashJob(sessionId, toolCallId);
      return;
    }

    if (this.emittedBashUi.has(toolCallId)) return;
    if (this.hasAcpPendingForToolCall(toolCallId)) return;

    this.emittedBashUi.add(toolCallId);
    const permissionId = `bash-gate-${toolCallId}`;
    this.bashJobContext.set(toolCallId, job);

    log.info(`permission:bash-tool-call gate=${permissionId} toolCallId=${toolCallId}`);
    this.emitNotification("session/permission", {
      id: permissionId,
      sessionId,
      tabId,
      toolCallId,
      toolName: "bash",
      message: command.trim(),
      options: [
        { optionId: "allow_once", kind: "allow_once", name: "Allow" },
        { optionId: "reject_once", kind: "reject_once", name: "Reject" },
      ],
    });
    this.scheduleSyntheticPermissionTimeout(permissionId, () => {
      log.warn(`permission:bash-gate-timeout toolCallId=${toolCallId}`);
      denyBashJob(sessionId, toolCallId);
      this.bashJobContext.delete(toolCallId);
      this.emittedBashUi.delete(toolCallId);
      this.bashAutoApproved.delete(toolCallId);
    });
  }

  /**
   * OpenCode custom delete/move may invoke execute() before ACP requestPermission
   * (or skip permission entirely when the rule is allow). Mirror bash: unblock
   * the bridge on auto_allow / deny; only prompt when the mode asks.
   */
  syncCustomToolPermissionFromToolCall(args: {
    sessionId: string;
    tabId: string;
    toolCallId: string;
    toolName: string;
    input?: Record<string, unknown>;
  }): void {
    if (this.sessionReplaySuppress > 0) {
      log.debug(`permission:custom-tool-call replay-suppressed toolCallId=${args.toolCallId}`);
      return;
    }
    const { toolCallId, sessionId, tabId, toolName, input } = args;
    const normalized = toolName.toLowerCase();
    if (!toolCallId || !CUSTOM_GATED_TOOLS.has(normalized)) return;

    const mode = resolvePermissionMode(
      (getSettings() as Record<string, unknown>).permissionMode as string | undefined,
    );
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const val = input?.[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }
      return undefined;
    };
    const permRules = buildPermissionRulesFromSettings(
      getSettings() as Record<string, unknown>,
    );
    const action = resolvePermissionAction(mode, normalized, this.getSessionAgent(sessionId), {
      projectRoot: this.projectPath,
      filePath: pick("file_path", "filePath", "path"),
      sourcePath: pick("source_path", "sourcePath", "source", "src", "path"),
      destinationPath: pick("destination_path", "destinationPath", "destination", "dst"),
      sessionId,
    }, permRules);
    const syncAction =
      action === "allow" ? "auto_allow" : action === "deny" ? "deny" : "prompt";

    if (syncAction === "auto_allow") {
      if (readBashPermissionStatus(sessionId, toolCallId)) return;
      registerCustomToolJobIntent({ sessionId, toolCallId, toolName: normalized });
      approveCustomToolJob(sessionId, toolCallId);
      log.info(
        `permission:custom-tool-call auto-approve tool=${normalized} toolCallId=${toolCallId} mode=${mode}`,
      );
      return;
    }
    if (syncAction === "deny") {
      if (readBashPermissionStatus(sessionId, toolCallId)) return;
      denyBashJob(sessionId, toolCallId);
      log.info(
        `permission:custom-tool-call auto-deny tool=${normalized} toolCallId=${toolCallId} mode=${mode}`,
      );
      return;
    }

    if (this.emittedCustomToolUi.has(toolCallId)) return;
    if (this.hasAcpPendingForToolCall(toolCallId)) return;

    this.emittedCustomToolUi.add(toolCallId);
    registerCustomToolJobIntent({ sessionId, toolCallId, toolName: normalized });
    this.customToolJobContext.set(toolCallId, {
      sessionId,
      chatTabId: tabId,
      toolCallId,
      toolName: normalized,
    });

    const permissionId = `${normalized}-gate-${toolCallId}`;
    const detail = this.formatCustomToolPermissionMessage(normalized, input);

    log.info(`permission:custom-tool-call gate=${permissionId} tool=${normalized} toolCallId=${toolCallId}`);
    this.emitNotification("session/permission", {
      id: permissionId,
      sessionId,
      tabId,
      toolCallId,
      toolName: normalized,
      message: detail,
      options: [
        { optionId: "allow_once", kind: "allow_once", name: "Allow" },
        { optionId: "reject_once", kind: "reject_once", name: "Reject" },
      ],
    });
    this.scheduleSyntheticPermissionTimeout(permissionId, () => {
      log.warn(`permission:custom-gate-timeout tool=${normalized} toolCallId=${toolCallId}`);
      denyBashJob(sessionId, toolCallId);
      this.customToolJobContext.delete(toolCallId);
      this.emittedCustomToolUi.delete(toolCallId);
    });
  }

  private scheduleSyntheticPermissionTimeout(
    permissionId: string,
    onTimeout: () => void,
  ): void {
    this.clearSyntheticPermissionTimeout(permissionId);
    const timer = setTimeout(() => {
      this.syntheticPermissionTimers.delete(permissionId);
      onTimeout();
    }, PERMISSION_TIMEOUT_MS);
    this.syntheticPermissionTimers.set(permissionId, timer);
  }

  private clearSyntheticPermissionTimeout(permissionId: string): void {
    const timer = this.syntheticPermissionTimers.get(permissionId);
    if (!timer) return;
    clearTimeout(timer);
    this.syntheticPermissionTimers.delete(permissionId);
  }

  private formatCustomToolPermissionMessage(
    toolName: string,
    input?: Record<string, unknown>,
  ): string {
    if (toolName === "delete") {
      const path = input?.file_path;
      return typeof path === "string" && path.trim() ? path.trim() : "Delete file";
    }
    if (toolName === "move") {
      const src = input?.source_path;
      const dst = input?.destination_path;
      if (typeof src === "string" && typeof dst === "string") {
        return `${src.trim()} → ${dst.trim()}`;
      }
      return "Move file";
    }
    return toolName;
  }

  private hasAcpPendingForToolCall(toolCallId: string): boolean {
    for (const entry of this.pendingPermissions.values()) {
      if (entry.toolCallId === toolCallId) return true;
    }
    return false;
  }

  private isBashTool(toolName: string): boolean {
    const n = (toolName || "").toLowerCase();
    return n === "bash" || n === "shell" || n === "terminal" || n === "execute";
  }

  private isCustomGatedTool(toolName: string): boolean {
    return CUSTOM_GATED_TOOLS.has((toolName || "").toLowerCase());
  }

  private runApprovedBash(job: ApprovedBashJob): void {
    if (!isRunnableBashCommand(job.command)) {
      log.warn(`permission:bash-run skipped non-command toolCallId=${job.toolCallId} command=${JSON.stringify(job.command)}`);
      return;
    }
    // Avoid double PTY starts when both ACP auto-allow and tool_call sync fire.
    if (readBashPermissionStatus(job.sessionId, job.toolCallId)) {
      log.debug(`permission:bash-run already-settled toolCallId=${job.toolCallId}`);
      return;
    }
    if (isDirectLatexCompileBashCommand(job.command)) {
      log.info(
        `permission:latex-compile-bash-deny-run toolCallId=${job.toolCallId} cmd=${job.command.slice(0, 80)}`,
      );
      this.pendingTaskDenialRedirect.set(job.sessionId, latexCompileBashRedirectNote());
      denyBashJob(job.sessionId, job.toolCallId, latexCompileBashBlockMessage());
      return;
    }
    executeApprovedBashJob(job);
  }

  private extractBashCommandFromPermissionParams(params: Record<string, unknown>): string {
    const tc = (params.toolCall ?? params.tool_call) as Record<string, unknown> | undefined;
    const input = (tc?.rawInput ?? tc?.raw_input ?? tc?.input ?? params.input) as
      | Record<string, unknown>
      | undefined;
    const fromInput = extractBashCommandFromInput(input);
    if (fromInput) return fromInput;
    const msg = params.message ?? params.title ?? tc?.title;
    return typeof msg === "string" ? msg.trim() : "";
  }

  /** Best-effort paths for move permission gating. */
  private extractMovePathsFromPermissionParams(params: Record<string, unknown>): {
    source?: string;
    destination?: string;
  } {
    const tc = (params.toolCall ?? params.tool_call) as Record<string, unknown> | undefined;
    const input = (tc?.rawInput ?? tc?.raw_input ?? tc?.input ?? params.input) as
      | Record<string, unknown>
      | undefined;
    if (!input || typeof input !== "object") return {};
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const val = input[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }
      return undefined;
    };
    return {
      source: pick("source_path", "sourcePath", "source", "src", "path"),
      destination: pick("destination_path", "destinationPath", "destination", "dst"),
    };
  }

  /** Best-effort path for edit/write/apply_patch permission gating (Plan draft allowlist). */
  private extractFilePathFromPermissionParams(params: Record<string, unknown>): string {
    const tc = (params.toolCall ?? params.tool_call) as Record<string, unknown> | undefined;
    const input = (tc?.rawInput ?? tc?.raw_input ?? tc?.input ?? params.input) as
      | Record<string, unknown>
      | undefined;
    if (input && typeof input === "object") {
      for (const key of ["file_path", "filePath", "path", "target", "file"]) {
        const val = input[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }
    }
    for (const key of ["file_path", "filePath", "path"]) {
      const val = params[key];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    const msg = params.message ?? params.title ?? tc?.title;
    if (typeof msg === "string") {
      const m = msg.match(
        /(?:^|[\s`"'])((?:\.prismnext\/research\/plans\/drafts\/[^\s`"']+\.md)|(?:\.prismnext\/research\/plans\/current-draft\.md)|(?:[^\s`"']*current-draft\.md))/i,
      );
      if (m?.[1]) return m[1].trim();
    }
    return "";
  }

  // ─── Config ─────────────────────────────────────────────────

  async getProviders(): Promise<any[]> {
    if (!this.conn) return [];
    try {
      const result = await this.conn.extMethod("providers/list", {});
      return (result as any)?.providers || [];
    } catch (err: any) {
      log.warn(`providers/list failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Register a provider with OpenCode via the standard ACP `providers/set` method.
   * Only needed for non-built-in providers (DeepSeek, OpenRouter, custom).
   * Built-in providers (anthropic, openai, google) are recognized natively.
   */
  async setAuth(
    provider: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean }> {
    if (!this.conn) throw new Error("AcpService not initialized");

    // Built-in providers don't need explicit registration
    const BUILTIN = new Set([
      "anthropic",
      "openai",
      "google",
      "openrouter",
      "opencode-go",
      "opencode-zen",
      "opencode",
    ]);
    if (BUILTIN.has(provider.toLowerCase())) return { success: true };

    const apiKey = credentials.apiKey;
    const baseUrl = credentials.baseUrl;

    // Non-built-in providers that need explicit ACP registration.
    // Built-in: anthropic, openai, google, openrouter — recognized natively.
    const configs: Record<string, { apiType: string; baseUrl: string }> = {
      deepseek: { apiType: "openai", baseUrl: baseUrl || "https://api.deepseek.com/v1" },
    };

    const config = configs[provider.toLowerCase()];
    // For unknown providers with a custom baseUrl, auto-register as openai-compatible
    const effectiveBaseUrl = config?.baseUrl || baseUrl;
    if (!effectiveBaseUrl) {
      log.warn(`setAuth: no baseUrl for provider ${provider}`);
      return { success: false };
    }

    try {
      await this.conn.extMethod("providers/set", {
        id: provider.toLowerCase(),
        apiType: config?.apiType || "openai",
        baseUrl: effectiveBaseUrl,
      });
      return { success: true };
    } catch (err: any) {
      log.warn(`ACP providers/set not available for ${provider}: ${err.message}`);
      return { success: false };
    }
  }

  // ─── Notification Subsystem ────────────────────────────────

  onNotification(
    handler: (method: string, params: any) => void,
  ): () => void {
    this.notificationHandlers.push(handler);
    return () => {
      const idx = this.notificationHandlers.indexOf(handler);
      if (idx !== -1) this.notificationHandlers.splice(idx, 1);
    };
  }

  private emitNotification(method: string, params: any): void {
    if (method === "session/update") {
      const sid = params?.sessionId;
      if (typeof sid === "string" && sid) {
        const now = Date.now();
        this.sessionActivityAt.set(sid, now);
        // Parent is silent on ACP while waiting on Task — child frames must
        // keep the turn watchdog from false-stalling / hard-timing-out.
        const parentId = this.getSessionParentId(sid);
        if (parentId) this.sessionActivityAt.set(parentId, now);
        this.trackToolCallForWatchdog(sid, parentId, params);
      }
    }
    for (const handler of this.notificationHandlers) {
      try {
        handler(method, params);
      } catch (err: any) {
        log.debug(`Notification handler error (${method}): ${err.message}`);
      }
    }
  }

  /**
   * Maintain the set of open tool calls for the session subtree, so the turn
   * watchdog can tell "upstream hung" apart from "tools legitimately running
   * in silence" (Task subagents emit frames per child session, or go quiet
   * for minutes while their own provider call is in flight).
   *
   * Frame shapes mirror event-mapper.ts (wrapped Shape A / flattened Shape B):
   *   tool_call:        update.tool_call | update.toolCall | sessionUpdate==="tool_call"
   *   tool_call_update: update.tool_call_update | update.toolCallUpdate | ...
   * A missing status on tool_call_update means "completed" (event-mapper
   * applies the same default when forwarding). Tracking fails soft: a missed
   * terminal frame just keeps the busy tier until the next turn resets it.
   */
  private trackToolCallForWatchdog(
    sessionId: string,
    parentId: string | null,
    params: any,
  ): void {
    const update = params?.update ?? params;
    if (!update || typeof update !== "object") return;
    const chunkType =
      typeof update.sessionUpdate === "string" ? update.sessionUpdate : "";
    const primary = parentId ?? sessionId;

    const tc =
      update.tool_call ??
      update.toolCall ??
      (chunkType === "tool_call" ? update : null);
    if (tc && typeof tc === "object") {
      const id = tc.toolCallId || tc.tool_call_id || tc.callID || tc.id;
      if (typeof id === "string" && id) {
        const status = String(tc.status ?? tc.state?.status ?? "").toLowerCase();
        const key = `${sessionId}:${id}`;
        const set =
          this.subtreeRunningToolKeys.get(primary) ?? new Set<string>();
        if (WATCHDOG_TERMINAL_TOOL_STATUS.has(status)) set.delete(key);
        else set.add(key); // absent status on tool_call = just started
        this.subtreeRunningToolKeys.set(primary, set);
      }
      return;
    }

    const tu =
      update.tool_call_update ??
      update.toolCallUpdate ??
      (chunkType === "tool_call_update" ? update : null);
    if (tu && typeof tu === "object") {
      const status = String(tu.status ?? tu.state?.status ?? "").toLowerCase();
      if (status !== "" && !WATCHDOG_TERMINAL_TOOL_STATUS.has(status)) return;
      const id = tu.toolCallId || tu.tool_call_id || tu.callID || tu.id;
      if (typeof id === "string" && id) {
        this.subtreeRunningToolKeys.get(primary)?.delete(`${sessionId}:${id}`);
      }
    }
  }

  // ─── Turn Watchdog ─────────────────────────────────────────
  //
  // OpenCode emits NO ACP frames while its internal provider-retry loop is
  // sleeping (rate limits, quota gates, 5xx), and halt() never notifies the
  // client when retries are exhausted. Without a watchdog the chat UI stays
  // in "streaming" forever with zero feedback.
  //
  // The watchdog is silence-based (not duration-based): a long agent turn
  // keeps emitting frames, so only true upstream silence triggers it. Two
  // silence tiers apply:
  //   idle — no tool calls open in the session subtree. Silence here means
  //          the provider is stuck before/ between steps; abort relatively
  //          quickly (TURN_HARD_TIMEOUT_MS).
  //   busy — tool calls are open (Task subagents, long bash, MinerU parses).
  //          Long silence is legitimate: a subagent may wait minutes on its
  //          own provider call without emitting a single frame. Use the much
  //          longer TURN_BUSY_HARD_TIMEOUT_MS so real long tasks survive.

  /** Warn the UI after this much upstream silence (provider likely retrying). */
  static readonly TURN_STALL_WARN_MS = 30_000;
  /** Auto-abort the turn after this much uninterrupted upstream silence. */
  static readonly TURN_HARD_TIMEOUT_MS = 360_000;
  /**
   * Hard timeout while tool calls are open in the session subtree (Task
   * subagents etc. may stay silent for many minutes between frames).
   */
  static readonly TURN_BUSY_HARD_TIMEOUT_MS = 1_800_000;

  /** OpenCode's rotating text log (quota / stream errors land here, not on ACP). */
  getOpenCodeLogPath(): string {
    return join(this.getServerDataDir(), "opencode", "log", "opencode.log");
  }

  /** Consume a scraped provider error for this session (if any). */
  takeSessionProviderError(sessionId: string): string | undefined {
    const msg = this.sessionProviderErrors.get(sessionId);
    if (msg) this.sessionProviderErrors.delete(sessionId);
    return msg;
  }

  peekSessionProviderError(sessionId: string): string | undefined {
    return this.sessionProviderErrors.get(sessionId);
  }

  /** Read new opencode.log bytes; store + return primary stream error for session. */
  private pollOpenCodeLogForSessionError(sessionId: string): string | null {
    const path = this.getOpenCodeLogPath();
    const { offset, lines } = readOpenCodeLogDelta(path, this.opencodeLogWatchOffset);
    this.opencodeLogWatchOffset = offset;
    for (const line of lines) {
      const err = parseOpenCodeStreamErrorLine(line);
      if (!err || !isPrimaryOpenCodeStreamError(err)) continue;
      if (err.sessionId !== sessionId) continue;
      this.sessionProviderErrors.set(sessionId, err.message);
      log.warn(
        `opencode log stream error: sessionId=${sessionId} msg=${err.message.slice(0, 200)}`,
      );
      return err.message;
    }
    return null;
  }

  startTurnWatchdog(
    sessionId: string,
    callbacks: {
      onStall: (silentMs: number) => void;
      /** busy=true when tools were still open in the subtree at hard timeout. */
      onTimeout: (silentMs: number, busy: boolean) => void;
      /** Fired once when opencode.log reports a primary provider stream error. */
      onProviderError?: (message: string) => void;
    },
    opts?: { stallMs?: number; timeoutMs?: number; busyTimeoutMs?: number; pollMs?: number },
  ): () => void {
    const stallMs = opts?.stallMs ?? AcpService.TURN_STALL_WARN_MS;
    const timeoutMs = opts?.timeoutMs ?? AcpService.TURN_HARD_TIMEOUT_MS;
    const busyTimeoutMs = opts?.busyTimeoutMs ?? AcpService.TURN_BUSY_HARD_TIMEOUT_MS;
    const startedAt = Date.now();
    this.sessionActivityAt.set(sessionId, startedAt);
    this.sessionProviderErrors.delete(sessionId);
    // Fresh turn: drop stale open-tool keys an aborted previous turn may have
    // left behind (its terminal tool_call_update frames never arrived).
    this.subtreeRunningToolKeys.delete(sessionId);
    // Only watch lines written during this turn (skip historical quota noise).
    this.opencodeLogWatchOffset = openCodeLogEndOffset(this.getOpenCodeLogPath());
    let stalled = false;
    let fired = false;
    let providerErrorFired = false;
    const timer = setInterval(() => {
      if (fired) return;

      if (!providerErrorFired && callbacks.onProviderError) {
        const providerErr = this.pollOpenCodeLogForSessionError(sessionId);
        if (providerErr) {
          providerErrorFired = true;
          callbacks.onProviderError(providerErr);
        }
      }

      const last = Math.max(startedAt, this.sessionActivityAt.get(sessionId) ?? 0);
      const silentMs = Date.now() - last;
      const busy = (this.subtreeRunningToolKeys.get(sessionId)?.size ?? 0) > 0;
      const hardMs = busy ? busyTimeoutMs : timeoutMs;
      if (silentMs >= hardMs) {
        fired = true;
        clearInterval(timer);
        log.error(
          `turn watchdog hard timeout: sessionId=${sessionId} silentMs=${silentMs} busy=${busy}`,
        );
        callbacks.onTimeout(silentMs, busy);
        return;
      }
      if (!stalled && silentMs >= stallMs) {
        stalled = true;
        log.warn(`turn watchdog stall: sessionId=${sessionId} silentMs=${silentMs}`);
        callbacks.onStall(silentMs);
      } else if (stalled && silentMs < stallMs) {
        // Stream resumed — allow a future stall to warn again.
        stalled = false;
      }
    }, opts?.pollMs ?? 1_000);
    return () => {
      fired = true;
      clearInterval(timer);
      // Turn over — any still-open keys are leftovers from aborted tools.
      this.subtreeRunningToolKeys.delete(sessionId);
      // Final scrape so empty-turn complete can still attach the real message.
      if (!providerErrorFired) {
        this.pollOpenCodeLogForSessionError(sessionId);
      }
    };
  }

  // ─── Binary Discovery ───────────────────────────────────────

  isBinaryAvailable(): boolean {
    try {
      return existsSync(this.resolveBinaryPath());
    } catch {
      return false;
    }
  }

  /** Resolve full path to the opencode binary. */
  private resolveBinaryPath(): string {
    return resolveOpencodeBinaryPath();
  }
}
