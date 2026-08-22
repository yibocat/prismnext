/**
 * Pi context-window occupancy vs session spend.
 *
 * Occupancy is the current prompt window (grows with the conversation).
 * Spend is billed USD across every LLM call in the session (must accumulate).
 */

export const CONTEXT_BREAKDOWN_KEYS = [
  "systemPrompt",
  "tools",
  "rules",
  "skills",
  "mcp",
  "subagents",
  "summarized",
  "conversation",
] as const;

export type ContextBreakdownKey = (typeof CONTEXT_BREAKDOWN_KEYS)[number];

export type ContextUsageBreakdown = Partial<Record<ContextBreakdownKey, number>>;

export interface PiUsageFields {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: { total?: number };
}

export interface SessionUsageTotals {
  /** Current context-window fill. Null after compact until the next model reply. */
  occupancyTokens: number | null;
  windowSize: number | null;
  /** Cumulative session spend in USD. */
  costUsd: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  breakdown?: ContextUsageBreakdown;
  updatedAt: number;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Pi footer occupancy: native totalTokens, else input + output + cache*.
 * Zero / missing usage is unknown, not an empty window.
 */
export function occupancyFromPiUsage(usage: PiUsageFields | null | undefined): number | null {
  if (!usage) return null;
  const total = num(usage.totalTokens);
  if (total > 0) return Math.round(total);
  const sum = num(usage.input) + num(usage.output) + num(usage.cacheRead) + num(usage.cacheWrite);
  return sum > 0 ? Math.round(sum) : null;
}

export function costFromPiUsage(usage: PiUsageFields | null | undefined): number | null {
  const total = usage?.cost?.total;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

/** Fit estimated buckets onto billed occupancy so the stacked bar sums to the ring. */
export function fitBreakdownToOccupancy(
  parts: ContextUsageBreakdown,
  occupancy: number | null,
): ContextUsageBreakdown {
  const staticKeys = CONTEXT_BREAKDOWN_KEYS.filter((key) => key !== "conversation");
  const next: ContextUsageBreakdown = {};
  let staticSum = 0;
  for (const key of staticKeys) {
    const n = Math.max(0, Math.round(parts[key] ?? 0));
    if (n > 0) {
      next[key] = n;
      staticSum += n;
    }
  }
  const conversationEst = Math.max(0, Math.round(parts.conversation ?? 0));

  if (occupancy == null || occupancy <= 0) {
    if (conversationEst > 0) next.conversation = conversationEst;
    return next;
  }

  if (staticSum >= occupancy) {
    if (staticSum === 0) return { conversation: occupancy };
    const scale = occupancy / staticSum;
    const scaled: ContextUsageBreakdown = {};
    let used = 0;
    const present = staticKeys.filter((key) => (next[key] ?? 0) > 0);
    for (let i = 0; i < present.length; i++) {
      const key = present[i]!;
      if (i === present.length - 1) {
        const rest = occupancy - used;
        if (rest > 0) scaled[key] = rest;
      } else {
        const v = Math.max(0, Math.round((next[key] ?? 0) * scale));
        if (v > 0) {
          scaled[key] = v;
          used += v;
        }
      }
    }
    return scaled;
  }

  next.conversation = occupancy - staticSum;
  return next;
}

export function occupancyExceedsWindow(
  occupancy: number | null | undefined,
  windowSize: number,
): boolean {
  return typeof occupancy === "number"
    && occupancy > 0
    && windowSize > 0
    && occupancy > windowSize;
}

export function breakdownTotal(parts: ContextUsageBreakdown | null | undefined): number {
  if (!parts) return 0;
  let sum = 0;
  for (const key of CONTEXT_BREAKDOWN_KEYS) {
    sum += Math.max(0, parts[key] ?? 0);
  }
  return sum;
}

export function estimateCostUsd(
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number },
  rates?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } | null,
): number {
  if (!rates) return 0;
  const perM = 1_000_000;
  return (
    (tokens.input * (rates.input ?? 0)
      + tokens.output * (rates.output ?? 0)
      + tokens.cacheRead * (rates.cacheRead ?? 0)
      + tokens.cacheWrite * (rates.cacheWrite ?? 0))
    / perM
  );
}

/** Segment widths as a fraction of the full context window (not of consumed tokens). */
export function contextBarSegments(
  breakdown: ContextUsageBreakdown | null | undefined,
  occupancy: number,
  windowSize: number,
): Array<{ key: ContextBreakdownKey; tokens: number; widthPct: number }> {
  if (windowSize <= 0) return [];
  const source = breakdown && breakdownTotal(breakdown) > 0
    ? breakdown
    : occupancy > 0
      ? { conversation: occupancy } satisfies ContextUsageBreakdown
      : null;
  if (!source) return [];
  return CONTEXT_BREAKDOWN_KEYS.flatMap((key) => {
    const tokens = source[key] ?? 0;
    if (tokens <= 0) return [];
    return [{ key, tokens, widthPct: (tokens / windowSize) * 100 }];
  });
}

export function usageTotalsFromTurns(
  turns: Array<{
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      costUsd?: number;
    };
  }>,
): SessionUsageTotals | null {
  let costUsd = 0;
  let occupancyTokens: number | null = null;
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let saw = false;
  for (const turn of turns) {
    const usage = turn.usage;
    if (!usage) continue;
    saw = true;
    input = num(usage.inputTokens);
    output = num(usage.outputTokens);
    cacheRead = num(usage.cacheReadTokens);
    cacheWrite = num(usage.cacheWriteTokens);
    if (typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd)) {
      costUsd += usage.costUsd;
    }
    if (typeof usage.inputTokens === "number" && usage.inputTokens > 0) {
      occupancyTokens = Math.round(usage.inputTokens);
    }
  }
  if (!saw) return null;
  return {
    occupancyTokens,
    windowSize: null,
    costUsd,
    input,
    output,
    cacheRead,
    cacheWrite,
    updatedAt: Date.now(),
  };
}
