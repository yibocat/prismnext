import { normalizeDoi } from "../../../../shared/doi-utils";
import { stripHtml } from "../../../../shared/bibliographic-metadata/helpers";
import { truncateDiscoveryAbstract, type DiscoveryHit } from "../../../../shared/literature-discovery";
import { catalogFetch } from "../../../../shared/bibliographic-metadata/catalog-fetch";
import type { DiscoveryAdapter } from "../types";
import { DISCOVERY_HEADERS } from "./http";

function formatCrossrefAuthor(a: { given?: string; family?: string }): string {
  const given = a.given?.trim() ?? "";
  const family = a.family?.trim() ?? "";
  return [given, family].filter(Boolean).join(" ").trim();
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

export const crossrefDiscoveryAdapter: DiscoveryAdapter = {
  id: "crossref",
  async search(query, opts) {
    const params = new URLSearchParams({
      query: opts.author?.trim() ? `${query} author:${opts.author.trim()}` : query,
      rows: String(opts.limit),
    });
    const res = await catalogFetch(`https://api.crossref.org/works?${params}`, {
      headers: DISCOVERY_HEADERS,
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`Crossref HTTP ${res.status}`);
    const data = (await res.json()) as {
      message?: {
        items?: Array<{
          DOI?: string;
          title?: string[];
          author?: Array<{ given?: string; family?: string }>;
          issued?: { "date-parts"?: number[][] };
          abstract?: string;
          URL?: string;
          "is-referenced-by-count"?: number;
        }>;
      };
    };
    const hits: DiscoveryHit[] = [];
    for (const item of data.message?.items ?? []) {
      const doi = item.DOI ? normalizeDoi(item.DOI) : null;
      const title = item.title?.[0]?.trim();
      if (!title) continue;
      const year = item.issued?.["date-parts"]?.[0]?.[0];
      const authors = (item.author ?? [])
        .map(formatCrossrefAuthor)
        .filter(Boolean);
      hits.push({
        id: doi ? `crossref:${doi}` : `crossref:${title.slice(0, 40)}`,
        title,
        authors,
        year: Number.isFinite(year) ? year : undefined,
        doi: doi ?? undefined,
        abstract: truncateDiscoveryAbstract(
          item.abstract ? stripHtml(item.abstract) : undefined,
        ),
        url: item.URL?.trim() || (doi ? `https://doi.org/${doi}` : undefined),
        citationCount: item["is-referenced-by-count"],
        source: "crossref",
      });
    }
    return filterByYear(hits, opts.year).slice(0, opts.limit);
  },
};
