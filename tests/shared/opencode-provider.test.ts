import { describe, expect, it } from "vitest";
import {
  formatOpenCodeModelRef,
  migrateOpenCodeEnabledModelIds,
  normalizeOpenCodeModelId,
  providerApiKeyEnvVar,
} from "../../src/shared/opencode-provider";

describe("opencode-provider", () => {
  it("maps opencode-go API key to OPENCODE_API_KEY", () => {
    expect(providerApiKeyEnvVar("opencode-go")).toBe("OPENCODE_API_KEY");
    expect(providerApiKeyEnvVar("anthropic")).toBe("ANTHROPIC_API_KEY");
  });

  it("normalizes legacy Go model IDs", () => {
    expect(normalizeOpenCodeModelId("opencode-go", "GLM-5.1")).toBe("glm-5.1");
    expect(normalizeOpenCodeModelId("opencode-go", "deepseek/deepseek-v4-pro")).toBe(
      "deepseek-v4-pro",
    );
  });

  it("formats OpenCode model ref for session/set_model", () => {
    expect(formatOpenCodeModelRef("opencode-go", "GLM-5.1")).toBe("opencode-go/glm-5.1");
    expect(formatOpenCodeModelRef("opencode-zen", "glm-5.1")).toBe("opencode/glm-5.1");
    expect(formatOpenCodeModelRef("opencode-zen", "anthropic/claude-opus-4-8")).toBe(
      "opencode/claude-opus-4-8",
    );
  });

  it("migrates enabled model lists", () => {
    expect(migrateOpenCodeEnabledModelIds("opencode-go", ["GLM-5.1", "glm-5.1"])).toEqual([
      "glm-5.1",
    ]);
  });
});
