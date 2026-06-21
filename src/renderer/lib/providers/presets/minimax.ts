import type { ProviderConfig } from "../types";

export const minimaxPreset: ProviderConfig = {
  id: "minimax",
  name: "MiniMax",
  defaultBaseUrl: "https://api.minimax.io",
  models: [
    { id: "MiniMax-M3", name: "MiniMax M3", contextWindow: "1M" },
    { id: "MiniMax-M2.7", name: "MiniMax M2.7", contextWindow: "205K" },
    { id: "MiniMax-M2.7-highspeed", name: "MiniMax M2.7 HighSpeed", contextWindow: "205K" },
  ],
};
