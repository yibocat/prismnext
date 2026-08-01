import { normalizeDoi, normalizeArxivId } from "../../../../shared/doi-utils";
import { reconstructInvertedAbstract } from "../../../../shared/bibliographic-metadata/helpers";
import { truncateDiscoveryAbstract, type DiscoveryHit } from "../../../../shared/literature-discovery";
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

function buildOpenAlexFilters(
  year: { from: number; to: number | null } | null | undefined,
  venueFilter?: string,
): string | undefined {
  const filters: string[] = [];
  if (venueFilter) filters.push(venueFilter);
  if (year) {
    if (year.to != null) {
      filters.push(`publication_year:${year.from}-${year.to}`);
    } else {
      filters.push(`publication_year:>${year.from - 1}`);
    }
  }
  return filters.length > 0 ? filters.join(",") : undefined;
}

export function createOpenAlexDiscoveryAdapter(venueFilter?: string): DiscoveryAdapter {
  const sourceId = venueFilter?.includes("bioRxiv")
    ? "biorxiv"
    : venueFilter?.includes("medRxiv")
      ? "medrxiv"
      : "openalex";

  return {
    id: sourceId as DiscoveryAdapter["id"],
    async search(query, opts) {
      const params = new URLSearchParams({
        search: opts.author?.trim() ? `${query} ${opts.author.trim()}` : query,
        per_page: String(opts.limit),
      });
      const filter = buildOpenAlexFilters(opts.year, venueFilter);
      if (filter) params.set("filter", filter);

      const res = await catalogFetch(`https://api.openalex.org/works?${params}`, {
        headers: DISCOVERY_HEADERS,
        signal: opts.signal,
      });
      if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
      const data = (await res.json()) as {
        results?: Array<{
          id?: string;
          display_name?: string;
          publication_year?: number;
          doi?: string;
          ids?: { arxiv?: string };
          abstract_inverted_index?: Record<string, number[]>;
          cited_by_count?: number;
          primary_location?: {
            landing_page_url?: string;
            pdf_url?: string;
          };
          open_access?: { oa_url?: string };
          authorships?: Array<{ author?: { display_name?: string } }>;
        }>;
      };

      const hits: DiscoveryHit[] = [];
      for (const work of data.results ?? []) {
        const title = work.display_name?.trim();
        if (!title) continue;
        const doi = work.doi
          ? normalizeDoi(work.doi.replace(/^https?:\/\/doi\.org\//i, ""))
          : null;
        const arxivId = work.ids?.arxiv ? normalizeArxivId(work.ids.arxiv) : null;
        const pdfUrl =
          work.primary_location?.pdf_url?.trim() ||
          work.open_access?.oa_url?.trim() ||
          undefined;
        const openAlexId = work.id?.replace(/^https:\/\/openalex\.org\//, "") ?? title;
        hits.push({
          id: `${sourceId}:${openAlexId}`,
          title,
          authors: (work.authorships ?? [])
            .map((a) => a.author?.display_name?.trim() ?? "")
            .filter(Boolean),
          year: work.publication_year,
          doi: doi ?? undefined,
          arxivId: arxivId ?? undefined,
          abstract: truncateDiscoveryAbstract(
            reconstructInvertedAbstract(work.abstract_inverted_index) ?? undefined,
          ),
          url: work.primary_location?.landing_page_url?.trim(),
          pdfUrl,
          citationCount: work.cited_by_count,
          source: sourceId as DiscoveryHit["source"],
        });
      }
      return filterByYear(hits, opts.year).slice(0, opts.limit);
    },
  };
}

export const openalexDiscoveryAdapter = createOpenAlexDiscoveryAdapter();
