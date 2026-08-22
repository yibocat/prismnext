import { normalizeArxivId, normalizeDoi } from "../../shared/literature/doi-utils";
import {
  PAPER_CITATION_PAGE_SIZE,
  PAPER_CITATION_UI_MAX_ROWS,
  type PaperCitationEntry,
  type PaperCitationSection,
} from "../../shared/literature/paper-citation-network";
import { mainNetFetch } from "../lib/main-network";

const S2_PAPER_FIELDS = "referenceCount,citationCount";
const S2_EDGE_FIELDS =
  "title,year,venue,citationCount,externalIds,authors.name";

type S2Paper = {
  paperId?: string;
  referenceCount?: number;
  citationCount?: number;
};

type S2NestedPaper = {
  paperId?: string;
  title?: string;
  year?: number;
  venue?: string;
  citationCount?: number;
  externalIds?: { DOI?: string; ArXiv?: string };
  authors?: Array<{ name?: string }>;
};

type S2EdgeList = {
  offset?: number;
  next?: number;
  data?: Array<{ citingPaper?: S2NestedPaper; citedPaper?: S2NestedPaper }>;
};

export type S2CitationCache = {
  paperId: string;
  s2PaperId: string;
  referencedWorksCount: number;
  citedByCount: number;
  fetchedAt: number;
};

function s2PaperIdForLookup(doi: string | null, arxivId: string | null): string | null {
  if (doi) return `DOI:${encodeURIComponent(doi)}`;
  if (arxivId) return `ARXIV:${encodeURIComponent(arxivId)}`;
  return null;
}

function formatS2Authors(authors: S2NestedPaper["authors"]): string | null {
  const names = (authors ?? []).map((a) => a.name?.trim()).filter((n): n is string => Boolean(n));
  if (names.length === 0) return null;
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} et al.`;
}

export function mapS2PaperToCitationEntry(paper: S2NestedPaper): PaperCitationEntry | null {
  const paperId = paper.paperId?.trim();
  const title = paper.title?.trim();
  if (!paperId || !title) return null;
  const doiRaw = paper.externalIds?.DOI ?? null;
  const arxivRaw = paper.externalIds?.ArXiv ?? null;
  return {
    openAlexId: paperId,
    title,
    authors: formatS2Authors(paper.authors),
    year: paper.year ?? null,
    venue: paper.venue?.trim() ?? null,
    doi: doiRaw ? normalizeDoi(doiRaw) : null,
    arxivId: arxivRaw ? normalizeArxivId(arxivRaw) : null,
    citedByCount: paper.citationCount ?? null,
  };
}

async function fetchS2Json<T>(url: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await mainNetFetch(url);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }
    if (res.status === 404) {
      throw new Error("Work not found in Semantic Scholar.");
    }
    if (res.status === 429) {
      lastErr = new Error("Semantic Scholar rate limited (429). Try again later.");
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw lastErr;
    }
    if (!res.ok) {
      throw new Error(`Semantic Scholar HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }
  throw lastErr instanceof Error ? lastErr : new Error("Semantic Scholar request failed.");
}

export async function resolveS2CitationCache(
  paperId: string,
  doi: string | null,
  arxivId: string | null,
): Promise<S2CitationCache> {
  const lookupId = s2PaperIdForLookup(doi, arxivId);
  if (!lookupId) {
    throw new Error("Missing DOI or arXiv ID for Semantic Scholar lookup.");
  }
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/${lookupId}` +
    `?fields=${S2_PAPER_FIELDS}`;
  const paper = await fetchS2Json<S2Paper>(url);
  if (!paper.paperId) {
    throw new Error("Work not found in Semantic Scholar for this DOI or arXiv ID.");
  }
  return {
    paperId,
    s2PaperId: paper.paperId,
    referencedWorksCount: paper.referenceCount ?? 0,
    citedByCount: paper.citationCount ?? 0,
    fetchedAt: Date.now(),
  };
}

function parseOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function fetchS2ReferencesPage(
  cache: S2CitationCache,
  cursor: string | undefined,
  pageSize: number,
): Promise<PaperCitationSection> {
  const offset = parseOffset(cursor);
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/${cache.s2PaperId}/references` +
    `?fields=${S2_EDGE_FIELDS}&offset=${offset}&limit=${pageSize}`;
  const data = await fetchS2Json<S2EdgeList>(url);
  const items = (data.data ?? [])
    .map((row) => row.citedPaper)
    .filter((p): p is S2NestedPaper => Boolean(p))
    .map(mapS2PaperToCitationEntry)
    .filter((e): e is PaperCitationEntry => Boolean(e));

  const nextOffset = offset + pageSize;
  const capped = nextOffset >= PAPER_CITATION_UI_MAX_ROWS;
  const hasMore = data.next != null && data.next > offset && !capped;

  return {
    totalCount: cache.referencedWorksCount,
    items,
    hasMore,
    nextCursor: hasMore ? String(nextOffset) : null,
  };
}

export async function fetchS2CitedByPage(
  cache: S2CitationCache,
  cursor: string | undefined,
  pageSize: number,
): Promise<PaperCitationSection> {
  const offset = parseOffset(cursor);
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/${cache.s2PaperId}/citations` +
    `?fields=${S2_EDGE_FIELDS}&offset=${offset}&limit=${pageSize}`;
  const data = await fetchS2Json<S2EdgeList>(url);
  const items = (data.data ?? [])
    .map((row) => row.citingPaper)
    .filter((p): p is S2NestedPaper => Boolean(p))
    .map(mapS2PaperToCitationEntry)
    .filter((e): e is PaperCitationEntry => Boolean(e))
    .sort((a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0));

  const nextOffset = offset + pageSize;
  const capped = nextOffset >= PAPER_CITATION_UI_MAX_ROWS;
  const hasMore = data.next != null && data.next > offset && !capped;

  return {
    totalCount: cache.citedByCount,
    items,
    hasMore,
    nextCursor: hasMore ? String(nextOffset) : null,
  };
}

/** @internal */
export const __s2Testing = {
  mapS2PaperToCitationEntry,
  s2PaperIdForLookup,
};
