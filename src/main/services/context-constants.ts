// prism-next/src/main/services/context-constants.ts
// Context-window display constants — owned by the agent / system-prompt assembly path.

/** Fallback context window size when model metadata is unavailable (128K tokens). */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Parse a context-window label string into a numeric token count.
 *  Supports: "200K" / "1M" / "2M" (suffix), "128000" (plain number).
 *  Returns `DEFAULT_CONTEXT_WINDOW` for unrecognized formats. */
export function parseContextWindow(label?: string | null): number {
  if (!label) return DEFAULT_CONTEXT_WINDOW;
  const trimmed = label.trim();
  // Suffix form: "200K", "1M", "0.5M"
  const suffixMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(K|M)$/i);
  if (suffixMatch) {
    const value = parseFloat(suffixMatch[1]);
    const unit = suffixMatch[2].toUpperCase();
    if (unit === "M") return Math.round(value * 1_000_000);
    if (unit === "K") return Math.round(value * 1_000);
  }
  // Plain number: "128000", "200000"
  const plainMatch = trimmed.match(/^(\d+)$/);
  if (plainMatch) {
    return parseInt(plainMatch[1], 10);
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/** Two-bucket estimate schema — only what Prism can roughly measure vs remainder. */
export interface ContextCategoryDef {
  key: string;
  label: string;
  color: string;
  description?: string;
  order: number;
}

export const CONTEXT_CATEGORY_SCHEMA: ContextCategoryDef[] = [
  {
    key: "prism-side",
    label: "Prism-injected",
    color: "bg-primary",
    description: "Rough chars/4 estimate of Prism prompts, skills, and MCP config",
    order: 0,
  },
  {
    key: "session-rest",
    label: "Session / agent",
    color: "bg-muted-foreground",
    description: "Remainder of OpenCode used − Prism-side estimate (conversation, tools, agent base, cache)",
    order: 1,
  },
];

/**
 * Build the honest two-bucket breakdown.
 * `prismSide` = sum of Prism-known estimates; remainder fills to `used`.
 */
export function buildTwoBucketBreakdown(
  used: number,
  prismSideEstimate: number,
): Record<string, number> {
  const prism = Math.max(0, Math.round(prismSideEstimate));
  const rest = Math.max(0, Math.round(used) - prism);
  return {
    "prism-side": prism,
    "session-rest": rest,
  };
}
