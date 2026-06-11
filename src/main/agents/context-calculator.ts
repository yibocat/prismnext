// src/main/agents/context-calculator.ts
//
// Core interfaces for the agent-agnostic context token calculation layer.
//
// ## Design Philosophy
//
// Context tokens fall into three buckets:
//
//   1. EXACT — what Prism controls and injects (system prompt, rules, skills,
//      tools, MCP config, plugins). These are tokenized directly from actual
//      file content or string literals. When a feature isn't built yet, the
//      category stays at 0 with a TODO comment — no guessing.
//
//   2. ESTIMATED — the conversation itself. We tokenize the user's prompt and
//      scale up for the assistant response. The only category we estimate.
//
//   3. REMAINDER — everything inside the agent CLI's black box. Claude Code's
//      internal system prompt, built-in tool definitions, cache overhead,
//      message formatting — we CAN'T see these, so we DON'T guess. Raw math:
//      agentOverhead = total - sum(exact) - sum(estimated).
//
// ## Adding a new agent
//
// Each agent's calculator declares its own categories via `categories[]`.
// The same Prism-controlled exact categories apply to ALL agents because
// Prism injects the same system prompt, rules, and skills regardless of
// which agent backend is active. Use the shared `PRISM_EXACT_CATEGORIES`
// as a starting point, then add agent-specific categories if needed.
//
// See ClaudeCalculator (claude/calculator.ts) for the reference implementation.

import type { ResolvedContext } from "./types";

// ─── Category Definition ───

export interface CategoryDef {
  /** Unique key within this agent, e.g. "systemPrompt", "rules" */
  key: string;
  /** Display label shown in the hover card legend */
  label: string;
  /** Tailwind background class for the stacked bar segment + legend dot */
  color: string;
  /** How this category's token count is computed.
   *
   *  - "exact":     Tokenized from actual content (file or string).
   *                 Returns 0 if the content doesn't exist — never guessed.
   *  - "estimated": Heuristic based on available data (e.g. prompt length).
   *                 Only used for conversation — the one thing we can approximate.
   *  - "remainder": totalTokens − sum(exact) − sum(estimated).
   *                 Absorbs agent-internal overhead we can't see.
   *                 Exactly ONE category per calculator must use this strategy. */
  strategy: "exact" | "estimated" | "remainder";
  /** Optional tooltip explaining what is counted */
  description?: string;
  /** Sort order in the stacked bar (lower = leftmost). Default 0. */
  order?: number;
}

// ─── Tokenizer Interface ───

export interface Tokenizer {
  /** Count tokens in a plain text string. Never throws. */
  countText(text: string): number;
  /** Count tokens across files matching `pattern` in a directory (non-recursive).
   *  `pattern` tests against filenames (e.g. /\.(md|tex|txt)$/i). Never throws. */
  countDir(dirPath: string, pattern?: RegExp): number;
}

// ─── Calculation Input/Output ───

export interface CalcInput {
  /** Total input tokens reported by the agent API (input + cache_create + cache_read) */
  totalTokens: number;
  /** Project context resolved from the filesystem.
   *  Contains actual content of Prism-controlled components (system prompt,
   *  CLAUDE.md text, skills directory path, etc.) — all available for exact
   *  tokenization. */
  resolvedContext: ResolvedContext;
  /** Injected tokenizer — model-family-aware */
  tokenizer: Tokenizer;
  /** Active model ID, for potential model-specific estimation tuning */
  modelId?: string;
  /** The user's latest prompt text, for conversation token estimation.
   *  When set, calculators should tokenize it to produce a better
   *  conversation estimate. When absent (replay/error), fall back. */
  lastUserPrompt?: string;
}

export interface CalcOutput {
  /** Token count per category key. Keys match CategoryDef.key.
   *  Sum of all values should equal `total`. */
  categories: Record<string, number>;
  /** Sum of all category values (should ≈ totalTokens, modulo rounding) */
  total: number;
}

// ─── ContextCalculator Interface ───

export interface ContextCalculator {
  /** Agent ID this calculator is for */
  readonly agentId: string;
  /** Categories declared by this agent — drives the UI rendering.
   *  Must include exactly ONE category with strategy "remainder". */
  readonly categories: CategoryDef[];
  /** Compute the token breakdown for a completed turn.
   *
   *  Implementations MUST:
   *  - Tokenize exact categories from resolvedContext (never guess).
   *  - Estimate conversation from lastUserPrompt (or fall back).
   *  - Let remainder absorb everything the agent hides.
   *
   *  Implementations MUST NOT:
   *  - Hardcode guesses for agent-internal overhead.
   *  - Throw — catch internally and return best-effort data. */
  calculate(input: CalcInput): CalcOutput;
}

// ─── Shared Prism Base Categories ───
//
// These exact categories apply to ALL agents because Prism injects the
// same system prompt, rules, and skills regardless of the agent backend.
// Use as a starting point in each agent's calculator, then add
// agent-specific categories below them.

// Ordered by visual priority: agent overhead first (largest, most honest),
// then Prism-controlled components, then conversation last.
export const PRISM_EXACT_CATEGORIES: CategoryDef[] = [
  {
    key: "systemPrompt",
    label: "System Prompt",
    color: "bg-blue-500",
    strategy: "exact",
    description: "Prism application system prompt (injected into every agent)",
    order: 2,
  },
  {
    key: "rules",
    label: "Rules",
    color: "bg-amber-500",
    strategy: "exact",
    description: "CLAUDE.md + project rules content",
    order: 3,
  },
  {
    key: "skills",
    label: "Skills",
    color: "bg-violet-500",
    strategy: "exact",
    description: "Project and agent-level skill definitions (.md files)",
    order: 4,
  },
  {
    key: "tools",
    label: "Tools",
    color: "bg-emerald-500",
    strategy: "exact",
    description: "Prism-defined tool definitions",
    order: 5,
  },
  {
    key: "mcp",
    label: "MCP",
    color: "bg-cyan-500",
    strategy: "exact",
    description: "MCP server configurations",
    order: 6,
  },
  {
    key: "plugins",
    label: "Plugins",
    color: "bg-pink-500",
    strategy: "exact",
    description: "Agent plugin definitions",
    order: 7,
  },
];

export const CONVERSATION_CATEGORY: CategoryDef = {
  key: "conversation",
  label: "Conversation",
  color: "bg-gray-500",
  strategy: "estimated",
  description: "User + assistant messages (estimated from prompt length)",
  order: 8,
};

export const AGENT_OVERHEAD_CATEGORY: CategoryDef = {
  key: "agentOverhead",
  label: "Agent Overhead",
  color: "bg-slate-500",
  strategy: "remainder",
  description: "Agent-internal context we can't see — internal prompt, tool defs, cache, formatting",
  order: 1,
};

// ─── Shared Helpers ───

/**
 * Compute exact token counts for all Prism-controlled components.
 *
 * Returns a partial Record that each calculator merges with its own
 * agent-specific categories.
 *
 * All categories return 0 when their source content is absent —
 * we never guess what we can't measure.
 */
export function computePrismExactTokens(
  resolvedContext: ResolvedContext,
  tokenizer: Tokenizer,
): Record<string, number> {
  return {
    systemPrompt: tokenizer.countText(resolvedContext.appSystemPrompt),
    rules: resolvedContext.rules ? tokenizer.countText(resolvedContext.rules) : 0,
    skills: resolvedContext.skillsDir ? tokenizer.countDir(resolvedContext.skillsDir) : 0,

    // ── TODO: Not yet built at the application layer ──────────────────
    // These categories are placeholders. When Prism implements its own
    // tool definitions, MCP configuration, and plugin system, replace
    // the hardcoded 0s with actual tokenization calls:
    //
    //   tools:   resolvedContext.toolsDir   ? tokenizer.countDir(...)  : 0
    //   mcp:     resolvedContext.mcpConfig  ? tokenizer.countText(...) : 0
    //   plugins: resolvedContext.pluginsDir ? tokenizer.countDir(...)  : 0
    //
    // For now they are legitimately zero — Prism doesn't inject any
    // of these yet. They are NOT estimated because we don't guess.
    tools: 0,
    mcp: 0,
    plugins: 0,
  };
}

/**
 * Estimate conversation tokens from the user's latest prompt.
 *
 * Tokenizes the actual user prompt string, then scales up to account for
 * the assistant response and message formatting overhead.
 *
 * When no prompt is available (replay / error path), falls back to a
 * conservative percentage of total — this is intentionally LOW because
 * the remainder will absorb any underestimation.
 */
export function estimateConversationTokens(
  userPrompt: string | undefined,
  tokenizer: Tokenizer,
  totalTokens: number,
): number {
  if (userPrompt) {
    const userTokens = tokenizer.countText(userPrompt);
    const estimated = userTokens + Math.max(30, userTokens * 2);
    return Math.min(estimated, Math.round(totalTokens * 0.5));
  }
  return Math.min(500, Math.round(totalTokens * 0.03));
}
