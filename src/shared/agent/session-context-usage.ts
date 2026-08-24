/**
 * OpenCode / ACP context-window usage helpers.
 *
 * Prefer ACP `usage_update` ({ used, size }) for the ring. Fall back to
 * PromptResponse.usage fields when the notification is missing.
 */

export type ContextUsageSource = "usage_update" | "prompt_usage" | "estimate";

export interface AcpUsageUpdate {
  used: number;
  size: number;
  cost?: { amount: number; currency: string } | null;
}

export interface AcpPromptUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedReadTokens?: number;
  cachedWriteTokens?: number;
  totalTokens?: number;
  thoughtTokens?: number;
  /** Snake_case aliases (renderer / persisted). */
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  total_tokens?: number;
  thought_tokens?: number;
}

/** Parse ACP sessionUpdate usage_update (wrapped or flattened). */
export function parseAcpUsageUpdate(update: unknown): AcpUsageUpdate | null {
  if (!update || typeof update !== "object") return null;
  const u = update as Record<string, unknown>;
  const bag =
    u.sessionUpdate === "usage_update" || u.sessionUpdate === "usageUpdate"
      ? u
      : typeof u.update === "object" && u.update
        ? (u.update as Record<string, unknown>)
        : null;
  if (!bag) return null;
  const kind = bag.sessionUpdate ?? bag.session_update;
  if (kind !== "usage_update" && kind !== "usageUpdate") return null;

  const used = num(bag.used);
  const size = num(bag.size);
  if (used == null || size == null || size <= 0) return null;

  let cost: AcpUsageUpdate["cost"];
  const rawCost = bag.cost;
  if (rawCost && typeof rawCost === "object") {
    const c = rawCost as Record<string, unknown>;
    const amount = num(c.amount);
    const currency = typeof c.currency === "string" ? c.currency : null;
    if (amount != null && currency) cost = { amount, currency };
  }

  return { used: Math.max(0, Math.round(used)), size: Math.round(size), cost };
}

/**
 * Context fill from PromptResponse.usage.
 * Prefer totalTokens (closest to usage_update.used); else input + cache*.
 * Does not invent a number when all fields are missing/zero.
 */
export function resolveContextUsedFromPromptUsage(
  usage: AcpPromptUsage | null | undefined,
): number | null {
  if (!usage) return null;

  const total =
    num(usage.totalTokens) ?? num(usage.total_tokens);
  if (total != null && total > 0) return Math.round(total);

  const input =
    num(usage.inputTokens) ?? num(usage.input_tokens) ?? 0;
  const cacheWrite =
    num(usage.cachedWriteTokens) ?? num(usage.cache_creation_input_tokens) ?? 0;
  const cacheRead =
    num(usage.cachedReadTokens) ?? num(usage.cache_read_input_tokens) ?? 0;
  const sum = input + cacheWrite + cacheRead;
  return sum > 0 ? Math.round(sum) : null;
}

/** Map ACP camelCase usage → snake_case for legacy renderer footnotes. */
export function mapAcpUsageToSnake(acpUsage: AcpPromptUsage): {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_tokens?: number;
  thought_tokens?: number;
} {
  const total = num(acpUsage.totalTokens) ?? num(acpUsage.total_tokens);
  const thought = num(acpUsage.thoughtTokens) ?? num(acpUsage.thought_tokens);
  return {
    input_tokens: num(acpUsage.inputTokens) ?? num(acpUsage.input_tokens) ?? 0,
    output_tokens: num(acpUsage.outputTokens) ?? num(acpUsage.output_tokens) ?? 0,
    cache_creation_input_tokens:
      num(acpUsage.cachedWriteTokens) ?? num(acpUsage.cache_creation_input_tokens) ?? 0,
    cache_read_input_tokens:
      num(acpUsage.cachedReadTokens) ?? num(acpUsage.cache_read_input_tokens) ?? 0,
    ...(total != null ? { total_tokens: total } : {}),
    ...(thought != null ? { thought_tokens: thought } : {}),
  };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
