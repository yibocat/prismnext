/**
 * Human-readable BibTeX cite keys for the project library.
 * Opaque Zotero/BBT keys (e.g. N98JPVKU) are replaced with author+year+title slugs.
 */

export interface BibkeyAuthorPart {
  given?: string;
  family?: string;
  name?: string;
}

function asciiLettersDigits(value: string, maxLen: number): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, maxLen);
}

function firstAuthorFamily(authors: string | null | undefined): string | null {
  if (!authors?.trim()) return null;
  try {
    const parsed = JSON.parse(authors) as BibkeyAuthorPart[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const a = parsed[0]!;
    if (a.family?.trim()) return asciiLettersDigits(a.family.trim(), 16);
    if (a.name?.trim()) {
      const parts = a.name.trim().split(/\s+/);
      const last = parts[parts.length - 1];
      return last ? asciiLettersDigits(last, 16) : null;
    }
    return null;
  } catch {
    const comma = authors.indexOf(",");
    const token = (comma >= 0 ? authors.slice(0, comma) : authors).trim().split(/\s+/).pop();
    return token ? asciiLettersDigits(token, 16) : null;
  }
}

function titleSlugForBibkey(title: string, maxLen = 16): string {
  const cleaned = title
    .trim()
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/\s+/g, " ");
  const firstWord = cleaned.split(/\s+/)[0] ?? cleaned;
  return asciiLettersDigits(firstWord, maxLen);
}

/** Zotero random / item-key style keys that are not meaningful for \cite{}. */
export function isOpaqueBibkey(key: string): boolean {
  const k = key.trim();
  if (!k) return true;
  // Classic author+year patterns: vaswani2017attention, smith_2024
  if (/[a-z]/.test(k) && /\d{4}/.test(k)) return false;
  if (k.includes("_") && /[a-z]/.test(k)) return false;
  if (/^[a-z]+[0-9]{4}[a-z0-9]+$/i.test(k)) return false;
  // Zotero default: ABCD1234
  if (/^[A-Z0-9]{6,12}$/.test(k)) return true;
  // Zotero item key fallback (8 lowercase alnum, no year)
  if (/^[a-z0-9]{8}$/.test(k) && !/\d{4}/.test(k)) return true;
  return false;
}

/** Suggest a readable cite key: author + year + title word (e.g. vaswani2017attention). */
export function suggestBibkey(
  title: string,
  year?: number | null,
  authors?: string | null,
): string {
  const author = firstAuthorFamily(authors);
  const titlePart = titleSlugForBibkey(title);
  const y =
    year != null && Number.isFinite(year) && year > 0 ? String(Math.trunc(year)) : null;

  if (author && y && titlePart) return `${author}${y}${titlePart}`;
  if (author && y) return `${author}${y}`;
  if (author && titlePart) return `${author}${titlePart}`;

  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return y ? `${base || "paper"}_${y}` : base || "paper";
}

/**
 * Pick the project cite key from an incoming Zotero/BibTeX key.
 * Keeps readable keys; replaces opaque ones with a suggested slug.
 */
export function resolveIncomingBibkey(
  incoming: string | null | undefined,
  title: string,
  year?: number | null,
  authors?: string | null,
): string {
  const trimmed = incoming?.trim();
  if (trimmed && !isOpaqueBibkey(trimmed)) return trimmed;
  return suggestBibkey(title, year, authors);
}

/** When upgrading an existing row, keep user-chosen readable keys. */
export function resolveStoredBibkey(
  existingBibkey: string,
  incoming: string | null | undefined,
  title: string,
  year?: number | null,
  authors?: string | null,
): string {
  if (existingBibkey.trim() && !isOpaqueBibkey(existingBibkey)) return existingBibkey.trim();
  return resolveIncomingBibkey(incoming ?? existingBibkey, title, year, authors);
}

/** Replace the cite key in a raw BibTeX entry header when the user renames a paper. */
export function patchRawBibtexKey(raw: string | null | undefined, newKey: string): string | null {
  if (!raw?.trim()) return null;
  const next = raw.replace(/^@([A-Za-z]+)\s*\{\s*[^,\s]+\s*,/m, `@$1{${newKey},`);
  return next === raw ? null : next;
}

/** Short label for @-mentions and dropdowns (the cite key users type in \\cite{}). */
export function formatPaperMentionLabel(bibkey: string): string {
  return bibkey.trim();
}
