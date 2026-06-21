import type { ProviderConfig } from "../types";

export const opencodeZenPreset: ProviderConfig = {
  id: "opencode-zen",
  name: "OpenCode Zen",
  defaultBaseUrl: "https://opencode.ai/zen/v1",
  models: [
    { id: "anthropic/claude-opus-4-8", name: "Claude Opus 4.8", contextWindow: "1M" },
    { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: "1M" },
    { id: "openai/gpt-5.5", name: "GPT-5.5", contextWindow: "1M" },
    { id: "openai/gpt-5.4", name: "GPT-5.4", contextWindow: "1M" },
    { id: "openai/gpt-5.3-codex", name: "GPT-5.3 Codex", contextWindow: "1M" },
    { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", contextWindow: "2M" },
    { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: "1M" },
  ],
  reasoning: ["low", "medium", "high", "xhigh", "max"],
};
