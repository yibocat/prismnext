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
} from "../../src/main/teams/project-mcp-defaults";

describe("ensureDefaultMcpServers", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-mcp-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("does not create .workbench when no MCP config exists", () => {
    const agentDir = join(root, ".workbench", "agent");
    const result = ensureDefaultMcpServers(agentDir);
    expect(result.added).toBe(false);
    expect(result.migrated).toBe(false);
    expect(result.removed).toBe(false);
    expect(existsSync(join(root, ".workbench"))).toBe(false);
    expect(existsSync(join(agentDir, "teams", "project.local", "mcp.json"))).toBe(false);
  });

  it("does not add paper-search-mcp to an empty hangar mcp.json", () => {
    const hangar = join(root, ".workbench", "agent", "teams", "project.local");
    mkdirSync(hangar, { recursive: true });
    writeFileSync(join(hangar, "mcp.json"), "[]\n", "utf-8");
    const result = ensureDefaultMcpServers(join(root, ".workbench", "agent"));
    expect(result.removed).toBe(false);
    expect(JSON.parse(readFileSync(join(hangar, "mcp.json"), "utf-8"))).toEqual([]);
  });

  it("does not inject paper-search alongside existing hangar servers", () => {
    const hangar = join(root, ".workbench", "agent", "teams", "project.local");
    mkdirSync(hangar, { recursive: true });
    writeFileSync(
      join(hangar, "mcp.json"),
      `${JSON.stringify([{ id: "github", name: "github", transport: { type: "stdio", command: "npx" } }], null, 2)}\n`,
      "utf-8",
    );
    const result = ensureDefaultMcpServers(join(root, ".workbench", "agent"));
    expect(result.removed).toBe(false);
    const parsed = JSON.parse(readFileSync(join(hangar, "mcp.json"), "utf-8"));
    expect(parsed.map((server: { id: string }) => server.id)).toEqual(["github"]);
  });

  it("removes leftover paper-search-mcp from the hangar and keeps other servers", () => {
    const hangar = join(root, ".workbench", "agent", "teams", "project.local");
    mkdirSync(hangar, { recursive: true });
    writeFileSync(
      join(hangar, "mcp.json"),
      `${JSON.stringify(
        [
          { id: PAPER_SEARCH_MCP_ID, name: PAPER_SEARCH_MCP_ID, transport: { type: "stdio", command: "npx" } },
          { id: "github", name: "github", transport: { type: "stdio", command: "npx" } },
        ],
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const result = ensureDefaultMcpServers(join(root, ".workbench", "agent"));
    expect(result.removed).toBe(true);
    const parsed = JSON.parse(readFileSync(join(hangar, "mcp.json"), "utf-8"));
    expect(parsed.map((server: { id: string }) => server.id)).toEqual(["github"]);
  });

  it("is a no-op when paper-search-mcp is already absent from the hangar", () => {
    const hangar = join(root, ".workbench", "agent", "teams", "project.local");
    mkdirSync(hangar, { recursive: true });
    writeFileSync(
      join(hangar, "mcp.json"),
      `${JSON.stringify([{ id: "memory", name: "memory", transport: { type: "stdio", command: "npx" } }], null, 2)}\n`,
      "utf-8",
    );
    const result = ensureDefaultMcpServers(join(root, ".workbench", "agent"));
    expect(result.removed).toBe(false);
    const parsed = JSON.parse(readFileSync(join(hangar, "mcp.json"), "utf-8"));
    expect(parsed.map((server: { id: string }) => server.id)).toEqual(["memory"]);
  });
});
