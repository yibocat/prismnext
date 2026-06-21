import type { ProviderConfig } from "../types";

export const zhipuPreset: ProviderConfig = {
  id: "zhipu",
  name: "智谱 GLM",
  defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  models: [
    { id: "GLM-5.1", name: "GLM-5.1", contextWindow: "200K" },
    { id: "GLM-5", name: "GLM-5", contextWindow: "200K" },
    { id: "GLM-4.7", name: "GLM-4.7", contextWindow: "200K" },
    { id: "GLM-4.7-FlashX", name: "GLM-4.7 FlashX", contextWindow: "200K" },
    { id: "GLM-4.7-Flash", name: "GLM-4.7 Flash (免费)", contextWindow: "200K" },
  ],
};
