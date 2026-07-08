import type { ProviderConfig } from "../types";

/**
 * OpenCode Go catalog — model IDs from https://opencode.ai/zen/go/v1/models
 * Config ref format: `opencode-go/<model-id>` (see https://opencode.ai/docs/go/)
 */
export const opencodeGoPreset: ProviderConfig = {
  id: "opencode-go",
  name: "OpenCode Go",
  defaultBaseUrl: "https://opencode.ai/zen/go/v1",
  defaultModel: "glm-5.1",
  models: [
    { id: "glm-5.2", name: "GLM-5.2", contextWindow: "1M" },
    { id: "glm-5.1", name: "GLM-5.1", contextWindow: "200K" },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", contextWindow: "256K" },
    { id: "kimi-k2.6", name: "Kimi K2.6", contextWindow: "256K" },
    { id: "mimo-v2.5", name: "MiMo-V2.5", contextWindow: "1M" },
    { id: "mimo-v2.5-pro", name: "MiMo-V2.5-Pro", contextWindow: "1M" },
    { id: "minimax-m3", name: "MiniMax M3", contextWindow: "1M" },
    { id: "minimax-m2.7", name: "MiniMax M2.7", contextWindow: "1M" },
    { id: "qwen3.7-max", name: "Qwen3.7 Max", contextWindow: "256K" },
    { id: "qwen3.7-plus", name: "Qwen3.7 Plus", contextWindow: "1M" },
    { id: "qwen3.6-plus", name: "Qwen3.6 Plus", contextWindow: "1M" },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: "1M" },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: "1M" },
  ],
  reasoning: ["low", "medium", "high"],
};
