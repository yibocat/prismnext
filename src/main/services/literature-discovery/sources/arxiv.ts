import { normalizeArxivId, normalizeDoi } from "../../../../shared/doi-utils";
import { truncateDiscoveryAbstract, type DiscoveryHit } from "../../../../shared/literature-discovery";
import { catalogFetch } from "../../../../shared/bibliographic-metadata/catalog-fetch";
import type { DiscoveryAdapter } from "../types";
import { DISCOVERY_XML_HEADERS } from "./http";

function parseArxivEntryAuthors(entryXml: string): string[] {
  return [...entryXml.matchAll(/<author>\s*<name>([^<]+)<\/name>/gi)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
}

function parseArxivEntryDoi(entryXml: string): string | undefined {
  const tagged = entryXml.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/i)?.[1]?.trim();
  if (tagged) return normalizeDoi(tagged) ?? undefined;
  const linkDoi = entryXml.match(/<link[^>]+title="doi"[^>]+href="([^"]+)"/i)?.[1];
  if (linkDoi) {
    return normalizeDoi(linkDoi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")) ?? undefined;
  }
  return undefined;
}

function parseArxivEntryPdfUrl(entryXml: string, arxivId: string): string | undefined {
  const pdfLink = entryXml.match(
    /<link[^>]+title="pdf"[^>]+href="([^"]+)"/i,
  )?.[1]?.trim();
  if (pdfLink) return pdfLink;
  return `https://arxiv.org/pdf/${arxivId}.pdf`;
}

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
      const title = entry.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
      if (!title || title === "Title") continue;
      const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.replace(/\s+/g, " ").trim();
      const published = entry.match(/<published>([^<]+)<\/published>/i)?.[1];
      const year = published ? Number.parseInt(published.slice(0, 4), 10) : undefined;
      hits.push({
        id: `arxiv:${arxivId}`,
        title,
        authors: parseArxivEntryAuthors(entry),
        year: Number.isFinite(year) ? year : undefined,
        doi: parseArxivEntryDoi(entry),
        arxivId,
        abstract: truncateDiscoveryAbstract(summary),
        url: `https://arxiv.org/abs/${arxivId}`,
        pdfUrl: parseArxivEntryPdfUrl(entry, arxivId),
        source: "arxiv",
      });
    }
    return filterByYear(hits, opts.year).slice(0, opts.limit);
  },
};
