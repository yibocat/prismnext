import { normalizeArxivId } from "../../../../shared/literature/doi-utils";
import { truncateDiscoveryAbstract, type DiscoveryHit } from "../../../../shared/literature/discovery";
import { catalogFetch } from "../../catalog/catalog-fetch";
import {
  parseArxivEntryAuthorNames,
  parseArxivEntryDoi,
  parseArxivEntryPdfUrl,
  parseArxivEntrySummary,
  parseArxivEntryTitle,
  parseArxivEntryYear,
} from "../../../../shared/bibliographic-metadata/arxiv-xml";
import type { DiscoveryAdapter } from "../types";
import { DISCOVERY_XML_HEADERS } from "./http";

function buildArxivSearchQuery(query: string, author?: string): string {
  const parts = [`all:${query.replace(/\s+/g, "+")}`];
  if (author?.trim()) {
    parts.push(`au:${author.trim().replace(/\s+/g, "+")}`);
  }
  return parts.join("+AND+");
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

export const arxivDiscoveryAdapter: DiscoveryAdapter = {
  id: "arxiv",
  async search(query, opts) {
    const searchQuery = buildArxivSearchQuery(query, opts.author);
    const url =
      `https://export.arxiv.org/api/query?search_query=${searchQuery}` +
      `&start=0&max_results=${opts.limit}`;
    const res = await catalogFetch(url, {
      headers: DISCOVERY_XML_HEADERS,
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
    const hits: DiscoveryHit[] = [];
    for (const entry of entries) {
      const absUrl = entry.match(/<id>([^<]+)<\/id>/i)?.[1]?.trim() ?? "";
      const rawId = absUrl.match(/arxiv\.org\/abs\/([^/?#]+)/i)?.[1] ?? "";
      const arxivIdRaw = normalizeArxivId(rawId);
      const arxivId = arxivIdRaw?.replace(/v\d+$/i, "") ?? null;
      if (!arxivId) continue;
      const title = parseArxivEntryTitle(entry);
      if (!title) continue;
      const year = parseArxivEntryYear(entry);
      hits.push({
        id: `arxiv:${arxivId}`,
        title,
        authors: parseArxivEntryAuthorNames(entry),
        year: year ?? undefined,
        doi: parseArxivEntryDoi(entry) ?? undefined,
        arxivId,
        abstract: truncateDiscoveryAbstract(parseArxivEntrySummary(entry) ?? undefined),
        url: `https://arxiv.org/abs/${arxivId}`,
        pdfUrl: parseArxivEntryPdfUrl(entry, arxivId),
        source: "arxiv",
      });
    }
    return filterByYear(hits, opts.year).slice(0, opts.limit);
  },
};
