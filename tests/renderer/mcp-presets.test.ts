import { describe, expect, it } from "vitest";
import {
  MCP_PRESETS,
  findPresetForEntry,
  getMcpPreset,
  isBuiltinMcpServer,
  presetFieldsValid,
  presetToEntry,
} from "../../src/renderer/lib/agent/mcp-presets";

describe("MCP presets catalog", () => {
  it("does not ship paper-search-mcp", () => {
    expect(getMcpPreset("paper-search-mcp")).toBeUndefined();
    expect(MCP_PRESETS.some((p) => p.id === "paper-search-mcp")).toBe(false);
    expect(MCP_PRESETS[0].id).toBe("fetch");
    expect(isBuiltinMcpServer("fetch")).toBe(false);
  });

  it("builds fetch preset via npx", () => {
    const preset = getMcpPreset("fetch")!;
    const entry = presetToEntry(preset);
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe("fetch");
    expect(entry!.command).toEqual(["npx", "-y", "@modelcontextprotocol/server-fetch"]);
    expect(findPresetForEntry(entry!)).toBe(preset);
  });

  it("validates brave-search required API key", () => {
    const preset = getMcpPreset("brave-search")!;
    expect(presetFieldsValid(preset, {})).toBe(false);
    expect(presetFieldsValid(preset, { BRAVE_API_KEY: "key" })).toBe(true);
    const entry = presetToEntry(preset, { BRAVE_API_KEY: "key" });
    expect(entry?.environment.BRAVE_API_KEY).toBe("key");
  });
});
