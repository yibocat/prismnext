// Re-export from presets/
export { type ProviderConfig, type ModelConfig } from "./types";
export { ALL_PROVIDERS, PROVIDER_PRESETS, CUSTOM_PRESET, getPreset } from "./presets";
export {
  openaiProvider,
  googleProvider,
  deepseekProvider,
  openrouterPreset,
  anthropicPreset,
  zhipuPreset,
  minimaxPreset,
  kimiPreset,
  alibabaPreset,
  opencodeZenPreset,
  opencodeGoPreset,
} from "./presets";

import { ALL_PROVIDERS, getPreset } from "./presets";
import type { ProviderConfig, ModelConfig } from "./types";

/** User-added provider entry from settings (`aiCustomProviders`). */
export interface CustomProviderEntry {
  id: string;
  name: string;
  baseUrl: string;
}

export function getProvider(id: string): ProviderConfig | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

/**
 * Resolve a provider config from built-ins, presets, or user-added providers.
 * Custom entries may override preset display name / base URL.
 */
export function resolveProviderConfig(
  id: string,
  customProviders?: CustomProviderEntry[],
): ProviderConfig | undefined {
  const builtin = getProvider(id);
  if (builtin) return builtin;

  const preset = getPreset(id);
  const custom = customProviders?.find((p) => p.id === id);

  if (preset) {
    if (!custom) return preset;
    return {
      ...preset,
      name: custom.name || preset.name,
      defaultBaseUrl: custom.baseUrl || preset.defaultBaseUrl,
    };
  }

  if (custom) {
    return {
      id: custom.id,
      name: custom.name,
      defaultBaseUrl: custom.baseUrl,
      models: [],
    };
  }

  return undefined;
}

export function getProviderModels(
  providerId: string,
  customModels?: Record<string, ModelConfig[]>,
  customProviders?: CustomProviderEntry[],
): ModelConfig[] {
  const provider = resolveProviderConfig(providerId, customProviders);
  const staticModels = provider?.models ?? [];
  const customs = customModels?.[providerId] ?? [];
  const byId = new Map<string, ModelConfig>();
  for (const m of staticModels) byId.set(m.id, m);
  for (const m of customs) byId.set(m.id, m);
  return Array.from(byId.values());
}

export function getModel(
  providerId: string,
  modelId: string,
  customModels?: Record<string, ModelConfig[]>,
  customProviders?: CustomProviderEntry[],
): ModelConfig | undefined {
  return getProviderModels(providerId, customModels, customProviders).find((m) => m.id === modelId);
}

function collectEnabledModelsForProvider(
  provider: ProviderConfig,
  enabledIds: Record<string, string[]> | undefined,
  customModels: Record<string, ModelConfig[]> | undefined,
): Array<{ provider: ProviderConfig; model: ModelConfig }> {
  const result: Array<{ provider: ProviderConfig; model: ModelConfig }> = [];
  const enabled = enabledIds?.[provider.id];
  const customs = customModels?.[provider.id] ?? [];
  const knownIds = new Set<string>();

  for (const model of provider.models) {
    if (model.hidden) continue;
    knownIds.add(model.id);
    if (enabled) {
      if (enabled.includes(model.id)) result.push({ provider, model });
    } else {
      result.push({ provider, model });
    }
  }

  for (const cm of customs) {
    knownIds.add(cm.id);
    if (!enabled || enabled.includes(cm.id)) {
      result.push({ provider, model: cm });
    }
  }

  if (enabled) {
    for (const id of enabled) {
      if (knownIds.has(id)) continue;
      result.push({
        provider,
        model: { id, name: id, contextWindow: "Unknown" },
      });
    }
  }

  return result;
}

/**
 * Returns all enabled models across providers, ready for Chat model dropdown.
 * Includes built-in providers and user-added preset/custom providers.
 */
export function getAllEnabledModels(
  enabledIds: Record<string, string[]> | undefined,
  customModels: Record<string, ModelConfig[]> | undefined,
  customProviders?: CustomProviderEntry[],
): Array<{ provider: ProviderConfig; model: ModelConfig }> {
  const result: Array<{ provider: ProviderConfig; model: ModelConfig }> = [];
  const seen = new Set<string>();

  for (const provider of ALL_PROVIDERS) {
    if (provider.id === "custom") continue;
    seen.add(provider.id);
    result.push(...collectEnabledModelsForProvider(provider, enabledIds, customModels));
  }

  for (const cp of customProviders ?? []) {
    if (seen.has(cp.id)) continue;
    const provider = resolveProviderConfig(cp.id, customProviders);
    if (!provider) continue;
    seen.add(cp.id);
    result.push(...collectEnabledModelsForProvider(provider, enabledIds, customModels));
  }

  return result;
}

/**
 * Returns thought/reasoning level options for a provider.
 */
const DEFAULT_REASONING = ["low", "medium", "high"] as const;

export function getThoughtLevels(
  providerId: string,
): Array<{ value: string; label: string }> {
  const provider = getProvider(providerId) || getPreset(providerId);
  const levels = provider?.reasoning || DEFAULT_REASONING;
  return levels.map((r: string) => ({ value: r, label: capitalize(r) }));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** True if `modelId` already exists in preset or custom model lists. */
export function modelIdTaken(
  modelId: string,
  presetModels: ModelConfig[],
  customModels: ModelConfig[],
): boolean {
  const id = modelId.trim();
  if (!id) return false;
  return presetModels.some((m) => m.id === id) || customModels.some((m) => m.id === id);
}

/** Build a user-added model entry; display name and context default when omitted. */
export function buildCustomModelEntry(
  modelId: string,
  displayName?: string,
  contextWindow?: string,
): ModelConfig {
  const id = modelId.trim();
  const name = (displayName || "").trim() || id;
  const ctx = (contextWindow || "").trim() || "Unknown";
  return { id, name, contextWindow: ctx };
}
