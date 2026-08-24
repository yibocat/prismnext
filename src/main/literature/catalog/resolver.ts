/**
 * Global bibliographic catalog lookup — delegates to the source registry.
 * Add sources in `sources/index.ts`, not here.
 */
import type {
  BibliographicMetadataQuery,
  BibliographicResolveResult,
} from "../../../shared/bibliographic-metadata/types";
import { resolveByArxiv, resolveByDoi, resolveByTitle, resolveByIsbn, resolveByPmid, resolveByAdsBibcode } from "./sources";

export { mergeBibliographicMetadata } from "../../../shared/bibliographic-metadata/sources/resolver-helpers";
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
  if (query.isbn) {
    return resolveByIsbn(query.isbn);
  }
  if (query.pmid) {
    return resolveByPmid(query.pmid);
  }
  if (query.adsBibcode) {
    return resolveByAdsBibcode(query.adsBibcode);
  }
  if (query.title) {
    return resolveByTitle(query.title);
  }
  throw new Error("Provide a valid doi, arxivId, isbn, pmid, adsBibcode, or title");
}

export type {
  BibliographicMetadata,
  BibliographicMetadataQuery,
  BibliographicResolveResult,
  BibliographicSource,
} from "../../../shared/bibliographic-metadata/types";
