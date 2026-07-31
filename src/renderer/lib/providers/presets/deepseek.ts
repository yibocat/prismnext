import type { ProviderConfig } from "../types";

/** DeepSeek — model list lazy-fetched from OpenCode models.json (Fetch in Configure). */
export const deepseekProvider: ProviderConfig = {
  id: "deepseek",
  name: "DeepSeek",
  defaultBaseUrl: "https://api.deepseek.com",
  models: [],
};
