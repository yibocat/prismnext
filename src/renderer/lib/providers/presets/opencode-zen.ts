import type { ProviderConfig } from "../types";

/**
 * OpenCode Zen catalog — model IDs from https://opencode.ai/zen/v1/models
 * Config ref format: `opencode/<model-id>` (see https://opencode.ai/docs/zen/)
 */
export const opencodeZenPreset: ProviderConfig = {
  id: "opencode-zen",
  name: "OpenCode Zen",
  defaultBaseUrl: "https://opencode.ai/zen/v1",
  defaultModel: "claude-sonnet-4-6",
  models: [
    { id: "claude-opus-4-8", name: "Claude Opus 4.8", contextWindow: "1M", capabilities: { vision: true } },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: "1M", capabilities: { vision: true } },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: "200K", capabilities: { vision: true } },
    { id: "gpt-5.5-pro", name: "GPT-5.5 Pro", contextWindow: "1M", capabilities: { vision: true } },
    { id: "gpt-5.5", name: "GPT-5.5", contextWindow: "1M", capabilities: { vision: true } },
    { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", contextWindow: "1M", capabilities: { vision: true } },
    { id: "gpt-5.4", name: "GPT-5.4", contextWindow: "1M", capabilities: { vision: true } },
    { id: "gpt-5.3-codex", name: "GPT-5.3 Codex", contextWindow: "1M", capabilities: { vision: false } },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", contextWindow: "2M", capabilities: { vision: true } },
    { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", contextWindow: "2M", capabilities: { vision: true } },
    { id: "glm-5.2", name: "GLM-5.2", contextWindow: "1M", capabilities: { vision: false } },
    { id: "glm-5.1", name: "GLM-5.1", contextWindow: "200K", capabilities: { vision: false } },
    {
      id: "kimi-k2.7-code",
      name: "Kimi K2.7 Code",
      contextWindow: "256K",
      capabilities: { vision: false },
    },
    { id: "kimi-k2.6", name: "Kimi K2.6", contextWindow: "256K", capabilities: { vision: true } },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      contextWindow: "1M",
      capabilities: { vision: false },
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      contextWindow: "1M",
      capabilities: { vision: false },
    },
    { id: "minimax-m3", name: "MiniMax M3", contextWindow: "1M", capabilities: { vision: true } },
    {
      id: "minimax-m2.7",
      name: "MiniMax M2.7",
      contextWindow: "205K",
      capabilities: { vision: false },
    },
    {
      id: "qwen3.6-plus",
      name: "Qwen3.6 Plus",
      contextWindow: "256K",
      capabilities: { vision: false },
    },
  ],
  reasoning: ["low", "medium", "high", "xhigh", "max"],
};
