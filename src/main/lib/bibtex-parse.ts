/**
 * BibTeX parsing via Citation.js — replaces the hand-rolled regex parser.
 * Keeps the same `BibEntry` interface so literature-service doesn't change.
 */
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";

export interface BibEntry {
  citekey: string;
  entryType: string;
  fields: Record<string, string>;
  raw: string;
  /** Full CSL-JSON from Citation.js — canonical extended metadata for import. */
  cslJson: string;
}

interface CitationJsEntry {
  id?: string;
  type?: string;
  title?: string;
  author?: Array<{ given?: string; family?: string; literal?: string }>;
  "container-title"?: string | string[];
  "container-title-short"?: string;
  "publisher"?: string;
  "event"?: string;
  volume?: string | number;
  issue?: string | number;
  page?: string;
  URL?: string;
  language?: string;
  editor?: Array<{ given?: string; family?: string; literal?: string }>;
  issued?: { "date-parts"?: number[][] };
  DOI?: string;
  ISBN?: string;
  abstract?: string;
  note?: string;
  eprint?: string;
  [key: string]: unknown;
}

/** CSL type → BibTeX type (for DB `type` column compat). */
const CSL_TO_BIBTEX_TYPE: Record<string, string> = {
  "article-journal": "article",
  "article-magazine": "article",
  "article-newspaper": "article",
  "paper-conference": "inproceedings",
  "chapter": "incollection",
  "manuscript": "unpublished",
  "report": "techreport",
  "thesis": "phdthesis",
  "book": "book",
  "booklet": "booklet",
  "proceedings": "proceedings",
  "misc": "misc",
  "patent": "patent",
  "personal-communication": "misc",
  "song": "misc",
  "speech": "misc",
  "broadcast": "misc",
  "interview": "misc",
  "motion_picture": "misc",
  "post": "misc",
  "post-weblog": "misc",
  "webpage": "misc",
  "figure": "misc",
  "graphic": "misc",
  "legal_case": "misc",
  "legislation": "misc",
  "map": "misc",
  "musical_score": "misc",
  "pamphlet": "misc",
  "review": "article",
  "review-book": "article",
  "software": "misc",
  "dataset": "misc",
  "entry": "misc",
  "entry-dictionary": "misc",
  "entry-encyclopedia": "misc",
};

function authorNames(author: BibEntry["fields"]["author"] | undefined): string[] {
  if (!author) return [];
  return author
    .split(/\s+and\s+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function fieldFromCsl(entry: CitationJsEntry, key: string): string | undefined {
  const v = entry[key];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function cslJsonFromEntry(entry: CitationJsEntry, citekey: string): string {
  const csl: Record<string, unknown> = { ...entry, id: citekey };
  return JSON.stringify(csl);
}

/** Rewrite CSL `id` when the library bibkey differs from the BibTeX citekey. */
export function patchCslJsonBibkey(cslJson: string, citekey: string): string {
  try {
    const csl = JSON.parse(cslJson) as Record<string, unknown>;
    csl.id = citekey;
    return JSON.stringify(csl);
  } catch {
    return cslJson;
  }
}

function venueFromCsl(entry: CitationJsEntry): string | undefined {
  const ct = entry["container-title"];
  if (typeof ct === "string") return ct;
  if (Array.isArray(ct) && typeof ct[0] === "string") return ct[0];
  return (
    fieldFromCsl(entry, "container-title-short") ??
    fieldFromCsl(entry, "event") ??
    fieldFromCsl(entry, "publisher")
  );
}

function yearFromCsl(entry: CitationJsEntry): string | undefined {
  const parts = entry.issued?.["date-parts"]?.[0];
  if (parts?.[0]) return String(parts[0]);
  return undefined;
}

/** Parse BibTeX string into BibEntry[] using Citation.js. */
export function parseBibTeX(content: string): BibEntry[] {
  let data: unknown;
  try {
    data = new Cite(content);
  } catch {
    return [];
  }
  const entries = (data as { data?: CitationJsEntry[] }).data ?? [];
  return entries.map((e) => {
    const fields: Record<string, string> = {};
    if (e.title) fields.title = e.title;
    const authorStr = e.author
      ?.map((a) => a.literal ?? [a.given, a.family].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(" and ");
    if (authorStr) fields.author = authorStr;
    const venue = venueFromCsl(e);
    if (venue) {
      fields.journal = venue;
      fields.booktitle = venue;
    }
    const year = yearFromCsl(e);
    if (year) fields.year = year;
    if (e.DOI) fields.doi = e.DOI;
    if (e.ISBN) fields.isbn = e.ISBN;
    if (e.abstract) fields.abstract = e.abstract;
    if (e.eprint) {
      fields.eprint = e.eprint;
      fields.arxiv = e.eprint;
    }
    const volume = fieldFromCsl(e, "volume");
    if (volume) fields.volume = volume;
    const number = fieldFromCsl(e, "issue");
    if (number) fields.number = number;
    const pages = fieldFromCsl(e, "page");
    if (pages) fields.pages = pages;
    const publisher = fieldFromCsl(e, "publisher");
    if (publisher) fields.publisher = publisher;
    const url = fieldFromCsl(e, "URL");
    if (url) fields.url = url;
    if (e.note) fields.note = e.note;
    const citekey = e.id ?? "unknown";
    return {
      citekey,
      entryType: e.type ? (CSL_TO_BIBTEX_TYPE[e.type] ?? e.type) : "article",
      fields,
      raw: "",
      cslJson: cslJsonFromEntry(e, citekey),
    } satisfies BibEntry;
  });
}

/** Convert an author field ("Family, Given and Other Family and ...") to JSON string. */
export function authorsFromBibField(value: string | undefined): string | null {
  const names = authorNames(value);
  if (!names.length) return null;
  return JSON.stringify(
    names.map((name) => {
      const trimmed = name.trim();
      if (trimmed.includes(",")) {
        const [family, given] = trimmed.split(",").map((s) => s.trim());
        return { family: family ?? "", given: given ?? "" };
      }
      const tokens = trimmed.split(/\s+/);
      const family = tokens.pop() ?? "";
      return { given: tokens.join(" "), family };
    }),
  );
}

/** Render a BibEntry back to BibTeX (for export). */
export function bibEntryToRaw(entry: BibEntry): string {
  const fieldLines = Object.entries(entry.fields)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(",\n");
  return `@${entry.entryType}{${entry.citekey},\n${fieldLines}\n}`;
}
