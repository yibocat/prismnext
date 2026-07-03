/**
 * Normalize library citation markers in agent text for parsers and enrich layers.
 * Does not invent bibkeys — only canonicalizes spacing inside `[@bibkey]`.
 */
const BRACKETED_LOOSE_RE = /\[\s*@\s*([A-Za-z0-9][A-Za-z0-9:_-]*)\s*\]/g;

export function normalizeLibraryCiteMarkers(text: string): string {
  if (!text.includes("@")) return text;
  return text.replace(BRACKETED_LOOSE_RE, "[@$1]");
}
