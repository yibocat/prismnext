import { DatabaseSync } from "node:sqlite";

export type { LiteraturePaper, PaperAiMetadataStatus } from "../../shared/literature/paper";

export interface PaperRow {
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
  raw_bibtex: string | null;
  csl_json: string | null;
  /** JSON string array in DB — use `parsePaperTagsJson` for UI. */
  tags: string | null;
  ai_summary: string | null;
  ai_metadata_at: number | null;
  ai_metadata_sha: string | null;
  /** Virtual — JOINed from paper_ai_metadata. */
  ai_metadata_status: string | null;
  ai_metadata_error: string | null;
  /** Virtual field — JOINed from zotero_mirror, not a papers column. */
  zotero_key: string | null;
  created_at: number;
  updated_at: number;
}

export interface AnnotationRow {
  id: string;
  paper_id: string;
  kind: string;
  page: number;
  rects: string;
  quoted_text: string | null;
  color: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface CollectionRow {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  paper_count?: number;
  zotero_key?: string | null;
  zotero_parent?: string | null;
  zotero_version?: number | null;
}

export interface LibraryPaths {
  libraryDir: string;
  dbPath: string;
  attachmentsDir: string;
  extractDir: string;
}

export type LibraryDb = DatabaseSync;
