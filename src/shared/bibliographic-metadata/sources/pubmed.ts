import { normalizeDoi } from "../../doi-utils";
import { normalizePmid } from "../../catalog-identifier-utils";
import { authorsJsonFromParts } from "../helpers";
import type { BibliographicMetadata } from "../types";
import type { BibliographicSource } from "./types";
import { catalogFetch } from "../catalog-fetch";

const CATALOG_HEADERS = {
  Accept: "application/json",
  "User-Agent": "PrismNext/1.0 (mailto:yibocat@yeah.net)",
} as const;

type PubMedSummary = {
  uid?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  source?: string;
  pubdate?: string;
  articleids?: Array<{ idtype?: string; value?: string }>;
};

async function resolveByPmid(rawPmid: string): Promise<BibliographicMetadata | null> {
  const pmid = normalizePmid(rawPmid);
  if (!pmid) return null;

  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`;
  const res = await catalogFetch(url, { headers: CATALOG_HEADERS });
  if (!res.ok) throw new Error(`PubMed HTTP ${res.status}`);

  const data = (await res.json()) as { result?: Record<string, PubMedSummary | string> };
  const entry = data.result?.[pmid];
  if (!entry || typeof entry === "string") return null;

  const doiRaw = entry.articleids?.find((id) => id.idtype?.toLowerCase() === "doi")?.value;
  const doi = doiRaw ? normalizeDoi(doiRaw) : null;
  const yearMatch = entry.pubdate?.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : null;
  const authors = authorsJsonFromParts(
    (entry.authors ?? []).map((a) => {
      const name = a.name?.trim() ?? "";
      const comma = name.indexOf(", ");
      if (comma > 0) {
        return { family: name.slice(0, comma), given: name.slice(comma + 2) };
      }
      return { name };
    }),
  );

  return {
    title: entry.title?.replace(/\.$/, "") ?? `PMID ${pmid}`,
    authors,
    abstract: null,
    year,
    doi,
    arxiv_id: null,
    venue: entry.source?.trim() ?? null,
    type: "article",
    source: "pubmed",
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  };
}

export const pubmedSource: BibliographicSource = {
  id: "pubmed",
  label: "PubMed",
  supports: { pmid: true },
  priority: 12,
  enabled: true,
  resolveByPmid,
};

export { resolveByPmid };
