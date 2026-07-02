/**
 * BibliographicSource — interface every metadata source implements.
 * Add a new source: create `sources/<name>.ts`, register in `sources/index.ts`.
 */
import type { BibliographicMetadata } from "../types";

export interface BibliographicSource {
  /** Stable id, stored in `papers.source`. */
  id: string;
  /** Human-readable name for UI / logs. */
  label: string;
  /** Lookup capabilities. The resolver only calls supported methods. */
  supports: {
    doi?: boolean;
    arxiv?: boolean;
    title?: boolean;
    isbn?: boolean;
    pmid?: boolean;
    adsBibcode?: boolean;
  };
  /** Lower runs first in the chain. */
  priority: number;
  /** Can be toggled off without removing from registry. */
  enabled: boolean;
  resolveByDoi?(doi: string): Promise<BibliographicMetadata | null>;
  resolveByArxiv?(arxivId: string): Promise<BibliographicMetadata | null>;
  resolveByTitle?(title: string): Promise<BibliographicMetadata | null>;
  resolveByIsbn?(isbn: string): Promise<BibliographicMetadata | null>;
  resolveByPmid?(pmid: string): Promise<BibliographicMetadata | null>;
  resolveByAdsBibcode?(bibcode: string): Promise<BibliographicMetadata | null>;
}

export interface BibliographicResolveResult {
  metadata: BibliographicMetadata;
  sourcesAttempted: string[];
}
