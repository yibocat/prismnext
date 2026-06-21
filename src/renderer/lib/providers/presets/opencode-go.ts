import type { ProviderConfig } from "../types";

export const opencodeGoPreset: ProviderConfig = {
  id: "opencode-go",
  name: "OpenCode Go",
  defaultBaseUrl: "https://opencode.ai/zen/go/v1",
  models: [
    { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: "1M" },
    { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: "1M" },
    { id: "kimi-k2.6", name: "Kimi K2.6", contextWindow: "256K" },
    { id: "kimi-k2.5", name: "Kimi K2.5", contextWindow: "256K" },
    { id: "GLM-5.1", name: "GLM-5.1", contextWindow: "200K" },
    { id: "GLM-5", name: "GLM-5", contextWindow: "200K" },
    { id: "MiniMax-M3", name: "MiniMax M3", contextWindow: "1M" },
    { id: "qwen3.7-max", name: "Qwen 3.7 Max", contextWindow: "256K" },
    { id: "qwen3.7-plus", name: "Qwen 3.7 Plus", contextWindow: "1M" },
  ],
  reasoning: ["low", "medium", "high"],
};
