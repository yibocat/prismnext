import { describe, expect, it } from "vitest";
import {
  PAPER_SEARCH_MCP_ID,
  ensureBuiltinMcpInAllowlist,
} from "../../src/main/services/project-mcp-defaults";

describe("ensureBuiltinMcpInAllowlist", () => {
  it("leaves empty / undefined allowlist as-is (means all servers)", () => {
    expect(ensureBuiltinMcpInAllowlist(undefined)).toBeUndefined();
    expect(ensureBuiltinMcpInAllowlist([])).toEqual([]);
  });

  it("appends paper-search-mcp when missing from a non-empty allowlist", () => {
    expect(ensureBuiltinMcpInAllowlist(["memory", "github"])).toEqual([
      "memory",
      "github",
      PAPER_SEARCH_MCP_ID,
    ]);
  });

  it("does not duplicate when already present", () => {
    expect(
      ensureBuiltinMcpInAllowlist(["paper-search-mcp", "memory"]),
    ).toEqual(["paper-search-mcp", "memory"]);
  });
});
