import type { AgentIntegration } from "../types";
import type { ContextCalculator, CalcInput, CalcOutput } from "../context-calculator";
import {
  PRISM_EXACT_CATEGORIES,
  CONVERSATION_CATEGORY,
  AGENT_OVERHEAD_CATEGORY,
  computePrismExactTokens,
  estimateConversationTokens,
} from "../context-calculator";
import { GeminiParser } from "./parser";
import { GeminiSessionProvider } from "./sessions";

const stubCalculator: ContextCalculator = {
  agentId: "gemini",
  categories: [...PRISM_EXACT_CATEGORIES, CONVERSATION_CATEGORY, AGENT_OVERHEAD_CATEGORY],
  calculate(input: CalcInput): CalcOutput {
    const exact = computePrismExactTokens(input.resolvedContext, input.tokenizer);
    const conversation = estimateConversationTokens(input.lastUserPrompt, input.tokenizer, input.totalTokens);
    const accounted = Object.values(exact).reduce((s, v) => s + v, 0) + conversation;
    return {
      categories: { ...exact, conversation, agentOverhead: Math.max(0, input.totalTokens - accounted) },
      total: input.totalTokens,
    };
  },
};

export const geminiAgent: AgentIntegration = {
  id: "gemini",
  name: "Gemini CLI",
  description: "Google Gemini CLI",
  binary: "gemini",
  args: [],
  placeholder: true,
  settings: [
    {
      key: "model",
      type: "model",
      label: "Model",
      options: [
        { id: null, name: "Default" },
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", desc: "Most capable" },
        { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Fast & efficient" },
      ],
    },
    {
      key: "temperature",
      type: "select",
      label: "Style",
      options: [
        { id: "precise", name: "Precise" },
        { id: "balanced", name: "Balanced" },
        { id: "creative", name: "Creative" },
      ],
    },
  ],
  createParser: () => new GeminiParser(),
  createSessionProvider: () => new GeminiSessionProvider(),
  createCalculator: () => stubCalculator,
};
