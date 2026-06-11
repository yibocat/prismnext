import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow } from "electron";
import { getAgent, getDefaultAgentId } from "../agents/registry";
import { resolveContext } from "./context-resolver";
import type { CalcOutput, CategoryDef, ContextCalculator } from "../agents/context-calculator";
import { createTokenizer } from "../agents/tokenizer";
import type { AgentIntegration, ResolvedContext, AssembledContext } from "../agents/types";
import { Writable } from "node:stream";
import type { CliSession, CliParser } from "./types";
import { createLogger } from "../services/logger";

const log = createLogger("cli-manager", "agent");

/** Shallow-equal two settings records.
 *  Treats undefined, null, and records with only null values as equivalent —
 *  all represent "no explicit settings / use agent defaults". This prevents
 *  an unnecessary process restart when prewarm (no settings) and the first
 *  sendPrompt (default settings) would otherwise be seen as different. */
function settingsEquals(
  a: Readonly<Record<string, string | null>> | undefined,
  b: Readonly<Record<string, string | null>> | undefined,
): boolean {
  if (a === b) return true;
  // Normalize: strip null-valued entries; undefined → empty
  const norm = (s: Readonly<Record<string, string | null>> | undefined): string[] =>
    s ? Object.keys(s).filter((k) => s[k] != null).sort() : [];
  const keysA = norm(a);
  const keysB = norm(b);
  if (keysA.length !== keysB.length) return false;
  if (keysA.length === 0) return true; // both empty/default → equivalent
  return keysA.every((k) => a![k] === b![k]);
}

export class CliManager {
  private win: BrowserWindow;
  private sessions = new Map<string, CliSession>();
  private parsers = new Map<string, CliParser>();
  private calculators = new Map<string, ContextCalculator>();
  private resolvedContexts = new Map<string, ResolvedContext>();
  private gatewayConfig: { baseUrl?: string; apiKey?: string } = {};
  private tabSessionIds = new Map<string, string>();
  /** Pending user message NDJSON lines, keyed by tabId. Written to the
   *  project-local JSONL as soon as the Claude CLI sessionId is known,
   *  so that listSessions() title extraction can find the user prompt. */
  /** Last user prompt text per tabId, for conversation token estimation. */
  private lastUserPrompts = new Map<string, string>();
  private pendingUserMessages = new Map<string, string>();

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  setGateway(baseUrl?: string, apiKey?: string): void {
    this.gatewayConfig = { baseUrl, apiKey };
    log.info(`Gateway updated: ${baseUrl || "default"}`);
  }

  /**
   * Ensure a persistent agent process is running for this tab.
   * The process stays alive between turns — prompts are sent via stdin.
   * Settings changes (any key in `settings`) trigger a restart so the new
   * flags and env vars take effect on the next turn.
   *
   * @param settings Agent-specific settings from the renderer UI.
   *   Passed as an opaque dict — CliManager never interprets the keys.
   *   The agent's applySettings() method does the interpretation.
   */
  private ensureProcess(
    tabId: string,
    cwd: string,
    agentId: string,
    sessionId?: string,
    settings?: Readonly<Record<string, string | null>>,
  ): { stdin: Writable; parser: CliParser } {
    // Reuse existing session if process is still alive AND all params match.
    const existing = this.sessions.get(tabId);
    let cwdChanged = false;
    let settingsChanged = false;
    let sessionChanged = false;
    if (existing && existing.child.exitCode === null && existing.child.signalCode === null) {
      cwdChanged = existing.cwd !== cwd || existing.agentId !== agentId;
      settingsChanged = !settingsEquals(existing.settings, settings);
      // Detect when the caller wants to resume a different Claude session
      // (or resume when the process was started fresh, or vice versa).
      // Normalize: undefined (fresh) → null for comparison.
      const existingResume = existing.resumedSessionId ?? null;
      const requestedResume = sessionId ?? null;
      sessionChanged = existingResume !== requestedResume;

      if (!cwdChanged && !settingsChanged && !sessionChanged) {
        return { stdin: existing.stdin, parser: this.parsers.get(tabId)! };
      }
      // Params changed — kill old process, start fresh
      const parts: string[] = [];
      if (existing.cwd !== cwd) parts.push(`cwd: ${existing.cwd} → ${cwd}`);
      if (existing.agentId !== agentId) parts.push(`agent: ${existing.agentId} → ${agentId}`);
      if (settingsChanged) parts.push("settings changed");
      if (sessionChanged) parts.push(`session: ${existingResume ?? "new"} → ${requestedResume ?? "new"}`);
      log.info(`${parts.join("; ")} for tab ${tabId}, restarting process`);
      try { existing.child.kill("SIGTERM"); } catch {}
    }

    // Clean up dead or mismatched session
    if (existing) {
      this.sessions.delete(tabId);
      this.parsers.delete(tabId);
      this.tabSessionIds.delete(tabId);
      this.calculators.delete(tabId);
      this.resolvedContexts.delete(tabId);
      this.lastUserPrompts.delete(tabId);
    }

    const agent = getAgent(agentId);
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);

    const args = [...agent.args];
    // Skip --resume when cwd changed; old session was created under a different directory
    if (sessionId && !cwdChanged) args.push("--resume", sessionId);

    // Let the agent translate opaque settings into CLI args + env vars.
    // CliManager does NOT interpret settings keys — only the agent does.
    const settingsArgs: string[] = [];
    const settingsEnv: Record<string, string> = {};
    if (settings && agent.applySettings) {
      const applied = agent.applySettings(settings);
      settingsArgs.push(...applied.args);
      Object.assign(settingsEnv, applied.env);
    }

    // Inject project-local agent config if the agent declares a configSubdir
    // AND its CLI supports project config flags (--mcp-config / --add-dir).
    if (agent.configSubdir && agent.supportsProjectConfig) {
      const configDir = join(cwd, ".prismnext", "agent-config", agent.configSubdir);

      // MCP config
      const mcpPath = join(configDir, "mcp.json");
      if (existsSync(mcpPath)) {
        args.push("--mcp-config", mcpPath);
      }

      // Add project agent-config dir for CLAUDE.md / rules discovery
      if (existsSync(configDir)) {
        args.push("--add-dir", configDir);
      }
    }

    // Merge agent-specific settings args into the CLI argument list
    for (const a of settingsArgs) args.push(a);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...(agent.env || {}),
      ...settingsEnv, // agent-specific settings overrides (e.g. CLAUDE_CODE_EFFORT_LEVEL)
    };

    // ── Agent context assembly (App Shell + Project + Agent layers) ──
    if (agent.contextComponents && agent.contextComponents.length > 0) {
      const resolved: ResolvedContext = resolveContext(cwd, agent.contextComponents);
      const assembled: AssembledContext = agent.assembleContext
        ? agent.assembleContext(resolved)
        : { extraArgs: [], extraEnv: {} };

      // Inject system prompt via Claude CLI's --append-system-prompt flag.
      if (assembled.systemPrompt) {
        args.push("--append-system-prompt", assembled.systemPrompt);
      }

      for (const a of assembled.extraArgs) args.push(a);
      Object.assign(env, assembled.extraEnv);

      // Store resolved context for token breakdown calculation
      if (resolved) {
        this.resolvedContexts.set(tabId, resolved);
      }
    }

    // Apply gateway config using agent-specific env var names (or Anthropic defaults as fallback)
    if (this.gatewayConfig.baseUrl) {
      const gw = agent.gatewayEnvMapping ?? { baseUrl: "ANTHROPIC_BASE_URL", apiKey: "ANTHROPIC_API_KEY" };
      env[gw.baseUrl] = this.gatewayConfig.baseUrl;
      if (this.gatewayConfig.apiKey) {
        env[gw.apiKey] = this.gatewayConfig.apiKey;
      }
    }

    // Log args with system prompt redacted
    const safeArgs = args.map((a, i) =>
      (i > 0 && args[i - 1] === "--append-system-prompt") ? "[system-prompt]" : a);
    log.info(`Spawning persistent process (cwd=${cwd}): ${agent.binary} ${safeArgs.join(" ")}`);

    const child = spawn(agent.binary, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const parser = agent.createParser();
    this.parsers.set(tabId, parser);

    // Create calculator for post-turn token breakdown
    const calculator = agent.createCalculator();
    this.calculators.set(tabId, calculator);

    // ── stdout: stream-json NDJSON, line by line ──
    let buffer = "";
    child.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const msg = parser.parse(trimmed);
        if (!msg) continue;

        // Sync session ID to renderer on first sight (only once per tab)
        if (msg.session_id && !this.tabSessionIds.has(tabId)) {
          this.tabSessionIds.set(tabId, msg.session_id as string);
          this.win.webContents.send("cli:sessionCreated", {
            tabId,
            sessionId: msg.session_id,
            agentId,
          });

          // Persist the pending user message to the project-local JSONL (deferred).
          const pending = this.pendingUserMessages.get(tabId);
          if (pending) {
            const pcwd = this.sessions.get(tabId)?.cwd;
            if (pcwd) {
              const pdir = join(pcwd, ".prismnext", "sessions", agentId);
              const pfile = join(pdir, `${msg.session_id}.jsonl`);
              const pline = pending;
              setImmediate(() => {
                try {
                  if (!existsSync(pdir)) mkdirSync(pdir, { recursive: true });
                  appendFileSync(pfile, pline);
                } catch (err) {
                  log.error(`Failed to persist user message for session ${msg.session_id}`, err);
                }
              });
            }
            this.pendingUserMessages.delete(tabId);
          }
        }

        this.win.webContents.send("cli:stream", {
          tabId,
          data: JSON.stringify(msg),
        });

        // ── Persist assistant messages to project-local JSONL ──
        // Deferred to next tick via setImmediate to avoid blocking the
        // main process event loop with sync I/O on every streaming chunk.
        if (msg.type === "assistant" && !(msg as any).__partial) {
          const sid = this.tabSessionIds.get(tabId);
          const tcwd = this.sessions.get(tabId)?.cwd;
          if (sid && tcwd) {
            const msgJson = JSON.stringify(msg) + "\n";
            const dir = join(tcwd, ".prismnext", "sessions", agentId);
            const file = join(dir, `${sid}.jsonl`);
            setImmediate(() => {
              try {
                if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                appendFileSync(file, msgJson);
              } catch (err) {
                log.error(`Failed to persist assistant message for session ${sid}`, err);
              }
            });
          }
        }

        // Notify renderer of turn completion
        if (msg.type === "result") {
          const calculator = this.calculators.get(tabId);
          const resolvedCtx = this.resolvedContexts.get(tabId);
          let breakdown: CalcOutput | null = null;
          let categorySchema: CategoryDef[] | null = null;

          if (calculator && resolvedCtx && parser.totalContextTokens != null) {
            try {
              const modelId = this.sessions.get(tabId)?.settings?.["model"] ?? undefined;
              const tokenizer = createTokenizer(agentId, modelId);
              const lastUserPrompt = this.lastUserPrompts.get(tabId);
              breakdown = calculator.calculate({
                totalTokens: parser.totalContextTokens,
                resolvedContext: resolvedCtx,
                tokenizer,
                modelId,
                lastUserPrompt,
              });
              categorySchema = calculator.categories;
            } catch (err) {
              log.error("Failed to compute context breakdown", err);
            }
          }

          // ── Persist result with breakdown to JSONL (deferred) ──
          const sid = this.tabSessionIds.get(tabId);
          const tcwd = this.sessions.get(tabId)?.cwd;
          if (sid && tcwd) {
            const record = {
              ...(msg as Record<string, unknown>),
              usage: {
                ...((msg as any).usage || {}),
                input_tokens: parser.totalContextTokens ?? (msg as any).usage?.input_tokens ?? 0,
              },
              contextBreakdown: breakdown?.categories ?? null,
              categorySchema: categorySchema ?? null,
            };
            const recordJson = JSON.stringify(record) + "\n";
            const dir = join(tcwd, ".prismnext", "sessions", agentId);
            const file = join(dir, `${sid}.jsonl`);
            setImmediate(() => {
              try {
                if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                appendFileSync(file, recordJson);
              } catch (err) {
                log.error(`Failed to persist result for session ${sid}`, err);
              }
            });
          }

          this.win.webContents.send("cli:complete", {
            tabId,
            success: !msg.is_error,
            error: msg.is_error ? (msg.result as string) : undefined,
            inputTokens: parser.totalContextTokens,
            breakdown,
            categorySchema,
          });
        }
      }
    });

    // ── stderr ──
    child.stderr!.on("data", (chunk: Buffer) => {
      this.win.webContents.send("cli:stderr", {
        tabId,
        data: chunk.toString(),
      });
    });

    // ── Process exit (unexpected) ──
    child.on("exit", (code, signal) => {
      log.info(`Process exited for tab ${tabId}: code=${code} signal=${signal}`);
      // Only clean up AND notify renderer if THIS child is still the active
      // session for this tab. When settings or sessionId changes trigger a
      // restart, a new child is spawned before the old one finishes dying.
      // The old exit handler must not touch maps that now belong to the new
      // session, and must not send cli:complete (which would prematurely
      // set isStreaming=false and hide the streaming indicator).
      const isActive = this.sessions.get(tabId)?.child === child;
      if (isActive) {
        this.sessions.delete(tabId);
        this.parsers.delete(tabId);
        this.calculators.delete(tabId);
        this.resolvedContexts.delete(tabId);
        if (code !== 0) {
          this.win.webContents.send("cli:complete", {
            tabId,
            success: false,
            error: `Process exited unexpectedly (code ${code})`,
            inputTokens: parser.totalContextTokens,
            breakdown: null,
            categorySchema: null,
          });
        }
      }
    });

    child.on("error", (err) => {
      log.error(`Process error for tab ${tabId}`, err.message);
      const isActive = this.sessions.get(tabId)?.child === child;
      if (isActive) {
        this.sessions.delete(tabId);
        this.parsers.delete(tabId);
        this.calculators.delete(tabId);
        this.resolvedContexts.delete(tabId);
        this.win.webContents.send("cli:complete", {
          tabId,
          success: false,
          error: err.message,
          inputTokens: parser.totalContextTokens,
          breakdown: null,
          categorySchema: null,
        });
      }
    });

    const session: CliSession = {
      child,
      stdin: child.stdin!,
      sessionId: `cli-${Date.now()}`,
      agentId,
      cwd,
      status: "idle",
      createdAt: Date.now(),
      settings,
      // Track which Claude session (if any) this process was configured
      // to resume.  Used to detect mismatches when the caller's sessionId
      // changes between prewarm (fresh) and the first prompt (resume).
      resumedSessionId: sessionId ?? null,
    };

    this.sessions.set(tabId, session);
    return { stdin: child.stdin!, parser };
  }

  sendPrompt(
    tabId: string,
    prompt: string,
    cwd: string,
    agentId: string = getDefaultAgentId(),
    sessionId?: string,
    settings?: Readonly<Record<string, string | null>>,
  ): void {
    try {
      const { stdin, parser } = this.ensureProcess(tabId, cwd, agentId, sessionId, settings);
      parser.reset();

      const session = this.sessions.get(tabId)!;
      session.status = "busy";

      // Store user prompt for conversation token estimation
      this.lastUserPrompts.set(tabId, prompt);

      // Send user message as NDJSON
      const ndjsonLine = JSON.stringify({
        type: "user",
        message: { role: "user", content: prompt },
      }) + "\n";
      stdin.write(ndjsonLine);

      // Buffer the user message so we can persist it to the project-local
      // JSONL once the real session ID arrives (via claude's system message).
      // If the session was resumed, tabSessionIds already has the ID and
      // the pending message is written immediately below.
      const existingSessionId = this.tabSessionIds.get(tabId);
      if (existingSessionId) {
        // Defer synchronous JSONL persistence to next tick so we don't block
        // the IPC response. appendFileSync was taking ~70ms on subsequent messages.
        const dir = join(cwd, ".prismnext", "sessions", agentId);
        const file = join(dir, `${existingSessionId}.jsonl`);
        const line = ndjsonLine;
        setImmediate(() => {
          try {
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            appendFileSync(file, line);
          } catch (err) {
            log.error(`Failed to persist user message for session ${existingSessionId}`, err);
          }
        });
      } else {
        // New session — defer write until sessionId arrives via stdout
        this.pendingUserMessages.set(tabId, ndjsonLine);
      }
    } catch (err: any) {
      this.win.webContents.send("cli:complete", {
        tabId,
        success: false,
        error: err?.message || String(err),
      });
    }
  }

  answer(tabId: string, answer: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;
    session.stdin.write(answer + "\n");
  }

  cancel(tabId: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;
    log.info(`Cancelling session for tab ${tabId}`);
    session.child.kill("SIGINT");
  }

  closeSession(tabId: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;
    log.info(`Closing session for tab ${tabId}`);
    try { session.child.kill("SIGTERM"); } catch {}
    this.sessions.delete(tabId);
    this.parsers.delete(tabId);
    this.calculators.delete(tabId);
    this.resolvedContexts.delete(tabId);
    this.tabSessionIds.delete(tabId);
    this.pendingUserMessages.delete(tabId);
  }

  closeAll(): void {
    for (const [tabId, session] of this.sessions) {
      try { session.child.kill("SIGTERM"); } catch {}
    }
    this.sessions.clear();
    this.parsers.clear();
    this.tabSessionIds.clear();
    this.pendingUserMessages.clear();
    this.calculators.clear();
    this.resolvedContexts.clear();
    this.lastUserPrompts.clear();
  }

  prewarm(tabId: string, cwd: string, settings?: Readonly<Record<string, string | null>>): void {
    // Eagerly start the persistent process with the current settings so the
    // first sendPrompt can reuse it without a restart.
    try {
      this.ensureProcess(tabId, cwd, getDefaultAgentId(), undefined, settings);
    } catch {}
  }

  getStatus(): {
    available: boolean;
    agentId?: string;
    agentName?: string;
    error?: string;
  } {
    const agent = getAgent(getDefaultAgentId());
    return { available: true, agentId: agent?.id, agentName: agent?.name ?? "Unknown" };
  }
}
