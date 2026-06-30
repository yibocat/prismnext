/**
 * Source registry — single place to add/remove bibliographic metadata sources.
 *
 * To add a source:
 * 1. Create `sources/<name>.ts` exporting a `BibliographicSource`.
 * 2. Import and add it to `SOURCE_REGISTRY` below.
 * 3. (optional) Add its id to `BibliographicSource` type in `types.ts`.
 */
import { normalizeDoi, normalizeArxivId } from "../../doi-utils";
import type { BibliographicMetadata, BibliographicResolveResult } from "../types";
import { mergeBibliographicMetadata } from "./resolver-helpers";
import type { BibliographicSource } from "./types";
import { warnCatalogFailure } from "../catalog-warn";
import { crossrefSource } from "./crossref";
import { dblpSource } from "./dblp";
import { semanticScholarSource } from "./semantic-scholar";
import { openalexSource } from "./openalex";
import { arxivSource } from "./arxiv";
import { dataciteSource } from "./datacite";
import { openreviewSource } from "./openreview";

export type { BibliographicSource, BibliographicResolveResult } from "./types";

/** Ordered list. Lower priority runs first. Add new sources here. */
export const SOURCE_REGISTRY: BibliographicSource[] = [
  crossrefSource,
  dblpSource,
  arxivSource,
  semanticScholarSource,
  openreviewSource,
  openalexSource,
  dataciteSource,
];

const enabledSources = () => SOURCE_REGISTRY.filter((s) => s.enabled).sort((a, b) => a.priority - b.priority);

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
    const attempted: string[] = ["crossref"];
    try {
      const meta = crossrefSource.resolveByDoi
        ? await crossrefSource.resolveByDoi(doi)
        : null;
      if (meta?.title?.trim()) {
        return { metadata: meta, sourcesAttempted: attempted };
      }
    } catch (err) {
      warnCatalogFailure("crossref", err);
    }
    attempted.push("openalex");
    try {
      const meta = openalexSource.resolveByDoi ? await openalexSource.resolveByDoi(doi) : null;
      if (meta?.title?.trim()) {
        return { metadata: meta, sourcesAttempted: attempted };
      }
    } catch (err) {
      warnCatalogFailure("openalex", err);
    }
    throw new Error(`No metadata found for DOI ${doi} (tried: ${attempted.join(", ")})`);
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
    const attempted: string[] = ["arxiv"];
    try {
      const meta = arxivSource.resolveByArxiv ? await arxivSource.resolveByArxiv(arxivId) : null;
      if (meta?.title?.trim()) {
        return { metadata: meta, sourcesAttempted: attempted };
      }
    } catch (err) {
      warnCatalogFailure("arxiv", err);
    }
    attempted.push("openalex");
    try {
      const meta = openalexSource.resolveByArxiv ? await openalexSource.resolveByArxiv(arxivId) : null;
      if (meta?.title?.trim()) {
        return { metadata: meta, sourcesAttempted: attempted };
      }
    } catch (err) {
      warnCatalogFailure("openalex", err);
    }
    throw new Error(`No metadata found for arXiv ${arxivId} (tried: ${attempted.join(", ")})`);
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

export function listSources(): Array<{ id: string; label: string; enabled: boolean }> {
  return SOURCE_REGISTRY.map((s) => ({ id: s.id, label: s.label, enabled: s.enabled }));
}
