import type { ProviderConfig } from "../types";

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
