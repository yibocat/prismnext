import { normalizeDoi, normalizeArxivId } from "../../../../shared/literature/doi-utils";
import { truncateDiscoveryAbstract, type DiscoveryHit } from "../../../../shared/literature/discovery";
import { catalogFetch } from "../../../../shared/bibliographic-metadata/catalog-fetch";
import type { DiscoveryAdapter } from "../types";
import { DISCOVERY_HEADERS } from "./http";

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

export const semanticScholarDiscoveryAdapter: DiscoveryAdapter = {
  id: "semantic-scholar",
  async search(query, opts) {
    const fields =
      "title,authors,year,abstract,externalIds,url,openAccessPdf,citationCount";
    const params = new URLSearchParams({
      query: opts.author?.trim() ? `${query} ${opts.author.trim()}` : query,
      limit: String(opts.limit),
      fields,
    });
    const headers: Record<string, string> = { ...DISCOVERY_HEADERS };
    if (opts.semanticScholarApiKey?.trim()) {
      headers["x-api-key"] = opts.semanticScholarApiKey.trim();
    }

    const res = await catalogFetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
      { headers, signal: opts.signal },
    );
    if (res.status === 429) throw new Error("rate limited");
    if (!res.ok) throw new Error(`Semantic Scholar HTTP ${res.status}`);

    const data = (await res.json()) as {
      data?: Array<{
        paperId?: string;
        title?: string;
        year?: number;
        abstract?: string;
        url?: string;
        citationCount?: number;
        authors?: Array<{ name?: string }>;
        externalIds?: { DOI?: string; ArXiv?: string };
        openAccessPdf?: { url?: string };
      }>;
    };

    const hits: DiscoveryHit[] = [];
    for (const paper of data.data ?? []) {
      const title = paper.title?.trim();
      if (!title) continue;
      const doi = paper.externalIds?.DOI
        ? normalizeDoi(paper.externalIds.DOI)
        : null;
      const arxivId = paper.externalIds?.ArXiv
        ? normalizeArxivId(paper.externalIds.ArXiv)
        : null;
      hits.push({
        id: `s2:${paper.paperId ?? title}`,
        title,
        authors: (paper.authors ?? [])
          .map((a) => a.name?.trim() ?? "")
          .filter(Boolean),
        year: paper.year,
        doi: doi ?? undefined,
        arxivId: arxivId ?? undefined,
        abstract: truncateDiscoveryAbstract(paper.abstract),
        url: paper.url?.trim(),
        pdfUrl: paper.openAccessPdf?.url?.trim(),
        citationCount: paper.citationCount,
        source: "semantic-scholar",
      });
    }
    return filterByYear(hits, opts.year).slice(0, opts.limit);
  },
};
