/**
 * Unified catalog → library enrich pipeline.
 * All import paths (PDF, DOI, arXiv, BibTeX follow-up) should funnel through here.
 */
import type { BibliographicMetadata } from "../../shared/bibliographic-metadata";
import {
  bibliographicToPaperPatch,
  bibliographicToCslJson,
  resolveBibliographicMetadata,
} from "../../shared/bibliographic-metadata";
import { normalizeArxivId, normalizeDoi, arxivIdFromDoi } from "../../shared/literature/doi-utils";
import {
  normalizeAdsBibcode,
  normalizeIsbn,
  normalizePmid,
} from "../../shared/literature/catalog-identifier-utils";
import { arxivPdfUrl, downloadPdfBytes, type PdfDownloadProgress } from "../lib/download-pdf";
import * as fs from "node:fs";
import {
  joinPdfAttachAttempts,
  PDF_ATTACH_NO_OA_URL,
  PDF_ATTACH_PAYWALL_FALLBACK,
} from "../../shared/literature/pdf-download-messages";
import type { StagedCitationImportInput, StagedAddProgressPhase } from "../../shared/literature/citation-staging";
import {
  StagedCitationAddCancelledError,
  throwIfStagedCitationAddAborted,
} from "../lib/staged-citation-add-cancelled";
import { extractIdsFromPdfFile } from "../lib/extract-pdf-identifiers";
import type { PaperRow } from "./literature-service";
import {
  applyIdentifiers,
  applyMetadata,
  attachPdfBufferToPaper,
  createPaper,
  deletePaper,
  getPaper,
  ingestPdf,
  recordPdfDownload,
  type CreatePaperResult,
  type IngestPdfResult,
} from "./literature-service";
import {
  onPaperPdfAttached,
  onPaperPdfChanged,
} from "./literature-extract-automation";
import { maybeEnqueueAiMetadataAfterMetadata } from "./literature-ai-metadata-queue";

export interface EnrichPaperResult {
  paper: PaperRow;
  enriched: boolean;
  enrichError?: string;
  pdfAttached?: boolean;
  pdfAttachError?: string;
}

export interface CreatePaperFromCatalogResult extends CreatePaperResult {
  pdfAttached?: boolean;
  pdfAttachError?: string;
}

export interface IngestPdfEnrichResult {
  paper: PaperRow;
  created: boolean;
  duplicateReason?: "pdf" | "doi" | "arxiv";
  identifiersFound: boolean;
  identifiers?: { doi?: string | null; arxivId?: string | null };
  enriched: boolean;
  enrichError?: string;
  pdfAttached?: boolean;
  pdfAttachError?: string;
}

export interface ImportBibTeXEnrichSummary {
  enriched: number;
  enrichFailed: number;
  pdfsAttached: number;
}

export interface PdfAttachResult {
  paper: PaperRow;
  attached: boolean;
  attachError?: string;
}

function catalogPdfUrl(metadata: BibliographicMetadata, paper?: PaperRow): string | null {
  if (metadata.pdfUrl?.trim()) return metadata.pdfUrl.trim();
  const arxivId =
    metadata.arxiv_id ??
    paper?.arxiv_id ??
    arxivIdFromDoi(metadata.doi) ??
    arxivIdFromDoi(paper?.doi) ??
    null;
  return arxivPdfUrl(arxivId);
}

export type StagedAddProgressCallback = (info: {
  phase: StagedAddProgressPhase;
  receivedBytes?: number;
  totalBytes?: number | null;
  pdfAttached?: boolean;
  pdfSkipped?: boolean;
}) => void;

function serializeCslJson(cslJson: StagedCitationImportInput["cslJson"]): string | null {
  if (!cslJson) return null;
  return JSON.stringify(cslJson);
}

function resolvePdfAttachError(
  attach: PdfAttachResult,
  pdfUrl: string | null | undefined,
): string | undefined {
  if (attach.attached) return undefined;
  if (attach.paper.pdf_path) return undefined;
  if (attach.attachError?.trim()) return attach.attachError.trim();
  if (pdfUrl?.trim()) return "PDF download failed for an unknown reason.";
  return PDF_ATTACH_NO_OA_URL;
}

/** Resolve an open PDF URL for staged import — arXiv first, then fast catalog for OA links. */
async function resolvePdfUrlForStaged(input: {
  doi?: string;
  arxivId?: string;
}): Promise<string | null> {
  const arxivId = input.arxivId ?? arxivIdFromDoi(input.doi) ?? null;
  const arxivUrl = arxivPdfUrl(arxivId);
  if (arxivUrl) return arxivUrl;
  if (!input.doi) return null;
  try {
    const { metadata } = await resolveBibliographicMetadata({ doi: input.doi }, { fast: true });
    return catalogPdfUrl(metadata);
  } catch {
    return null;
  }
}

/** Download open PDF URL and attach to entry when none is stored yet. */
export async function tryAttachPdfFromUrl(
  projectRoot: string,
  paperId: string,
  pdfUrl: string | null | undefined,
  onDownloadProgress?: (info: PdfDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<PdfAttachResult> {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) throw new Error("Paper not found");
  if (paper.pdf_path) return { paper, attached: false };
  if (!pdfUrl?.trim()) return { paper, attached: false };

  try {
    throwIfStagedCitationAddAborted(signal);
    const buf = await downloadPdfBytes(pdfUrl, onDownloadProgress, signal);
    throwIfStagedCitationAddAborted(signal);
    const updated = attachPdfBufferToPaper(projectRoot, paperId, buf);
    if (updated.pdf_path && !paper.pdf_path) {
      onPaperPdfAttached(projectRoot, paperId, "download");
      recordPdfDownload(projectRoot, updated, "literature-ingest", pdfUrl, buf.length);
    }
    return { paper: updated, attached: true };
  } catch (err) {
    if (err instanceof StagedCitationAddCancelledError || signal?.aborted) {
      throw new StagedCitationAddCancelledError();
    }
    return {
      paper,
      attached: false,
      attachError: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Resolve DOI/arXiv via global catalog and merge into an existing library row. */
export async function enrichPaperFromCatalog(
  projectRoot: string,
  paperId: string,
  opts?: { doi?: string; arxivId?: string },
): Promise<EnrichPaperResult> {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) throw new Error("Paper not found");

  const doi = opts?.doi ?? paper.doi ?? undefined;
  const arxivId = opts?.arxivId ?? paper.arxiv_id ?? undefined;
  if (!doi && !arxivId) throw new Error("Add a DOI or arXiv ID first");

  try {
    const result = await resolveBibliographicMetadata({ doi, arxivId });
    const patch = bibliographicToPaperPatch(result.metadata) as Partial<PaperRow>;
    const { pdfUrl: _omitPdfUrl, ...withoutExtras } = patch as Partial<PaperRow> & {
      pdfUrl?: string;
    };
    (withoutExtras as Partial<PaperRow> & { csl_json?: string; metadata_source?: string | null }).csl_json =
      bibliographicToCslJson(result.metadata);
    (withoutExtras as Partial<PaperRow> & { metadata_source?: string | null }).metadata_source =
      result.metadata.source;
    const updated = applyMetadata(projectRoot, paperId, withoutExtras);
    const pdfUrl = catalogPdfUrl(result.metadata, updated);
    const attach = await tryAttachPdfFromUrl(
      projectRoot,
      paperId,
      pdfUrl,
    );
    if (attach.attached) {
      onPaperPdfAttached(projectRoot, paperId, "download");
    }
    maybeEnqueueAiMetadataAfterMetadata(projectRoot, attach.paper.id);
    return {
      paper: attach.paper,
      enriched: true,
      pdfAttached: attach.attached,
      pdfAttachError: resolvePdfAttachError(attach, pdfUrl),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { paper, enriched: false, enrichError: message };
  }
}

/**
 * Add a session-staged citation to the library using its verified snapshot —
 * skips the full multi-source catalog chain used by `createPaperFromCatalog`.
 */
export async function createPaperFromStagedCitation(
  projectRoot: string,
  input: StagedCitationImportInput,
  onProgress?: StagedAddProgressCallback,
  opts?: { signal?: AbortSignal },
): Promise<CreatePaperFromCatalogResult> {
  const signal = opts?.signal;
  const doi = input.doi ? normalizeDoi(input.doi) : undefined;
  const arxivId = input.arxivId ? normalizeArxivId(input.arxivId) : undefined;
  if (!doi && !arxivId) throw new Error("Provide a DOI or arXiv ID");
  if (!input.catalogVerified) {
    throw new Error("Citation is not verified — cannot add to library");
  }

  let paperId: string | null = null;
  let createdNewPaper = false;
  try {
    throwIfStagedCitationAddAborted(signal);

    const pdfUrl = await resolvePdfUrlForStaged({ doi: doi ?? undefined, arxivId: arxivId ?? undefined });
    throwIfStagedCitationAddAborted(signal);

    let pdfBuffer: Buffer | null = null;
    let pdfAttachError: string | undefined;
    if (pdfUrl) {
      onProgress?.({ phase: "downloading-pdf" });
      try {
        pdfBuffer = await downloadPdfBytes(
          pdfUrl,
          (info) => onProgress?.({ phase: "downloading-pdf", ...info }),
          signal,
        );
      } catch (err) {
        if (err instanceof StagedCitationAddCancelledError || signal?.aborted) {
          throw new StagedCitationAddCancelledError();
        }
        pdfAttachError = err instanceof Error ? err.message : String(err);
      }
      throwIfStagedCitationAddAborted(signal);
    }

    onProgress?.({ phase: "writing" });
    const createResult = createPaper(projectRoot, {
      title: input.title.trim() || "Untitled",
      authors: input.authors,
      year: input.year,
      abstract: input.abstract,
      doi: doi ?? null,
      arxiv_id: arxivId ?? null,
      venue: input.venue,
      type: input.type,
      origin: "catalog",
      metadata_source: input.catalogSource,
      csl_json: serializeCslJson(input.cslJson),
    });
    paperId = createResult.paper.id;
    createdNewPaper = createResult.created;

    throwIfStagedCitationAddAborted(signal);

    let paper = createResult.paper;
    let pdfAttached = false;
    if (pdfBuffer && !paper.pdf_path) {
      paper = attachPdfBufferToPaper(projectRoot, paper.id, pdfBuffer);
      pdfAttached = Boolean(paper.pdf_path);
      if (pdfAttached) {
        onPaperPdfAttached(projectRoot, paper.id, "import");
        recordPdfDownload(projectRoot, paper, "literature-ingest", pdfUrl!, pdfBuffer.length);
      }
    }

    throwIfStagedCitationAddAborted(signal);

    onProgress?.({
      phase: "done",
      pdfAttached,
      pdfSkipped: !pdfUrl,
    });

    maybeEnqueueAiMetadataAfterMetadata(projectRoot, paper.id);

    return {
      ...createResult,
      paper,
      pdfAttached,
      pdfAttachError: pdfUrl && !pdfAttached ? pdfAttachError ?? PDF_ATTACH_NO_OA_URL : undefined,
    };
  } catch (err) {
    if (
      paperId &&
      createdNewPaper &&
      (err instanceof StagedCitationAddCancelledError || signal?.aborted)
    ) {
      try {
        deletePaper(projectRoot, paperId);
      } catch {
        // Best-effort cleanup after cancel.
      }
      throw new StagedCitationAddCancelledError();
    }
    throw err;
  }
}

/** Catalog lookup → create or merge by identifier. Sources only — no Zotero shortcut. */
export async function createPaperFromCatalog(
  projectRoot: string,
  query: {
    doi?: string;
    arxivId?: string;
    isbn?: string;
    pmid?: string;
    adsBibcode?: string;
  },
  onPdfProgress?: (
    paperId: string,
    info: {
      phase: "resolving" | "downloading";
      receivedBytes?: number;
      totalBytes?: number | null;
    },
  ) => void,
): Promise<CreatePaperFromCatalogResult> {
  const doi = query.doi ? normalizeDoi(query.doi) : undefined;
  const arxivId = query.arxivId ? normalizeArxivId(query.arxivId) : undefined;
  const isbn = query.isbn ? normalizeIsbn(query.isbn) : undefined;
  const pmid = query.pmid ? normalizePmid(query.pmid) : undefined;
  const adsBibcode = query.adsBibcode ? normalizeAdsBibcode(query.adsBibcode) : undefined;
  if (!doi && !arxivId && !isbn && !pmid && !adsBibcode) {
    throw new Error("Provide a DOI, arXiv ID, ISBN, PMID, or ADS bibcode");
  }

  const { metadata } = await resolveBibliographicMetadata({
    doi: doi ?? undefined,
    arxivId: arxivId ?? undefined,
    isbn: isbn ?? undefined,
    pmid: pmid ?? undefined,
    adsBibcode: adsBibcode ?? undefined,
  });
  const patch = bibliographicToPaperPatch(metadata) as Partial<PaperRow>;
  const createResult = createPaper(projectRoot, {
    title: patch.title as string,
    authors: patch.authors as string | null,
    year: patch.year as number | null,
    abstract: patch.abstract as string | null,
    doi: patch.doi as string | null,
    arxiv_id: patch.arxiv_id as string | null,
    venue: patch.venue as string | null,
    type: patch.type as string | null,
    origin: "catalog",
    metadata_source: metadata.source,
    csl_json: bibliographicToCslJson(metadata),
  });

  const pdfUrl = catalogPdfUrl(metadata, createResult.paper);
  if (pdfUrl && !createResult.paper.pdf_path && onPdfProgress) {
    onPdfProgress(createResult.paper.id, { phase: "resolving" });
  }

  const attach = await tryAttachPdfFromUrl(
    projectRoot,
    createResult.paper.id,
    pdfUrl,
    onPdfProgress
      ? (info) =>
          onPdfProgress(createResult.paper.id, {
            phase: "downloading",
            receivedBytes: info.receivedBytes,
            totalBytes: info.totalBytes,
          })
      : undefined,
  );
  if (attach.attached) {
    onPaperPdfAttached(projectRoot, attach.paper.id, "import");
  }

  maybeEnqueueAiMetadataAfterMetadata(projectRoot, attach.paper.id);

  return {
    ...createResult,
    paper: attach.paper,
    pdfAttached: attach.attached,
    pdfAttachError: resolvePdfAttachError(attach, pdfUrl),
  };
}

/**
 * Store PDF → extract identifiers → apply → catalog enrich.
 * Single orchestration for renderer import flows.
 */
export async function ingestPdfWithEnrich(
  projectRoot: string,
  pdfPath: string,
  opts?: { title?: string; doi?: string },
): Promise<IngestPdfEnrichResult> {
  const ingest: IngestPdfResult = ingestPdf(projectRoot, pdfPath, opts);

  if (ingest.created && ingest.paper.pdf_path) {
    onPaperPdfAttached(projectRoot, ingest.paper.id, "import");
  }

  if (!ingest.created) {
    return {
      paper: ingest.paper,
      created: false,
      duplicateReason: ingest.duplicateReason,
      identifiersFound: Boolean(ingest.paper.doi || ingest.paper.arxiv_id),
      enriched: false,
    };
  }

  let paper = ingest.paper;
  let identifiers = extractIdsFromPdfFile(pdfPath);

  if (!identifiers.doi && !identifiers.arxivId && opts?.doi) {
    identifiers = { doi: normalizeDoi(opts.doi), arxivId: null };
  }

  if (!identifiers.doi && !identifiers.arxivId) {
    return {
      paper,
      created: true,
      identifiersFound: false,
      enriched: false,
    };
  }

  const applied = applyIdentifiers(projectRoot, paper.id, {
    doi: identifiers.doi,
    arxivId: identifiers.arxivId,
  });

  if (applied.duplicatePaper) {
    const duplicate = applied.duplicatePaper;
    if (!duplicate.pdf_path) {
      try {
        const buf = fs.readFileSync(pdfPath);
        attachPdfBufferToPaper(projectRoot, duplicate.id, buf);
        onPaperPdfAttached(projectRoot, duplicate.id, "import");
      } catch {
        // Keep merge path even if attach fails — metadata enrich may still help.
      }
    }
    await deletePaper(projectRoot, paper.id);
    const enrich = await enrichPaperFromCatalog(projectRoot, duplicate.id);
    return {
      paper: enrich.paper,
      created: false,
      duplicateReason: "pdf",
      identifiersFound: true,
      identifiers,
      enriched: enrich.enriched,
      enrichError: enrich.enrichError,
      pdfAttached: enrich.pdfAttached,
      pdfAttachError: enrich.pdfAttachError,
    };
  }

  if (!applied.applied || !applied.paper) {
    return {
      paper,
      created: true,
      identifiersFound: true,
      identifiers,
      enriched: false,
    };
  }

  paper = applied.paper;
  const enrich = await enrichPaperFromCatalog(projectRoot, paper.id);
  return {
    paper: enrich.paper,
    created: true,
    identifiersFound: true,
    identifiers,
    enriched: enrich.enriched,
    enrichError: enrich.enrichError,
    pdfAttached: enrich.pdfAttached,
    pdfAttachError: enrich.pdfAttachError,
  };
}

/** Whether a BibTeX-imported row should receive catalog enrich. */
export function paperNeedsCatalogEnrich(paper: PaperRow): boolean {
  if (!paper.doi && !paper.arxiv_id) return false;
  return !paper.abstract?.trim() || !paper.venue?.trim() || paper.title === paper.bibkey;
}

/** After BibTeX import, enrich rows that have DOI/arXiv but may lack abstract/venue. */
export async function enrichImportedPapers(
  projectRoot: string,
  paperIds: string[],
): Promise<ImportBibTeXEnrichSummary> {
  let enriched = 0;
  let enrichFailed = 0;
  let pdfsAttached = 0;

  for (const paperId of paperIds) {
    const paper = getPaper(projectRoot, paperId);
    if (!paper) continue;

    if (paperNeedsCatalogEnrich(paper)) {
      const result = await enrichPaperFromCatalog(projectRoot, paperId);
      if (result.enriched) enriched++;
      else enrichFailed++;
      if (result.pdfAttached) {
        pdfsAttached++;
        onPaperPdfAttached(projectRoot, paperId, "import");
      }
    } else if (!paper.pdf_path) {
      const attach = await tryAttachPdfFromUrl(projectRoot, paperId, arxivPdfUrl(paper.arxiv_id));
      if (attach.attached) {
        pdfsAttached++;
        onPaperPdfAttached(projectRoot, paperId, "import");
      }
    }
  }

  return { enriched, enrichFailed, pdfsAttached };
}

/** User-initiated PDF download from arXiv or catalog open-access link. */
export async function downloadPdfForPaper(
  projectRoot: string,
  paperId: string,
  onDownloadProgress?: (info: PdfDownloadProgress) => void,
): Promise<PdfAttachResult> {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) throw new Error("Paper not found");
  if (paper.pdf_path) {
    return { paper, attached: false, attachError: "PDF already attached" };
  }

  const doi = paper.doi ?? undefined;
  const arxivId =
    normalizeArxivId(paper.arxiv_id) ?? arxivIdFromDoi(paper.doi) ?? undefined;
  if (!doi && !arxivId) {
    return { paper, attached: false, attachError: "Add a DOI or arXiv ID first" };
  }

  let arxivAttachError: string | undefined;
  const triedArxivUrl = arxivPdfUrl(arxivId);
  if (triedArxivUrl) {
    const attach = await tryAttachPdfFromUrl(
      projectRoot,
      paperId,
      triedArxivUrl,
      onDownloadProgress,
    );
    if (attach.attached) return attach;
    arxivAttachError = attach.attachError;
  }

  let metadata;
  try {
    ({ metadata } = await resolveBibliographicMetadata({ doi, arxivId }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      paper,
      attached: false,
      attachError:
        joinPdfAttachAttempts([
          arxivAttachError && triedArxivUrl ? `arXiv: ${arxivAttachError}` : undefined,
          `Catalog lookup: ${message}`,
        ]) ?? message,
    };
  }

  const discoveredArxiv =
    normalizeArxivId(metadata.arxiv_id) ?? arxivIdFromDoi(metadata.doi) ?? arxivId;
  const retryArxivUrl = arxivPdfUrl(discoveredArxiv);
  if (retryArxivUrl && retryArxivUrl !== triedArxivUrl) {
    const attach = await tryAttachPdfFromUrl(
      projectRoot,
      paperId,
      retryArxivUrl,
      onDownloadProgress,
    );
    if (attach.attached) return attach;
    if (!arxivAttachError) arxivAttachError = attach.attachError;
  }

  const catalogUrl = catalogPdfUrl(metadata, paper);
  if (!catalogUrl) {
    return {
      paper,
      attached: false,
      attachError:
        joinPdfAttachAttempts([
          arxivAttachError && (triedArxivUrl || retryArxivUrl)
            ? `arXiv: ${arxivAttachError}`
            : undefined,
        ]) ?? PDF_ATTACH_PAYWALL_FALLBACK,
    };
  }

  const attach = await tryAttachPdfFromUrl(
    projectRoot,
    paperId,
    catalogUrl,
    onDownloadProgress,
  );
  if (!attach.attached) {
    return {
      paper: attach.paper,
      attached: false,
      attachError:
        joinPdfAttachAttempts([
          arxivAttachError && (triedArxivUrl || retryArxivUrl)
            ? `arXiv: ${arxivAttachError}`
            : undefined,
          attach.attachError ? `Open-access link: ${attach.attachError}` : undefined,
        ]) ?? attach.attachError ?? "PDF download failed",
    };
  }
  return attach;
}
