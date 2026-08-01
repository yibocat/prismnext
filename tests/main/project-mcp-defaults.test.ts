import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  PAPER_SEARCH_MCP_ID,
  ensureDefaultMcpServers,
} from "../../src/main/services/project-mcp-defaults";

describe("ensureDefaultMcpServers", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-mcp-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes empty mcp.json when mcp.json is missing", () => {
    const agentDir = join(root, ".prismnext", "agent");
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.added).toBe(false);
    expect(result.removed).toBe(false);
    const mcpPath = join(agentDir, "mcp.json");
    expect(existsSync(mcpPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(parsed.mcpServers).toEqual({});
  });

  it("does not add paper-search-mcp to an empty mcp.json", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({ mcpServers: {} }, null, 2),
      "utf-8",
    );
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.removed).toBe(false);
    const parsed = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf-8"));
    expect(parsed.mcpServers[PAPER_SEARCH_MCP_ID]).toBeUndefined();
  });

  it("does not inject paper-search alongside existing unrelated servers", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            github: { type: "local", command: ["npx", "-y", "gh-mcp"], enabled: true },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.removed).toBe(false);
    const parsed = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf-8"));
    expect(parsed.mcpServers.github).toBeDefined();
    expect(parsed.mcpServers[PAPER_SEARCH_MCP_ID]).toBeUndefined();
  });

  it("removes legacy paper-search-mcp and keeps other servers", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            [PAPER_SEARCH_MCP_ID]: {
              type: "local",
              enabled: true,
              command: ["npx", "-y", "paper-search-mcp-nodejs"],
            },
            github: { type: "local", command: ["npx", "-y", "gh-mcp"], enabled: true },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.removed).toBe(true);
    const parsed = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf-8"));
    expect(parsed.mcpServers[PAPER_SEARCH_MCP_ID]).toBeUndefined();
    expect(parsed.mcpServers.github).toBeDefined();
  });

  it("is a no-op when paper-search-mcp is already absent", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    const before = JSON.stringify(
      {
        mcpServers: {
          memory: { type: "local", enabled: true, command: ["npx", "-y", "@modelcontextprotocol/server-memory"] },
        },
      },
      null,
      2,
    );
    writeFileSync(join(agentDir, "mcp.json"), before, "utf-8");
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.removed).toBe(false);
    expect(readFileSync(join(agentDir, "mcp.json"), "utf-8")).toBe(before);
  });
});
