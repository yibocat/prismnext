/** External bibliographic metadata source. Extend when adding new sources. */
export type BibliographicSource =
  | "crossref"
  | "dblp"
  | "datacite"
  | "openalex"
  | "semantic-scholar"
  | "arxiv"
  | "openreview"
  | "pubmed"
  | "zotero";

export interface BibliographicMetadataQuery {
  doi?: string;
  arxivId?: string;
  isbn?: string;
  pmid?: string;
  adsBibcode?: string;
  title?: string;
}

export interface BibliographicMetadata {
  title: string;
  authors: string | null;
  year: number | null;
  abstract: string | null;
  doi: string | null;
  arxiv_id: string | null;
  venue: string | null;
  type: string | null;
  source: BibliographicSource;
  pdfUrl?: string;
  /** CSL `volume` / BibTeX `volume`. */
  volume?: string | null;
  /** CSL `issue` / BibTeX `number`. */
  issue?: string | null;
  /** CSL `page` — normalized to `"first--last"` when ranged. */
  page?: string | null;
  publisher?: string | null;
  /** CSL `URL`. */
  url?: string | null;
  language?: string | null;
  /** CSL `container-title-short` / journal abbreviation. */
  containerTitleShort?: string | null;
  /** CSL `event` — conference or event name (complements venue). */
  event?: string | null;
  /** JSON author list for editors — same shape as `authors`. */
  editors?: string | null;
  /** CSL `note`. */
  note?: string | null;
}

export interface BibliographicResolveResult {
  metadata: BibliographicMetadata;
  /** IDs of the sources that were attempted (e.g. "openalex", "arxiv").
   *  Not `BibliographicSource[]` — these are string IDs, not source objects. */
  sourcesAttempted: string[];
}
