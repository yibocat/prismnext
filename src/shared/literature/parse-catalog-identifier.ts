import {
  arxivIdFromDoi,
  extractArxivFromText,
  extractDoisFromText,
  normalizeArxivId,
  normalizeDoi,
} from "./doi-utils";
import { normalizeAdsBibcode, normalizeIsbn, normalizePmid } from "./catalog-identifier-utils";

export type CatalogIdentifierFields = {
  doi?: string;
  arxivId?: string;
  isbn?: string;
  pmid?: string;
  adsBibcode?: string;
};

export type ParsedCatalogIdentifier =
  | ({ ok: true } & CatalogIdentifierFields)
  | { ok: false; error: string };

/** Parse user paste into catalog lookup keys. */
export function parseCatalogIdentifier(raw: string): ParsedCatalogIdentifier {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter an identifier" };
  }

  const arxivFromText = extractArxivFromText(trimmed);
  if (arxivFromText) {
    return { ok: true, arxivId: arxivFromText };
  }

  const adsBibcode = normalizeAdsBibcode(trimmed);
  if (adsBibcode) {
    return { ok: true, adsBibcode };
  }

  const pmid = normalizePmid(trimmed);
  if (pmid) {
    return { ok: true, pmid };
  }

  const isbn = normalizeIsbn(trimmed);
  if (isbn) {
    return { ok: true, isbn };
  }

  const bareArxiv = normalizeArxivId(trimmed.replace(/^arxiv:/i, "").trim());
  if (bareArxiv && !/^10\.\d/.test(trimmed)) {
    return { ok: true, arxivId: bareArxiv };
  }

  const doi = normalizeDoi(trimmed) ?? extractDoisFromText(trimmed)[0] ?? null;
  if (doi) {
    const arxivId = arxivIdFromDoi(doi) ?? undefined;
    return arxivId ? { ok: true, doi, arxivId } : { ok: true, doi };
  }

  return {
    ok: false,
    error: "Unrecognized identifier. Supported: DOI, arXiv, ISBN, PMID, ADS (URL or bare ID).",
  };
}
