import { describe, expect, it } from "vitest";
import {
  EAGER_MCP_SERVER_IDS,
  mergeMcpAllowlist,
  mcpAllowlistSetsEqual,
  PAPER_SEARCH_MCP_ID,
} from "../../src/main/services/project-mcp-defaults";

describe("project-mcp-defaults", () => {
  it("always includes paper-search-mcp in merged allowlist", () => {
    expect(mergeMcpAllowlist([])).toEqual([PAPER_SEARCH_MCP_ID]);
    expect(mergeMcpAllowlist(["custom-mcp"])).toEqual([
      PAPER_SEARCH_MCP_ID,
      "custom-mcp",
    ]);
  });

  it("dedupes explicit allowlist entries", () => {
    expect(mergeMcpAllowlist([PAPER_SEARCH_MCP_ID, "foo", "foo"])).toEqual([
      PAPER_SEARCH_MCP_ID,
      "foo",
    ]);
  });

  it("compares allowlist sets regardless of order", () => {
    expect(mcpAllowlistSetsEqual(["a", "b"], ["b", "a"])).toBe(true);
    expect(mcpAllowlistSetsEqual(["a"], ["a", "b"])).toBe(false);
  });

  it("exports eager ids as paper-search only", () => {
    expect(EAGER_MCP_SERVER_IDS).toEqual([PAPER_SEARCH_MCP_ID]);
  });
});
