import { formatLiteratureAuthors } from "@/lib/literature/literature-format";
import type { LiteraturePaper } from "@/types/electron.d";

/** Parsed subset of CSL-JSON stored on `papers.csl_json`. */
export interface PaperCslRecord {
  type?: string;
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  containerTitleShort?: string;
  containerTitle?: string;
  event?: string;
  url?: string;
  language?: string;
  note?: string;
  editors?: string | null;
}

export type CslPublicationFieldKey =
  | "volume"
  | "issue"
  | "page"
  | "publisher"
  | "containerTitleShort"
  | "containerTitle"
  | "event"
  | "editor"
  | "url"
  | "language"
  | "note";

export interface CslPublicationFieldDef {
  key: CslPublicationFieldKey;
  label: string;
}

export interface PublicationDetailRow {
  label: string;
  value: string;
  href?: string;
}

type EntryKind = "journal" | "conference" | "book" | "other";

function cslStringField(csl: Record<string, unknown>, key: string): string | null {
  const v = csl[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function editorsJsonFromCsl(csl: Record<string, unknown>): string | null {
  const editors = csl.editor;
  if (!Array.isArray(editors) || editors.length === 0) return null;
  const parts = editors
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const row = e as { given?: string; family?: string; literal?: string };
      if (row.literal?.trim()) return { name: row.literal.trim() };
      const given = row.given?.trim() ?? "";
      const family = row.family?.trim() ?? "";
      if (!given && !family) return null;
      return { given, family };
    })
    .filter(Boolean);
  return parts.length ? JSON.stringify(parts) : null;
}

/** Parse stored CSL-JSON; returns null on empty/invalid input. */
export function parseCslJson(raw: string | null | undefined): PaperCslRecord | null {
  if (!raw?.trim()) return null;
  try {
    const csl = JSON.parse(raw) as Record<string, unknown>;
    const editors = editorsJsonFromCsl(csl);
    const record: PaperCslRecord = {
      type: cslStringField(csl, "type") ?? undefined,
      volume: cslStringField(csl, "volume") ?? undefined,
      issue: cslStringField(csl, "issue") ?? undefined,
      page: cslStringField(csl, "page") ?? undefined,
      publisher: cslStringField(csl, "publisher") ?? undefined,
      containerTitleShort: cslStringField(csl, "container-title-short") ?? undefined,
      containerTitle: cslStringField(csl, "container-title") ?? undefined,
      event: cslStringField(csl, "event") ?? undefined,
      url: cslStringField(csl, "URL") ?? undefined,
      language: cslStringField(csl, "language") ?? undefined,
      note: cslStringField(csl, "note") ?? undefined,
      editors,
    };
    const hasData = Object.entries(record).some(
      ([key, value]) => key !== "type" && value != null && value !== "",
    );
    return hasData ? record : null;
  } catch {
    return null;
  }
}

/** Display CSL page range with typographic en dash. */
export function formatCslPageDisplay(page: string): string {
  return page.replace(/--/g, "–");
}

function normalizeEntryKind(bibtexType: string | null | undefined, cslType?: string): EntryKind {
  const t = (cslType ?? bibtexType ?? "").toLowerCase();
  if (
    t === "article" ||
    t === "article-journal" ||
    t === "article-magazine" ||
    t === "article-newspaper" ||
    t === "review" ||
    t === "review-book"
  ) {
    return "journal";
  }
  if (
    t === "inproceedings" ||
    t === "paper-conference" ||
    t === "proceedings" ||
    t === "speech"
  ) {
    return "conference";
  }
  if (t === "book" || t === "incollection" || t === "chapter" || t === "booklet") {
    return "book";
  }
  return "other";
}

/** Field order + labels for a literature entry type. */
export function cslFieldsForEntryType(
  bibtexType: string | null | undefined,
  cslType?: string,
): CslPublicationFieldDef[] {
  switch (normalizeEntryKind(bibtexType, cslType)) {
    case "journal":
      return [
        { key: "volume", label: "Volume" },
        { key: "issue", label: "Issue" },
        { key: "page", label: "Pages" },
        { key: "publisher", label: "Publisher" },
        { key: "containerTitleShort", label: "Journal abbrev." },
      ];
    case "conference":
      return [
        { key: "containerTitle", label: "Booktitle" },
        { key: "event", label: "Event" },
        { key: "page", label: "Pages" },
        { key: "publisher", label: "Publisher" },
      ];
    case "book":
      return [
        { key: "publisher", label: "Publisher" },
        { key: "page", label: "Pages" },
      ];
    default:
      return [
        { key: "volume", label: "Volume" },
        { key: "issue", label: "Issue" },
        { key: "page", label: "Pages" },
        { key: "publisher", label: "Publisher" },
        { key: "event", label: "Event" },
        { key: "editor", label: "Editors" },
        { key: "url", label: "URL" },
        { key: "language", label: "Language" },
        { key: "note", label: "Note" },
      ];
  }
}

function resolveCslFieldValue(
  csl: PaperCslRecord,
  key: CslPublicationFieldKey,
  paper: LiteraturePaper,
): string | null {
  switch (key) {
    case "volume":
      return csl.volume ?? null;
    case "issue":
      return csl.issue ?? null;
    case "page":
      return csl.page ? formatCslPageDisplay(csl.page) : null;
    case "publisher":
      return csl.publisher ?? null;
    case "containerTitleShort":
      if (!csl.containerTitleShort) return null;
      if (paper.venue && csl.containerTitleShort === paper.venue) return null;
      return csl.containerTitleShort;
    case "containerTitle": {
      if (!csl.containerTitle) return null;
      if (paper.venue && csl.containerTitle === paper.venue) return null;
      return csl.containerTitle;
    }
    case "event":
      if (!csl.event) return null;
      if (paper.venue && csl.event === paper.venue) return null;
      return csl.event;
    case "editor":
      return csl.editors ? formatLiteratureAuthors(csl.editors) : null;
    case "url":
      return csl.url ?? null;
    case "language":
      return csl.language ?? null;
    case "note":
      return csl.note ?? null;
    default:
      return null;
  }
}

/** Read-only publication detail rows from `csl_json` (skips empty / duplicate-of-venue values). */
export function publicationDetailRows(paper: LiteraturePaper): PublicationDetailRow[] {
  const csl = parseCslJson(paper.csl_json);
  if (!csl) return [];

  const defs = cslFieldsForEntryType(paper.type, csl.type);
  const rows: PublicationDetailRow[] = [];

  for (const def of defs) {
    const value = resolveCslFieldValue(csl, def.key, paper);
    if (!value) continue;
    rows.push({
      label: def.label,
      value,
      ...(def.key === "url" ? { href: value } : {}),
    });
  }

  return rows;
}
