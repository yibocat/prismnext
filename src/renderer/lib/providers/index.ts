// Re-export from presets/
export { type ProviderConfig, type ModelConfig } from "./types";
export {
  prefetchOpenCodeModelsCatalog,
  getCachedOpenCodeCatalogModels,
  mergeProviderWithOpenCodeCatalog,
  subscribeOpenCodeModelsCatalog,
  isUnknownContextWindowLabel,
} from "./opencode-catalog-models";
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

import { ALL_PROVIDERS, getPreset, PROVIDER_PRESETS } from "./presets";
import type { ProviderConfig, ModelConfig } from "./types";
import {
  getCachedOpenCodeCatalogModels,
  isUnknownContextWindowLabel,
  mergeProviderWithOpenCodeCatalog,
} from "./opencode-catalog-models";
import { parseContextWindow, DEFAULT_CONTEXT_WINDOW } from "@shared/context-constants";

/** User-added provider entry from settings (`aiCustomProviders`). */
export interface CustomProviderEntry {
  id: string;
  name: string;
  baseUrl: string;
}

/** Settings fields touched when removing an added provider (DeepSeek / OpenRouter / …). */
export type RemovableProviderSettings = {
  aiCustomProviders?: CustomProviderEntry[];
  aiApiKeys?: Record<string, string>;
  aiBaseUrls?: Record<string, string>;
  aiEnabledModels?: Record<string, string[]>;
  aiCustomModels?: Record<string, string[]>;
  aiCustomModelsData?: Record<string, ModelConfig[]>;
  aiVerifiedProviders?: string[];
  aiPinnedModelKeys?: string[];
  aiModelThoughtLevels?: Record<string, string>;
  aiProvider?: string;
  aiModel?: string | null;
  aiVisionFallbackModel?: string | null;
  aiSubagentModel?: string | null;
};

function omitProviderKey<V>(
  map: Record<string, V> | undefined,
  providerId: string,
): Record<string, V> | undefined {
  if (!map || !(providerId in map)) return map;
  const next = { ...map };
  delete next[providerId];
  return next;
}

function modelRefForProvider(ref: string | null | undefined, providerId: string): boolean {
  if (!ref) return false;
  const slash = ref.indexOf("/");
  if (slash <= 0) return false;
  return ref.slice(0, slash) === providerId;
}

/**
 * Full remove patch — drop the custom entry and all per-provider leftovers (keys, models, pins).
 * Same semantics for DeepSeek as for OpenRouter / Zen: restart must not resurrect the vendor.
 */
export function buildRemoveCustomProviderPatch(
  settings: RemovableProviderSettings,
  providerId: string,
): RemovableProviderSettings {
  const patch: RemovableProviderSettings = {
    aiCustomProviders: (settings.aiCustomProviders || []).filter((p) => p.id !== providerId),
    aiApiKeys: omitProviderKey(settings.aiApiKeys, providerId),
    aiBaseUrls: omitProviderKey(settings.aiBaseUrls, providerId),
    aiEnabledModels: omitProviderKey(settings.aiEnabledModels, providerId),
    aiCustomModels: omitProviderKey(settings.aiCustomModels, providerId),
    aiCustomModelsData: omitProviderKey(settings.aiCustomModelsData, providerId),
    aiVerifiedProviders: (settings.aiVerifiedProviders || []).filter((id) => id !== providerId),
  };

  if (settings.aiPinnedModelKeys?.length) {
    patch.aiPinnedModelKeys = settings.aiPinnedModelKeys.filter(
      (key) => !modelRefForProvider(key, providerId),
    );
  }

  if (settings.aiModelThoughtLevels) {
    const nextLevels = { ...settings.aiModelThoughtLevels };
    let levelsChanged = false;
    for (const key of Object.keys(nextLevels)) {
      if (modelRefForProvider(key, providerId)) {
        delete nextLevels[key];
        levelsChanged = true;
      }
    }
    if (levelsChanged) patch.aiModelThoughtLevels = nextLevels;
  }

  // Persist clears must be non-undefined (settingsSet skips undefined).
  if (settings.aiProvider === providerId) {
    patch.aiProvider = "";
    patch.aiModel = null;
  }

  if (modelRefForProvider(settings.aiVisionFallbackModel, providerId)) {
    patch.aiVisionFallbackModel = null;
  }
  if (modelRefForProvider(settings.aiSubagentModel, providerId)) {
    patch.aiSubagentModel = null;
  }

  return patch;
}

export function getProvider(id: string): ProviderConfig | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id) ?? getPreset(id);
}

/**
 * Resolve a provider config from built-ins, presets, or user-added providers.
 * Custom entries may override preset display name / base URL.
 */
export function resolveProviderConfig(
  id: string,
  customProviders?: CustomProviderEntry[],
): ProviderConfig | undefined {
  const preset = getProvider(id) ?? getPreset(id);
  const custom = customProviders?.find((p) => p.id === id);

  if (preset) {
    const base = !custom
      ? preset
      : {
          ...preset,
          name: custom.name || preset.name,
          defaultBaseUrl: custom.baseUrl || preset.defaultBaseUrl,
        };
    return mergeProviderWithOpenCodeCatalog(base);
  }

  if (custom) {
    const config: ProviderConfig = {
      id: custom.id,
      name: custom.name,
      defaultBaseUrl: custom.baseUrl,
      models: [],
    };
    return mergeProviderWithOpenCodeCatalog(config);
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

export function modelSupportsVision(model: ModelConfig | undefined): boolean {
  return Boolean(model?.capabilities?.vision);
}

/** True when the user has saved a non-empty API key for this provider. */
export function isProviderConfigured(
  providerId: string,
  aiApiKeys?: Record<string, string>,
): boolean {
  return Boolean(aiApiKeys?.[providerId]?.trim());
}

/** Provider ids with a configured API key among user-added providers. */
export function getConfiguredProviderIds(
  aiApiKeys?: Record<string, string>,
  customProviders?: CustomProviderEntry[],
): string[] {
  const ids = new Set<string>();
  for (const cp of customProviders ?? []) {
    if (isProviderConfigured(cp.id, aiApiKeys)) ids.add(cp.id);
  }
  return [...ids];
}

/**
 * Vision-capable models eligible as the multimodal helper:
 * configured provider (API key) × chat-enabled model × vision capability.
 */
export function getConfiguredVisionModels(
  enabledIds: Record<string, string[]> | undefined,
  customModels: Record<string, ModelConfig[]> | undefined,
  customProviders: CustomProviderEntry[] | undefined,
  aiApiKeys: Record<string, string> | undefined,
): Array<{ provider: ProviderConfig; model: ModelConfig }> {
  const configured = new Set(getConfiguredProviderIds(aiApiKeys, customProviders));
  return getAllEnabledModels(enabledIds, customModels, customProviders)
    .filter(
      ({ provider, model }) =>
        configured.has(provider.id) && modelSupportsVision(model),
    )
    .sort(
      (a, b) =>
        a.provider.name.localeCompare(b.provider.name) ||
        a.model.name.localeCompare(b.model.name),
    );
}

/** @deprecated Use getConfiguredVisionModels for helper picker. */
export function getVisionEnabledModels(
  enabledIds: Record<string, string[]> | undefined,
  customModels: Record<string, ModelConfig[]> | undefined,
  customProviders?: CustomProviderEntry[],
  aiApiKeys?: Record<string, string>,
): Array<{ provider: ProviderConfig; model: ModelConfig }> {
  return getConfiguredVisionModels(enabledIds, customModels, customProviders, aiApiKeys);
}

/** @deprecated Catalog scan — ignores API keys; do not use in Settings UI. */
export function getVisionCapableModels(
  customModels?: Record<string, ModelConfig[]>,
  customProviders?: CustomProviderEntry[],
): Array<{ provider: ProviderConfig; model: ModelConfig }> {
  const result: Array<{ provider: ProviderConfig; model: ModelConfig }> = [];
  const seen = new Set<string>();
  const providerIds = new Set<string>();

  for (const provider of ALL_PROVIDERS) {
    if (provider.id !== "custom") providerIds.add(provider.id);
  }
  for (const preset of PROVIDER_PRESETS) {
    providerIds.add(preset.id);
  }
  for (const cp of customProviders ?? []) {
    providerIds.add(cp.id);
  }

  for (const providerId of providerIds) {
    const provider = resolveProviderConfig(providerId, customProviders);
    if (!provider) continue;
    for (const model of getProviderModels(providerId, customModels, customProviders)) {
      if (!modelSupportsVision(model)) continue;
      const key = `${providerId}::${model.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ provider, model });
    }
  }

  return result.sort(
    (a, b) =>
      a.provider.name.localeCompare(b.provider.name) ||
      a.model.name.localeCompare(b.model.name),
  );
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
 * Returns all enabled models across user-added providers, ready for Chat model dropdown.
 */
export function getAllEnabledModels(
  enabledIds: Record<string, string[]> | undefined,
  customModels: Record<string, ModelConfig[]> | undefined,
  customProviders?: CustomProviderEntry[],
): Array<{ provider: ProviderConfig; model: ModelConfig }> {
  const result: Array<{ provider: ProviderConfig; model: ModelConfig }> = [];
  const seen = new Set<string>();

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
 * Display label for an OpenCode effort / variant id.
 */
export function formatEffortLabel(value: string): string {
  const known: Record<string, string> = {
    none: "None",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "XHigh",
    max: "Max",
    thinking: "Thinking",
    default: "Default",
  };
  if (known[value]) return known[value];
  return value
    .split(/[_-]/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/**
 * @deprecated Effort lists come from OpenCode catalog IPC only.
 */
export function getThoughtLevels(
  _providerId: string,
): Array<{ value: string; label: string }> {
  return [];
}

/**
 * @deprecated Use `getModelEffortLevelsAsync` / catalog IPC. Sync preset lists removed.
 */
export function getModelEffortLevels(
  _providerId: string,
  _modelId: string,
  _customModels?: Record<string, ModelConfig[]>,
  _customProviders?: CustomProviderEntry[],
): Array<{ value: string; label: string }> | null {
  return null;
}

function effortLevelsFromIds(ids: string[]): Array<{ value: string; label: string }> {
  return ids.map((value) => ({ value, label: formatEffortLabel(value) }));
}

/** @deprecated Preset effort lists removed — returns undefined (catalog-only). */
export function getModelEffortFallbackIds(
  _providerId: string,
  _modelId: string,
  _customModels?: Record<string, ModelConfig[]>,
  _customProviders?: CustomProviderEntry[],
): string[] | undefined {
  return undefined;
}

/**
 * Per-model effort options — OpenCode ACP catalog when available, preset fallback offline.
 */
export async function getModelEffortLevelsAsync(
  providerId: string,
  modelId: string,
  customModels?: Record<string, ModelConfig[]>,
  customProviders?: CustomProviderEntry[],
): Promise<Array<{ value: string; label: string }> | null> {
  const fallback = getModelEffortLevels(providerId, modelId, customModels, customProviders);
  const fallbackIds = fallback?.map((l) => l.value);
  try {
    const result = await window.electronAPI.chatGetModelEffort({
      provider: providerId,
      modelId,
      fallback: fallbackIds,
    });
    if (!result.efforts?.length) return null;
    return effortLevelsFromIds(result.efforts);
  } catch {
    return fallback;
  }
}

/** Batch-load effort catalog for model picker (single IPC). */
export async function prefetchEffortCatalog(): Promise<
  Record<string, string[]> | null
> {
  try {
    const snapshot = await window.electronAPI.chatGetEffortCatalog();
    return snapshot.entries;
  } catch {
    return null;
  }
}

export function effortLevelsFromCatalogEntry(
  efforts: string[] | undefined,
  _providerId: string,
  _modelId: string,
  _customModels?: Record<string, ModelConfig[]>,
  _customProviders?: CustomProviderEntry[],
): Array<{ value: string; label: string }> | null {
  if (!efforts?.length) return null;
  return effortLevelsFromIds(efforts);
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
  capabilities?: ModelConfig["capabilities"],
): ModelConfig {
  const id = modelId.trim();
  const name = (displayName || "").trim() || id;
  const ctx = (contextWindow || "").trim() || "Unknown";
  return { id, name, contextWindow: ctx, capabilities };
}

/**
 * Context-ring denominator for the selected model.
 * Prefers settings/catalog `contextWindow`; if Unknown/—, consults OpenCode
 * Go/Zen memory catalog (after prefetch).
 */
export function resolveSelectedModelContextTokens(
  providerId: string,
  modelId: string | undefined,
  enabledIds: Record<string, string[]> | undefined,
  customModels: Record<string, ModelConfig[]> | undefined,
  customProviders?: CustomProviderEntry[],
): number {
  if (!modelId) return DEFAULT_CONTEXT_WINDOW;
  const allModels = getAllEnabledModels(enabledIds, customModels, customProviders);
  const found = allModels.find(
    (m) => m.provider.id === providerId && m.model.id === modelId,
  );
  let label = found?.model.contextWindow;
  if (isUnknownContextWindowLabel(label)) {
    const catalogRow = getCachedOpenCodeCatalogModels(providerId)?.find(
      (m) => m.id === modelId,
    );
    if (catalogRow && !isUnknownContextWindowLabel(catalogRow.contextWindow)) {
      label = catalogRow.contextWindow;
    }
  }
  return parseContextWindow(label);
}
