import type { AgentIntegration } from "../types";
import type { ContextCalculator, CalcInput, CalcOutput } from "../context-calculator";
import {
  PRISM_EXACT_CATEGORIES,
  CONVERSATION_CATEGORY,
  AGENT_OVERHEAD_CATEGORY,
  computePrismExactTokens,
  estimateConversationTokens,
} from "../context-calculator";
import { OpenCodeParser } from "./parser";
import { OpenCodeSessionProvider } from "./sessions";

const stubCalculator: ContextCalculator = {
  agentId: "opencode",
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

export const opencodeAgent: AgentIntegration = {
  id: "opencode",
  name: "OpenCode",
  description: "OpenCode CLI",
  binary: "npx",
  args: ["opencode"],
  placeholder: true,
  settings: [
    {
      key: "model",
      type: "model",
      label: "Model",
      options: [
        { id: null, name: "Default" },
        { id: "gpt-4o", name: "GPT-4o", desc: "Latest GPT-4 Omni" },
        { id: "gpt-4-turbo", name: "GPT-4 Turbo", desc: "Fast GPT-4" },
      ],
    },
    {
      key: "reasoning",
      type: "select",
      label: "Reasoning",
      options: [
        { id: "low", name: "Low" },
        { id: "medium", name: "Medium" },
        { id: "high", name: "High" },
      ],
    },
  ],
  createParser: () => new OpenCodeParser(),
  createSessionProvider: () => new OpenCodeSessionProvider(),
  createCalculator: () => stubCalculator,
};
