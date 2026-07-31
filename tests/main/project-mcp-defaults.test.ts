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
  PAPER_SEARCH_MCP_COMMAND,
  ensureDefaultMcpServers,
  isLegacyPaperSearchCommand,
} from "../../src/main/services/project-mcp-defaults";

describe("isLegacyPaperSearchCommand", () => {
  it("treats npx nodejs command as current", () => {
    expect(isLegacyPaperSearchCommand([...PAPER_SEARCH_MCP_COMMAND])).toBe(false);
  });

  it("flags python -m, uv, venv, and mistaken bundled node paths", () => {
    expect(
      isLegacyPaperSearchCommand(["python3", "-m", "paper_search_mcp.server"]),
    ).toBe(true);
    expect(
      isLegacyPaperSearchCommand(["uv", "tool", "run", "paper-search-mcp"]),
    ).toBe(true);
    expect(isLegacyPaperSearchCommand(["uvx", "paper-search-mcp"])).toBe(true);
    expect(
      isLegacyPaperSearchCommand([
        "/Users/x/Library/Application Support/prism-next/runtimes/paper-search-mcp/.venv/bin/python",
        "-m",
        "paper_search_mcp.server",
      ]),
    ).toBe(true);
    expect(
      isLegacyPaperSearchCommand([
        "/usr/bin/node",
        "/app/resources/mcp/paper-search-mcp-nodejs/dist/server.js",
      ]),
    ).toBe(true);
  });
});

describe("ensureDefaultMcpServers", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-mcp-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes paper-search-mcp (npx) when mcp.json is missing", () => {
    const agentDir = join(root, ".prismnext", "agent");
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.added).toBe(true);
    expect(result.migrated).toBe(false);
    const mcpPath = join(agentDir, "mcp.json");
    expect(existsSync(mcpPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(parsed.mcpServers["paper-search-mcp"].command).toEqual([
      ...PAPER_SEARCH_MCP_COMMAND,
    ]);
  });

  it("does not re-add paper-search-mcp when mcp.json exists but entry was removed", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({ mcpServers: {} }, null, 2),
      "utf-8",
    );
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.added).toBe(false);
    const parsed = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf-8"));
    expect(parsed.mcpServers["paper-search-mcp"]).toBeUndefined();
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
    expect(result.added).toBe(false);
    const parsed = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf-8"));
    expect(parsed.mcpServers.github).toBeDefined();
    expect(parsed.mcpServers["paper-search-mcp"]).toBeUndefined();
  });

  it("migrates legacy python venv command to npx", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            "paper-search-mcp": {
              type: "local",
              enabled: true,
              command: [
                "/Users/x/Library/Application Support/prism-next/runtimes/paper-search-mcp/.venv/bin/python",
                "-m",
                "paper_search_mcp.server",
              ],
              environment: {
                SEMANTIC_SCHOLAR_API_KEY: "keep-me",
                PAPER_SEARCH_MCP_UNPAYWALL_EMAIL: "drop@me.com",
              },
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.added).toBe(false);
    expect(result.migrated).toBe(true);
    const parsed = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf-8"));
    expect(parsed.mcpServers["paper-search-mcp"].command).toEqual([
      ...PAPER_SEARCH_MCP_COMMAND,
    ]);
    expect(parsed.mcpServers["paper-search-mcp"].environment.SEMANTIC_SCHOLAR_API_KEY).toBe(
      "keep-me",
    );
    expect(
      parsed.mcpServers["paper-search-mcp"].environment.PAPER_SEARCH_MCP_UNPAYWALL_EMAIL,
    ).toBeUndefined();
  });

  it("migrates uv tool run to npx", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            "paper-search-mcp": {
              type: "local",
              enabled: true,
              command: ["uv", "tool", "run", "paper-search-mcp"],
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.migrated).toBe(true);
    const parsed = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf-8"));
    expect(parsed.mcpServers["paper-search-mcp"].command).toEqual([
      ...PAPER_SEARCH_MCP_COMMAND,
    ]);
  });

  it("migrates mistaken bundled node server.js back to npx", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            "paper-search-mcp": {
              type: "local",
              enabled: true,
              command: [
                "/usr/bin/node",
                "/Users/x/MyPro/prism-next/resources/mcp/paper-search-mcp-nodejs/dist/server.js",
              ],
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.migrated).toBe(true);
    const parsed = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf-8"));
    expect(parsed.mcpServers["paper-search-mcp"].command).toEqual([
      ...PAPER_SEARCH_MCP_COMMAND,
    ]);
  });

  it("respects enabled:false (does not force re-enable)", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            "paper-search-mcp": {
              type: "local",
              enabled: false,
              command: [...PAPER_SEARCH_MCP_COMMAND],
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.reenabled).toBe(false);
    const parsed = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf-8"));
    expect(parsed.mcpServers["paper-search-mcp"].enabled).toBe(false);
  });

  it("is a no-op when paper-search-mcp is already correct and enabled", () => {
    const agentDir = join(root, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    const before = JSON.stringify(
      {
        mcpServers: {
          "paper-search-mcp": {
            type: "local",
            enabled: true,
            command: [...PAPER_SEARCH_MCP_COMMAND],
            environment: { SEMANTIC_SCHOLAR_API_KEY: "k" },
          },
        },
      },
      null,
      2,
    );
    writeFileSync(join(agentDir, "mcp.json"), before, "utf-8");
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.added).toBe(false);
    expect(result.migrated).toBe(false);
    expect(result.reenabled).toBe(false);
    expect(readFileSync(join(agentDir, "mcp.json"), "utf-8")).toBe(before);
  });
});
