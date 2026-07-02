/**
 * DBLP — computer science bibliography.
 * Best coverage for top AI/ML/NLP/CV conferences: NeurIPS, ICML, ICLR, CVPR,
 * ICCV, ECCV, ACL, EMNLP, NAACL, AAAI, IJCAI, KDD, WWW, SIGIR, etc.
 *
 * API: https://dblp.org/search/publ/api?q=<query>&format=json
 * No API key required; rate limits are generous but please cache.
 */
import { normalizeDoi } from "../../doi-utils";
import { authorsJsonFromParts } from "../helpers";
import type { BibliographicMetadata } from "../types";
import type { BibliographicSource } from "./types";
import { catalogFetch } from "../catalog-fetch";

const DBLP_BASE = "https://dblp.org/search/publ/api";

interface DblpHit {
  info?: {
    title?: string;
    authors?: { author?: Array<{ text?: string }> | { text?: string } };
    year?: string;
    venue?: string;
    type?: string;
    doi?: string;
    pubtype?: string;
  };
}

interface DblpResponse {
  result?: {
    hits?: {
      hit?: Array<{ info?: DblpHit["info"] }>;
    };
  };
}

function parseAuthors(authors: DblpHit["info"]["authors"]): string | null {
  if (!authors?.author) return null;
  const list = Array.isArray(authors.author) ? authors.author : [authors.author];
  return authorsJsonFromParts(list.map((a) => ({ name: a.text ?? "" })));
}

function metadataFromHit(info: DblpHit["info"]): BibliographicMetadata | null {
  if (!info?.title) return null;
  const title = info.title.replace(/\.$/, "").trim();
  const year = info.year ? Number.parseInt(info.year, 10) : null;
  const doi = info.doi ? normalizeDoi(info.doi) : null;
  const venue = info.venue?.trim() || null;
  const type = (info.type ?? info.pubtype ?? "article").toLowerCase();
  return {
    title,
    authors: parseAuthors(info.authors),
    abstract: null,
    year: Number.isFinite(year) ? year : null,
    doi,
    arxiv_id: null,
    venue,
    type,
    source: "dblp",
  };
}

async function searchDblp(query: string): Promise<BibliographicMetadata | null> {
  const url = `${DBLP_BASE}?q=${encodeURIComponent(query)}&format=json&h=5`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await catalogFetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Prism/1.0" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`DBLP HTTP ${res.status}`);
    const json = (await res.json()) as DblpResponse;
    const hits = json.result?.hits?.hit ?? [];
    for (const hit of hits) {
      const meta = metadataFromHit(hit.info);
      if (meta) return meta;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveByDoi(rawDoi: string): Promise<BibliographicMetadata | null> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return null;
  return searchDblp(`doi:${doi}`);
}

async function resolveByTitle(title: string): Promise<BibliographicMetadata | null> {
  const clean = title.trim();
  if (!clean) return null;
  return searchDblp(clean);
}

export const dblpSource: BibliographicSource = {
  id: "dblp",
  label: "DBLP",
  supports: { doi: true, title: true },
  priority: 12,
  enabled: true,
  resolveByDoi,
  resolveByTitle,
};
