import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeArxivId, normalizeDoi } from "../../shared/literature/doi-utils";
import {
  PAPER_CITATION_CACHE_TTL_MS,
  PAPER_CITATION_PAGE_SIZE,
  PAPER_CITATION_UI_MAX_ROWS,
  formatCitationFetchError,
  type PaperCitationEntry,
  type PaperCitationNetworkResult,
  type PaperCitationNetworkSource,
  type PaperCitationSection,
  type PaperCitationSectionKind,
  paperCitationSourceLabel,
} from "../../shared/literature/paper-citation-network";
import { mainNetFetch } from "../lib/main-network";
import { openAlexWorkLookupUrl } from "../../shared/literature/openalex-lookup";
import { getLibraryPaths, getPaper } from "./literature-service";
import {
  fetchS2CitedByPage,
  fetchS2ReferencesPage,
  resolveS2CitationCache,
  type S2CitationCache,
} from "./literature-citation-s2";

const WORK_SELECT =
  "id,doi,ids,title,publication_year,cited_by_count,referenced_works_count,referenced_works,authorships,primary_location";

const HYDRATE_SELECT =
  "id,doi,ids,title,publication_year,cited_by_count,authorships,primary_location";

type OpenAlexWork = {
  id?: string;
  doi?: string;
  ids?: { arxiv?: string };
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  referenced_works_count?: number;
  referenced_works?: string[];
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { source?: { display_name?: string } };
};

type OpenAlexListResponse = {
  results?: OpenAlexWork[];
  meta?: { next_cursor?: string | null; count?: number };
};

type OpenAlexCitationCache = {
  source: "openalex";
  paperId: string;
  openAlexWorkId: string;
  referencedWorksCount: number;
  citedByCount: number;
  referencedWorkIds: string[];
  fetchedAt: number;
};

type S2CacheFile = S2CitationCache & { source: "semantic-scholar" };

export type CitationCacheFile = OpenAlexCitationCache | S2CacheFile;

function citationsCacheDir(projectRoot: string): string {
  return path.join(getLibraryPaths(projectRoot).libraryDir, "cache", "citations");
}

function citationsCachePath(projectRoot: string, paperId: string): string {
  return path.join(citationsCacheDir(projectRoot), `${paperId}.json`);
}

export function extractOpenAlexWorkId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("https://openalex.org/")) {
    return trimmed.replace(/^https:\/\/openalex\.org\//i, "");
  }
  return trimmed;
}

function formatAuthors(work: OpenAlexWork): string | null {
  const names = (work.authorships ?? [])
    .map((a) => a.author?.display_name?.trim())
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return null;
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} et al.`;
}

export function mapOpenAlexWorkToCitationEntry(work: OpenAlexWork): PaperCitationEntry | null {
  const openAlexId = work.id ? extractOpenAlexWorkId(work.id) : "";
  const title = work.title?.trim();
  if (!openAlexId || !title) return null;
  const doiRaw = work.doi?.replace(/^https?:\/\/doi\.org\//i, "") ?? null;
  return {
    openAlexId,
    title,
    authors: formatAuthors(work),
    year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name?.trim() ?? null,
    doi: doiRaw ? normalizeDoi(doiRaw) : null,
    arxivId: work.ids?.arxiv ? normalizeArxivId(work.ids.arxiv) : null,
    citedByCount: work.cited_by_count ?? null,
  };
}

async function fetchOpenAlexJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await mainNetFetch(url);
  } catch (err) {
    throw new Error(formatCitationFetchError(err instanceof Error ? err.message : String(err)));
  }
  if (res.status === 429 || res.status === 503) {
    throw new Error("OpenAlex is temporarily unavailable (rate limited). Try again later.");
  }
  if (res.status === 404) {
    throw new Error("Work not found in OpenAlex.");
  }
  if (!res.ok) {
    throw new Error(`OpenAlex HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function fetchOpenAlexWorkByLookup(
  doi: string | null,
  arxivId: string | null,
): Promise<OpenAlexWork | null> {
  const lookupUrl = openAlexWorkLookupUrl(doi, arxivId);
  if (!lookupUrl) return null;
  const url = `${lookupUrl}?select=${WORK_SELECT}`;
  let res: Response;
  try {
    res = await mainNetFetch(url);
  } catch (err) {
    throw new Error(formatCitationFetchError(err instanceof Error ? err.message : String(err)));
  }
  if (res.status === 404) return null;
  if (res.status === 429 || res.status === 503) {
    throw new Error("OpenAlex is temporarily unavailable (rate limited). Try again later.");
  }
  if (!res.ok) {
    throw new Error(`OpenAlex HTTP ${res.status}`);
  }
  return (await res.json()) as OpenAlexWork;
}

async function hydrateOpenAlexWorks(workIds: readonly string[]): Promise<Map<string, OpenAlexWork>> {
  const byId = new Map<string, OpenAlexWork>();
  if (workIds.length === 0) return byId;

  const chunks: string[][] = [];
  for (let i = 0; i < workIds.length; i += 50) {
    chunks.push(workIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const filter = chunk.map((id) => extractOpenAlexWorkId(id)).join("|");
    const url =
      `https://api.openalex.org/works?filter=openalex:${filter}` +
      `&per-page=50&select=${HYDRATE_SELECT}`;
    const data = await fetchOpenAlexJson<OpenAlexListResponse>(url);
    for (const work of data.results ?? []) {
      if (!work.id) continue;
      byId.set(extractOpenAlexWorkId(work.id), work);
    }
  }

  return byId;
}

function readCache(projectRoot: string, paperId: string): CitationCacheFile | null {
  const filePath = citationsCachePath(projectRoot, paperId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<CitationCacheFile> & {
      openAlexWorkId?: string;
      s2PaperId?: string;
    };
    if (parsed.paperId !== paperId) return null;
    if (Date.now() - (parsed.fetchedAt ?? 0) > PAPER_CITATION_CACHE_TTL_MS) return null;
    if (parsed.source === "semantic-scholar" && parsed.s2PaperId) {
      return parsed as S2CacheFile;
    }
    if ((parsed.source === "openalex" || !parsed.source) && parsed.openAlexWorkId) {
      // Narrow to the openalex variant — Partial<CitationCacheFile> is a union
      // of Partial<OpenAlexCitationCache> | Partial<S2CacheFile>, and
      // referencedWorkIds only exists on the openalex member, so accessing it
      // on the un-narrowed union is a type error.
      const openalexParsed = parsed as Partial<OpenAlexCitationCache>;
      return {
        source: "openalex",
        paperId: parsed.paperId!,
        openAlexWorkId: parsed.openAlexWorkId,
        referencedWorksCount: openalexParsed.referencedWorksCount ?? 0,
        citedByCount: openalexParsed.citedByCount ?? 0,
        referencedWorkIds: openalexParsed.referencedWorkIds ?? [],
        fetchedAt: parsed.fetchedAt!,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(projectRoot: string, cache: CitationCacheFile): void {
  const dir = citationsCacheDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(citationsCachePath(projectRoot, cache.paperId), JSON.stringify(cache, null, 2));
}

async function resolveOpenAlexCache(
  projectRoot: string,
  paperId: string,
  doi: string | null,
  arxivId: string | null,
): Promise<OpenAlexCitationCache> {
  const work = await fetchOpenAlexWorkByLookup(doi, arxivId);
  if (!work?.id) {
    throw new Error("Work not found in OpenAlex for this paper's DOI or arXiv ID.");
  }

  const referencedWorkIds = (work.referenced_works ?? []).map(extractOpenAlexWorkId).filter(Boolean);
  const cache: OpenAlexCitationCache = {
    source: "openalex",
    paperId,
    openAlexWorkId: extractOpenAlexWorkId(work.id),
    referencedWorksCount: work.referenced_works_count ?? referencedWorkIds.length,
    citedByCount: work.cited_by_count ?? 0,
    referencedWorkIds,
    fetchedAt: Date.now(),
  };
  writeCache(projectRoot, cache);
  return cache;
}

async function resolveS2CacheFile(
  projectRoot: string,
  paperId: string,
  doi: string | null,
  arxivId: string | null,
): Promise<S2CacheFile> {
  const base = await resolveS2CitationCache(paperId, doi, arxivId);
  const cache: S2CacheFile = { ...base, source: "semantic-scholar" };
  writeCache(projectRoot, cache);
  return cache;
}

async function resolveCache(
  projectRoot: string,
  paperId: string,
  doi: string | null,
  arxivId: string | null,
  refresh: boolean,
): Promise<{ cache: CitationCacheFile; fallbackNote?: string }> {
  if (!refresh) {
    const cached = readCache(projectRoot, paperId);
    if (cached) return { cache: cached };
  }

  try {
    const cache = await resolveOpenAlexCache(projectRoot, paperId, doi, arxivId);
    return { cache };
  } catch (openAlexErr) {
    const openAlexMessage =
      openAlexErr instanceof Error ? openAlexErr.message : String(openAlexErr);
    try {
      const cache = await resolveS2CacheFile(projectRoot, paperId, doi, arxivId);
      return {
        cache,
        fallbackNote: `OpenAlex 不可用（${openAlexMessage}），已改用 Semantic Scholar。`,
      };
    } catch (s2Err) {
      const s2Message = s2Err instanceof Error ? s2Err.message : String(s2Err);
      throw new Error(
        `OpenAlex 与 Semantic Scholar 均不可用。\nOpenAlex: ${openAlexMessage}\nSemantic Scholar: ${s2Message}`,
      );
    }
  }
}

function parseReferencesOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function fetchOpenAlexReferencesPage(
  cache: OpenAlexCitationCache,
  cursor: string | undefined,
  pageSize: number,
): Promise<PaperCitationSection> {
  const offset = parseReferencesOffset(cursor);
  const sliceIds = cache.referencedWorkIds.slice(offset, offset + pageSize);
  const hydrated = await hydrateOpenAlexWorks(sliceIds);
  const items: PaperCitationEntry[] = [];
  for (const id of sliceIds) {
    const work = hydrated.get(id);
    if (!work) continue;
    const entry = mapOpenAlexWorkToCitationEntry(work);
    if (entry) items.push(entry);
  }

  const nextOffset = offset + pageSize;
  const capped = nextOffset >= PAPER_CITATION_UI_MAX_ROWS;
  const hasMoreInList = nextOffset < cache.referencedWorkIds.length;
  const hasMore = hasMoreInList && !capped;

  return {
    totalCount: cache.referencedWorksCount,
    items,
    hasMore,
    nextCursor: hasMore ? String(nextOffset) : null,
  };
}

async function fetchOpenAlexCitedByPage(
  cache: OpenAlexCitationCache,
  cursor: string | undefined,
  pageSize: number,
): Promise<PaperCitationSection> {
  const params = new URLSearchParams({
    filter: `cites:${cache.openAlexWorkId}`,
    sort: "cited_by_count:desc",
    "per-page": String(pageSize),
    select: HYDRATE_SELECT,
  });
  if (cursor) params.set("cursor", cursor);

  const url = `https://api.openalex.org/works?${params.toString()}`;
  const data = await fetchOpenAlexJson<OpenAlexListResponse>(url);
  const items = (data.results ?? [])
    .map(mapOpenAlexWorkToCitationEntry)
    .filter((e): e is PaperCitationEntry => Boolean(e));

  const nextCursor = data.meta?.next_cursor ?? null;

  return {
    totalCount: cache.citedByCount,
    items,
    hasMore: Boolean(nextCursor),
    nextCursor,
  };
}

async function fetchSectionPage(
  cache: CitationCacheFile,
  section: PaperCitationSectionKind,
  cursor: string | undefined,
  pageSize: number,
): Promise<PaperCitationSection> {
  if (cache.source === "semantic-scholar") {
    return section === "references"
      ? fetchS2ReferencesPage(cache, cursor, pageSize)
      : fetchS2CitedByPage(cache, cursor, pageSize);
  }
  return section === "references"
    ? fetchOpenAlexReferencesPage(cache, cursor, pageSize)
    : fetchOpenAlexCitedByPage(cache, cursor, pageSize);
}

function failureResult(error: string, source: PaperCitationNetworkSource = "openalex"): PaperCitationNetworkResult {
  return { ok: false, error: formatCitationFetchError(error), source };
}

function successResult(
  cache: CitationCacheFile,
  references: PaperCitationSection,
  citedBy: PaperCitationSection,
  fallbackNote?: string,
): PaperCitationNetworkResult {
  return {
    ok: true,
    openAlexWorkId: cache.source === "openalex" ? cache.openAlexWorkId : undefined,
    references,
    citedBy,
    cachedAt: cache.fetchedAt,
    source: cache.source,
    sourceNote: fallbackNote,
  };
}

function workIdFromCache(cache: CitationCacheFile): string | undefined {
  return cache.source === "openalex" ? cache.openAlexWorkId : cache.s2PaperId;
}

export async function getPaperCitationNetwork(
  projectRoot: string,
  paperId: string,
  opts: { refresh?: boolean } = {},
): Promise<PaperCitationNetworkResult> {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) return failureResult("Paper not found.");

  const doi = paper.doi ? normalizeDoi(paper.doi) : null;
  const arxivId = paper.arxiv_id ? normalizeArxivId(paper.arxiv_id) : null;
  if (!doi && !arxivId) {
    return failureResult("Add a DOI or arXiv ID to this entry to load references and cited-by lists.");
  }

  try {
    const { cache, fallbackNote } = await resolveCache(
      projectRoot,
      paperId,
      doi,
      arxivId,
      opts.refresh ?? false,
    );
    const [references, citedBy] = await Promise.all([
      fetchSectionPage(cache, "references", undefined, PAPER_CITATION_PAGE_SIZE),
      fetchSectionPage(cache, "citedBy", undefined, PAPER_CITATION_PAGE_SIZE),
    ]);
    return successResult(cache, references, citedBy, fallbackNote);
  } catch (err) {
    return failureResult(err instanceof Error ? err.message : String(err));
  }
}

export async function getPaperCitationNetworkPage(
  projectRoot: string,
  paperId: string,
  section: PaperCitationSectionKind,
  cursor: string,
  opts: { refresh?: boolean } = {},
): Promise<PaperCitationNetworkResult> {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) return failureResult("Paper not found.");

  const doi = paper.doi ? normalizeDoi(paper.doi) : null;
  const arxivId = paper.arxiv_id ? normalizeArxivId(paper.arxiv_id) : null;
  if (!doi && !arxivId) {
    return failureResult("Add a DOI or arXiv ID to this entry to load references and cited-by lists.");
  }

  try {
    const { cache, fallbackNote } = await resolveCache(
      projectRoot,
      paperId,
      doi,
      arxivId,
      opts.refresh ?? false,
    );
    const sectionData = await fetchSectionPage(cache, section, cursor, PAPER_CITATION_PAGE_SIZE);
    return {
      ok: true,
      openAlexWorkId: workIdFromCache(cache),
      ...(section === "references" ? { references: sectionData } : { citedBy: sectionData }),
      cachedAt: cache.fetchedAt,
      source: cache.source,
      sourceNote: fallbackNote,
    };
  } catch (err) {
    return failureResult(err instanceof Error ? err.message : String(err));
  }
}

/** @internal test hooks */
export const __testing = {
  fetchOpenAlexReferencesPage,
  fetchOpenAlexCitedByPage,
  mapOpenAlexWorkToCitationEntry,
  extractOpenAlexWorkId,
  resolveOpenAlexCache,
};
