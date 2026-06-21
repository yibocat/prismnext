import type { ProviderConfig } from "../types";

export const kimiPreset: ProviderConfig = {
  id: "kimi",
  name: "Kimi (Moonshot)",
  defaultBaseUrl: "https://api.moonshot.ai/v1",
  models: [
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", contextWindow: "256K" },
    { id: "kimi-k2.6", name: "Kimi K2.6", contextWindow: "256K" },
    { id: "kimi-k2.5", name: "Kimi K2.5", contextWindow: "256K" },
  ],
};
