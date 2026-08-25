import { arxivDoiFromArxivId, arxivIdFromDoi, normalizeArxivId, normalizeDoi } from "./doi-utils";

/**
 * OpenAlex single-work lookup URL.
 * @see https://developers.openalex.org/api-reference/works/get-a-single-work
 *
 * arXiv preprints must use the DataCite DOI (`10.48550/arxiv.*`), not `arxiv.org/abs/…`.
 */
export function openAlexWorkLookupUrl(doi: string | null, arxivId: string | null): string | null {
  const normDoi = doi ? normalizeDoi(doi) : null;
  const arxivDerivedDoi = arxivId ? arxivDoiFromArxivId(arxivId) : null;

  // Prefer explicit DOI unless it is already the arXiv DataCite DOI for this ID.
  if (normDoi) {
    const normArxiv = arxivId ? normalizeArxivId(arxivId) : null;
    const fromDoi = arxivIdFromDoi(normDoi);
    if (!normArxiv || !fromDoi || fromDoi === normArxiv) {
      return `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(normDoi)}`;
    }
  }

  if (arxivDerivedDoi) {
    return `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(arxivDerivedDoi)}`;
  }

  return null;
}
