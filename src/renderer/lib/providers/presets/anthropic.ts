import type { ProviderConfig } from "../types";

/** Anthropic — model list lazy-fetched from OpenCode models.json (Fetch in Configure). */
export const anthropicPreset: ProviderConfig = {
  id: "anthropic",
  name: "Anthropic",
  defaultBaseUrl: "https://api.anthropic.com",
  models: [],
};
