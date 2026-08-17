import { describe, expect, it } from "vitest";
import type { McpServerDef } from "../../src/shared/teams/types";
import {
  isMcpToolName,
  mcpDefsFromTeamAssets,
  mcpToolName,
  sanitizeMcpSegment,
  selectMcpServers,
} from "../../src/main/agent/mcp-host";

function server(name: string, autoStart = false): McpServerDef {
  return {
    id: name,
    name,
    autoStart,
    transport: { type: "stdio", command: "echo" },
  };
}

describe("mcp-host selection and names", () => {
  it("keeps only autoStart servers when the allowlist is empty", () => {
    const selected = selectMcpServers(
      [server("lazy"), server("eager", true), server("also-lazy")],
      [],
    );
    expect(selected.map((item) => item.name)).toEqual(["eager"]);
  });

  it("adds allowlisted servers to the autoStart set", () => {
    const selected = selectMcpServers(
      [server("lazy"), server("eager", true)],
      ["lazy", "missing"],
    );
    expect(selected.map((item) => item.name)).toEqual(["lazy", "eager"]);
  });

  it("dedupes servers by name", () => {
    const selected = selectMcpServers(
      [server("dup", true), { ...server("dup", true), id: "other" }],
      [],
    );
    expect(selected).toHaveLength(1);
  });

  it("reads enabled team MCP assets", () => {
    const defs = mcpDefsFromTeamAssets([
      { enabled: true, definition: server("papers") },
      { enabled: false, definition: server("off") },
      { enabled: true, definition: { name: "broken" } },
    ]);
    expect(defs.map((item) => item.name)).toEqual(["papers"]);
  });

  it("encodes MCP tools as mcp__server__tool", () => {
    expect(mcpToolName("paper-search", "search_papers")).toBe("mcp__paper-search__search_papers");
    expect(mcpToolName("weird.name", "do thing")).toBe("mcp__weird_name__do_thing");
    expect(sanitizeMcpSegment("")).toBe("unnamed");
    expect(isMcpToolName("mcp__papers__search")).toBe(true);
    expect(isMcpToolName("literature-search")).toBe(false);
  });
});
