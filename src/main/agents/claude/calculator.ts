// src/main/agents/claude/calculator.ts
// ClaudeCalculator — reference implementation of the ContextCalculator pattern.
//
// Design: exact (Prism-controlled) + estimated (conversation) + remainder (agent black box).
// We NEVER guess Claude Code's internal consumption. Everything we can't tokenize
// from actual content lands in agentOverhead.

import type { ContextCalculator, CalcInput, CalcOutput } from "../context-calculator";
import {
  PRISM_EXACT_CATEGORIES,
  CONVERSATION_CATEGORY,
  AGENT_OVERHEAD_CATEGORY,
  computePrismExactTokens,
  estimateConversationTokens,
} from "../context-calculator";

// Claude's categories = Prism base + conversation + agent overhead.
// No Claude-specific estimation categories — we don't guess what's inside the CLI.
const CLAUDE_CATEGORIES = [
  ...PRISM_EXACT_CATEGORIES,
  CONVERSATION_CATEGORY,
  AGENT_OVERHEAD_CATEGORY,
];

export class ClaudeCalculator implements ContextCalculator {
  readonly agentId = "claude";
  readonly categories = CLAUDE_CATEGORIES;

  calculate(input: CalcInput): CalcOutput {
    const { totalTokens, resolvedContext, tokenizer } = input;

    // Exact: Prism-controlled components
    const exact = computePrismExactTokens(resolvedContext, tokenizer);

    // Estimated: conversation
    const conversation = estimateConversationTokens(input.lastUserPrompt, tokenizer, totalTokens);

    // Remainder: everything inside Claude Code's black box
    const accounted = Object.values(exact).reduce((sum, v) => sum + v, 0) + conversation;
    const agentOverhead = Math.max(0, totalTokens - accounted);

    return {
      categories: { ...exact, conversation, agentOverhead },
      total: totalTokens,
    };
  }
}
