import type { ComposerPart } from "@/lib/chat/composer-parts";
import { mergeAdjacentText } from "@/lib/chat/composer-parts";

/** One doc character per inline token — atomic, same index as visual chip. */
export const TOKEN_OBJECT = "\uFFFC";

/** Visible separator after each auto-inserted token. */
export const TOKEN_BOUNDARY_SEP = " ";

/** @deprecated Legacy invisible gap. */
export const TOKEN_BOUNDARY_GAP = "\u200B";

/** @deprecated Legacy multi-char marker start. */
export const TOKEN_MARKER_START = "\uE000";
/** @deprecated Legacy multi-char marker end. */
export const TOKEN_MARKER_END = "\uE001";

const LEGACY_MARKER_RE = /\uE000([^\uE001]+)\uE001/g;

export function isAutoTokenSeparator(ch: string | undefined): boolean {
  return ch === TOKEN_BOUNDARY_SEP || ch === TOKEN_BOUNDARY_GAP;
}

export function isTokenObject(ch: string | undefined): boolean {
  return ch === TOKEN_OBJECT;
}

/** Compare docs ignoring auto separators after tokens (for linkify diff). */
export function stripTokenSeparators(doc: string): string {
  const withoutLegacy = doc.replaceAll(TOKEN_BOUNDARY_GAP, "");
  return withoutLegacy.replace(new RegExp(`${TOKEN_OBJECT} `, "g"), TOKEN_OBJECT);
}

/** @deprecated Use {@link stripTokenSeparators}. */
export function stripBoundaryGaps(doc: string): string {
  return stripTokenSeparators(doc);
}

/** @deprecated Legacy marker string; use {@link TOKEN_OBJECT}. */
export function tokenMarker(_tokenId: string): string {
  return TOKEN_OBJECT;
}

export type PositionTokenMap = Map<number, ComposerPart>;

export function orderedPartsFromMap(tokenMap: PositionTokenMap): ComposerPart[] {
  return [...tokenMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, part]) => part);
}

export function rebuildTokenMapFromDoc(
  doc: string,
  orderedParts: ComposerPart[],
): PositionTokenMap {
  const map: PositionTokenMap = new Map();
  let idx = 0;
  for (let i = 0; i < doc.length; i++) {
    if (doc[i] !== TOKEN_OBJECT) continue;
    const part = orderedParts[idx++];
    if (part && part.type !== "text") map.set(i, part);
  }
  return map;
}

/** Drop a leading space on text immediately after a token — partsToDoc already adds one. */
export function collapseRedundantTokenSeparators(parts: ComposerPart[]): ComposerPart[] {
  const result: ComposerPart[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      const prev = result[result.length - 1];
      if (prev && prev.type !== "text") {
        const stripped = part.text.replace(/^ /, "");
        if (stripped) result.push({ type: "text", text: stripped });
        continue;
      }
      if (!part.text) continue;
    }
    result.push(part);
  }
  return mergeAdjacentText(result);
}

export function partsToDoc(parts: ComposerPart[]): { doc: string; tokenMap: PositionTokenMap } {
  const tokenMap: PositionTokenMap = new Map();
  let doc = "";
  for (const part of collapseRedundantTokenSeparators(parts)) {
    if (part.type === "text") {
      doc += part.text;
      continue;
    }
    const pos = doc.length;
    tokenMap.set(pos, part);
    doc += TOKEN_OBJECT + TOKEN_BOUNDARY_SEP;
  }
  return { doc, tokenMap };
}

export function docToParts(doc: string, tokenMap: PositionTokenMap): ComposerPart[] {
  const migrated = migrateLegacyDocIfNeeded(doc, tokenMap);
  doc = migrated.doc;
  tokenMap = migrated.tokenMap;

  const ordered = orderedPartsFromMap(tokenMap);
  const parts: ComposerPart[] = [];
  let textBuf = "";
  let tokenIdx = 0;

  for (let i = 0; i < doc.length; i++) {
    const ch = doc[i]!;
    if (ch === TOKEN_OBJECT) {
      if (textBuf) {
        parts.push({ type: "text", text: textBuf });
        textBuf = "";
      }
      const token = ordered[tokenIdx++];
      if (token && token.type !== "text") parts.push(token);
      if (isAutoTokenSeparator(doc[i + 1])) i++;
      continue;
    }
    textBuf += ch;
  }

  if (textBuf) parts.push({ type: "text", text: textBuf });
  return mergeAdjacentText(parts);
}

function migrateLegacyDocIfNeeded(
  doc: string,
  tokenMap: PositionTokenMap,
): { doc: string; tokenMap: PositionTokenMap } {
  if (!doc.includes(TOKEN_MARKER_START)) return { doc, tokenMap };

  const legacyById = new Map<string, ComposerPart>();
  for (const part of orderedPartsFromMap(tokenMap)) {
    if (part.type !== "text") legacyById.set(part.id, part);
  }

  const parts: ComposerPart[] = [];
  let lastIndex = 0;
  LEGACY_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LEGACY_MARKER_RE.exec(doc)) !== null) {
    const before = doc.slice(lastIndex, match.index);
    if (before) parts.push({ type: "text", text: before });
    const tokenId = match[1];
    const token = legacyById.get(tokenId);
    if (token) parts.push(token);
    lastIndex = match.index + match[0].length;
    if (isAutoTokenSeparator(doc[lastIndex])) lastIndex++;
  }
  const tail = doc.slice(lastIndex);
  if (tail) parts.push({ type: "text", text: tail });

  return partsToDoc(mergeAdjacentText(parts));
}

/** Migrate legacy ZWSP separators to normal spaces. */
export function repairTokenSeparators(doc: string): { doc: string; changed: boolean } {
  if (!doc.includes(TOKEN_BOUNDARY_GAP)) return { doc, changed: false };
  return { doc: doc.replaceAll(TOKEN_BOUNDARY_GAP, TOKEN_BOUNDARY_SEP), changed: true };
}

/** Map cursor by plain-text offset (ignoring token object chars and auto separators). */
export function plainTextOffsetToDocPos(doc: string, plainOffset: number): number {
  let plain = 0;
  for (let i = 0; i < doc.length; i++) {
    if (plain >= plainOffset) return i;
    const ch = doc[i]!;
    if (ch === TOKEN_OBJECT) {
      if (isAutoTokenSeparator(doc[i + 1])) i++;
      continue;
    }
    plain++;
  }
  return doc.length;
}

export function docPosToPlainTextOffset(doc: string, pos: number): number {
  let plain = 0;
  const clamped = Math.max(0, Math.min(pos, doc.length));
  for (let i = 0; i < clamped; i++) {
    const ch = doc[i]!;
    if (ch === TOKEN_OBJECT) {
      if (isAutoTokenSeparator(doc[i + 1])) i++;
      continue;
    }
    plain++;
  }
  return plain;
}

export function plainTextLength(parts: ComposerPart[]): number {
  let n = 0;
  for (const part of parts) {
    if (part.type === "text") n += part.text.length;
  }
  return n;
}

/** Split parts at plain-text offsets (tokens contribute 0 plain chars). */
export function splitPartsAtPlainRange(
  parts: ComposerPart[],
  from: number,
  to: number,
): { before: ComposerPart[]; after: ComposerPart[] } {
  const [before, rest] = splitPartsAtPlainOffset(parts, from);
  const [, after] = splitPartsAtPlainOffset(rest, Math.max(0, to - from));
  return { before: mergeAdjacentText(before), after: mergeAdjacentText(after) };
}

function splitPartsAtPlainOffset(parts: ComposerPart[], offset: number): [ComposerPart[], ComposerPart[]] {
  if (offset <= 0) return [[], parts];
  let pos = 0;
  const before: ComposerPart[] = [];
  const after: ComposerPart[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      const len = part.text.length;
      if (pos + len <= offset) {
        before.push(part);
        pos += len;
        continue;
      }
      if (pos >= offset) {
        after.push(part);
        continue;
      }
      const idx = offset - pos;
      if (idx > 0) before.push({ type: "text", text: part.text.slice(0, idx) });
      if (idx < len) after.push({ type: "text", text: part.text.slice(idx) });
      pos = offset;
      continue;
    }
    if (pos < offset) before.push(part);
    else after.push(part);
  }
  return [mergeAdjacentText(before), mergeAdjacentText(after)];
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
