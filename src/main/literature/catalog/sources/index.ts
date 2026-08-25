/**
 * Source registry — single place to add/remove bibliographic metadata sources.
 *
 * To add a source:
 * 1. Create `sources/<name>.ts` exporting a `BibliographicSource`.
 * 2. Import and add it to `SOURCE_REGISTRY` below.
 * 3. (optional) Add its id to `BibliographicSource` type in `types.ts`.
 */
import { normalizeDoi, normalizeArxivId } from "../../../../shared/literature/doi-utils";
import { normalizeIsbn, normalizePmid, normalizeAdsBibcode } from "../../../../shared/literature/catalog-identifier-utils";
import type { BibliographicMetadata, BibliographicResolveResult } from "../../../../shared/bibliographic-metadata/types";
import { mergeBibliographicMetadata, hasAnyAbstract } from "../../../../shared/bibliographic-metadata/sources/resolver-helpers";
import type { BibliographicSource } from "../../../../shared/bibliographic-metadata/sources/types";
import { warnCatalogFailure } from "../../../../shared/bibliographic-metadata/catalog-warn";
import { crossrefSource } from "./crossref";
import { dblpSource } from "./dblp";
import { semanticScholarSource } from "./semantic-scholar";
import { openalexSource } from "./openalex";
import { arxivSource } from "./arxiv";
import { dataciteSource } from "./datacite";
import { openreviewSource } from "./openreview";
import { pubmedSource } from "./pubmed";

export type { BibliographicSource } from "../../../../shared/bibliographic-metadata/sources/types";
export type { BibliographicResolveResult } from "../../../../shared/bibliographic-metadata/types";

/** Ordered list. Lower priority runs first. Add new sources here. */
export const SOURCE_REGISTRY: BibliographicSource[] = [
  crossrefSource,
  pubmedSource,
  dblpSource,
  arxivSource,
  semanticScholarSource,
  openreviewSource,
  openalexSource,
  dataciteSource,
];

const enabledSources = () => SOURCE_REGISTRY.filter((s) => s.enabled).sort((a, b) => a.priority - b.priority);

function tryMergeSource(
  merged: BibliographicMetadata | null,
  attempted: string[],
  sourceId: string,
  meta: BibliographicMetadata | null,
): BibliographicMetadata | null {
  if (!attempted.includes(sourceId)) attempted.push(sourceId);
  if (!meta?.title?.trim()) return merged;
  return merged ? mergeBibliographicMetadata(merged, meta) : meta;
}

function formatResolveFailure(
  kind: "DOI" | "arXiv",
  id: string,
  attempted: string[],
  failures: string[],
): string {
  const tried = attempted.join(", ") || "none";
  const detail = failures.length ? ` (${failures.join("; ")})` : "";
  return `No metadata found for ${kind} ${id} (tried: ${tried})${detail}`;
}

async function querySource(
  sourceId: string,
  attempted: string[],
  failures: string[],
  query: () => Promise<BibliographicMetadata | null>,
): Promise<BibliographicMetadata | null> {
  if (!attempted.includes(sourceId)) attempted.push(sourceId);
  try {
    return await query();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${sourceId}: ${msg}`);
    warnCatalogFailure(sourceId, err);
    return null;
  }
}

async function resolveByDoiFast(doi: string): Promise<BibliographicResolveResult> {
  const attempted: string[] = [];
  const failures: string[] = [];
  let merged: BibliographicMetadata | null = null;

  if (crossrefSource.resolveByDoi) {
    const meta = await querySource("crossref", attempted, failures, () =>
      crossrefSource.resolveByDoi!(doi),
    );
    merged = tryMergeSource(merged, attempted, "crossref", meta);
  }

  const needsOpenAlex = !merged?.title?.trim() || !hasAnyAbstract(merged?.abstract);
  if (needsOpenAlex && openalexSource.resolveByDoi) {
    const meta = await querySource("openalex", attempted, failures, () =>
      openalexSource.resolveByDoi!(doi),
    );
    merged = tryMergeSource(merged, attempted, "openalex", meta);
  }

  if (!merged?.title?.trim()) {
    throw new Error(formatResolveFailure("DOI", doi, attempted, failures));
  }
  return { metadata: merged, sourcesAttempted: attempted };
}

async function resolveByArxivFast(arxivId: string): Promise<BibliographicResolveResult> {
  const attempted: string[] = [];
  const failures: string[] = [];
  let merged: BibliographicMetadata | null = null;

  if (arxivSource.resolveByArxiv) {
    const meta = await querySource("arxiv", attempted, failures, () =>
      arxivSource.resolveByArxiv!(arxivId),
    );
    merged = tryMergeSource(merged, attempted, "arxiv", meta);
  }

  // arXiv API is authoritative for abs IDs — only fall back when it returns no title.
  const needsOpenAlex = !merged?.title?.trim();
  if (needsOpenAlex && openalexSource.resolveByArxiv) {
    const meta = await querySource("openalex", attempted, failures, () =>
      openalexSource.resolveByArxiv!(arxivId),
    );
    merged = tryMergeSource(merged, attempted, "openalex", meta);
  }

  if (!merged?.title?.trim()) {
    throw new Error(formatResolveFailure("arXiv", arxivId, attempted, failures));
  }
  return { metadata: merged, sourcesAttempted: attempted };
}

async function runChain(
  fn: (s: BibliographicSource) => Promise<BibliographicMetadata | null>,
  opts?: { stopWhenTitle?: boolean },
): Promise<{ merged: BibliographicMetadata | null; attempted: string[] }> {
  const sources = enabledSources();
  const attempted: string[] = [];
  let merged: BibliographicMetadata | null = null;
  for (const source of sources) {
    attempted.push(source.id);
    try {
      const meta = await fn(source);
      if (!meta) continue;
      merged = merged ? mergeBibliographicMetadata(merged, meta) : meta;
      if (opts?.stopWhenTitle && merged.title?.trim()) break;
    } catch (err) {
      warnCatalogFailure(source.id, err);
    }
  }
  return { merged, attempted };
}

export async function resolveByDoi(
  rawDoi: string,
  opts?: { fast?: boolean },
): Promise<BibliographicResolveResult> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) throw new Error("Provide a valid DOI");
  if (opts?.fast) {
    return resolveByDoiFast(doi);
  }
  const { merged, attempted } = await runChain(async (s) =>
    s.supports.doi && s.resolveByDoi ? s.resolveByDoi(doi) : null,
  );
  if (merged) return { metadata: merged, sourcesAttempted: attempted };
  throw new Error(`No metadata found for DOI ${doi} (tried: ${attempted.join(", ")})`);
}

export async function resolveByArxiv(
  rawArxiv: string,
  opts?: { fast?: boolean },
): Promise<BibliographicResolveResult> {
  const arxivId = normalizeArxivId(rawArxiv);
  if (!arxivId) throw new Error("Provide a valid arXiv ID");
  if (opts?.fast) {
    return resolveByArxivFast(arxivId);
  }
  const { merged, attempted } = await runChain(async (s) =>
    s.supports.arxiv && s.resolveByArxiv ? s.resolveByArxiv(arxivId) : null,
  );
  if (merged) return { metadata: merged, sourcesAttempted: attempted };
  throw new Error(`No metadata found for arXiv ${arxivId} (tried: ${attempted.join(", ")})`);
}

export async function resolveByTitle(title: string): Promise<BibliographicResolveResult> {
  const clean = title.trim();
  if (!clean) throw new Error("Provide a title");
  const { merged, attempted } = await runChain(async (s) =>
    s.supports.title && s.resolveByTitle ? s.resolveByTitle(clean) : null,
  );
  if (merged) return { metadata: merged, sourcesAttempted: attempted };
  throw new Error(`No metadata found for title (tried: ${attempted.join(", ")})`);
}

export async function resolveByIsbn(rawIsbn: string): Promise<BibliographicResolveResult> {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) throw new Error("Provide a valid ISBN");
  const { merged, attempted } = await runChain(async (s) =>
    s.supports.isbn && s.resolveByIsbn ? s.resolveByIsbn(isbn) : null,
  );
  if (merged) return { metadata: merged, sourcesAttempted: attempted };
  throw new Error(`No metadata found for ISBN ${isbn} (tried: ${attempted.join(", ")})`);
}

export async function resolveByPmid(rawPmid: string): Promise<BibliographicResolveResult> {
  const pmid = normalizePmid(rawPmid);
  if (!pmid) throw new Error("Provide a valid PMID");
  const { merged, attempted } = await runChain(async (s) =>
    s.supports.pmid && s.resolveByPmid ? s.resolveByPmid(pmid) : null,
  );
  if (merged) return { metadata: merged, sourcesAttempted: attempted };
  throw new Error(`No metadata found for PMID ${pmid} (tried: ${attempted.join(", ")})`);
}

export async function resolveByAdsBibcode(rawBibcode: string): Promise<BibliographicResolveResult> {
  const bibcode = normalizeAdsBibcode(rawBibcode);
  if (!bibcode) throw new Error("Provide a valid ADS bibcode");
  const { merged, attempted } = await runChain(async (s) =>
    s.supports.adsBibcode && s.resolveByAdsBibcode ? s.resolveByAdsBibcode(bibcode) : null,
  );
  if (merged) return { metadata: merged, sourcesAttempted: attempted };
  throw new Error(`No metadata found for ADS bibcode ${bibcode} (tried: ${attempted.join(", ")})`);
}

export function listSources(): Array<{ id: string; label: string; enabled: boolean }> {
  return SOURCE_REGISTRY.map((s) => ({ id: s.id, label: s.label, enabled: s.enabled }));
}
