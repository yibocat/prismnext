import { describe, expect, it } from "vitest";
import { mcpJsonToAcpServers, rawMcpEntryToAcp } from "../../src/main/acp/mcp-transform";

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
});
