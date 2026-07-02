import { normalizeDoi, arxivIdFromDoi } from "../../doi-utils";
import { normalizeIsbn } from "../../catalog-identifier-utils";
import { authorsJsonFromParts, normalizeCslPageRange, stripHtml } from "../helpers";
import type { BibliographicMetadata } from "../types";
import type { BibliographicSource } from "./types";
import { catalogFetch } from "../catalog-fetch";

const CATALOG_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Prism/1.0 (mailto:support@researchprism.app)",
} as const;

export function pickCrossrefVenue(msg: {
  "container-title"?: string[];
  "short-container-title"?: string[];
  container?: string[];
  event?: { name?: string };
  publisher?: string;
}): string | null {
  return (
    msg["container-title"]?.[0]?.trim() ||
    msg["short-container-title"]?.[0]?.trim() ||
    msg.container?.[0]?.trim() ||
    msg.event?.name?.trim() ||
    msg.publisher?.trim() ||
    null
  );
}

export function pickCrossrefPage(msg: {
  page?: string;
  "article-number"?: string;
}): string | null {
  const raw = msg.page?.trim() || msg["article-number"]?.trim();
  return raw ? normalizeCslPageRange(raw) : null;
}

function crossrefStringField(value: string | number | undefined | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

async function resolveByDoi(rawDoi: string): Promise<BibliographicMetadata | null> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return null;
  const res = await catalogFetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: CATALOG_HEADERS,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Crossref HTTP ${res.status}`);
  const data = (await res.json()) as {
    message: {
      title?: string[];
      author?: Array<{ given?: string; family?: string }>;
      abstract?: string;
      published?: { "date-parts"?: number[][] };
      "published-print"?: { "date-parts"?: number[][] };
      "container-title"?: string[];
      "short-container-title"?: string[];
      container?: string[];
      event?: { name?: string };
      publisher?: string;
      type?: string;
      volume?: string | number;
      issue?: string | number;
      page?: string;
      "article-number"?: string;
      language?: string;
      URL?: string;
      link?: Array<{ URL?: string; "content-type"?: string }>;
    };
  };
  const msg = data.message;
  const year =
    msg.published?.["date-parts"]?.[0]?.[0] ??
    msg["published-print"]?.["date-parts"]?.[0]?.[0] ??
    null;
  const url =
    msg.URL?.trim() ||
    msg.link?.find((l) => l.URL?.trim())?.URL?.trim() ||
    null;
  return {
    title: msg.title?.[0] ?? doi,
    authors: authorsJsonFromParts(msg.author ?? []),
    abstract: stripHtml(msg.abstract),
    year: typeof year === "number" ? year : null,
    doi,
    arxiv_id: arxivIdFromDoi(doi),
    venue: pickCrossrefVenue(msg),
    type: msg.type ?? "article",
    source: "crossref",
    volume: crossrefStringField(msg.volume),
    issue: crossrefStringField(msg.issue),
    page: pickCrossrefPage(msg),
    publisher: msg.publisher?.trim() ?? null,
    url,
    language: msg.language?.trim() ?? null,
    containerTitleShort: msg["short-container-title"]?.[0]?.trim() ?? null,
    event: msg.event?.name?.trim() ?? null,
  };
}

async function resolveByIsbn(rawIsbn: string): Promise<BibliographicMetadata | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) return null;
  const res = await catalogFetch(
    `https://api.crossref.org/works?filter=isbn:${encodeURIComponent(isbn)}&rows=1`,
    { headers: CATALOG_HEADERS },
  );
  if (!res.ok) throw new Error(`Crossref HTTP ${res.status}`);
  const data = (await res.json()) as {
    message?: { items?: Array<{ DOI?: string }> };
  };
  const doiRaw = data.message?.items?.[0]?.DOI;
  if (!doiRaw) return null;
  return resolveByDoi(doiRaw);
}

export const crossrefSource: BibliographicSource = {
  id: "crossref",
  label: "Crossref",
  supports: { doi: true, isbn: true },
  priority: 10,
  enabled: true,
  resolveByDoi,
  resolveByIsbn,
};

export { resolveByDoi, resolveByIsbn };
