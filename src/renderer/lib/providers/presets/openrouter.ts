import type { ProviderConfig } from "../types";

/**
 * OpenRouter — full list lazy-fetched via Configure → Fetch models
 * (`chat:fetchProviderModels`).
 */
export const openrouterPreset: ProviderConfig = {
  id: "openrouter",
  name: "OpenRouter",
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  models: [],
};
