import type { ProviderConfig } from "../types";

export const openrouterPreset: ProviderConfig = {
  id: "openrouter",
  name: "OpenRouter",
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  models: [
    { id: "anthropic/claude-opus-4-8", name: "Claude Opus 4.8", contextWindow: "1M", capabilities: { vision: true } },
    { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: "1M", capabilities: { vision: true } },
    { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: "200K", capabilities: { vision: true } },
    { id: "openai/gpt-5.5", name: "GPT-5.5", contextWindow: "1M", capabilities: { vision: true } },
    { id: "openai/gpt-5.4", name: "GPT-5.4", contextWindow: "1M", capabilities: { vision: true } },
    { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", contextWindow: "2M", capabilities: { vision: true } },
    { id: "google/gemini-3.1-pro", name: "Gemini 3.1 Pro", contextWindow: "2M", capabilities: { vision: true } },
    { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: "1M", capabilities: { vision: false } },
  ],
};
