import { normalizeArxivId, normalizeDoi } from "../../doi-utils";
import { authorsJsonFromParts } from "../helpers";
import type { BibliographicMetadata } from "../types";
import type { BibliographicSource } from "./types";
import { catalogFetch } from "../catalog-fetch";

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

const ARXIV_FETCH_TIMEOUT_MS = 15_000;
const ARXIV_RETRYABLE_STATUSES = new Set([429, 503]);

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchArxivApi(id: string, signal: AbortSignal): Promise<Response> {
  const res = await catalogFetch(
    `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`,
    { signal },
  );
  if (ARXIV_RETRYABLE_STATUSES.has(res.status)) {
    throw new Error(`arXiv temporarily unavailable (HTTP ${res.status})`);
  }
  if (res.status === 404) return res;
  if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
  return res;
}

async function resolveByArxiv(rawArxiv: string): Promise<BibliographicMetadata | null> {
  const id = normalizeArxivId(rawArxiv);
  if (!id) return null;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ARXIV_FETCH_TIMEOUT_MS);
    try {
      const res = await fetchArxivApi(id, controller.signal);
      const xml = await res.text();
      if (/<opensearch:totalResults>\s*0\s*<\/opensearch:totalResults>/i.test(xml)) {
        return null;
      }
      const entryBlock = xml.match(/<entry>[\s\S]*?<\/entry>/i)?.[0];
      if (!entryBlock) return null;
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
      lastErr = err;
      const retryable =
        err instanceof Error
        && (err.name === "AbortError"
          || err.message.includes("temporarily unavailable")
          || err.message.includes("timed out"));
      if (retryable && attempt === 0) {
        await delay(1200);
        continue;
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("arXiv request timed out");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export const arxivSource: BibliographicSource = {
  id: "arxiv",
  label: "arXiv",
  supports: { arxiv: true },
  priority: 15,
  enabled: true,
  resolveByArxiv,
};
