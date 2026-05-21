import { spawn, type ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
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

  async startSession(tabId: string, cwd: string, agentId?: string): Promise<string> {
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
    console.log(`[agent-manager] Spawning: ${binary} ${args.join(" ")} (cwd: ${cwd})`);

    // Spawn agent subprocess
    const child = spawn(binary, args, {
      cwd,
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Forward stderr to renderer
    child.stderr?.on("data", (data: Buffer) => {
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
          const content = await readFile(params.path, "utf-8");
          return { content };
        } catch (err: any) {
          throw new Error(`Failed to read file: ${err.message}`);
        }
      },

      writeTextFile: async (params) => {
        try {
          await writeFile(params.path, params.content, "utf-8");
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

      // Create session
      const { sessionId } = await connection.newSession({
        cwd,
        mcpServers: [],
      });

      this.sessions.set(tabId, {
        child,
        connection,
        sessionId,
        agentId: id,
        cwd,
      });

      this.win.webContents.send("agent:sessionCreated", { tabId, sessionId, agentId: id });

      console.log(`[agent-manager] Session created: ${sessionId} for tab ${tabId} (${id})`);
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

  async ensureSession(tabId: string, cwd: string, agentId?: string): Promise<string> {
    const existing = this.sessions.get(tabId);
    if (existing && existing.cwd === cwd) {
      return existing.sessionId;
    }
    return this.startSession(tabId, cwd, agentId);
  }

  // ─── Prompt ───

  sendPrompt(tabId: string, prompt: string): void {
    const session = this.sessions.get(tabId);
    if (!session) {
      this.win.webContents.send("agent:complete", {
        tabId,
        success: false,
        error: "No active session for this tab",
      });
      return;
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
