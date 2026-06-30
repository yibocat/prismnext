import type { BibliographicMetadata } from "./types";

export function authorsJsonFromParts(
  parts: Array<{ given?: string; family?: string; name?: string }>,
): string | null {
  if (!parts.length) return null;
  return JSON.stringify(
    parts.map((a) => {
      if (a.name) {
        const tokens = a.name.trim().split(/\s+/);
        const family = tokens.pop() ?? "";
        return { given: tokens.join(" "), family };
      }
      return { given: a.given ?? "", family: a.family ?? "" };
    }),
  );
}

export function reconstructInvertedAbstract(
  inverted: Record<string, number[]> | null | undefined,
): string | null {
  if (!inverted) return null;
  const tokens: Array<{ pos: number; word: string }> = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) tokens.push({ pos, word });
  }
  if (!tokens.length) return null;
  tokens.sort((a, b) => a.pos - b.pos);
  return tokens.map((t) => t.word).join(" ");
}

export function stripHtml(text: string | null | undefined): string | null {
  if (!text) return null;
  const stripped = text
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  return stripped || null;
}

/** Normalize publisher page strings to CSL `page` (`"first--last"`). */
export function normalizeCslPageRange(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (trimmed.includes("--")) return trimmed;
  return trimmed.replace(/(\d)\s*-\s*(\d)/g, "$1--$2");
}

/** Build CSL `page` from first/last page parts. */
export function formatCslPageRange(
  first?: string | number | null,
  last?: string | number | null,
): string | null {
  const a = first != null && String(first).trim() ? String(first).trim() : null;
  const b = last != null && String(last).trim() ? String(last).trim() : null;
  if (a && b && a !== b) return `${a}--${b}`;
  if (a) return a;
  if (b) return b;
  return null;
}

function parseNameListJson(json: string | null | undefined): Array<{ family: string; given: string }> {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json) as Array<{ family?: string; given?: string }>;
    return parsed.map((a) => ({ family: a.family ?? "", given: a.given ?? "" }));
  } catch {
    return [];
  }
}

function setCslString(csl: Record<string, unknown>, key: string, value: string | null | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) csl[key] = trimmed;
}

function cslStringField(csl: Record<string, unknown>, key: string): string | null {
  const v = csl[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function formatPageDisplay(page: string): string {
  return page.replace(/--/g, "–");
}

function editorsDisplayFromCsl(csl: Record<string, unknown>): string | null {
  const editors = csl.editor;
  if (!Array.isArray(editors) || editors.length === 0) return null;
  const parts = editors
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const row = e as { given?: string; family?: string; literal?: string };
      if (row.literal?.trim()) return row.literal.trim();
      const given = row.given?.trim() ?? "";
      const family = row.family?.trim() ?? "";
      if (!given && !family) return null;
      return `${given} ${family}`.trim();
    })
    .filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

/** Minimal paper row fields needed to build a CSL entry or publication details. */
export interface PaperCslSourceRow {
  bibkey: string;
  title: string;
  authors: string | null;
  year: number | null;
  doi: string | null;
  venue: string | null;
  type: string | null;
  abstract?: string | null;
  csl_json: string | null;
}

/** Structured publication fields for Agent tools (from stored `csl_json` + flat fallback). */
export interface PublicationDetails {
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  journal_abbrev?: string;
  booktitle?: string;
  event?: string;
  editors?: string;
  url?: string;
  language?: string;
  note?: string;
}

/** Build a citeproc-ready CSL entry from DB row (`csl_json` canonical, flat columns fill gaps). */
export function cslEntryFromPaperRow(row: PaperCslSourceRow): Record<string, unknown> {
  let stored: Record<string, unknown> = {};
  if (row.csl_json?.trim()) {
    try {
      stored = JSON.parse(row.csl_json) as Record<string, unknown>;
    } catch {
      stored = {};
    }
  }

  const authors = parseNameListJson(row.authors);
  const entry: Record<string, unknown> = { ...stored };
  entry.id = row.bibkey;
  if (!cslStringField(entry, "type")) entry.type = row.type || "article";
  if (!cslStringField(entry, "title")) entry.title = row.title;
  if (authors.length && !Array.isArray(entry.author)) entry.author = authors;
  if (row.year && !entry.issued) entry.issued = { "date-parts": [[row.year]] };
  if (row.doi && !entry.DOI) entry.DOI = row.doi;
  if (row.abstract && !entry.abstract) entry.abstract = row.abstract;
  if (row.venue && !entry["container-title"]) entry["container-title"] = row.venue;
  return entry;
}

/** Extract publication details for Agent / API consumers. */
export function publicationDetailsFromPaperRow(row: PaperCslSourceRow): PublicationDetails | null {
  const csl = cslEntryFromPaperRow(row);
  const details: PublicationDetails = {};

  const volume = cslStringField(csl, "volume");
  if (volume) details.volume = volume;

  const issue = cslStringField(csl, "issue");
  if (issue) details.issue = issue;

  const page = cslStringField(csl, "page");
  if (page) details.pages = formatPageDisplay(page);

  const publisher = cslStringField(csl, "publisher");
  if (publisher) details.publisher = publisher;

  const abbrev = cslStringField(csl, "container-title-short");
  if (abbrev && abbrev !== row.venue) details.journal_abbrev = abbrev;

  const booktitle = cslStringField(csl, "container-title");
  if (booktitle && booktitle !== row.venue) details.booktitle = booktitle;

  const event = cslStringField(csl, "event");
  if (event && event !== row.venue) details.event = event;

  const editors = editorsDisplayFromCsl(csl);
  if (editors) details.editors = editors;

  const url = cslStringField(csl, "URL");
  if (url) details.url = url;

  const language = cslStringField(csl, "language");
  if (language) details.language = language;

  const note = cslStringField(csl, "note");
  if (note) details.note = note;

  return Object.keys(details).length ? details : null;
}

/** Map to literature DB row fields (`source` = catalog id). */
export function bibliographicToPaperPatch(meta: BibliographicMetadata): Record<string, unknown> {
  return {
    title: meta.title,
    authors: meta.authors,
    year: meta.year,
    abstract: meta.abstract,
    doi: meta.doi,
    arxiv_id: meta.arxiv_id,
    venue: meta.venue,
    type: meta.type,
    source: meta.source,
    ...(meta.pdfUrl ? { pdfUrl: meta.pdfUrl } : {}),
  };
}

/** Build a CSL-JSON object from BibliographicMetadata (for citeproc / Zotero push / Word). */
export function bibliographicToCslJson(meta: BibliographicMetadata): string {
  const authors = parseNameListJson(meta.authors);
  const editors = parseNameListJson(meta.editors);
  const csl: Record<string, unknown> = {
    id: meta.doi ?? meta.arxiv_id ?? "prism",
    type: meta.type ?? "article",
    title: meta.title,
  };
  if (authors.length) {
    csl.author = authors;
  }
  if (editors.length) {
    csl.editor = editors;
  }
  if (meta.year) csl.issued = { "date-parts": [[meta.year]] };
  setCslString(csl, "DOI", meta.doi);
  setCslString(csl, "abstract", meta.abstract);
  setCslString(csl, "container-title", meta.venue);
  setCslString(csl, "container-title-short", meta.containerTitleShort);
  setCslString(csl, "volume", meta.volume);
  setCslString(csl, "issue", meta.issue);
  setCslString(csl, "page", meta.page);
  setCslString(csl, "publisher", meta.publisher);
  setCslString(csl, "URL", meta.url);
  setCslString(csl, "language", meta.language);
  setCslString(csl, "event", meta.event);
  setCslString(csl, "note", meta.note);
  return JSON.stringify(csl);
}
