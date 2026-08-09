import { describe, expect, it } from "vitest";
import {
  mcpJsonToAcpServers,
  packMcpDefToAcp,
  rawMcpEntryToAcp,
} from "../../src/main/acp/mcp-transform";

describe("mcp-transform", () => {
  it("converts OpenCode local preset to ACP stdio without type field", () => {
    const acp = rawMcpEntryToAcp("github", {
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-github"],
      environment: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test" },
      enabled: true,
    });
    expect(acp).toEqual({
      name: "github",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: [{ name: "GITHUB_PERSONAL_ACCESS_TOKEN", value: "ghp_test" }],
    });
    expect(acp).not.toHaveProperty("type");
  });

  it("skips disabled servers", () => {
    expect(
      rawMcpEntryToAcp("fetch", { type: "local", command: ["npx", "-y", "fetch"], enabled: false }),
    ).toBeNull();
  });

  it("converts remote servers with header array", () => {
    const acp = rawMcpEntryToAcp("remote-api", {
      type: "remote",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer x" },
      enabled: true,
    });
    expect(acp).toMatchObject({
      name: "remote-api",
      type: "http",
      url: "https://example.com/mcp",
      headers: [{ name: "Authorization", value: "Bearer x" }],
    });
  });

  it("normalizes legacy command + args", () => {
    const acp = rawMcpEntryToAcp("fs", {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    });
    expect(acp?.command).toBe("npx");
    expect(acp?.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]);
  });

  it("maps full mcp.json record", () => {
    const servers = mcpJsonToAcpServers({
      memory: { type: "local", command: ["npx", "-y", "memory"] },
      off: { type: "local", command: ["npx", "-y", "x"], enabled: false },
    });
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("memory");
  });

  it("converts pack-declared stdio MCP to ACP wire format", () => {
    const acp = packMcpDefToAcp({
      id: "pg",
      name: "postgres-local",
      transport: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: { PGHOST: "localhost" },
      },
    });
    expect(acp).toEqual({
      name: "postgres-local",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      env: [{ name: "PGHOST", value: "localhost" }],
    });
    expect(acp).not.toHaveProperty("type");
  });

  it("converts pack-declared http MCP with header array", () => {
    const acp = packMcpDefToAcp({
      id: "web",
      name: "remote-web",
      transport: {
        type: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer x" },
      },
    });
    expect(acp).toMatchObject({
      name: "remote-web",
      type: "http",
      url: "https://example.com/mcp",
      headers: [{ name: "Authorization", value: "Bearer x" }],
    });
  });

  it("skips pack MCP with empty command or url", () => {
    expect(
      packMcpDefToAcp({
        id: "bad",
        name: "bad",
        transport: { type: "stdio", command: "  " },
      }),
    ).toBeNull();
    expect(
      packMcpDefToAcp({
        id: "bad2",
        name: "bad2",
        transport: { type: "http", url: "" },
      }),
    ).toBeNull();
  });
});
