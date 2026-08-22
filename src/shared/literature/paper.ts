/** IPC / renderer paper DTO. DB row (`PaperRow`) stays in main — tags there are JSON text. */

export type PaperAiMetadataStatus =
  | "idle"
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "skipped";

export interface LiteraturePaper {
  id: string;
  bibkey: string;
  title: string;
  authors: string | null;
  year: number | null;
  abstract: string | null;
  doi: string | null;
  arxiv_id: string | null;
  isbn: string | null;
  venue: string | null;
  type: string | null;
  pdf_path: string | null;
  pdf_sha: string | null;
  origin: string | null;
  metadata_source: string | null;
  csl_json: string | null;
  /** @deprecated Use `origin` instead */
  source: string | null;
  raw_bibtex: string | null;
  zotero_key?: string | null;
  zotero_version?: number | null;
  zotero_attach_key?: string | null;
  /** User-defined project tags (not synced to Zotero). */
  tags: string[];
  ai_summary?: string | null;
  ai_metadata_at?: number | null;
  ai_metadata_sha?: string | null;
  ai_metadata_status?: PaperAiMetadataStatus;
  ai_metadata_error?: string | null;
  created_at: number;
  updated_at: number;
}

export type LiteratureAttachLocalPdfConflict =
  | { kind: "sha_duplicate"; otherPaper: LiteraturePaper }
  | {
      kind: "identifier_duplicate";
      otherPaper: LiteraturePaper;
      doi?: string | null;
      arxivId?: string | null;
    }
  | {
      kind: "target_mismatch";
      entryDoi?: string | null;
      entryArxivId?: string | null;
      pdfDoi?: string | null;
      pdfArxivId?: string | null;
    }
  | {
      kind: "target_unverified";
      entryDoi?: string | null;
      entryArxivId?: string | null;
    };

export interface LiteratureAttachLocalPdfResult {
  paper: LiteraturePaper;
  attached: boolean;
  replaced: boolean;
  conflict?: LiteratureAttachLocalPdfConflict;
  attachError?: string;
}
