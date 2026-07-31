import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Curated Paper Search MCP server id — prismnext built-in default. */
export const PAPER_SEARCH_MCP_ID = "paper-search-mcp";

/**
 * MCP servers connected at session/new (before first model turn).
 * Empty on purpose: built-in Paper Search used to be eager (`npx` cold start
 * blocked session/new), which felt like a multi‑minute hang before the first
 * Task. All MCP — including paper-search-mcp — now loads only via session/load
 * when @-mentioned or composer/orchestrator allowlist requires them.
 */
export const EAGER_MCP_SERVER_IDS = [] as const;

export function isEagerMcpServer(id: string): boolean {
  return (EAGER_MCP_SERVER_IDS as readonly string[]).includes(id);
}

/** Dedupe explicit allowlist only — does not force built-in Paper Search. */
export function mergeMcpAllowlist(allowlist?: string[] | null): string[] {
  const merged = new Set<string>();
  for (const id of allowlist ?? []) {
    if (id?.trim()) merged.add(id.trim());
  }
  return [...merged];
}

export function mcpAllowlistSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

/** Curated Paper Search MCP — Node.js via npx. No app-bundled package. */
export const PAPER_SEARCH_MCP_COMMAND = ["npx", "-y", "paper-search-mcp-nodejs"] as const;

export function buildDefaultPaperSearchServer(
  environment: Record<string, string> = {},
) {
  return {
    type: "local" as const,
    enabled: true,
    command: [...PAPER_SEARCH_MCP_COMMAND],
    environment,
  };
}

export interface EnsureDefaultMcpResult {
  added: boolean;
  migrated: boolean;
  /** @deprecated No longer force-reenables; always false. Kept for IPC shape. */
  reenabled: boolean;
  path: string;
}

export type PaperSearchMcpHealth = {
  status: "ready" | "degraded";
  mode: "npx";
  detail: string;
};

/** Built-in Paper Search is always configured to launch via npx. */
export function getPaperSearchMcpHealth(): PaperSearchMcpHealth {
  return {
    status: "ready",
    mode: "npx",
    detail: "Built-in Paper Search via npx -y paper-search-mcp-nodejs.",
  };
}

function commandsEqual(a: unknown, b: readonly string[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((part, i) => part === b[i]);
}

/**
 * True if this is a legacy Python / uv / old venv / accidental bundled path
 * that must be replaced by the official npx command.
 */
export function isLegacyPaperSearchCommand(command: unknown): boolean {
  if (!Array.isArray(command) || command.length === 0) return true;
  if (commandsEqual(command, PAPER_SEARCH_MCP_COMMAND)) return false;

  const joined = command.map(String).join(" ").toLowerCase();

  if (
    commandsEqual(command, ["uv", "tool", "run", "paper-search-mcp"]) ||
    commandsEqual(command, ["uvx", "paper-search-mcp"]) ||
    (command[0] === "uv" && joined.includes("paper-search")) ||
    (command[0] === "uvx" && joined.includes("paper-search"))
  ) {
    return true;
  }

  if (
    command.length >= 3 &&
    command[command.length - 2] === "-m" &&
    String(command[command.length - 1]).includes("paper_search_mcp")
  ) {
    return true;
  }

  if (
    joined.includes("paper-search-mcp") &&
    (joined.includes(".venv") ||
      joined.includes("runtimes/paper-search") ||
      joined.includes("paper_search_mcp") ||
      // Previous mistaken app-vendored node launchers
      joined.includes("resources/mcp/paper-search") ||
      joined.includes("dist/server.js"))
  ) {
    return true;
  }

  const bin = String(command[0]).toLowerCase();
  if (
    bin === "python" ||
    bin === "python3" ||
    bin.endsWith("/python") ||
    bin.endsWith("/python3") ||
    bin.endsWith("\\python.exe") ||
    bin.endsWith("\\python3.exe") ||
    // node …/server.js leftover from reverted bundling
    bin === "node" ||
    bin.endsWith("/node") ||
    bin.endsWith("\\node.exe")
  ) {
    if (joined.includes("paper-search") || joined.includes("server.js")) {
      return true;
    }
  }

  return false;
}

function envFromRaw(existing: Record<string, unknown>): Record<string, string> {
  const raw =
    (existing.environment && typeof existing.environment === "object"
      ? existing.environment
      : existing.env && typeof existing.env === "object"
        ? existing.env
        : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  const dropPrefixes = ["PAPER_SEARCH_MCP_"];
  for (const key of Object.keys(out)) {
    if (dropPrefixes.some((p) => key.startsWith(p))) delete out[key];
  }
  return out;
}

function readMcpServers(
  mcpPath: string,
): { servers: Record<string, Record<string, unknown>>; rawOk: boolean } {
  if (!existsSync(mcpPath)) {
    return { servers: {}, rawOk: true };
  }
  try {
    const parsed = JSON.parse(readFileSync(mcpPath, "utf-8")) as {
      mcpServers?: Record<string, Record<string, unknown>>;
    };
    return {
      servers:
        parsed.mcpServers && typeof parsed.mcpServers === "object"
          ? { ...parsed.mcpServers }
          : {},
      rawOk: true,
    };
  } catch {
    return { servers: {}, rawOk: false };
  }
}

function writeMcpServers(
  mcpPath: string,
  servers: Record<string, Record<string, unknown>>,
): void {
  writeFileSync(mcpPath, JSON.stringify({ mcpServers: servers }, null, 2), "utf-8");
}

/**
 * Pass-through. Built-in Paper Search is kept in mcp.json for discovery, but
 * is no longer injected into every turn's allowlist (load only when requested).
 */
export function ensureBuiltinMcpInAllowlist(
  allowlist: string[] | undefined | null,
): string[] | undefined {
  if (!allowlist?.length) return allowlist ?? undefined;
  return allowlist;
}

/**
 * Seed / repair Paper Search MCP (optional default, user-controllable):
 * - seed only when mcp.json does not exist yet (new project)
 * - if the entry exists with a legacy command, migrate to npx (keep enabled as-is)
 * - never force `enabled: true` and never re-add after the user removes it
 */
export function ensureDefaultMcpServers(agentDir: string): EnsureDefaultMcpResult {
  mkdirSync(agentDir, { recursive: true });
  const mcpPath = join(agentDir, "mcp.json");
  const fileMissing = !existsSync(mcpPath);
  const { servers } = readMcpServers(mcpPath);

  let added = false;
  let migrated = false;
  const existing = servers[PAPER_SEARCH_MCP_ID];

  if (!existing) {
    // Only seed on a brand-new mcp.json — respect intentional removal otherwise.
    if (fileMissing) {
      servers[PAPER_SEARCH_MCP_ID] = buildDefaultPaperSearchServer();
      writeMcpServers(mcpPath, servers);
      return { added: true, migrated: false, reenabled: false, path: mcpPath };
    }
    return { added: false, migrated: false, reenabled: false, path: mcpPath };
  }

  let next = { ...existing };
  let dirty = false;

  if (isLegacyPaperSearchCommand(existing.command)) {
    next = {
      type: existing.type ?? "local",
      // Preserve user disable across migration.
      enabled: existing.enabled !== false,
      command: [...PAPER_SEARCH_MCP_COMMAND],
      environment: envFromRaw(existing),
    };
    migrated = true;
    dirty = true;
  }

  if (dirty) {
    servers[PAPER_SEARCH_MCP_ID] = next;
    writeMcpServers(mcpPath, servers);
  }

  return { added, migrated, reenabled: false, path: mcpPath };
}
