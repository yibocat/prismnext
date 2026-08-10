import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "./logger";
import { ensureProjectContentMigrated } from "../teams/migrate-project-content";

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
 * After M11, user MCP lives in `teams/project.local/mcp.json` — do not recreate
 * the legacy agent-level file once that target exists.
 */
export function ensureDefaultMcpServers(agentDir: string): EnsureDefaultMcpResult {
  mkdirSync(agentDir, { recursive: true });
  // M11 is the only permitted reader/converter of agent/mcp.json. Derive the
  // project root from <project>/.prismnext/agent and migrate before creating
  // a v2 default file.
  const migrated = ensureProjectContentMigrated(dirname(dirname(agentDir)));
  const projectLocalMcp = join(agentDir, "teams", "project.local", "mcp.json");
  if (!existsSync(projectLocalMcp)) {
    mkdirSync(dirname(projectLocalMcp), { recursive: true });
    writeFileSync(projectLocalMcp, "[]\n", "utf-8");
  }

  let servers: Array<{ id?: unknown }> = [];
  try {
    const parsed = JSON.parse(readFileSync(projectLocalMcp, "utf-8"));
    if (Array.isArray(parsed)) servers = parsed;
  } catch {
    return { added: false, migrated, reenabled: false, removed: false, path: projectLocalMcp };
  }
  const filtered = servers.filter((server) => server?.id !== PAPER_SEARCH_MCP_ID);
  const removed = filtered.length !== servers.length;
  if (removed) {
    writeFileSync(projectLocalMcp, `${JSON.stringify(filtered, null, 2)}\n`, "utf-8");
    log.info(
      `Removed legacy ${PAPER_SEARCH_MCP_ID} from project.local MCP — use built-in literature-discover`,
    );
  }
  return { added: false, migrated, reenabled: false, removed, path: projectLocalMcp };
}
