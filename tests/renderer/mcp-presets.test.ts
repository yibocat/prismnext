import { describe, expect, it } from "vitest";
import {
  MCP_PRESETS,
  findPresetForEntry,
  getMcpPreset,
  isBuiltinMcpServer,
  presetFieldsValid,
  presetToEntry,
} from "../../src/renderer/lib/agent/mcp-presets";

describe("paper-search-mcp preset", () => {
  it("exists as first built-in search preset", () => {
    const preset = getMcpPreset("paper-search-mcp");
    expect(preset).toBeDefined();
    expect(preset!.builtin).toBe(true);
    expect(preset!.recommended).toBe(true);
    expect(preset!.category).toBe("search");
    expect(MCP_PRESETS[0].id).toBe("paper-search-mcp");
    expect(isBuiltinMcpServer("paper-search-mcp")).toBe(true);
    expect(isBuiltinMcpServer("fetch")).toBe(false);
  });

  it("builds npx launcher for paper-search-mcp-nodejs", () => {
    const preset = getMcpPreset("paper-search-mcp")!;
    const entry = presetToEntry(preset, {
      SEMANTIC_SCHOLAR_API_KEY: "test-key",
    });
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe("paper-search-mcp");
    expect(entry!.command).toEqual(["npx", "-y", "paper-search-mcp-nodejs"]);
    expect(entry!.environment.SEMANTIC_SCHOLAR_API_KEY).toBe("test-key");
    expect(findPresetForEntry(entry!)).toBe(preset);
  });

  it("allows install without optional env keys", () => {
    const preset = getMcpPreset("paper-search-mcp")!;
    expect(presetFieldsValid(preset, {})).toBe(true);
    const entry = presetToEntry(preset, {});
    expect(entry?.command).toEqual(["npx", "-y", "paper-search-mcp-nodejs"]);
  });

  it("exposes full upstream env keys for Configure", () => {
    const keys = (getMcpPreset("paper-search-mcp")!.fields ?? []).map((f) => f.key);
    expect(keys).toEqual([
      "SEMANTIC_SCHOLAR_API_KEY",
      "PUBMED_API_KEY",
      "WOS_API_KEY",
      "WOS_API_VERSION",
      "ELSEVIER_API_KEY",
      "SPRINGER_API_KEY",
      "SPRINGER_OPENACCESS_API_KEY",
      "WILEY_TDM_TOKEN",
      "SCHOLAR_PROXY",
    ]);
    // None are required — search works via free platforms without keys.
    expect(
      (getMcpPreset("paper-search-mcp")!.fields ?? []).every((f) => !f.required),
    ).toBe(true);
  });
});
