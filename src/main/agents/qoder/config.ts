import type { AgentIntegration } from "../types";
import type { ContextCalculator, CalcInput, CalcOutput } from "../context-calculator";
import {
  PRISM_EXACT_CATEGORIES,
  CONVERSATION_CATEGORY,
  AGENT_OVERHEAD_CATEGORY,
  computePrismExactTokens,
  estimateConversationTokens,
} from "../context-calculator";
import { QoderParser } from "./parser";
import { QoderSessionProvider } from "./sessions";

const stubCalculator: ContextCalculator = {
  agentId: "qoder",
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

export const qoderAgent: AgentIntegration = {
  id: "qoder",
  name: "Qoder CLI",
  description: "Qoder CLI",
  binary: "qoder",
  args: [],
  placeholder: true,
  settings: [
    {
      key: "model",
      type: "model",
      label: "Model",
      options: [
        { id: null, name: "Default" },
        { id: "llama-4", name: "Llama 4", desc: "Latest Meta model" },
        { id: "mixtral", name: "Mixtral", desc: "Mixture of experts" },
      ],
    },
  ],
  createParser: () => new QoderParser(),
  createSessionProvider: () => new QoderSessionProvider(),
  createCalculator: () => stubCalculator,
};
