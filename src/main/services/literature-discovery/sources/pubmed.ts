import { normalizeDoi } from "../../../../shared/literature/doi-utils";
import { truncateDiscoveryAbstract, type DiscoveryHit } from "../../../../shared/literature/discovery";
import { catalogFetch } from "../../../../shared/bibliographic-metadata/catalog-fetch";
import type { DiscoveryAdapter } from "../types";
import { DISCOVERY_HEADERS } from "./http";

type PubMedSummary = {
  uid?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  source?: string;
  pubdate?: string;
  articleids?: Array<{ idtype?: string; value?: string }>;
};

function parsePubYear(pubdate?: string): number | undefined {
  const match = pubdate?.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function filterByYear(
  hits: DiscoveryHit[],
  year: { from: number; to: number | null } | null | undefined,
): DiscoveryHit[] {
  if (!year) return hits;
  return hits.filter((h) => {
    if (h.year == null) return true;
    if (year.to != null) return h.year >= year.from && h.year <= year.to;
    return h.year >= year.from;
  });
}

export const pubmedDiscoveryAdapter: DiscoveryAdapter = {
  id: "pubmed",
  async search(query, opts) {
    const term = opts.author?.trim()
      ? `${query} ${opts.author.trim()}[Author]`
      : query;
    const searchParams = new URLSearchParams({
      db: "pubmed",
      term,
      retmax: String(opts.limit),
      retmode: "json",
    });
    if (opts.pubmedApiKey?.trim()) {
      searchParams.set("api_key", opts.pubmedApiKey.trim());
    }

    const searchRes = await catalogFetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams}`,
      { headers: DISCOVERY_HEADERS, signal: opts.signal },
    );
    if (!searchRes.ok) throw new Error(`PubMed esearch HTTP ${searchRes.status}`);

    const searchData = (await searchRes.json()) as {
      esearchresult?: { idlist?: string[] };
    };
    const ids = searchData.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    const summaryParams = new URLSearchParams({
      db: "pubmed",
      id: ids.join(","),
      retmode: "json",
    });
    if (opts.pubmedApiKey?.trim()) {
      summaryParams.set("api_key", opts.pubmedApiKey.trim());
    }

    const summaryRes = await catalogFetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams}`,
      { headers: DISCOVERY_HEADERS, signal: opts.signal },
    );
    if (!summaryRes.ok) throw new Error(`PubMed esummary HTTP ${summaryRes.status}`);

    const summaryData = (await summaryRes.json()) as {
      result?: Record<string, PubMedSummary | string>;
    };

    const hits: DiscoveryHit[] = [];
    for (const pmid of ids) {
      const entry = summaryData.result?.[pmid];
      if (!entry || typeof entry === "string") continue;
      const title = entry.title?.replace(/\.$/, "").trim();
      if (!title) continue;
      const doiRaw = entry.articleids?.find((id) => id.idtype?.toLowerCase() === "doi")?.value;
      const doi = doiRaw ? normalizeDoi(doiRaw) : null;
      hits.push({
        id: `pubmed:${pmid}`,
        title,
        authors: (entry.authors ?? [])
          .map((a) => a.name?.trim() ?? "")
          .filter(Boolean),
        year: parsePubYear(entry.pubdate),
        doi: doi ?? undefined,
        pmid,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        source: "pubmed",
        abstract: truncateDiscoveryAbstract(undefined),
      });
    }
    return filterByYear(hits, opts.year).slice(0, opts.limit);
  },
};
