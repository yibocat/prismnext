import { describe, expect, it } from "vitest";
import {
  formatCommandLines,
  mergeMcpEntries,
  namedEntryFromBareConfig,
  parseCommandLines,
  parseKeyValueLines,
  parseMcpConfig,
  parsePastedMcpJson,
  serializeMcpConfig,
} from "../../src/renderer/lib/agent/mcp-config";
import {
  presetToEntry,
  findPresetForEntry,
  MCP_PRESETS,
} from "../../src/renderer/lib/agent/mcp-presets";

describe("mcp-config", () => {
  it("parses OpenCode-style local server", () => {
    const json = JSON.stringify({
      mcpServers: {
        github: {
          type: "local",
          command: ["npx", "-y", "@modelcontextprotocol/server-github"],
          enabled: true,
          environment: { GITHUB_TOKEN: "secret" },
        },
      },
    });
    const entries = parseMcpConfig(json);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("github");
    expect(entries[0].type).toBe("local");
    expect(entries[0].command).toEqual(["npx", "-y", "@modelcontextprotocol/server-github"]);
    expect(entries[0].environment.GITHUB_TOKEN).toBe("secret");
  });

  it("normalizes legacy command + args format", () => {
    const json = JSON.stringify({
      mcpServers: {
        fs: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          env: { FOO: "bar" },
        },
      },
    });
    const [entry] = parseMcpConfig(json);
    expect(entry.type).toBe("local");
    expect(entry.command).toEqual(["npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp"]);
    expect(entry.environment.FOO).toBe("bar");
  });

  it("round-trips remote server", () => {
    const original = [
      {
        name: "remote-api",
        type: "remote" as const,
        enabled: false,
        command: [],
        environment: {},
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer x" },
      },
    ];
    const serialized = serializeMcpConfig(original);
    const [parsed] = parseMcpConfig(serialized);
    expect(parsed.name).toBe("remote-api");
    expect(parsed.type).toBe("remote");
    expect(parsed.enabled).toBe(false);
    expect(parsed.url).toBe("https://example.com/mcp");
    expect(parsed.headers.Authorization).toBe("Bearer x");
  });

  it("parses key-value lines", () => {
    expect(parseKeyValueLines("A=1\n# comment\nB=two=parts")).toEqual({
      A: "1",
      B: "two=parts",
    });
  });

  it("parses command lines", () => {
    expect(parseCommandLines(formatCommandLines(["npx", "-y", "pkg"]))).toEqual([
      "npx",
      "-y",
      "pkg",
    ]);
  });

  it("parses pasted mcpServers wrapper", () => {
    const result = parsePastedMcpJson(`{
      "mcpServers": {
        "fetch": { "type": "local", "command": ["npx", "-y", "fetch"] }
      }
    }`);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe("fetch");
  });

  it("parses pasted name map without wrapper", () => {
    const result = parsePastedMcpJson(`{
      "github": { "type": "local", "command": ["npx", "-y", "gh"] }
    }`);
    expect(result.entries[0].name).toBe("github");
  });

  it("detects bare single-server paste", () => {
    const result = parsePastedMcpJson(`{ "type": "local", "command": ["npx", "-y", "x"] }`);
    expect(result.bareConfig).toBeDefined();
    expect(result.entries).toHaveLength(0);
    const entry = namedEntryFromBareConfig("custom", result.bareConfig!);
    expect(entry?.name).toBe("custom");
  });

  it("merges entries by name", () => {
    const a = presetToEntry(MCP_PRESETS[0], { GITHUB_PERSONAL_ACCESS_TOKEN: "t" })!;
    const b = { ...a, enabled: false };
    const merged = mergeMcpEntries([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].enabled).toBe(false);
  });

  it("builds preset entry with env and path", () => {
    const git = MCP_PRESETS.find((p) => p.id === "git")!;
    const entry = presetToEntry(git, { __path__: "/tmp" });
    expect(entry?.command).toContain("/tmp");
    expect(findPresetForEntry(entry!)).toBe(git);
  });
});
