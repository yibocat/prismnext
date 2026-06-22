import type { ComposerPart } from "./tokens";

/** Private-use marker wrapping a token id inside the CodeMirror document. */
export const TOKEN_MARKER_START = "\uE000";
export const TOKEN_MARKER_END = "\uE001";

export function tokenMarker(tokenId: string): string {
  return `${TOKEN_MARKER_START}${tokenId}${TOKEN_MARKER_END}`;
}

const MARKER_RE = /\uE000([^\uE001]+)\uE001/g;

export function partsToDoc(parts: ComposerPart[]): { doc: string; tokenMap: Map<string, ComposerPart> } {
  const tokenMap = new Map<string, ComposerPart>();
  let doc = "";
  for (const part of parts) {
    if (part.type === "text") {
      doc += part.text;
    } else {
      tokenMap.set(part.id, part);
      doc += tokenMarker(part.id);
    }
  }
  return { doc, tokenMap };
}

export function docToParts(doc: string, tokenMap: Map<string, ComposerPart>): ComposerPart[] {
  const parts: ComposerPart[] = [];
  let lastIndex = 0;
  MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_RE.exec(doc)) !== null) {
    const before = doc.slice(lastIndex, match.index);
    if (before) parts.push({ type: "text", text: before });
    const tokenId = match[1];
    const token = tokenMap.get(tokenId);
    if (token) parts.push(token);
    else parts.push({ type: "text", text: match[0] });
    lastIndex = match.index + match[0].length;
  }
  const tail = doc.slice(lastIndex);
  if (tail) parts.push({ type: "text", text: tail });
  return mergeAdjacentText(parts);
}

export function mergeAdjacentText(parts: ComposerPart[]): ComposerPart[] {
  const merged: ComposerPart[] = [];
  for (const part of parts) {
    if (part.type === "text" && merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.type === "text") {
        prev.text += part.text;
        continue;
      }
    }
    if (part.type === "text" && !part.text) continue;
    merged.push(part.type === "text" ? { ...part } : { ...part });
  }
  return merged;
}

export function parseDraftJson(raw: string | undefined): ComposerPart[] {
  if (!raw) return [{ type: "text", text: "" }];
  try {
    const parsed = JSON.parse(raw) as { parts?: ComposerPart[] };
    if (Array.isArray(parsed.parts) && parsed.parts.length > 0) {
      return mergeAdjacentText(parsed.parts);
    }
  } catch {
    // legacy plain string
  }
  return [{ type: "text", text: raw }];
}

export function draftToJson(parts: ComposerPart[]): string {
  return JSON.stringify({ parts: mergeAdjacentText(parts) });
}
