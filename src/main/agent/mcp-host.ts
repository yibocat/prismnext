/**
 * Independent MCP host for the Pi agent.
 * Pi has no MCP; Teams mcp.json stays the product file, this module connects it.
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import type { McpServerDef } from "../../shared/teams/types";
import type { PermissionGate } from "./permission-gate";
import type { ToolExecuteContext } from "./tool-host";
import { createLogger, shortLogDetail } from "../services/logger";

const log = createLogger("mcp-host", "agent");

export const MCP_TOOL_PREFIX = "mcp__";
export const MCP_CONNECT_TIMEOUT_MS = 15_000;

const HOST_INFO = { name: "prismnext", version: "0.7.3" };

export type McpToolContext = Omit<ToolExecuteContext, "toolCallId" | "abortSignal">;

export function isMcpToolName(name: string): boolean {
  return name.startsWith(MCP_TOOL_PREFIX);
}

export function sanitizeMcpSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return cleaned.slice(0, 64) || "unnamed";
}

export function mcpToolName(serverName: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${sanitizeMcpSegment(serverName)}__${sanitizeMcpSegment(toolName)}`;
}

export function mcpDefsFromTeamAssets(
  mcps?: Array<{ definition?: unknown; enabled?: boolean }> | null,
): McpServerDef[] {
  const out: McpServerDef[] = [];
  const seen = new Set<string>();
  for (const asset of mcps ?? []) {
    if (asset.enabled === false) continue;
    const def = asset.definition as McpServerDef | undefined;
    const name = def?.name?.trim();
    if (!name || !def?.transport || seen.has(name)) continue;
    seen.add(name);
    out.push(def);
  }
  return out;
}

/**
 * Empty allowlist = only autoStart servers (lazy).
 * Names in the allowlist join autoStart for this turn.
 */
export function selectMcpServers(
  servers: readonly McpServerDef[],
  allowlist?: string[] | null,
): McpServerDef[] {
  const allow = new Set((allowlist ?? []).map((name) => name.trim()).filter(Boolean));
  const seen = new Set<string>();
  const out: McpServerDef[] = [];
  for (const server of servers) {
    const name = server.name?.trim();
    if (!name || seen.has(name)) continue;
    if (server.autoStart !== true && !allow.has(name)) continue;
    seen.add(name);
    out.push(server);
  }
  return out;
}

interface ConnectedMcp {
  name: string;
  client: Client;
  tools: ToolDefinition[];
}

export class AgentMcpHost {
  private readonly connections = new Map<string, ConnectedMcp>();
  private readonly attachedNames = new Set<string>();
  private toolEnv: {
    gate: PermissionGate;
    getContext: () => McpToolContext;
  } | null = null;

  bindToolEnv(input: { gate: PermissionGate; getContext: () => McpToolContext }): void {
    this.toolEnv = input;
  }

  async ensure(
    servers: readonly McpServerDef[],
    opts: { cwd: string },
  ): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [];
    for (const server of servers) {
      const name = server.name.trim();
      const existing = this.connections.get(name);
      if (existing) {
        tools.push(...existing.tools);
        continue;
      }
      try {
        const connected = await connectMcpServer(server, opts.cwd, this.toolEnv);
        this.connections.set(name, connected);
        tools.push(...connected.tools);
        log.info("mcp.connect", {
          serverName: name,
          toolCount: connected.tools.length,
        });
      } catch (err) {
        log.warn("mcp.connect.fail", {
          serverName: name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return tools;
  }

  takeUnattached(tools: readonly ToolDefinition[]): ToolDefinition[] {
    const fresh: ToolDefinition[] = [];
    for (const tool of tools) {
      if (this.attachedNames.has(tool.name)) continue;
      this.attachedNames.add(tool.name);
      fresh.push(tool);
    }
    return fresh;
  }

  markAttached(names: readonly string[]): void {
    for (const name of names) this.attachedNames.add(name);
  }

  async dispose(): Promise<void> {
    const clients = [...this.connections.values()];
    this.connections.clear();
    this.attachedNames.clear();
    this.toolEnv = null;
    await Promise.all(clients.map((item) => item.client.close().catch(() => {})));
  }
}

async function connectMcpServer(
  server: McpServerDef,
  cwd: string,
  toolEnv: AgentMcpHost["toolEnv"],
): Promise<ConnectedMcp> {
  const client = new Client(HOST_INFO);
  const transport = createTransport(server, cwd);
  try {
    await withTimeout(client.connect(transport), MCP_CONNECT_TIMEOUT_MS, `mcp_connect:${server.name}`);
    const listed = await client.listTools();
    const tools = (listed.tools ?? []).map((tool) =>
      toPiMcpTool({
        serverName: server.name,
        toolName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        client,
        toolEnv,
      }),
    );
    return { name: server.name, client, tools };
  } catch (err) {
    await client.close().catch(() => {});
    await transport.close?.().catch(() => {});
    throw err;
  }
}

function createTransport(server: McpServerDef, cwd: string) {
  if (server.transport.type === "stdio") {
    return new StdioClientTransport({
      command: server.transport.command,
      args: server.transport.args ?? [],
      env: {
        ...getDefaultEnvironment(),
        ...server.transport.env,
      },
      cwd,
      stderr: "pipe",
    });
  }
  return new StreamableHTTPClientTransport(new URL(server.transport.url), {
    requestInit: server.transport.headers
      ? { headers: server.transport.headers }
      : undefined,
  });
}

function toPiMcpTool(input: {
  serverName: string;
  toolName: string;
  description?: string;
  inputSchema?: unknown;
  client: Client;
  toolEnv: AgentMcpHost["toolEnv"];
}): ToolDefinition {
  const name = mcpToolName(input.serverName, input.toolName);
  const schemaHint = input.inputSchema
    ? `\n\nInput schema: ${JSON.stringify(input.inputSchema)}`
    : "";
  const description = [
    input.description?.trim() || `MCP tool ${input.toolName} from ${input.serverName}`,
    schemaHint,
  ].join("");

  return defineTool({
    name,
    label: `${input.serverName}/${input.toolName}`,
    description,
    parameters: Type.Any({ description: `Arguments for ${input.toolName}` }),
    execute: async (toolCallId, params, signal, _onUpdate, _ctx) => {
      const args = (params ?? {}) as Record<string, unknown>;
      if (input.toolEnv) {
        const turn = input.toolEnv.getContext();
        const decision = await input.toolEnv.gate.decide({
          requestId: `perm-${toolCallId}`,
          runtimeSessionId: turn.runtimeSessionId,
          tabId: turn.tabId,
          turnId: turn.turnId,
          toolCallId,
          toolName: name,
          args,
          projectRoot: turn.projectRoot,
          permissionMode: turn.permissionMode,
          sessionAgent: turn.sessionAgent,
          allowedPaths: turn.allowedPaths,
          skillReadRoots: turn.skillReadRoots,
        });
        if (decision.decision === "deny") {
          return {
            content: [{ type: "text" as const, text: decision.reason }],
            details: { ok: false, denied: true, error: decision.reason },
          };
        }
      }
      if (signal?.aborted) {
        return {
          content: [{ type: "text" as const, text: "mcp_aborted" }],
          details: { ok: false, error: "mcp_aborted" },
        };
      }
      const startedAt = Date.now();
      log.info("tool.execute.start", { toolName: name, toolCallId });
      try {
        const result = await input.client.callTool({
          name: input.toolName,
          arguments: args,
        });
        const failed = Boolean((result as { isError?: boolean } | null)?.isError);
        log.info("tool.execute.end", {
          toolName: name,
          toolCallId,
          durationMs: Date.now() - startedAt,
          ok: failed ? "error" : "ok",
        });
        if (failed) {
          log.warn("tool.execute.error", { toolName: name, toolCallId, error: "mcp_error" });
        }
        const text = formatMcpResult(result);
        return {
          content: [{ type: "text" as const, text }],
          details: result,
        };
      } catch (err) {
        log.info("tool.execute.end", {
          toolName: name,
          toolCallId,
          durationMs: Date.now() - startedAt,
          ok: "error",
        });
        log.warn("tool.execute.error", {
          toolName: name,
          toolCallId,
          error: shortLogDetail(err),
        });
        throw err;
      }
    },
  });
}

function formatMcpResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const record = result as {
    content?: Array<{ type?: string; text?: string; mimeType?: string }>;
    isError?: boolean;
  };
  const parts = (record.content ?? []).map((block) => {
    if (block.type === "text" && block.text) return block.text;
    if (block.type === "image") return `[image ${block.mimeType ?? ""}]`.trim();
    return JSON.stringify(block);
  });
  const body = parts.join("\n").trim();
  if (body) return record.isError ? `mcp_error\n${body}` : body;
  return JSON.stringify(result);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
