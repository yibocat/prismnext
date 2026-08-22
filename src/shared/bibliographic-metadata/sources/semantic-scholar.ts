import { normalizeDoi, normalizeArxivId } from "../../literature/doi-utils";
import { authorsJsonFromParts, normalizeCslPageRange } from "../helpers";
import type { BibliographicMetadata } from "../types";
import type { BibliographicSource } from "./types";
import { catalogFetch } from "../catalog-fetch";

const CATALOG_HEADERS = {
  Accept: "application/json",
  "User-Agent": "PrismNext/1.0 (mailto:yibocat@yeah.net)",
} as const;

async function resolveByDoi(rawDoi: string): Promise<BibliographicMetadata | null> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return null;
  const fields = "title,authors,year,abstract,venue,externalIds,journal,openAccessPdf";
  const res = await catalogFetch(
    `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${fields}`,
    { headers: CATALOG_HEADERS },
  );
  if (res.status === 404) return null;
  if (res.status === 429) {
    console.warn("[bibliographic-metadata] Semantic Scholar rate limited (429)");
    return null;
  }
  if (!res.ok) throw new Error(`Semantic Scholar HTTP ${res.status}`);
  const paper = (await res.json()) as {
    title?: string;
    year?: number;
    abstract?: string;
    venue?: string;
    journal?: { name?: string; volume?: string; pages?: string };
    authors?: Array<{ name?: string }>;
    externalIds?: { DOI?: string; ArXiv?: string };
    openAccessPdf?: { url?: string };
  };
  if (!paper.title) return null;
  const arxivRaw = paper.externalIds?.ArXiv;
  const pdfUrl = paper.openAccessPdf?.url?.trim();
  return {
    title: paper.title,
    authors: authorsJsonFromParts((paper.authors ?? []).map((a) => ({ name: a.name ?? "" }))),
    abstract: paper.abstract ?? null,
    year: paper.year ?? null,
    doi: paper.externalIds?.DOI ? normalizeDoi(paper.externalIds.DOI) : doi,
    arxiv_id: arxivRaw ? normalizeArxivId(arxivRaw) : null,
    venue: paper.journal?.name ?? paper.venue ?? null,
    type: "article",
    source: "semantic-scholar",
    ...(pdfUrl ? { pdfUrl } : {}),
    volume: paper.journal?.volume?.trim() ?? null,
    page: normalizeCslPageRange(paper.journal?.pages ?? null),
  };
}

export const semanticScholarSource: BibliographicSource = {
  id: "semantic-scholar",
  label: "Semantic Scholar",
  supports: { doi: true },
  priority: 20,
  enabled: true,
  resolveByDoi,
};
