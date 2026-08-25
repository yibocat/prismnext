export const MAX_PAPER_TAG_LENGTH = 32;
export const MAX_PAPER_TAGS_PER_PAPER = 20;

const EDGE_PUNCT = /^[.,;:!?'"`[\](){}]+|[.,;:!?'"`[\](){}]+$/g;

/** Normalize separators: _/\ and most hyphens → space; keep letter-digit version hyphens (gpt-4). */
function normalizeTagSeparators(s: string): string {
  const versionHyphen = "\u0001";
  const withVersionMarkers = s.replace(/(?<=[a-zA-Z])-(?=\d)/g, versionHyphen);
  const spaced = withVersionMarkers.replace(/[-_/\\]+/g, " ");
  return spaced.split(versionHyphen).join("-");
}

/** Stable identity — two tags with the same key are the same tag. */
export function paperTagKey(raw: string): string {
  let s = raw.normalize("NFKC").trim();
  s = normalizeTagSeparators(s);
  s = s.toLowerCase().replace(/\s+/g, " ").trim();
  s = s.replace(EDGE_PUNCT, "").trim();
  return s;
}

export function isValidPaperTagKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_PAPER_TAG_LENGTH;
}

/** Normalize a single user tag (trim, collapse spaces, length cap). */
export function normalizePaperTag(raw: string): string | null {
  const trimmed = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > MAX_PAPER_TAG_LENGTH) return null;
  const key = paperTagKey(trimmed);
  if (!isValidPaperTagKey(key)) return null;
  return trimmed;
}

/**
 * Pick canonical display for this key.
 * If any paper in project already has a tag with same key, reuse that display casing/spacing.
 */
export function resolvePaperTagDisplay(
  raw: string,
  existingProjectTags: readonly string[],
): string | null {
  const key = paperTagKey(raw);
  if (!isValidPaperTagKey(key)) return null;
  for (const existing of existingProjectTags) {
    if (paperTagKey(existing) === key) return normalizePaperTag(existing) ?? existing;
  }
  return normalizePaperTag(raw);
}

export function normalizePaperTagsWithCatalog(
  tags: readonly string[],
  existingProjectTags: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const display = resolvePaperTagDisplay(raw, [...existingProjectTags, ...out]);
    if (!display) continue;
    const key = paperTagKey(display);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
    if (out.length >= MAX_PAPER_TAGS_PER_PAPER) break;
  }
  return out;
}

/** Dedupe tags by canonical key; preserve first display in list. Prefer WithCatalog at write boundaries. */
export function normalizePaperTags(tags: readonly string[]): string[] {
  return normalizePaperTagsWithCatalog(tags, []);
}

export function parsePaperTagsJson(json: string | null | undefined): string[] {
  if (!json?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return normalizePaperTags(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return [];
  }
}

export function serializePaperTagsJson(tags: readonly string[]): string | null {
  const normalized = normalizePaperTags(tags);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

/** Stable palette index from tag text (same tag → same color). */
export function paperTagToneIndex(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return hash % PAPER_TAG_TONE_COUNT;
}

export const PAPER_TAG_TONE_COUNT = 8;

/** Tailwind tone classes for user tag pills — border / fill / text. */
export const PAPER_TAG_TONE_CLASSES = [
  "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  "border-violet-500/35 bg-violet-500/10 text-violet-800 dark:text-violet-300",
  "border-rose-500/35 bg-rose-500/10 text-rose-800 dark:text-rose-300",
  "border-orange-500/35 bg-orange-500/10 text-orange-800 dark:text-orange-300",
  "border-teal-500/35 bg-teal-500/10 text-teal-800 dark:text-teal-300",
  "border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-800 dark:text-fuchsia-300",
] as const;

export function paperTagToneClass(tag: string): string {
  return PAPER_TAG_TONE_CLASSES[paperTagToneIndex(tag)] ?? PAPER_TAG_TONE_CLASSES[0];
}

/** Solid dot for compact menu rows (suggest / filter lists). */
export const PAPER_TAG_DOT_CLASSES = [
  "bg-amber-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-fuchsia-500",
] as const;

export function paperTagDotClass(tag: string): string {
  return PAPER_TAG_DOT_CLASSES[paperTagToneIndex(tag)] ?? PAPER_TAG_DOT_CLASSES[0];
}
