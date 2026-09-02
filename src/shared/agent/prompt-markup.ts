/**
 * Markup wrappers on the live Pi system prompt so the context-ring
 * estimator can split modules / tool how-to / AGENTS.md without guessing headings.
 */

export const CAPABILITY_MODULES_OPEN = "<capability_modules>";
export const CAPABILITY_MODULES_CLOSE = "</capability_modules>";
export const TOOL_GUIDELINES_OPEN = "<tool_guidelines>";
export const TOOL_GUIDELINES_CLOSE = "</tool_guidelines>";
export const PROJECT_CONTEXT_OPEN = "<project_context>";
export const PROJECT_CONTEXT_CLOSE = "</project_context>";

export function wrapPromptMarkup(open: string, close: string, inner: string): string {
  const text = inner.trim();
  if (!text) return "";
  return `${open}\n\n${text}\n\n${close}`;
}

export function wrapCapabilityModulesMarkup(inner: string): string {
  return wrapPromptMarkup(CAPABILITY_MODULES_OPEN, CAPABILITY_MODULES_CLOSE, inner);
}

export function wrapToolGuidelinesMarkup(lines: string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  if (unique.length === 0) return "";
  const body = unique.map((line) => `- ${line}`).join("\n");
  return wrapPromptMarkup(TOOL_GUIDELINES_OPEN, TOOL_GUIDELINES_CLOSE, body);
}

export function wrapAgentsMdProjectContext(agentsMd: string): string {
  const text = agentsMd.trim();
  if (!text) return "";
  return [
    PROJECT_CONTEXT_OPEN,
    "",
    `<project_instructions path=".workbench/agent/AGENTS.md">`,
    text,
    "</project_instructions>",
    "",
    PROJECT_CONTEXT_CLOSE,
  ].join("\n");
}
