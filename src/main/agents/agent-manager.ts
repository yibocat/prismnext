import { spawn, type ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { BrowserWindow } from "electron";
import * as acp from "@agentclientprotocol/sdk";
import { getAgentConfig, type AgentConfig, DEFAULT_AGENT_ID } from "./configs";

// Path to node_modules from the compiled output (out/main/agents/ → node_modules/)
// electron-vite compiles main as CJS, so __dirname is available
const NODE_MODULES = join(__dirname, "..", "..", "..", "node_modules");

function resolveAgentBinary(config: AgentConfig): { binary: string; args: string[] } {
  // For "npx" configs, resolve to local node_modules binary
  if (config.binary === "npx" && config.args.length > 0) {
    const pkgName = config.args[0];
    const restArgs = config.args.slice(1);
    // Try local node_modules first
    const localPath = join(NODE_MODULES, pkgName, "dist", "index.js");
    if (existsSync(localPath)) {
      return { binary: process.execPath, args: [localPath, ...restArgs] };
    }
    // Fallback: use npx
    return { binary: "npx", args: config.args };
  }
  return { binary: config.binary, args: config.args };
}

// ─── Types ───

export interface AgentStatus {
  available: boolean;
  binary: string;
  error?: string;
}

interface TabSession {
  child: ChildProcess;
  connection: acp.ClientSideConnection;
  sessionId: string;
  agentId: string;
  cwd: string;
  /** Agent-specific settings (model, mode, effort, etc.) — stored for future ACP session config */
  settings: Record<string, string | null>;
}

// ─── Agent Manager ───

export class AgentManager {
  private win: BrowserWindow;
  private sessions = new Map<string, TabSession>();
  private currentAgentId: string = DEFAULT_AGENT_ID;

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  get agentId(): string {
    return this.currentAgentId;
  }

  // ─── Status ───

  async getStatus(agentId?: string): Promise<AgentStatus> {
    const id = agentId || this.currentAgentId;
    const config = getAgentConfig(id);
    if (!config) {
      return { available: false, binary: "", error: `Unknown agent: ${id}` };
    }
    if (config.placeholder) {
      return { available: false, binary: config.binary, error: "Not yet implemented" };
    }
    // Check if binary exists (for "npx" we just check it's on PATH)
    try {
      const { execSync } = require("node:child_process");
      const checkCmd = process.platform === "win32" ? "where" : "which";
      execSync(`${checkCmd} ${config.binary}`, { encoding: "utf-8", timeout: 5000 });
      return { available: true, binary: config.binary };
    } catch {
      return { available: false, binary: config.binary, error: `${config.binary} not found` };
    }
  }

  // ─── Session Lifecycle ───

  async startSession(tabId: string, cwd: string, agentId?: string, sessionIdToResume?: string): Promise<string> {
    // Kill existing session for this tab
    await this.closeSession(tabId);

    const id = agentId || this.currentAgentId;
    this.currentAgentId = id;

    const config = getAgentConfig(id);
    if (!config || config.placeholder) {
      throw new Error(`Agent not available: ${id}`);
    }

    // Resolve binary (handle npx → local node_modules)
    const { binary, args } = resolveAgentBinary(config);
    console.log(`[agent-manager] Spawning: ${binary} ${args.join(" ")} (cwd: ${cwd})` +
      (sessionIdToResume ? ` resume=${sessionIdToResume}` : ""));

    // Spawn agent subprocess
    const child = spawn(binary, args, {
      cwd,
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Forward stderr to renderer — throttle to at most 1 event per second per tab
    let lastStderrTime = 0;
    child.stderr?.on("data", (data: Buffer) => {
      const now = Date.now();
      if (now - lastStderrTime < 1000) return;
      lastStderrTime = now;
      this.win.webContents.send("agent:stderr", { tabId, data: data.toString() });
    });

    child.on("error", (err) => {
      console.error(`[agent-manager] Process error for tab ${tabId}:`, err);
      this.win.webContents.send("agent:complete", { tabId, success: false });
      this.sessions.delete(tabId);
    });

    child.on("close", () => {
      console.log(`[agent-manager] Process closed for tab ${tabId}`);
      this.sessions.delete(tabId);
    });

    // Create ACP stream from stdio
    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );

    // Create Client handler
    const client: acp.Client = {
      requestPermission: async (params) => {
        // Auto-approve all permissions for now (equivalent to --dangerously-skip-permissions)
        const allowedOption = params.options.find((o) => o.kind === "allow_once");
        return {
          outcome: {
            outcome: "selected" as const,
            optionId: allowedOption?.optionId ?? params.options[0]?.optionId ?? "",
          },
        };
      },

      sessionUpdate: async (params) => {
        // Forward session update to renderer
        this.win.webContents.send("agent:stream", { tabId, data: JSON.stringify(params) });
      },

      readTextFile: async (params) => {
        try {
          const resolved = resolve(cwd, params.path);
          if (!resolved.startsWith(cwd + sep)) {
            throw new Error(`Access denied: path is outside project directory`);
          }
          const content = await readFile(resolved, "utf-8");
          return { content };
        } catch (err: any) {
          throw new Error(`Failed to read file: ${err.message}`);
        }
      },

      writeTextFile: async (params) => {
        try {
          const resolved = resolve(cwd, params.path);
          if (!resolved.startsWith(cwd + sep)) {
            throw new Error(`Access denied: path is outside project directory`);
          }
          await writeFile(resolved, params.content, "utf-8");
          return {};
        } catch (err: any) {
          throw new Error(`Failed to write file: ${err.message}`);
        }
      },
    };

    try {
      // Create ClientSideConnection
      const connection = new acp.ClientSideConnection(
        (_agent: acp.Agent) => client,
        stream,
      );

      // Initialize
      await connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
        },
        clientInfo: { name: "Prism", version: "0.1.0" },
      });

      // Create or resume session
      let sessionId: string;
      if (sessionIdToResume) {
        try {
          console.log(`[agent-manager] Attempting to resume session: ${sessionIdToResume}`);
          await connection.resumeSession({ sessionId: sessionIdToResume, cwd });
          sessionId = sessionIdToResume;
          console.log(`[agent-manager] Session resumed: ${sessionId}`);
        } catch (resumeErr: any) {
          console.warn(`[agent-manager] Resume failed (${resumeErr?.message}), creating new session`);
          const result = await connection.newSession({ cwd, mcpServers: [] });
          sessionId = result.sessionId;
        }
      } else {
        const result = await connection.newSession({ cwd, mcpServers: [] });
        sessionId = result.sessionId;
      }

      this.sessions.set(tabId, {
        child,
        connection,
        sessionId,
        agentId: id,
        cwd,
        settings: {},
      });

      this.win.webContents.send("agent:sessionCreated", { tabId, sessionId, agentId: id });

      console.log(`[agent-manager] Session active: ${sessionId} for tab ${tabId} (${id})`);
      return sessionId;
    } catch (err: any) {
      console.error(`[agent-manager] Failed to start session for tab ${tabId}:`, err);
      child.kill("SIGTERM");
      this.win.webContents.send("agent:complete", {
        tabId,
        success: false,
        error: `Failed to start agent: ${err?.message || String(err)}`,
      });
      throw err;
    }
  }

  // ─── Ensure Session ───

  async ensureSession(tabId: string, cwd: string, agentId?: string, sessionIdToResume?: string): Promise<string> {
    const existing = this.sessions.get(tabId);
    // If existing session matches, reuse it
    if (existing && existing.cwd === cwd && (!sessionIdToResume || existing.sessionId === sessionIdToResume)) {
      return existing.sessionId;
    }
    // Close mismatched session only when a specific session is requested but doesn't match
    if (existing && sessionIdToResume && existing.sessionId !== sessionIdToResume) {
      console.log(`[agent-manager] Closing mismatched session ${existing.sessionId} to resume ${sessionIdToResume}`);
      await this.closeSession(tabId);
    }
    return this.startSession(tabId, cwd, agentId, sessionIdToResume);
  }

  // ─── Prompt ───

  async sendPrompt(tabId: string, prompt: string, modelId?: string | null, agentMode?: string, effortLevel?: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) {
      this.win.webContents.send("agent:complete", {
        tabId,
        success: false,
        error: "No active session for this tab",
      });
      return;
    }

    // Store agent settings for future ACP session configuration
    if (agentMode) session.settings.agentMode = agentMode;
    if (effortLevel) session.settings.effortLevel = effortLevel;
    // TODO: apply settings when spawning/resuming ACP session (e.g. env vars, CLI args)

    // Apply model selection before sending prompt (only if user picked a specific model)
    if (modelId) {
      try {
        await session.connection.unstable_setSessionModel({
          sessionId: session.sessionId,
          modelId,
        });
      } catch (err: any) {
        console.warn(`[agent-manager] setSessionModel failed: ${err?.message}`);
      }
    }

    // Fire and forget — streaming goes through sessionUpdate callback,
    // completion is signaled via agent:complete
    session.connection
      .prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: prompt }],
      })
      .then((result) => {
        this.win.webContents.send("agent:complete", {
          tabId,
          success: true,
          stopReason: result.stopReason,
        });
      })
      .catch((err: any) => {
        console.error(`[agent-manager] Prompt error for tab ${tabId}:`, err);
        this.win.webContents.send("agent:complete", {
          tabId,
          success: false,
          error: err?.message || String(err),
        });
      });
  }

  // ─── Cancel ───

  async cancel(tabId: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) return;

    try {
      await session.connection.cancel({ sessionId: session.sessionId });
    } catch (err) {
      console.error(`[agent-manager] Cancel error for tab ${tabId}:`, err);
    }

    // Force-kill the child process if it doesn't exit within 5 seconds after cancel
    const child = session.child;
    setTimeout(() => {
      try {
        if (child.exitCode === null && this.sessions.has(tabId)) {
          console.warn(`[agent-manager] Force-killing stuck process for tab ${tabId}`);
          child.kill("SIGKILL");
          this.sessions.delete(tabId);
        }
      } catch {
        // Ignore
      }
    }, 5000);
  }

  // ─── Close Session ───

  async closeSession(tabId: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) return;

    console.log(`[agent-manager] Closing session for tab ${tabId}`);

    try {
      session.child.kill("SIGTERM");
    } catch {
      // Ignore
    }

    // Force kill after 2s
    setTimeout(() => {
      try {
        if (session.child.exitCode === null) {
          session.child.kill("SIGKILL");
        }
      } catch {
        // Ignore
      }
    }, 2000);

    this.sessions.delete(tabId);
    this.win.webContents.send("agent:sessionClosed", { tabId });
  }

  // ─── Shutdown ───

  closeAll(): void {
    for (const [tabId] of this.sessions) {
      this.closeSession(tabId);
    }
  }
}
