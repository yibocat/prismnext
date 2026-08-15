/** OpenCode-compatible MCP server entry (stored under mcpServers in mcp.json). */
import type { McpServerDef } from "@shared/teams/types";

export type McpServerType = "local" | "remote";

export interface McpServerEntry {
  name: string;
  type: McpServerType;
  enabled: boolean;
  /** argv for local servers */
  command: string[];
  environment: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerRaw>;
}

export interface McpServerRaw {
  type?: McpServerType;
  command?: string | string[];
  args?: string[];
  env?: Record<string, string>;
  environment?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

const EMPTY_ENTRY = (): Omit<McpServerEntry, "name"> => ({
  type: "local",
  enabled: true,
  command: [],
  environment: {},
  url: "",
  headers: {},
});

function normalizeCommand(raw: McpServerRaw): string[] {
  if (Array.isArray(raw.command)) {
    return raw.command.filter((part) => typeof part === "string" && part.length > 0);
  }
  if (typeof raw.command === "string" && raw.command.trim()) {
    const args = Array.isArray(raw.args)
      ? raw.args.filter((a) => typeof a === "string" && a.length > 0)
      : [];
    return [raw.command.trim(), ...args];
  }
  return [];
}

function inferType(raw: McpServerRaw): McpServerType {
  if (raw.type === "local" || raw.type === "remote") return raw.type;
  if (typeof raw.url === "string" && raw.url.trim()) return "remote";
  return "local";
}

function rawToEntry(name: string, raw: McpServerRaw): McpServerEntry {
  const type = inferType(raw);
  const environment = { ...(raw.environment ?? raw.env ?? {}) };
  const headers = { ...(raw.headers ?? {}) };
  return {
    name,
    type,
    enabled: raw.enabled !== false,
    command: type === "local" ? normalizeCommand(raw) : [],
    environment,
    url: type === "remote" && typeof raw.url === "string" ? raw.url : "",
    headers,
  };
}

export function parseMcpConfig(content: string): McpServerEntry[] {
  if (!content.trim()) return [];
  const parsed = JSON.parse(content) as McpConfigFile;
  const servers = parsed?.mcpServers;
  if (!servers || typeof servers !== "object") return [];
  return Object.entries(servers).map(([name, raw]) =>
    rawToEntry(name, raw && typeof raw === "object" ? raw : {}),
  );
}

function entryToRaw(entry: McpServerEntry): McpServerRaw {
  const base: McpServerRaw = {
    type: entry.type,
    enabled: entry.enabled,
  };
  if (entry.type === "local") {
    if (entry.command.length > 0) base.command = entry.command;
    if (Object.keys(entry.environment).length > 0) base.environment = entry.environment;
  } else {
    if (entry.url.trim()) base.url = entry.url.trim();
    if (Object.keys(entry.headers).length > 0) base.headers = entry.headers;
  }
  return base;
}

export function serializeMcpConfig(servers: McpServerEntry[]): string {
  const mcpServers: Record<string, McpServerRaw> = {};
  for (const entry of servers) {
    const key = entry.name.trim();
    if (!key) continue;
    mcpServers[key] = entryToRaw(entry);
  }
  return JSON.stringify({ mcpServers }, null, 2);
}

/** Convert a single Team `McpServerDef` into the UI entry shape. */
export function mcpServerDefToEntry(server: McpServerDef): McpServerEntry | null {
  if (!server.id || !server.name || !server.transport) return null;
  if (server.transport.type === "stdio") {
    return {
      name: server.id,
      type: "local",
      enabled: true,
      command: [server.transport.command, ...(server.transport.args ?? [])],
      environment: { ...(server.transport.env ?? {}) },
      url: "",
      headers: {},
    };
  }
  return {
    name: server.id,
    type: "remote",
    enabled: true,
    command: [],
    environment: {},
    url: server.transport.url,
    headers: { ...(server.transport.headers ?? {}) },
  };
}

/** Parse the v2 Team mcp.json array used by project.local and Team assets. */
export function parseTeamMcpConfig(content: string): McpServerEntry[] {
  if (!content.trim()) return [];
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((raw): McpServerEntry[] => {
    if (!raw || typeof raw !== "object") return [];
    const entry = mcpServerDefToEntry(raw as McpServerDef);
    return entry ? [entry] : [];
  });
}

/** Serialize UI entries into the v2 McpServerDef[] Team schema. */
export function serializeTeamMcpConfig(servers: McpServerEntry[]): string {
  const out: McpServerDef[] = [];
  for (const entry of servers) {
    const id = entry.name.trim();
    if (!id) continue;
    if (entry.type === "local") {
      const [command, ...args] = entry.command;
      if (!command) continue;
      out.push({
        id,
        name: id,
        transport: {
          type: "stdio",
          command,
          ...(args.length ? { args } : {}),
          ...(Object.keys(entry.environment).length ? { env: entry.environment } : {}),
        },
      });
    } else if (entry.url.trim()) {
      out.push({
        id,
        name: id,
        transport: {
          type: "http",
          url: entry.url.trim(),
          ...(Object.keys(entry.headers).length ? { headers: entry.headers } : {}),
        },
      });
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

export function createEmptyMcpServer(name = ""): McpServerEntry {
  return { name, ...EMPTY_ENTRY() };
}

/** One KEY=value per line; lines starting with # are ignored. */
export function parseKeyValueLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export function formatKeyValueLines(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/** One argument per line (supports paths with spaces). */
export function parseCommandLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatCommandLines(command: string[]): string {
  return command.join("\n");
}

export function isValidMcpServerName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name.trim());
}

export interface ParsePasteResult {
  entries: McpServerEntry[];
  /** Single server body without a name key — caller should prompt for name. */
  bareConfig?: McpServerRaw;
  error?: "invalid_json" | "invalid_format" | "empty";
}

function entriesFromMcpServersRecord(servers: Record<string, McpServerRaw>): McpServerEntry[] {
  return Object.entries(servers).map(([name, raw]) =>
    rawToEntry(name, raw && typeof raw === "object" ? raw : {}),
  );
}

/** Accept full mcp.json, mcpServers object, or a map of name → config. */
export function parsePastedMcpJson(text: string): ParsePasteResult {
  const trimmed = text.trim();
  if (!trimmed) return { entries: [], error: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { entries: [], error: "invalid_json" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { entries: [], error: "invalid_format" };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.mcpServers && typeof obj.mcpServers === "object" && !Array.isArray(obj.mcpServers)) {
    const entries = entriesFromMcpServersRecord(obj.mcpServers as Record<string, McpServerRaw>);
    return entries.length > 0 ? { entries } : { entries: [], error: "empty" };
  }

  if (obj.type === "local" || obj.type === "remote" || obj.command || obj.url) {
    return { entries: [], bareConfig: obj as McpServerRaw };
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return { entries: [], error: "empty" };

  const allNamedServers = keys.every(
    (k) => obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k]),
  );
  if (allNamedServers) {
    const entries = entriesFromMcpServersRecord(obj as Record<string, McpServerRaw>);
    return entries.length > 0 ? { entries } : { entries: [], error: "empty" };
  }

  return { entries: [], error: "invalid_format" };
}

/** Merge by server name; incoming replaces existing with the same name. */
export function mergeMcpEntries(
  existing: McpServerEntry[],
  incoming: McpServerEntry[],
): McpServerEntry[] {
  const map = new Map(existing.map((e) => [e.name, e]));
  for (const entry of incoming) {
    map.set(entry.name, entry);
  }
  return Array.from(map.values());
}

export function entryToJsonSnippet(entry: McpServerEntry): string {
  const raw = entryToRaw(entry);
  return JSON.stringify({ [entry.name]: raw }, null, 2);
}

export function namedEntryFromBareConfig(name: string, raw: McpServerRaw): McpServerEntry | null {
  const trimmed = name.trim();
  if (!isValidMcpServerName(trimmed)) return null;
  return rawToEntry(trimmed, raw);
}
