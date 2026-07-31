import { describe, expect, it } from "vitest";
import {
  PAPER_SEARCH_MCP_ID,
  ensureBuiltinMcpInAllowlist,
} from "../../src/main/services/project-mcp-defaults";

describe("ensureBuiltinMcpInAllowlist", () => {
  it("leaves empty / undefined allowlist as-is (means no forced MCP)", () => {
    expect(ensureBuiltinMcpInAllowlist(undefined)).toBeUndefined();
    expect(ensureBuiltinMcpInAllowlist([])).toEqual([]);
  });

  it("does not append paper-search-mcp to a non-empty allowlist", () => {
    expect(ensureBuiltinMcpInAllowlist(["memory", "github"])).toEqual([
      "memory",
      "github",
    ]);
  });

  it("keeps paper-search when already present", () => {
    expect(
      ensureBuiltinMcpInAllowlist(["paper-search-mcp", "memory"]),
    ).toEqual([PAPER_SEARCH_MCP_ID, "memory"]);
  });
});
