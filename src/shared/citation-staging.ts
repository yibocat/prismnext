/**
 * Staged citation — a bibliographic reference produced by the AI agent
 * during a chat session, held for user confirmation before being added
 * to the project literature library (`library.db`).
 *
 * Lives only in the renderer store (+ localStorage persistence);
 * never written to SQLite. See
 * `docs/superpowers/specs/2026-07-01-chat-citation-staging-design.md`.
 */
export type StagedCitationDiscovery = "websearch" | "webfetch" | "user" | "agent";

export interface StagedCitation {
  id: string;
  /** Session-scoped reference number, corresponds to `[n]` in chat text. Starts at 1. */
  refId: number;
  /** Owning chat tab id. */
  sessionId: string;
  // Bibliographic snapshot (catalog-resolved, offline-readable)
  title: string;
  authors: string | null;
  year: number | null;
  venue: string | null;
  type: string | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string | null;
  cslJson: Record<string, unknown> | null;
  /** Originating page (websearch result / arXiv abs / user-supplied). */
  sourceUrl: string | null;
  /** Catalog source id: crossref / arxiv / openalex / s2 / dblp / openreview / datacite. */
  catalogSource: string | null;
  catalogVerified: boolean;
  verifyError: string | null;
  discoveredFrom: StagedCitationDiscovery;
  // Link to project library when an existing entry matches by DOI/arXiv.
  libraryPaperId: string | null;
  libraryBibkey: string | null;
  addedToLibrary: boolean;
  addedAt: number | null;
  createdAt: number;
}

/** Subset returned by the bridge `stage` action (no session/ref tracking fields). */
export interface StagedCitationPayload {
  title: string;
  authors: string | null;
  year: number | null;
  venue: string | null;
  type: string | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string | null;
  cslJson: Record<string, unknown> | null;
  sourceUrl: string | null;
  catalogSource: string | null;
  catalogVerified: boolean;
  verifyError: string | null;
  discoveredFrom: StagedCitationDiscovery;
  libraryPaperId: string | null;
  libraryBibkey: string | null;
}

/** Shape emitted by `literature:stage` / bridge `stage` action. */
export interface StageResult {
  staged: boolean;
  verified: boolean;
  refId?: number;
  citation?: StagedCitationPayload;
  alreadyInLibrary?: boolean;
  libraryBibkey?: string | null;
  error?: string;
  hint?: string;
}
