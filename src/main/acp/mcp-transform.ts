/**
 * Convert `.prismnext/agent/mcp.json` entries (OpenCode-style on disk)
 * into ACP `session/new` / `session/load` mcpServers wire format.
 *
 * OpenCode's ACP handler (`mcpConfig`) treats any object with a `type` key as
 * remote HTTP/SSE. Local stdio servers must use `command` + `args` + `env[]`
 * and must NOT include `type`.
 *
 * @see https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/acp/service.ts
 */

export interface McpJsonServerRaw {
  type?: "local" | "remote";
  command?: string | string[];
  args?: string[];
  env?: Record<string, string>;
  environment?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export interface AcpMcpServer {
  name: string;
  type?: string;
  command?: string;
  args?: string[];
  env?: Array<{ name: string; value: string }>;
  url?: string;
  headers?: Array<{ name: string; value: string }>;
}

function normalizeArgv(raw: McpJsonServerRaw): string[] {
  if (Array.isArray(raw.command)) {
    return raw.command.filter((p) => typeof p === "string" && p.length > 0);
  }
  if (typeof raw.command === "string" && raw.command.trim()) {
    const args = Array.isArray(raw.args)
      ? raw.args.filter((a) => typeof a === "string" && a.length > 0)
      : [];
    return [raw.command.trim(), ...args];
  }
  return [];
}

function inferStorageType(raw: McpJsonServerRaw): "local" | "remote" {
  if (raw.type === "local" || raw.type === "remote") return raw.type;
  if (typeof raw.url === "string" && raw.url.trim()) return "remote";
  return "local";
}

function envRecord(raw: McpJsonServerRaw): Record<string, string> {
  return { ...(raw.environment ?? raw.env ?? {}) };
}

function headersRecord(raw: McpJsonServerRaw): Record<string, string> {
  return { ...(raw.headers ?? {}) };
}

export function rawMcpEntryToAcp(name: string, raw: McpJsonServerRaw): AcpMcpServer | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.enabled === false) return null;

  const trimmedName = name.trim();
  if (!trimmedName) return null;

  const storageType = inferStorageType(raw);

  if (storageType === "remote") {
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!url) return null;
    const headers = headersRecord(raw);
    return {
      name: trimmedName,
      // OpenCode ACP: presence of `type` selects the remote branch in mcpConfig.
      type: "http",
      url,
      headers: Object.entries(headers).map(([headerName, value]) => ({
        name: headerName,
        value,
      })),
    };
  }

  const argv = normalizeArgv(raw);
  if (argv.length === 0) return null;
  const [command, ...args] = argv;
  const environment = envRecord(raw);

  // Local stdio — do NOT set `type` (OpenCode would treat it as remote).
  return {
    name: trimmedName,
    command,
    args,
    env: Object.entries(environment).map(([envName, value]) => ({
      name: envName,
      value,
    })),
  };
}

export function mcpJsonToAcpServers(
  mcpServers: Record<string, McpJsonServerRaw> | undefined,
): AcpMcpServer[] {
  if (!mcpServers || typeof mcpServers !== "object") return [];
  return Object.entries(mcpServers)
    .map(([name, raw]) => rawMcpEntryToAcp(name, raw))
    .filter((entry): entry is AcpMcpServer => entry !== null);
}
