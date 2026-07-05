export interface BibFallbackEntry {
  bibkey: string;
  title: string | null;
  doi: string | null;
  arxivId: string | null;
  canImportFromBib: boolean;
}

export interface CitationHealthLibraryCheck {
  texFilesScanned: number;
  citeKeysInTex: string[];
  knownKeys: string[];
  missingKeys: string[];
  unusedKeys: string[];
}

export interface CitationHealthBibCheck {
  texFilesScanned: number;
  bibPath: string | null;
  citeKeysInTex: string[];
  keysInBib: string[];
  missingKeys: string[];
  unusedKeys: string[];
  duplicateKeys: string[];
  libraryCheck?: CitationHealthLibraryCheck;
}

export interface CitationHealthReport {
  bibCheck: CitationHealthBibCheck;
  libraryCheck: CitationHealthLibraryCheck;
  bibFallback: BibFallbackEntry[];
  /** Keys in manuscript .bib that are not in library.db — policy violation under library-first rules. */
  bibKeysNotInLibrary: string[];
}

export interface MergeIntoManuscriptBibResult {
  bibPath: string;
  appended: string[];
  skipped: string[];
  notFound: string[];
  papersProcessed: number;
}

export interface ImportFromManuscriptBibResult {
  imported: number;
  skipped: number;
  notInBib: string[];
  importedPaperIds: string[];
}
