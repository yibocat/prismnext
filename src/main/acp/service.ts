import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, accessSync, constants, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { Readable, Writable } from "node:stream";
import { app } from "electron";
import {
  ClientSideConnection,
  ndJsonStream,
} from "@agentclientprotocol/sdk";
import { createLogger } from "../services/logger";
import { getBuiltinToolFiles, BUILTIN_TOOLS } from "../tools";
import {
  buildOpencodeToolDescription,
  patchToolDescription,
} from "../tools/tool-description";
import { buildPermissionOutcome, type PermissionResponse } from "./permission";
import { resolveChatTabId } from "../services/chat-session-registry";
import { mcpJsonToAcpServers, type AcpMcpServer } from "./mcp-transform";
import {
  getPermissionRulesForMode,
  resolvePermissionMode,
  resolveEffectiveAgentTerminalMode,
  extractPermissionToolName,
  resolvePermissionAction,
  type PermissionMode,
} from "../services/permission-modes";
import { getSettings } from "../services/settings";
import { sanitizeSkillPermissionMap, skillPermissionNeedsRepair } from "../services/skills-sync";
import { buildEnabledToolsConfig } from "../services/opencode-tools-config";
import {
  mergeOpencodeInstructions,
  PRISM_OPENCODE_INSTRUCTIONS,
} from "../services/prompt-sync";
import { messageIdsAfterTurn } from "../../shared/chat-turns";
import {
  approveCustomToolJob,
  denyBashJob,
  executeApprovedBashJob,
  extractBashCommandFromInput,
  isRunnableBashCommand,
  registerCustomToolJobIntent,
  type ApprovedBashJob,
} from "../services/bash-permission-bridge";

const CUSTOM_GATED_TOOLS = new Set(["delete", "move"]);

const log = createLogger("acp-service", "agent");

// ── Constants ──
const PERMISSION_TIMEOUT_MS = 120_000;
const SIGKILL_GRACE_MS = 5_000;
/** Files smaller than this are assumed to be auto-generated config stubs. */
const MIN_CUSTOM_CONFIG_LENGTH = 60;

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
  /** Stored API keys from last chat:send — reused on reconnect. */
  private lastExtraEnv: Record<string, string> = {};
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

  // ─── Lifecycle ──────────────────────────────────────────────

  /**
   * Initialize the ACP connection. Spawns opencode acp as a persistent
   * child process. XDG directories are routed to <userData>/opencode-server/
   * so all session data lives at the app level — one process serves all
   * projects, with zero cold-start on project switch.
   */
  async initialize(extraEnv?: Record<string, string>): Promise<void> {
    // Merge into stored env — preserves keys from other providers across reconnects
    if (extraEnv) Object.assign(this.lastExtraEnv, extraEnv);

    // Already alive — skip (API keys are baked into the running process)
    if (this.conn && this.proc) {
      return;
    }

    await this.shutdown();

    // Resolve the opencode binary — use full path for reliability
    const binaryPath = this.resolveBinaryPath();

    if (!existsSync(binaryPath)) {
      throw new Error(
        `OpenCode binary not found at ${binaryPath}. ` +
        "Install it from https://opencode.ai"
      );
    }

    // Verify the binary is executable (existsSync doesn't check +x)
    try {
      accessSync(binaryPath, constants.X_OK);
    } catch {
      throw new Error(
        `OpenCode binary is not executable: ${binaryPath}\n` +
        "Fix: chmod +x " + binaryPath
      );
    }

    // Route OpenCode's XDG directories to the app-level data folder.
    const serverDir = this.getServerDataDir();
    mkdirSync(serverDir, { recursive: true });

    // Load previously persisted sub-agent session IDs
    this.loadSubAgentSessions();

    // Sync prism-next's built-in custom tools so OpenCode can discover them.
    this.repairOpencodeServerConfigs();

    // Write default OpenCode config to enable ALL built-in tools.  OpenCode
    // disables websearch, question, etc. by default (privacy-first).  We
    // enable everything so the AI has the full toolbox available.
    this.writeDefaultConfig();
    this.applyBuiltinToolsConfig();
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

    const env = {
      ...process.env,
      PATH: safePath,
      ...this.lastExtraEnv,
      ...extraEnv,
      XDG_DATA_HOME: serverDir,
      XDG_CONFIG_HOME: join(serverDir, "config"),
      XDG_CACHE_HOME: join(serverDir, "cache"),
      XDG_STATE_HOME: join(serverDir, "state"),
      // Enable OpenCode's built-in websearch (disabled by default)
      OPENCODE_ENABLE_EXA: "1",
    };

    log.info(`Spawning opencode acp (data: ${serverDir})`);
    try {
      this.proc = spawn(binaryPath, ["acp"], {
        cwd: serverDir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err: any) {
      log.error(`Failed to spawn opencode: ${err.message}`);
      this.proc = null;
      throw new Error(`Failed to start OpenCode: ${err.message}`);
    }

    // Handle async spawn errors (e.g. ENOENT) — without this they become
    // uncaught exceptions that crash the app.
    this.proc.on("error", (err: Error) => {
      log.error(`OpenCode process error: ${err.message}`);
      this.conn = null;
      this.proc = null;
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
          const permissionId = params.id || params.permissionId || `perm-${Date.now()}`;
          const options = Array.isArray(params.options) ? params.options : [];
          if (this.sessionReplaySuppress > 0) {
            log.debug(`permission:replay-suppressed id=${permissionId}`);
            return buildPermissionOutcome(options, false);
          }
          const settings = getSettings() as Record<string, unknown>;
          const mode = resolvePermissionMode(settings.permissionMode as string | undefined);
          const toolName = extractPermissionToolName(params as Record<string, unknown>);
          const action = resolvePermissionAction(mode, toolName);
          const sessionId =
            (params as { sessionId?: string }).sessionId
            || (params as { session?: { id?: string } }).session?.id;
          const tabId = sessionId ? resolveChatTabId(sessionId) : undefined;
          const toolCallId =
            (params as { toolCallId?: string }).toolCallId
            || (params as { tool_call_id?: string }).tool_call_id
            || (params as { callID?: string }).callID
            || ((params as { toolCall?: { id?: string; toolCallId?: string } }).toolCall?.toolCallId)
            || ((params as { toolCall?: { id?: string } }).toolCall?.id);

          const bashCommand = this.extractBashCommandFromPermissionParams(
            params as Record<string, unknown>,
          );
          const bashCwd =
            (params as { directory?: string }).directory
            || (params as { cwd?: string }).cwd
            || this.projectPath;

          if (action === "allow") {
            log.debug(`permission:auto-allow id=${permissionId} mode=${mode} tool=${toolName || "?"} toolCallId=${toolCallId ?? "(none)"}`);
            if (
              this.isBashTool(toolName)
              && sessionId
              && toolCallId
              && isRunnableBashCommand(bashCommand)
            ) {
              this.runApprovedBash({
                sessionId,
                chatTabId: tabId || sessionId,
                toolCallId,
                command: bashCommand,
                cwd: bashCwd || process.cwd(),
              });
            } else if (this.isBashTool(toolName) && sessionId && toolCallId) {
              // Auto-allow arrived before real command — remember context, wait for backfill.
              this.bashJobContext.set(toolCallId, {
                sessionId,
                chatTabId: tabId || sessionId,
                toolCallId,
                command: bashCommand,
                cwd: bashCwd || process.cwd(),
              });
              this.bashAutoApproved.add(toolCallId);
            }
            return buildPermissionOutcome(options, true);
          }
          if (action === "deny") {
            log.debug(`permission:auto-deny id=${permissionId} mode=${mode} tool=${toolName || "?"} toolCallId=${toolCallId ?? "(none)"}`);
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

      const wasUnexpected = code !== 0 && code !== null;
      if (!wasUnexpected) {
        this.reconnectAttempts = 0;
        return;
      }

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        log.error("Max reconnect attempts reached — giving up");
        this.reconnectAttempts = 0;
        this.emitNotification("agent/connectionLost", {
          error: "OpenCode process crashed and could not be restarted",
        });
        return;
      }

      const delay = this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts);
      this.reconnectAttempts++;
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
    } catch (err: any) {
      log.error(`ACP initialize failed: ${err.message}`);
      await this.shutdown();
      throw new Error(`OpenCode ACP handshake failed: ${err.message}`);
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
  }

  /**
   * Merge per-project skill discovery into app-level OpenCode config
   * (`userData/opencode-server/config/opencode/opencode.json`), not the project tree.
   * skills.paths use forward slashes — valid on Windows, macOS, and Linux.
   */
  applyProjectSkillsIntegration(
    projectRoot: string,
    patch: { skillsPaths: string[]; skillPermissions: Record<string, string> },
  ): string {
    const primaryPath = join(this.getServerDataDir(), "config", "opencode", "opencode.json");
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
        config.skills = nextSkills;

        const existingPermission = (config.permission as Record<string, unknown> | undefined) ?? {};
        config.permission = {
          ...existingPermission,
          skill: sanitizeSkillPermissionMap(existingPermission.skill, patch.skillPermissions),
        };

        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
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
    return primaryPath;
  }

  /**
   * Merge Prism instruction paths into app-level OpenCode config.
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
        }

        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, JSON.stringify(merged.config, null, 2), "utf-8");
        log.info("Applied project prompt integration", {
          configPath: p,
          instructions: PRISM_OPENCODE_INSTRUCTIONS,
          changed: merged.changed,
        });
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
    await this.shutdown();
    await this.initialize();
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
          log.info("Removed prism bash tool (mirror mode uses OpenCode built-in)");
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
   * Fix corrupted/stale `permission.skill` maps in app-level OpenCode config.
   * Runs automatically on every OpenCode spawn — users never edit Application Support manually.
   *
   * Two cases handled:
   * 1. Legacy numeric-key corruption (string spread bug).
   * 2. Stale per-skill `deny` entries left by previous profile whitelist runs
   *    — these would keep skills blocked forever after switching profiles.
   *    We reset the map to just the wildcard; per-project denies are re-added
   *    by `applyProjectSkillsIntegration` when a project is loaded.
   */
  repairOpencodeServerConfigs(): void {
    for (const p of this.getOpencodeConfigPaths()) {
      if (!existsSync(p)) continue;
      try {
        const config = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
        const permission = config.permission as Record<string, unknown> | undefined;
        if (!permission) continue;

        const before = permission.skill;
        const needsRepair =
          skillPermissionNeedsRepair(before)
          || typeof before === "string"
          || (before && typeof before === "object" && !Array.isArray(before)
            && Object.keys(before as Record<string, unknown>).some((k) => k !== "*"));
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
   * Ensures new Prism custom tools (delete, move, …) are visible to the model
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
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
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

  /** Restart OpenCode so custom tools (e.g. prism bash) are picked up. */
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
    const defaultConfig = {
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
    };

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
    options?: { mcpServerAllowlist?: string[] },
  ): {
    mcpServers: AcpMcpServer[];
    additionalDirectories: string[];
  } {
    const useCache = !options?.mcpServerAllowlist?.length;
    if (useCache && this.cachedAgentConfig?.projectRoot === projectRoot) {
      return {
        mcpServers: this.cachedAgentConfig.mcpServers,
        additionalDirectories: this.cachedAgentConfig.additionalDirectories,
      };
    }

    const config = this.readAgentConfig(projectRoot);
    if (!options?.mcpServerAllowlist?.length) {
      if (!this.cachedAgentConfig || this.cachedAgentConfig.projectRoot !== projectRoot) {
        log.warn("Agent config cache miss — reading from disk", { projectRoot });
      }
      return config;
    }

    const allow = new Set(options.mcpServerAllowlist);
    return {
      ...config,
      mcpServers: config.mcpServers.filter((s) => allow.has(s.name)),
    };
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
    options?: { mcpServerAllowlist?: string[] },
  ): Promise<SessionInfo> {
    if (!this.conn) throw new Error("AcpService not initialized");

    this.projectPath = cwd;
    const root = projectRoot || cwd;
    const { mcpServers, additionalDirectories } = this.loadProjectAgentConfig(root, options);

    const params: any = { cwd, mcpServers };
    if (additionalDirectories.length > 0) {
      params.additionalDirectories = additionalDirectories;
    }

    log.info("Creating ACP session", {
      cwd,
      mcpCount: mcpServers.length,
      mcpNames: mcpServers.map((s) => s.name),
    });

    const result = await this.conn.extMethod("session/new", params);

    const sessionId = (result as any)?.sessionId || (result as any)?.id;
    if (!sessionId) throw new Error("session/new did not return a sessionId");
    this.opencodeHydratedSessions.add(sessionId);

    // Set the model via standard ACP session/set_model
    if (model) {
      try {
        await this.conn.extMethod("session/set_model", {
          sessionId,
          modelId: model,
        });
      } catch (err: any) {
        log.warn(`session/set_model failed: ${err.message}`);
      }
    }

    return {
      id: sessionId,
      title: "New Chat",
      lastModified: Date.now(),
      createdAt: Date.now(),
    };
  }

  /**
   * Set a session configuration option via ACP.
   * Used for thought_level, model, mode, etc.
   */
  async setConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<void> {
    if (!this.conn) throw new Error("AcpService not initialized");
    await this.conn.extMethod("session/set_config_option", {
      sessionId,
      configId,
      value,
    });
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
    };

    const ep = endpoints[provider];
    if (!ep && !baseUrl) {
      log.warn(`testConnection: unknown provider ${provider} and no baseUrl`);
      return { success: false };
    }

    try {
      // Google uses API key as query parameter
      if (provider === "google") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url);
        const data = await res.json() as any;
        const models = data?.models?.map((m: any) => m.name?.replace("models/", "")) || undefined;
        return { success: res.ok, models };
      }

      // All other providers use Authorization or custom header
      const base = ep?.url || baseUrl!;
      const listUrl = base.replace(/\/+$/, "") + "/v1/models";
      const headers: Record<string, string> = {};
      if (ep?.header && ep?.prefix !== undefined) {
        headers[ep.header] = ep.prefix + apiKey;
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const res = await fetch(listUrl, { headers });
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
        const rows = db.prepare(
          `SELECT id, title, time_created, time_updated
           FROM session
           WHERE directory = ?
             AND time_archived IS NULL
             AND parent_id IS NULL
           ORDER BY time_updated DESC`,
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

  /** List sessions for the project root and every Prism worktree checkout. */
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

  /** Fire-and-forget ACP session/load to init session state for continued conversation. */
  async initSession(sessionId: string, cwd: string, projectRoot?: string): Promise<void> {
    if (!this.conn) return;
    const root = projectRoot || cwd;
    const { mcpServers } = this.loadProjectAgentConfig(root);
    this.sessionReplaySuppress++;
    try {
      await this.withNotificationCollector(
        () => {}, // discard — just need the side effect of initializing session state
        () => this.conn!.extMethod("session/load", { sessionId, cwd, mcpServers }),
      );
      this.opencodeHydratedSessions.add(sessionId);
    } catch (err: any) {
      log.debug(`session/load failed for ${sessionId}: ${err.message}`);
    } finally {
      this.sessionReplaySuppress = Math.max(0, this.sessionReplaySuppress - 1);
    }
  }

  /** Hydrate OpenCode in-memory session state once before the first prompt after restart. */
  async ensureSessionHydrated(sessionId: string, cwd: string, projectRoot?: string): Promise<void> {
    if (!this.conn || this.opencodeHydratedSessions.has(sessionId)) return;
    await this.initSession(sessionId, cwd, projectRoot);
  }

  /** Reload MCP tool definitions for an existing session (composer `/` MCP tokens). */
  async reloadSessionMcps(
    sessionId: string,
    cwd: string,
    projectRoot: string,
    mcpServerAllowlist: string[],
  ): Promise<void> {
    if (!this.conn || mcpServerAllowlist.length === 0) return;
    const { mcpServers } = this.loadProjectAgentConfig(projectRoot, { mcpServerAllowlist });
    log.info("Reloading session MCP servers", {
      sessionId,
      allowlist: mcpServerAllowlist,
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
    const { mcpServers } = this.loadProjectAgentConfig(root);
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

  /** Mark a session as a sub-agent session (created by the task tool).
   *  Sub-agent sessions are hidden from the sidebar session list. */
  markSubAgentSession(sessionId: string): void {
    if (this.subAgentSessions.has(sessionId)) return;
    this.subAgentSessions.add(sessionId);
    this.persistSubAgentSessions();
    log.info(`Marked sub-agent session: ${sessionId}`);
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
    const db = new DatabaseSync(dbPath, { readonly: opts?.readonly ?? false });
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
      /** Active agent profile — per-tab; injected every turn when non-empty. */
      profileOverlayPrompt?: string;
      /** Project rules — read fresh each turn; always injected when non-empty. */
      projectRulesPrompt?: string;
    },
  ): Promise<{ usage?: any }> {
    if (!this.conn) throw new Error("AcpService not initialized");

    const content: Array<{ type: "text"; text: string; _meta?: Record<string, unknown> }> = [];

    const profile = opts?.profileOverlayPrompt?.trim();
    if (profile) {
      content.push({
        type: "text",
        text: profile,
        _meta: { prism: "profile-overlay" },
      });
      log.info(`Profile overlay injected: ${profile.length} chars`);
    }

    // Project rules — every turn, fresh from RULE.md on disk.
    const rules = opts?.projectRulesPrompt?.trim();
    if (rules) {
      content.push({
        type: "text",
        text: rules,
        _meta: { prism: "project-rules" },
      });
      log.info(`Project rules injected: ${rules.length} chars`);
    }

    content.push({ type: "text", text: prompt });

    if (opts?.model) {
      const modelId = opts.model.includes("/")
        ? opts.model
        : `${opts.provider || "anthropic"}/${opts.model}`;
      try {
        await this.conn.extMethod("session/set_model", { sessionId, modelId });
      } catch (err: any) {
        log.warn(`session/set_model failed before prompt: ${err.message}`);
      }
    }

    log.info(
      `session/prompt: sessionId=${sessionId} userLen=${prompt.length} blocks=${content.length}`,
    );
    const promptResult = await this.conn.prompt({ sessionId, prompt: content });
    log.info(`session/prompt complete: ${JSON.stringify(promptResult).slice(0, 200)}`);
    return promptResult as any;
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

  async abort(sessionId: string): Promise<void> {
    this.releaseSessionPendingWork(sessionId);
    if (!this.conn) return;

    try {
      this.conn.extNotification("session/cancel", { sessionId });
    } catch (err: any) {
      log.error(`Failed to abort session ${sessionId}: ${err.message}`);
    }
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
      log.info(`permission:answer id=${resolvedId} approved=${approved} toolCallId=${pending.toolCallId ?? "(none)"}`);
      pending.resolve(buildPermissionOutcome(pending.options, approved));
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
   * OpenCode custom bash may invoke execute() before ACP requestPermission.
   * When we see a bash tool_call and no ACP pending exists, emit the same UI gate.
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
    if (resolvePermissionAction(mode, "bash") !== "prompt") return;
    if (this.emittedBashUi.has(toolCallId)) return;
    if (this.hasAcpPendingForToolCall(toolCallId)) return;

    const cwd = args.cwd || this.projectPath || process.cwd();
    this.emittedBashUi.add(toolCallId);
    const permissionId = `bash-gate-${toolCallId}`;
    this.bashJobContext.set(toolCallId, {
      sessionId,
      chatTabId: tabId,
      toolCallId,
      command: command.trim(),
      cwd,
    });

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
   * OpenCode custom delete/move may invoke execute() before ACP requestPermission.
   * When we see a tool_call, emit the same PermissionGatePanel as built-in tools.
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
    if (resolvePermissionAction(mode, normalized) !== "prompt") return;
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
    const BUILTIN = new Set(["anthropic", "openai", "google", "openrouter"]);
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
    for (const handler of this.notificationHandlers) {
      try {
        handler(method, params);
      } catch (err: any) {
        log.debug(`Notification handler error (${method}): ${err.message}`);
      }
    }
  }

  // ─── Binary Discovery ───────────────────────────────────────

  isBinaryAvailable(): boolean {
    try { return existsSync(this.resolveBinaryPath()); } catch { return false; }
  }

  /** Resolve full path to the opencode binary.
   *  Packaged: <resources>/opencode/opencode
   *  Dev:      <project>/bin/opencode/<platform>-<arch>/opencode */
  private resolveBinaryPath(): string {
    const binName = process.platform === "win32" ? "opencode.exe" : "opencode";

    if (app.isPackaged) {
      return join(process.resourcesPath, "opencode", binName);
    }

    const platform = process.platform;
    const arch = process.arch;
    let platformDir: string;
    if (platform === "darwin") platformDir = "darwin";
    else if (platform === "linux") platformDir = "linux";
    else if (platform === "win32") platformDir = "windows";
    else platformDir = platform;
    let archDir: string;
    if (arch === "arm64") archDir = "arm64";
    else if (arch === "x64") archDir = "x64";
    else archDir = arch;

    return join(
      app.getAppPath(),
      "bin",
      "opencode",
      `${platformDir}-${archDir}`,
      binName,
    );
  }
}
