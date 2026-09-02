import { wrapToolGuidelinesMarkup } from "../../shared/agent/prompt-markup";

/** Collect unique promptGuidelines from Pi / native tool definitions. */
export function collectPromptGuidelines(
  tools: Array<{ promptGuidelines?: string[] }>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    for (const line of tool.promptGuidelines ?? []) {
      const trimmed = line.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Pi skips `promptGuidelines` when a custom system prompt is set.
 * Append this block via ClosedResourceLoader so the model still sees tool how-to.
 */
export function formatToolGuidelinesPrompt(
  tools: Array<{ promptGuidelines?: string[] }>,
): string {
  return wrapToolGuidelinesMarkup(collectPromptGuidelines(tools));
}
