// Preset providers — all come from the Pi provider catalog. No hand-maintained
// model lists: every provider's models are fetched at runtime via `agent:listModels`.
export type { ProviderConfig, ModelConfig } from "../types";

import { PI_PRESET_PROVIDERS, type PiProviderMeta } from "../../../../shared/providers/pi-catalog";
import type { ProviderConfig } from "../types";

/**
 * All product providers are Pi providers now. `ALL_PROVIDERS` is kept empty so
 * existing imports do not break — vendors are added via Settings → Add Provider.
 */
export const ALL_PROVIDERS: ProviderConfig[] = [];

function metaToPreset(meta: PiProviderMeta): ProviderConfig {
  return {
    id: meta.id,
    name: meta.name,
    defaultBaseUrl: meta.baseUrl ?? "",
    models: [],
  };
}

/** Preset providers available in the Add Provider dialog dropdown. */
export const PROVIDER_PRESETS: ProviderConfig[] = PI_PRESET_PROVIDERS.map(metaToPreset);

/** The "Custom" entry — user defines everything manually. */
export const CUSTOM_PRESET: ProviderConfig = {
  id: "__custom__",
  name: "Custom",
  defaultBaseUrl: "",
  models: [],
};

export function getPreset(id: string): ProviderConfig | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
