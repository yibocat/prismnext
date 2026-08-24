import { normalizeArxivId, normalizeDoi, arxivIdFromDoi } from "./doi-utils";

export type PdfEntryIdentityCheck = "match" | "mismatch" | "unverified";

export type NormalizedLiteratureIdentifiers = {
  doi: string | null;
  arxivId: string | null;
};

export function normalizeLiteratureIdentifiers(input: {
  doi?: string | null;
  arxivId?: string | null;
  arxiv_id?: string | null;
}): NormalizedLiteratureIdentifiers {
  const doi = input.doi ? normalizeDoi(input.doi) : null;
  const arxivRaw = input.arxivId ?? input.arxiv_id ?? null;
  const arxivId = arxivRaw ? normalizeArxivId(arxivRaw) : null;
  return {
    doi,
    arxivId: arxivId ?? arxivIdFromDoi(doi) ?? null,
  };
}

/** Compare catalog entry identifiers with those extracted from a PDF. */
export function checkPdfMatchesEntry(
  entry: { doi?: string | null; arxiv_id?: string | null },
  pdf: { doi?: string | null; arxivId?: string | null },
): PdfEntryIdentityCheck {
  const entryIds = normalizeLiteratureIdentifiers(entry);
  const pdfIds = normalizeLiteratureIdentifiers(pdf);

  const entryHasId = Boolean(entryIds.doi || entryIds.arxivId);
  const pdfHasId = Boolean(pdfIds.doi || pdfIds.arxivId);

  if (!entryHasId) return "match";
  if (!pdfHasId) return "unverified";

  if (entryIds.doi && pdfIds.doi && entryIds.doi === pdfIds.doi) return "match";
  if (entryIds.arxivId && pdfIds.arxivId && entryIds.arxivId === pdfIds.arxivId) return "match";
  if (entryIds.doi && pdfIds.arxivId && arxivIdFromDoi(entryIds.doi) === pdfIds.arxivId) {
    return "match";
  }
  if (pdfIds.doi && entryIds.arxivId && arxivIdFromDoi(pdfIds.doi) === entryIds.arxivId) {
    return "match";
  }

  return "mismatch";
}

export function formatIdentifierBrief(ids: NormalizedLiteratureIdentifiers): string {
  if (ids.doi) return `DOI ${ids.doi}`;
  if (ids.arxivId) return `arXiv ${ids.arxivId}`;
  return "no identifier";
}
