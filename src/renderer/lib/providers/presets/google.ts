import type { ProviderConfig } from "../types";

/** Google Gemini — model list lazy-fetched from OpenCode models.json (Fetch in Configure). */
export const googleProvider: ProviderConfig = {
  id: "google",
  name: "Google",
  defaultBaseUrl: "https://generativelanguage.googleapis.com",
  models: [],
};
