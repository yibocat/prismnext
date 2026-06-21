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

export function getProvider(id: string): ProviderConfig | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

export function getProviderModels(providerId: string): ModelConfig[] {
  return getProvider(providerId)?.models ?? [];
}

export function getModel(
  providerId: string,
  modelId: string,
): ModelConfig | undefined {
  return getProviderModels(providerId).find((m) => m.id === modelId);
}

/**
 * Returns all enabled models across all providers, ready for Chat model dropdown.
 * Merges static provider models, custom models, and enabled filter.
 */
export function getAllEnabledModels(
  enabledIds: Record<string, string[]> | undefined,
  customModels: Record<string, ModelConfig[]> | undefined,
): Array<{ provider: ProviderConfig; model: ModelConfig }> {
  const result: Array<{ provider: ProviderConfig; model: ModelConfig }> = [];

  for (const provider of ALL_PROVIDERS) {
    if (provider.id === "custom") continue;

    const enabled = enabledIds?.[provider.id];
    const customs = customModels?.[provider.id] ?? [];

    for (const model of provider.models) {
      if (!model.hidden && enabled) {
        if (enabled.includes(model.id)) {
          result.push({ provider, model });
        }
      } else if (!model.hidden && !enabled) {
        result.push({ provider, model });
      }
    }

    for (const cm of customs) {
      if (!enabled || enabled.includes(cm.id)) {
        result.push({ provider, model: cm });
      }
    }
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
  // Check built-in providers first, then presets
  const provider = getProvider(providerId) || getPreset(providerId);
  const levels = provider?.reasoning || DEFAULT_REASONING;
  return levels.map((r: string) => ({ value: r, label: capitalize(r) }));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
