import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  effortLevelsFromCatalogEntry,
  getModelEffortLevels,
} from "../../src/renderer/lib/providers/index";

describe("model-effort renderer helpers", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers ACP catalog entry over preset when provided", () => {
    const preset = getModelEffortLevels("anthropic", "claude-sonnet-4-5");
    const fromCatalog = effortLevelsFromCatalogEntry(
      ["high", "max"],
      "opencode-go",
      "deepseek-v4-pro",
    );
    expect(fromCatalog?.map((l) => l.value)).toEqual(["high", "max"]);
    expect(preset).toBeNull();
  });

  it("returns null when catalog entry missing (no preset fallback)", () => {
    const levels = effortLevelsFromCatalogEntry(
      undefined,
      "anthropic",
      "claude-sonnet-4-5",
    );
    expect(levels).toBeNull();
  });
});
