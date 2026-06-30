import { normalizeArxivId, normalizeDoi } from "../../doi-utils";
import { authorsJsonFromParts } from "../helpers";
import type { BibliographicMetadata } from "../types";
import type { BibliographicSource } from "./types";

function parseArxivEntryAuthors(xml: string): string | null {
  const names = [...xml.matchAll(/<author>\s*<name>([^<]+)<\/name>/gi)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  if (!names.length) return null;
  return authorsJsonFromParts(names.map((name) => ({ name })));
}

function parseArxivEntryDoi(xml: string): string | null {
  const tagged = xml.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/i)?.[1]?.trim();
  if (tagged) return normalizeDoi(tagged);
  const linkDoi = xml.match(/<link[^>]+title="doi"[^>]+href="([^"]+)"/i)?.[1];
  if (linkDoi) return normalizeDoi(linkDoi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ""));
  return null;
}

const ARXIV_FETCH_TIMEOUT_MS = 8_000;

async function resolveByArxiv(rawArxiv: string): Promise<BibliographicMetadata | null> {
  const id = normalizeArxivId(rawArxiv);
  if (!id) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ARXIV_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, {
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status === 503) return null;
    if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
    const xml = await res.text();
    const entryBlock = xml.match(/<entry>[\s\S]*?<\/entry>/i)?.[0] ?? xml;
    const entryTitle = entryBlock.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
    const summary = entryBlock.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.replace(/\s+/g, " ").trim();
    const published = entryBlock.match(/<published>([^<]+)<\/published>/i)?.[1];
    const year = published ? Number.parseInt(published.slice(0, 4), 10) : null;
    if (!entryTitle || entryTitle === "Title") return null;
    const arxivDoi = parseArxivEntryDoi(entryBlock);
    return {
      title: entryTitle,
      authors: parseArxivEntryAuthors(entryBlock),
      abstract: summary ?? null,
      year: Number.isFinite(year) ? year : null,
      doi: arxivDoi,
      arxiv_id: id,
      venue: "arXiv",
      type: "article",
      source: "arxiv",
      pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("arXiv request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const arxivSource: BibliographicSource = {
  id: "arxiv",
  label: "arXiv",
  supports: { arxiv: true },
  priority: 15,
  enabled: true,
  resolveByArxiv,
};
