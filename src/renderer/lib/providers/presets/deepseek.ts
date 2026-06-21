// src/renderer/lib/providers/deepseek.ts
import type { ProviderConfig } from "../types";

export const deepseekProvider: ProviderConfig = {
  id: "deepseek",
  name: "DeepSeek",
  defaultBaseUrl: "https://api.deepseek.com",
  defaultModel: "deepseek-v4-pro",
  models: [
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      contextWindow: "1M",
      reasoning: ["low", "medium", "high", "max"],
      defaultReasoning: "high",
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      contextWindow: "1M",
      reasoning: ["low", "medium", "high", "max"],
    },
  ],
  reasoning: ["low", "medium", "high", "max"],
  defaultReasoning: undefined,
};
