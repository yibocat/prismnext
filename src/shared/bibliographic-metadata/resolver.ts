/**
 * Global bibliographic catalog lookup — delegates to the source registry.
 * Add sources in `sources/index.ts`, not here.
 */
import type {
  BibliographicMetadata,
  BibliographicMetadataQuery,
  BibliographicResolveResult,
  BibliographicSource,
} from "./types";
import { resolveByArxiv, resolveByDoi, resolveByTitle } from "./sources";

export { mergeBibliographicMetadata } from "./sources/resolver-helpers";
export { SOURCE_REGISTRY, listSources } from "./sources";

export async function resolveBibliographicMetadata(
  query: BibliographicMetadataQuery,
  options?: { fast?: boolean },
): Promise<BibliographicResolveResult> {
  const fast = options?.fast ?? false;
  if (query.doi) {
    return resolveByDoi(query.doi, fast ? { fast: true } : undefined);
  }
  if (query.arxivId) {
    return resolveByArxiv(query.arxivId, fast ? { fast: true } : undefined);
  }
  if (query.title) {
    return resolveByTitle(query.title);
  }
  throw new Error("Provide a valid doi, arxivId, or title");
}

export type { BibliographicMetadata, BibliographicMetadataQuery, BibliographicResolveResult, BibliographicSource };
