import { normalizeDoi } from "../literature/doi-utils";

/** Shared arXiv Atom `<entry>` parsers — used by bibliographic lookup and discovery. */

export function parseArxivEntryAuthorNames(xml: string): string[] {
  return [...xml.matchAll(/<author>\s*<name>([^<]+)<\/name>/gi)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
}

export function parseArxivEntryDoi(xml: string): string | null {
  const tagged = xml.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/i)?.[1]?.trim();
  if (tagged) return normalizeDoi(tagged);
  const linkDoi = xml.match(/<link[^>]+title="doi"[^>]+href="([^"]+)"/i)?.[1];
  if (linkDoi) return normalizeDoi(linkDoi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ""));
  return null;
}

export function parseArxivEntryTitle(xml: string): string | null {
  const title = xml.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
  if (!title || title === "Title") return null;
  return title;
}

export function parseArxivEntrySummary(xml: string): string | null {
  return xml.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

export function parseArxivEntryYear(xml: string): number | null {
  const published = xml.match(/<published>([^<]+)<\/published>/i)?.[1];
  const year = published ? Number.parseInt(published.slice(0, 4), 10) : NaN;
  return Number.isFinite(year) ? year : null;
}

export function parseArxivEntryPdfUrl(xml: string, arxivId: string): string {
  const pdfLink = xml.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/i)?.[1]?.trim();
  return pdfLink || `https://arxiv.org/pdf/${arxivId}.pdf`;
}
