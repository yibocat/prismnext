import { describe, expect, it } from "vitest";
import {
  buildModelsCatalogFromModelsDevCache,
  PRISM_LAZY_FETCH_CATALOG_PROVIDERS,
} from "../../src/shared/opencode-models-catalog";
import {
  isLazyCatalogProvider,
  LAZY_CATALOG_PROVIDER_IDS,
  LEGACY_BUILTIN_PROVIDER_IDS,
  migrateLegacyBuiltinProviders,
} from "../../src/shared/lazy-provider-catalog";
import { PROVIDER_PRESETS, ALL_PROVIDERS } from "../../src/renderer/lib/providers/presets";
import { getConfiguredProviderIds } from "../../src/renderer/lib/providers";

const sampleModelsDevCache = {
  openai: {
    id: "openai",
    models: {
      "gpt-5.6": {
        id: "gpt-5.6",
        name: "GPT-5.6",
        limit: { context: 400_000 },
        modalities: { input: ["text", "image"] },
        description: "Latest GPT flagship",
      },
      "old-gpt": {
        id: "old-gpt",
        name: "Old GPT",
        status: "deprecated",
        limit: { context: 128_000 },
      },
    },
  },
  anthropic: {
    id: "anthropic",
    models: {
      "claude-sonnet-4-6": {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        limit: { context: 1_000_000 },
        modalities: { input: ["text", "image"] },
        description: "Balanced Claude",
      },
    },
  },
  google: {
    id: "google",
    models: {
      "gemini-3.5-flash": {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        limit: { context: 1_000_000 },
        modalities: { input: ["text", "image"] },
        description: "Fast Gemini",
      },
    },
  },
  deepseek: {
    id: "deepseek",
    models: {
      "deepseek-chat": {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        limit: { context: 128_000 },
        modalities: { input: ["text"] },
        description: "DeepSeek chat",
      },
    },
  },
};

describe("lazy provider catalog", () => {
  it("marks openai/anthropic/google/deepseek/openrouter as lazy", () => {
    expect(LAZY_CATALOG_PROVIDER_IDS).toEqual([
      "openai",
      "anthropic",
      "google",
      "deepseek",
      "openrouter",
    ]);
    for (const id of LAZY_CATALOG_PROVIDER_IDS) {
      expect(isLazyCatalogProvider(id)).toBe(true);
    }
    expect(isLazyCatalogProvider("zhipu")).toBe(false);
  });

  it("parses openai/anthropic/google rows from models.json with context + description", () => {
    const entries = buildModelsCatalogFromModelsDevCache(
      sampleModelsDevCache,
      PRISM_LAZY_FETCH_CATALOG_PROVIDERS,
    );

    const gpt = entries.openai?.find((m) => m.id === "gpt-5.6");
    expect(gpt).toMatchObject({
      name: "GPT-5.6",
      contextWindow: "400K",
      description: "Latest GPT flagship",
      capabilities: { vision: true },
    });
    expect(entries.openai?.some((m) => m.id === "old-gpt")).toBe(false);

    expect(entries.anthropic?.[0]).toMatchObject({
      id: "claude-sonnet-4-6",
      contextWindow: "1M",
      description: "Balanced Claude",
    });
    expect(entries.google?.[0]).toMatchObject({
      id: "gemini-3.5-flash",
      contextWindow: "1M",
      description: "Fast Gemini",
    });
    expect(entries.deepseek?.[0]?.id).toBe("deepseek-chat");
  });

  it("keeps ALL_PROVIDERS empty and lazy presets without hand-maintained models", () => {
    expect(ALL_PROVIDERS).toEqual([]);
    for (const id of ["openai", "anthropic", "google", "deepseek", "openrouter"] as const) {
      const preset = PROVIDER_PRESETS.find((p) => p.id === id);
      expect(preset).toBeDefined();
      expect(preset!.models).toEqual([]);
    }
  });

  it("getConfiguredProviderIds only returns added custom providers with keys", () => {
    expect(
      getConfiguredProviderIds(
        { openai: "sk-test", google: "g-key" },
        [{ id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com" }],
      ),
    ).toEqual(["openai"]);
    expect(getConfiguredProviderIds({ openai: "sk-test" }, [])).toEqual([]);
  });

  it("lists former builtins for migration", () => {
    expect([...LEGACY_BUILTIN_PROVIDER_IDS]).toEqual(["openai", "google", "deepseek"]);
  });

  it("migrateLegacyBuiltinProviders promotes keyed former builtins when the list was never written", () => {
    const presets: Record<string, { name: string; defaultBaseUrl: string }> = {
      deepseek: { name: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com" },
    };
    const first = migrateLegacyBuiltinProviders(
      { aiApiKeys: { deepseek: "sk-test" } },
      (id) => presets[id],
    );
    expect(first).not.toBeNull();
    expect(first!.promoted).toBe(true);
    expect(first!.legacyBuiltinProvidersMigrated).toBe(true);
    expect(first!.aiCustomProviders.map((p) => p.id)).toEqual(["deepseek"]);

    const second = migrateLegacyBuiltinProviders(
      {
        aiApiKeys: { deepseek: "sk-test" },
        aiCustomProviders: first!.aiCustomProviders,
        legacyBuiltinProvidersMigrated: true,
      },
      (id) => presets[id],
    );
    expect(second).toBeNull();
  });

  it("migrateLegacyBuiltinProviders does not re-add a removed former builtin when the list already exists", () => {
    const marked = migrateLegacyBuiltinProviders(
      {
        aiApiKeys: { deepseek: "sk-orphan" },
        aiCustomProviders: [{ id: "openrouter", name: "OpenRouter", baseUrl: "" }],
      },
      () => ({ name: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com" }),
    );
    expect(marked).not.toBeNull();
    expect(marked!.promoted).toBe(false);
    expect(marked!.aiCustomProviders.map((p) => p.id)).toEqual(["openrouter"]);

    const again = migrateLegacyBuiltinProviders(
      {
        aiApiKeys: { deepseek: "sk-orphan" },
        aiCustomProviders: [],
        legacyBuiltinProvidersMigrated: true,
      },
      () => ({ name: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com" }),
    );
    expect(again).toBeNull();
  });
});
