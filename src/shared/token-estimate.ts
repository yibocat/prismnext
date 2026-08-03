/** BPE encoding used for Prism-side token estimates (js-tiktoken rank). */
export const PROMPT_TOKEN_ENCODING = "o200k_base" as const;

export type PromptTokenEncoding = typeof PROMPT_TOKEN_ENCODING;

export interface PromptTokenEstimate {
  tokenCount: number;
  charCount: number;
  encoding: PromptTokenEncoding;
}

/** Human-readable token count for Settings UI (e.g. 12.4k). */
export function formatTokenCount(count: number): string {
  const n = Math.max(0, Math.round(count));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}
