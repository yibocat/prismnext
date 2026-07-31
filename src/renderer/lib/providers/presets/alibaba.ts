import type { ProviderConfig } from "../types";

/**
 * 阿里云百炼 — OpenCode often exposes toggle (none/high) for Qwen3.6+/3.7 on some
 * transports; when unsure keep empty so Edit stays hidden rather than sending
 * invalid effort values.
 */
export const alibabaPreset: ProviderConfig = {
  id: "alibaba",
  name: "阿里云百炼 (Qwen)",
  defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  models: [
    { id: "qwen3.7-max", name: "Qwen 3.7 Max", contextWindow: "256K" },
    { id: "qwen3.7-plus", name: "Qwen 3.7 Plus", contextWindow: "1M" },
    { id: "qwen3.6-plus", name: "Qwen 3.6 Plus", contextWindow: "256K" },
    { id: "qwen3.6-flash", name: "Qwen 3.6 Flash", contextWindow: "256K" },
  ],
};
