import { i18n } from "@/lib/i18n";
import type { LiteraturePaper } from "@/types/electron.d";

export interface LiteratureAuthorPart {
  given?: string;
  family?: string;
  name?: string;
}

export function formatLiteratureAuthors(authors: string | null): string {
  if (!authors) return i18n.t("literature.detail.unknownAuthors");
  try {
    const parsed = JSON.parse(authors) as LiteratureAuthorPart[];
    return parsed
      .map((a) => authorDisplayName(a))
      .filter(Boolean)
      .join(", ");
  } catch {
    return authors;
  }
}

function authorDisplayName(a: LiteratureAuthorPart): string {
  if (a.name?.trim()) return a.name.trim();
  return [a.given, a.family].filter(Boolean).join(" ");
}

function parseAuthorNames(authors: string | null): string[] {
  if (!authors) return [];
  try {
    const parsed = JSON.parse(authors) as LiteratureAuthorPart[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((a) => authorDisplayName(a)).filter(Boolean);
  } catch {
    const trimmed = authors.trim();
    return trimmed ? [trimmed] : [];
  }
}

/** List column: 1 name; 2 → "A and B"; 3+ → "First et al." */
export function formatLiteratureAuthorsShort(authors: string | null): string {
  const names = parseAuthorNames(authors);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} et al.`;
}

/** Edit-friendly single-line author list (comma-separated). */
export function authorsForEditField(authors: string | null): string {
  if (!authors) return "";
  return formatLiteratureAuthors(authors);
}

function splitAuthorSegments(trimmed: string): string[] {
  if (/[;\n]/.test(trimmed) || /\s+and\s+/i.test(trimmed)) {
    return trimmed
      .split(/\n|;/)
      .flatMap((line) => line.split(/\s+and\s+/i))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (trimmed.includes(",")) {
    return trimmed
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

/**
 * Parse human-edited author text into JSON stored in DB.
 * Supports: "Given Family, Given Family", "Family, Given", single names, JSON array.
 */
export function parseAuthorsInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as LiteratureAuthorPart[];
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch {
      // fall through to heuristic parse
    }
  }

  const segments = splitAuthorSegments(trimmed);

  const authors: LiteratureAuthorPart[] = segments.map((segment) => {
    if (segment.includes(",")) {
      const commaParts = segment.split(",").map((s) => s.trim()).filter(Boolean);
      if (commaParts.length === 1) return { name: commaParts[0] };
      const [first, ...rest] = commaParts;
      const restJoined = rest.join(", ");
      if (rest.length === 1 && !first.includes(" ")) {
        return { family: first, given: restJoined };
      }
      return { name: segment };
    }
    const tokens = segment.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return { name: "" };
    if (tokens.length === 1) return { name: tokens[0] };
    const family = tokens[tokens.length - 1];
    const given = tokens.slice(0, -1).join(" ");
    return { given, family };
  });

  const filtered = authors.filter((a) => a.name || a.given || a.family);
  return filtered.length ? JSON.stringify(filtered) : null;
}

/** Paper mirrored from Zotero (metadata owned by Zotero until promoted to project-local). */
export function isZoteroSyncedPaper(paper: LiteraturePaper): boolean {
  return Boolean(paper.zotero_key) && paper.origin === "zotero";
}

export function zoteroSelectItemUrl(itemKey: string): string {
  return `zotero://select/library/items/${itemKey}`;
}

export const BETTER_BIBTEX_URL = "https://retorque.re/zotero-better-bibtex/";

export const LITERATURE_ENTRY_TYPES = [
  { value: "article", label: "Journal article" },
  { value: "inproceedings", label: "Conference paper" },
  { value: "book", label: "Book" },
  { value: "incollection", label: "Book chapter" },
  { value: "phdthesis", label: "PhD thesis" },
  { value: "mastersthesis", label: "Master's thesis" },
  { value: "techreport", label: "Technical report" },
  { value: "misc", label: "Miscellaneous" },
] as const;

export const CSL_STYLES = ["apa", "ieee", "chicago", "mla", "harvard1"] as const;
export type CslStyle = (typeof CSL_STYLES)[number];

export const CSL_STYLE_LABELS: Record<CslStyle, string> = {
  apa: "APA",
  ieee: "IEEE",
  chicago: "Chicago",
  mla: "MLA",
  harvard1: "Harvard",
};

const METADATA_SOURCE_LABELS: Record<string, string> = {
  crossref: "Crossref",
  openalex: "OpenAlex",
  dblp: "DBLP",
  "semantic-scholar": "Semantic Scholar",
  arxiv: "arXiv",
  datacite: "DataCite",
  openreview: "OpenReview",
};

const ORIGIN_LABELS: Record<string, string> = {
  manual: "Manual entry",
  doi: "Added by DOI",
  arxiv: "Added by arXiv",
  pdf: "Imported from PDF",
  bibtex: "Imported from BibTeX",
  zotero: "Zotero",
};

export function formatEntryType(type: string | null | undefined): string | null {
  if (!type?.trim()) return null;
  const found = LITERATURE_ENTRY_TYPES.find((t) => t.value === type);
  return found?.label ?? type;
}

export function formatMetadataSource(source: string | null | undefined): string | null {
  if (!source?.trim()) return null;
  return METADATA_SOURCE_LABELS[source] ?? source;
}

export interface PaperProvenance {
  primary: string;
  secondary?: string;
}

export function formatPaperProvenance(paper: LiteraturePaper): PaperProvenance {
  if (paper.zotero_key) {
    const enriched = formatMetadataSource(paper.metadata_source);
    return {
      primary: "Zotero",
      secondary: enriched ? `Enriched from ${enriched}` : undefined,
    };
  }
  const primary = paper.origin
    ? (ORIGIN_LABELS[paper.origin] ?? paper.origin)
    : "Local library";
  const enriched = formatMetadataSource(paper.metadata_source);
  return {
    primary,
    secondary: enriched ? `Enriched from ${enriched}` : undefined,
  };
}

export type LiteratureSortColumn = "year" | "title" | "created_at" | "updated_at";
export type LiteratureSortDirection = "asc" | "desc";

/** Compact date for library list columns (ms epoch). */
export function formatLiteratureListDate(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local `pdf_path` or Zotero item (PDF bytes resolved when opening reader). */
export function paperHasReadablePdf(paper: LiteraturePaper): boolean {
  return Boolean(paper.pdf_path || paper.zotero_key);
}

export function sortLiteraturePapers(
  papers: LiteraturePaper[],
  column: LiteratureSortColumn,
  direction: LiteratureSortDirection,
): LiteraturePaper[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...papers].sort((a, b) => {
    if (column === "created_at" || column === "updated_at") {
      const av = a[column] ?? 0;
      const bv = b[column] ?? 0;
      if (av !== bv) return (av - bv) * dir;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    }
    if (column === "year") {
      const ay = a.year ?? -1;
      const by = b.year ?? -1;
      if (ay !== by) return (ay - by) * dir;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    }
    const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    if (cmp !== 0) return cmp * dir;
    return (a.year ?? 0) - (b.year ?? 0);
  });
}
