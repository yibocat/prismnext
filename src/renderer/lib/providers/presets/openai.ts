import type { ProviderConfig } from "../types";

/** OpenAI — model list lazy-fetched from OpenCode models.json (Fetch in Configure). */
export const openaiProvider: ProviderConfig = {
  id: "openai",
  name: "OpenAI",
  defaultBaseUrl: "https://api.openai.com",
  models: [],
};
