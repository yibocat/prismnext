import { describe, expect, it } from "vitest";
import {
  mergeMcpAllowlist,
  mcpAllowlistSetsEqual,
  PAPER_SEARCH_MCP_ID,
} from "../../src/main/services/project-mcp-defaults";

describe("project-mcp-defaults", () => {
  it("does not force paper-search into empty / custom allowlists", () => {
    expect(mergeMcpAllowlist([])).toEqual([]);
    expect(mergeMcpAllowlist(undefined)).toEqual([]);
    expect(mergeMcpAllowlist(["custom-mcp"])).toEqual(["custom-mcp"]);
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

});
