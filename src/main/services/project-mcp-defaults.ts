import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "./logger";

const log = createLogger("project-mcp-defaults");

/** Legacy built-in MCP id — stripped on project open (replaced by literature-discover). */
export const PAPER_SEARCH_MCP_ID = "paper-search-mcp";

/** Dedupe explicit allowlist only — does not inject legacy Paper Search. */
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

export interface EnsureDefaultMcpResult {
  added: boolean;
  /** @deprecated Paper Search migration removed — always false. */
  migrated: boolean;
  /** @deprecated Always false. */
  reenabled: boolean;
  /** True when legacy paper-search-mcp was removed from mcp.json. */
  removed: boolean;
  path: string;
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
 * Ensure mcp.json exists and strip legacy Paper Search MCP.
 * New projects get `{}`; existing projects lose `paper-search-mcp` on open.
 */
export function ensureDefaultMcpServers(agentDir: string): EnsureDefaultMcpResult {
  mkdirSync(agentDir, { recursive: true });
  const mcpPath = join(agentDir, "mcp.json");
  const fileMissing = !existsSync(mcpPath);
  if (fileMissing) {
    writeMcpServers(mcpPath, {});
    return { added: false, migrated: false, reenabled: false, removed: false, path: mcpPath };
  }

  const { servers, rawOk } = readMcpServers(mcpPath);
  if (!rawOk || !(PAPER_SEARCH_MCP_ID in servers)) {
    return { added: false, migrated: false, reenabled: false, removed: false, path: mcpPath };
  }

  const { [PAPER_SEARCH_MCP_ID]: _legacy, ...rest } = servers;
  writeMcpServers(mcpPath, rest);
  log.info(
    `Removed legacy ${PAPER_SEARCH_MCP_ID} from mcp.json — use built-in literature-discover`,
  );
  return { added: false, migrated: false, reenabled: false, removed: true, path: mcpPath };
}
