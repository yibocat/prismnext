import { normalizeDoi, normalizeArxivId } from "../../doi-utils";
import { openAlexWorkLookupUrl } from "../../openalex-lookup";
import { normalizeAdsBibcode } from "../../catalog-identifier-utils";
import { authorsJsonFromParts, formatCslPageRange, reconstructInvertedAbstract } from "../helpers";
import type { BibliographicMetadata } from "../types";
import type { BibliographicSource } from "./types";
import { catalogFetch } from "../catalog-fetch";

const CATALOG_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Prism/1.0 (mailto:support@researchprism.app)",
} as const;

async function resolveOpenAlexUrl(url: string): Promise<BibliographicMetadata | null> {
  const res = await catalogFetch(url, { headers: CATALOG_HEADERS });
  if (res.status === 404) return null;
  if (res.status === 429 || res.status === 503) return null;
  if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
  const work = (await res.json()) as {
    title?: string;
    publication_year?: number;
    doi?: string;
    ids?: { arxiv?: string };
    abstract_inverted_index?: Record<string, number[]>;
    type?: string;
    language?: string;
    open_access?: { oa_url?: string };
    primary_location?: {
      pdf_url?: string;
      landing_page_url?: string;
      source?: { display_name?: string; host_organization_name?: string };
    };
    biblio?: {
      volume?: string | number;
      issue?: string | number;
      first_page?: string | number;
      last_page?: string | number;
    };
    authorships?: Array<{ author?: { display_name?: string } }>;
  };
  if (!work.title) return null;
  const pdfUrl =
    work.primary_location?.pdf_url?.trim() || work.open_access?.oa_url?.trim() || undefined;
  const biblio = work.biblio;
  return {
    title: work.title,
    authors: authorsJsonFromParts(
      (work.authorships ?? []).map((a) => ({ name: a.author?.display_name ?? "" })),
    ),
    abstract: reconstructInvertedAbstract(work.abstract_inverted_index),
    year: work.publication_year ?? null,
    doi: work.doi ? normalizeDoi(work.doi.replace(/^https?:\/\/doi\.org\//i, "")) : null,
    arxiv_id: work.ids?.arxiv ? normalizeArxivId(work.ids.arxiv) : null,
    venue: work.primary_location?.source?.display_name ?? null,
    type: work.type ?? "article",
    source: "openalex",
    ...(pdfUrl ? { pdfUrl } : {}),
    volume: biblio?.volume != null ? String(biblio.volume) : null,
    issue: biblio?.issue != null ? String(biblio.issue) : null,
    page: formatCslPageRange(biblio?.first_page, biblio?.last_page),
    publisher: work.primary_location?.source?.host_organization_name?.trim() ?? null,
    url: work.primary_location?.landing_page_url?.trim() ?? null,
    language: work.language?.trim() ?? null,
  };
}

async function resolveByDoi(rawDoi: string): Promise<BibliographicMetadata | null> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return null;
  return resolveOpenAlexUrl(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
}

async function resolveByArxiv(rawArxiv: string): Promise<BibliographicMetadata | null> {
  const id = normalizeArxivId(rawArxiv);
  if (!id) return null;
  const lookupUrl = openAlexWorkLookupUrl(null, id);
  if (!lookupUrl) return null;
  return resolveOpenAlexUrl(lookupUrl);
}

async function resolveByAdsBibcode(rawBibcode: string): Promise<BibliographicMetadata | null> {
  const bibcode = normalizeAdsBibcode(rawBibcode);
  if (!bibcode) return null;
  const res = await catalogFetch(
    `https://api.openalex.org/works?filter=ids.bibcode:${encodeURIComponent(bibcode)}&per_page=1`,
    { headers: CATALOG_HEADERS },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ id?: string }> };
  const workUrl = data.results?.[0]?.id;
  if (!workUrl) return null;
  return resolveOpenAlexUrl(workUrl);
}

export const openalexSource: BibliographicSource = {
  id: "openalex",
  label: "OpenAlex",
  supports: { doi: true, arxiv: true, adsBibcode: true },
  priority: 30,
  enabled: true,
  resolveByDoi,
  resolveByArxiv,
  resolveByAdsBibcode,
};

export { resolveByAdsBibcode };
