import { describe, expect, it } from "vitest";
import {
  effortIdsFromReasoningOptions,
  filterEffortVariantIds,
  modelEffortKey,
  parseEffortConfigOption,
  parseRuntimeModelRef,
  prismModelFromRuntimeRef,
  prismProviderFromRuntime,
  sanitizeEffortChoice,
  appendEffortToRuntimeModelRef,
  OPENCODE_DEFAULT_VARIANT,
} from "../../src/shared/opencode-effort";

describe("opencode-effort", () => {
  it("maps opencode runtime id to opencode-zen prism id", () => {
    expect(prismProviderFromRuntime("opencode")).toBe("opencode-zen");
    expect(prismProviderFromRuntime("opencode-go")).toBe("opencode-go");
  });

  it("builds model effort keys with normalized model ids", () => {
    expect(modelEffortKey("opencode-go", "glm-5.1")).toBe("opencode-go/glm-5.1");
  });

  it("parses runtime model refs", () => {
    expect(parseRuntimeModelRef("opencode/glm-5.1")).toEqual({
      runtimeProvider: "opencode",
      modelId: "glm-5.1",
    });
    expect(prismModelFromRuntimeRef("opencode/glm-5.1")).toEqual({
      providerId: "opencode-zen",
      modelId: "glm-5.1",
    });
  });

  it("effortIdsFromReasoningOptions maps effort and toggle", () => {
    expect(
      effortIdsFromReasoningOptions([
        { type: "effort", values: ["high", "max"] },
        { type: "toggle" },
      ]),
    ).toEqual(["high", "max", "none", "thinking"]);
  });

  it("effortIdsFromReasoningOptions maps budget_tokens to high/max", () => {
    expect(
      effortIdsFromReasoningOptions([
        { type: "toggle" },
        { type: "budget_tokens", max: 81920 },
      ]),
    ).toEqual(["none", "thinking", "high", "max"]);
  });

  it("appendEffortToRuntimeModelRef appends validated effort suffix", () => {
    expect(appendEffortToRuntimeModelRef("opencode-go/glm-5.2", "max")).toBe(
      "opencode-go/glm-5.2/max",
    );
    expect(appendEffortToRuntimeModelRef("anthropic/claude-sonnet-4-6", "high")).toBe(
      "anthropic/claude-sonnet-4-6/high",
    );
    expect(appendEffortToRuntimeModelRef("opencode-go/glm-5.2/max", "max")).toBe(
      "opencode-go/glm-5.2/max",
    );
    expect(appendEffortToRuntimeModelRef("opencode-go/glm-5.2", OPENCODE_DEFAULT_VARIANT)).toBe(
      "opencode-go/glm-5.2",
    );
    expect(appendEffortToRuntimeModelRef("opencode-go/glm-5.2", undefined)).toBe(
      "opencode-go/glm-5.2",
    );
  });

  it("buildEffortMapFromProvidersList parses variantsByModel index", () => {
    const parsed = parseEffortConfigOption([
      {
        id: "effort",
        currentValue: "default",
        options: [
          { value: "default", name: "Default" },
          { value: "high", name: "High" },
          { value: "max", name: "Max" },
        ],
      },
    ]);
    expect(parsed).toEqual({ options: ["high", "max"] });
  });

  it("returns null when effort option missing or empty", () => {
    expect(parseEffortConfigOption([])).toBeNull();
    expect(parseEffortConfigOption([{ id: "agent", options: [] }])).toBeNull();
    expect(
      parseEffortConfigOption([
        { id: "effort", options: [{ value: "default", name: "Default" }] },
      ]),
    ).toBeNull();
  });

  it("filterEffortVariantIds dedupes and drops default", () => {
    expect(filterEffortVariantIds(["default", "high", "high", "max"])).toEqual([
      "high",
      "max",
    ]);
  });

  it("sanitizeEffortChoice rejects invalid values", () => {
    expect(sanitizeEffortChoice(undefined, ["high"])).toBeUndefined();
    expect(sanitizeEffortChoice("default", ["high"])).toBeUndefined();
    expect(sanitizeEffortChoice("high", ["high", "max"])).toBe("high");
    expect(sanitizeEffortChoice("low", ["high", "max"])).toBeUndefined();
  });
});
