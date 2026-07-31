import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn();

vi.mock("../../src/main/services/settings", () => ({
  getSettings: () => getSettings(),
}));

import {
  buildOpenCodeCredentialEnv,
  diffCredentialEnvKeys,
  resolveOpenCodeApiKey,
} from "../../src/main/acp/credential-env";

describe("buildOpenCodeCredentialEnv", () => {
  beforeEach(() => {
    getSettings.mockReset();
  });

  it("trims keys and skips catalog base URLs", () => {
    getSettings.mockReturnValue({
      aiProvider: "opencode-go",
      aiApiKeys: {
        anthropic: "  sk-ant  ",
        "opencode-go": " go-key ",
      },
      aiBaseUrls: {
        anthropic: " https://example.com/v1 ",
        "opencode-go": "https://should-ignore.example",
      },
    });

    expect(buildOpenCodeCredentialEnv()).toEqual({
      ANTHROPIC_API_KEY: "sk-ant",
      ANTHROPIC_BASE_URL: "https://example.com/v1",
      OPENCODE_API_KEY: "go-key",
    });
  });

  it("does not last-wins overwrite OPENCODE_API_KEY with zen after go", () => {
    getSettings.mockReturnValue({
      aiProvider: "opencode-go",
      aiApiKeys: {
        "opencode-go": "go-key",
        "opencode-zen": "zen-key",
      },
      aiBaseUrls: {},
    });

    // Object.entries order puts zen after go in insertion order — old builder
    // would bake zen-key; new builder prefers aiProvider / go.
    expect(buildOpenCodeCredentialEnv().OPENCODE_API_KEY).toBe("go-key");
    expect(
      buildOpenCodeCredentialEnv(undefined, {
        preferredCatalogProvider: "opencode-zen",
      }).OPENCODE_API_KEY,
    ).toBe("zen-key");
  });

  it("ignores call-site OPENCODE_API_KEY that is just another known catalog key", () => {
    getSettings.mockReturnValue({
      aiProvider: "opencode-go",
      aiApiKeys: {
        "opencode-go": "go-key",
        "opencode-zen": "zen-key",
      },
      aiBaseUrls: {},
    });

    // Simulate renderer sending zen key while chat provider is go — must stay go.
    expect(
      buildOpenCodeCredentialEnv(
        { OPENCODE_API_KEY: "zen-key" },
        { preferredCatalogProvider: "opencode-go" },
      ).OPENCODE_API_KEY,
    ).toBe("go-key");
  });

  it("merges call-site overrides with trim for non-catalog providers", () => {
    getSettings.mockReturnValue({
      aiApiKeys: { openai: "settings-key" },
      aiBaseUrls: {},
    });

    expect(
      buildOpenCodeCredentialEnv({
        OPENAI_API_KEY: "  override  ",
        EMPTY: "   ",
      }),
    ).toEqual({
      OPENAI_API_KEY: "override",
    });
  });
});

describe("resolveOpenCodeApiKey", () => {
  it("prefers preferred catalog provider over settings.aiProvider", () => {
    expect(
      resolveOpenCodeApiKey(
        { "opencode-go": "go", "opencode-zen": "zen" },
        "opencode-zen",
        "opencode-go",
      ),
    ).toBe("zen");
  });
});

describe("diffCredentialEnvKeys", () => {
  it("reports length-only diffs for API keys", () => {
    expect(
      diffCredentialEnvKeys(
        { OPENCODE_API_KEY: "aaaa", DEEPSEEK_API_KEY: "same" },
        { OPENCODE_API_KEY: "bbbbb", DEEPSEEK_API_KEY: "same" },
      ),
    ).toEqual([{ key: "OPENCODE_API_KEY", bakedLen: 4, nextLen: 5 }]);
  });
});
