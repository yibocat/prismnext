// src/renderer/lib/providers/google.ts
import type { ProviderConfig } from "../types";

export const googleProvider: ProviderConfig = {
  id: "google",
  name: "Google",
  defaultBaseUrl: "https://generativelanguage.googleapis.com",
  defaultModel: "gemini-3.5-flash",
  models: [
    {
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      contextWindow: "2M",
      reasoning: ["minimal", "low", "medium", "high"],
      defaultReasoning: "medium",
    },
    {
      id: "gemini-3.1-pro",
      name: "Gemini 3.1 Pro",
      contextWindow: "2M",
      reasoning: ["minimal", "low", "medium", "high"],
      defaultReasoning: "high",
    },
    {
      id: "gemini-3-flash",
      name: "Gemini 3 Flash",
      contextWindow: "1M",
      reasoning: ["minimal", "low", "medium", "high"],
      defaultReasoning: "medium",
    },
    {
      id: "gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash-Lite",
      contextWindow: "1M",
      reasoning: ["minimal", "low", "medium"],
      defaultReasoning: "low",
    },
  ],
  reasoning: ["minimal", "low", "medium", "high", "adaptive"],
  defaultReasoning: undefined,
};
