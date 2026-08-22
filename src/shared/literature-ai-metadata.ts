export type AiMetadataLlmResult = {
  summary: string;
  keywords: string[];
};

export const AI_METADATA_KEYWORD_MIN = 3;
export const AI_METADATA_KEYWORD_MAX = 6;
/** Prompt guidance only — not enforced on stored/displayed summary. */
export const AI_METADATA_SUMMARY_MAX_LENGTH = 180;

export function buildAiMetadataPrompt(
  title: string,
  abstractText: string,
  keywordHints: readonly string[],
): string {
  const hints =
    keywordHints.length > 0
      ? `\nOptional keyword hints from PDF: ${keywordHints.join(", ")}`
      : "";
  return `You analyze academic paper metadata. Reply with JSON only, no markdown fences.

Title: ${title}

Abstract:
${abstractText.slice(0, 6000)}${hints}

Return:
{"summary":"Two or three plain sentences (aim for about ${AI_METADATA_SUMMARY_MAX_LENGTH} characters, no markdown).","keywords":["3 to 6 short noun phrases"]}`;
}

export function parseAiMetadataLlmJson(raw: string): AiMetadataLlmResult | null {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as { summary?: unknown; keywords?: unknown };
    if (typeof parsed.summary !== "string") return null;
    if (!Array.isArray(parsed.keywords)) return null;
    const keywords = parsed.keywords.filter((k): k is string => typeof k === "string");
    return { summary: parsed.summary.trim(), keywords };
  } catch {
    return null;
  }
}
