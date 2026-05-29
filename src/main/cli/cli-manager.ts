import { spawn } from "node:child_process";
import { BrowserWindow } from "electron";
import { getAgentConfig, DEFAULT_AGENT_ID } from "../agents/configs";
import { ClaudeParser } from "./claude-parser";
import { Writable } from "node:stream";
import type { CliSession, CliParser } from "./types";

export class CliManager {
  private win: BrowserWindow;
  private sessions = new Map<string, CliSession>();
  private parsers = new Map<string, CliParser>();
  private gatewayConfig: { baseUrl?: string; apiKey?: string } = {};
  private tabSessionIds = new Map<string, string>();

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  setGateway(baseUrl?: string, apiKey?: string): void {
    this.gatewayConfig = { baseUrl, apiKey };
    console.log(`[cli-manager] Gateway updated: ${baseUrl || "default"}`);
  }

  /**
   * Ensure a persistent Claude Code process is running for this tab.
   * The process stays alive between turns — prompts are sent via stdin.
   * This eliminates the ~2s startup cost on every message.
   */
  private ensureProcess(
    tabId: string,
    cwd: string,
    agentId: string,
    model?: string | null,
  ): { stdin: Writable; parser: CliParser } {
    // Reuse existing session if process is still alive
    const existing = this.sessions.get(tabId);
    if (existing && existing.child.exitCode === null && existing.child.signalCode === null) {
      return { stdin: existing.stdin, parser: this.parsers.get(tabId)! };
    }

    // Clean up dead session
    if (existing) {
      this.sessions.delete(tabId);
      this.parsers.delete(tabId);
    }

    const config = getAgentConfig(agentId);
    if (!config) throw new Error(`Unknown agent: ${agentId}`);

    const args = [...config.args];
    if (model) args.push("--model", model);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      CLAUDE_CODE_EFFORT_LEVEL: "low",
    };
    if (this.gatewayConfig.baseUrl) {
      env.ANTHROPIC_BASE_URL = this.gatewayConfig.baseUrl;
      if (this.gatewayConfig.apiKey) {
        env.ANTHROPIC_API_KEY = this.gatewayConfig.apiKey;
      }
    }

    console.log(`[cli-manager] Spawning persistent process: ${config.binary} ${args.join(" ")}`);

    const child = spawn(config.binary, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const parser = new ClaudeParser();
    this.parsers.set(tabId, parser);

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
        }

        this.win.webContents.send("cli:stream", {
          tabId,
          data: JSON.stringify(msg),
        });

        // Result signals turn completion
        if (msg.type === "result") {
          this.win.webContents.send("cli:complete", {
            tabId,
            success: !msg.is_error,
            error: msg.is_error ? (msg.result as string) : undefined,
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
      console.log(`[cli-manager] Process exited for tab ${tabId}: code=${code} signal=${signal}`);
      this.sessions.delete(tabId);
      this.parsers.delete(tabId);
      if (code !== 0) {
        this.win.webContents.send("cli:complete", {
          tabId,
          success: false,
          error: `Process exited unexpectedly (code ${code})`,
        });
      }
    });

    child.on("error", (err) => {
      console.error(`[cli-manager] Process error for tab ${tabId}:`, err.message);
      this.sessions.delete(tabId);
      this.parsers.delete(tabId);
      this.win.webContents.send("cli:complete", {
        tabId,
        success: false,
        error: err.message,
      });
    });

    const session: CliSession = {
      child,
      stdin: child.stdin!,
      sessionId: `cli-${Date.now()}`,
      agentId,
      cwd,
      status: "idle",
      createdAt: Date.now(),
    };

    this.sessions.set(tabId, session);
    return { stdin: child.stdin!, parser };
  }

  sendPrompt(
    tabId: string,
    prompt: string,
    cwd: string,
    agentId: string = DEFAULT_AGENT_ID,
    model?: string | null,
  ): void {
    try {
      const { stdin, parser } = this.ensureProcess(tabId, cwd, agentId, model);
      parser.reset();

      const session = this.sessions.get(tabId)!;
      session.status = "busy";

      // Send user message as NDJSON
      const message = JSON.stringify({
        type: "user",
        message: { role: "user", content: prompt },
      });
      stdin.write(message + "\n");
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
    console.log(`[cli-manager] Cancelling session for tab ${tabId}`);
    session.child.kill("SIGINT");
  }

  closeSession(tabId: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;
    console.log(`[cli-manager] Closing session for tab ${tabId}`);
    try { session.child.kill("SIGTERM"); } catch {}
    this.sessions.delete(tabId);
    this.parsers.delete(tabId);
  }

  closeAll(): void {
    for (const [tabId, session] of this.sessions) {
      try { session.child.kill("SIGTERM"); } catch {}
    }
    this.sessions.clear();
    this.parsers.clear();
  }

  prewarm(tabId: string, cwd: string): void {
    // Eagerly start the persistent process
    try {
      this.ensureProcess(tabId, cwd, DEFAULT_AGENT_ID);
    } catch {}
  }

  getStatus(): {
    available: boolean;
    agentId?: string;
    agentName?: string;
    error?: string;
  } {
    return { available: true, agentId: "claude", agentName: "Claude Code" };
  }
}
