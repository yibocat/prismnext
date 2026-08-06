import { beforeEach, describe, expect, it, vi } from "vitest";

const storeData: Record<string, unknown> = {};

vi.mock("electron-store", () => ({
  default: class MockStore {
    get store() {
      return storeData;
    }
    get(key: string) {
      return storeData[key];
    }
    set(patch: Record<string, unknown>) {
      Object.assign(storeData, patch);
    }
  },
}));

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, "utf8"),
    decryptString: (b: Buffer) => b.toString("utf8"),
  },
}));

import {
  getSettings,
  pruneOrphanProviderSettings,
} from "../../src/main/services/settings";

describe("pruneOrphanProviderSettings", () => {
  beforeEach(() => {
    for (const key of Object.keys(storeData)) delete storeData[key];
  });

  it("prunes every per-provider leftover whose id left aiCustomProviders", () => {
    storeData.aiCustomProviders = [{ id: "opencode-go", name: "Go", baseUrl: "" }];
    storeData.aiApiKeys = JSON.stringify({
      "opencode-go": "go-key",
      openrouter: "or-key",
      "opencode-zen": "zen-key",
    });
    storeData.aiBaseUrls = {
      "opencode-go": "https://go.example",
      openrouter: "https://or.example",
    };
    storeData.aiEnabledModels = { "opencode-go": ["m1"], openrouter: ["m2"] };
    storeData.aiCustomModels = { openrouter: ["m3"] };
    storeData.aiCustomModelsData = { "opencode-zen": [{ id: "x" }] };
    storeData.aiVerifiedProviders = ["opencode-go", "openrouter"];

    const pruned = pruneOrphanProviderSettings();

    expect(pruned).toEqual(["opencode-zen", "openrouter"]);
    const settings = getSettings() as Record<string, any>;
    expect(settings.aiApiKeys).toEqual({ "opencode-go": "go-key" });
    expect(settings.aiBaseUrls).toEqual({ "opencode-go": "https://go.example" });
    expect(settings.aiEnabledModels).toEqual({ "opencode-go": ["m1"] });
    expect(settings.aiCustomModels).toEqual({});
    expect(settings.aiCustomModelsData).toEqual({});
    expect(settings.aiVerifiedProviders).toEqual(["opencode-go"]);
  });

  it("is a no-op while aiCustomProviders has never been written", () => {
    // Legacy install: renderer migration may still promote keyed built-ins —
    // nothing counts as an orphan yet, keys must survive.
    storeData.aiApiKeys = JSON.stringify({ openai: "sk-legacy" });

    expect(pruneOrphanProviderSettings()).toEqual([]);
    expect(getSettings().aiApiKeys).toEqual({ openai: "sk-legacy" });
  });

  it("writes nothing when there are no orphans", () => {
    const keysJson = JSON.stringify({ "opencode-go": "go-key" });
    storeData.aiCustomProviders = [{ id: "opencode-go", name: "Go", baseUrl: "" }];
    storeData.aiApiKeys = keysJson;

    expect(pruneOrphanProviderSettings()).toEqual([]);
    // Untouched — still the exact stored value (no rewrite churn).
    expect(storeData.aiApiKeys).toBe(keysJson);
  });
});
