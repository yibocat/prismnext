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
import { normalizeArxivId, normalizeDoi, arxivIdFromDoi } from "../../shared/doi-utils";
import { arxivPdfUrl, downloadPdfBytes } from "../lib/download-pdf";
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
  type CreatePaperResult,
  type IngestPdfResult,
} from "./literature-service";

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

/** Download open PDF URL and attach to entry when none is stored yet. */
export async function tryAttachPdfFromUrl(
  projectRoot: string,
  paperId: string,
  pdfUrl: string | null | undefined,
): Promise<PdfAttachResult> {
  const paper = getPaper(projectRoot, paperId);
  if (!paper) throw new Error("Paper not found");
  if (paper.pdf_path) return { paper, attached: false };
  if (!pdfUrl?.trim()) return { paper, attached: false };

  try {
    const buf = await downloadPdfBytes(pdfUrl);
    const updated = attachPdfBufferToPaper(projectRoot, paperId, buf);
    return { paper: updated, attached: true };
  } catch (err) {
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
    const attach = await tryAttachPdfFromUrl(
      projectRoot,
      paperId,
      catalogPdfUrl(result.metadata, updated),
    );
    return {
      paper: attach.paper,
      enriched: true,
      pdfAttached: attach.attached,
      pdfAttachError: attach.attachError,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { paper, enriched: false, enrichError: message };
  }
}

/** Catalog lookup → create or merge by DOI/arXiv. Sources only — no Zotero shortcut. */
export async function createPaperFromCatalog(
  projectRoot: string,
  query: { doi?: string; arxivId?: string },
): Promise<CreatePaperFromCatalogResult> {
  const doi = query.doi ? normalizeDoi(query.doi) : undefined;
  const arxivId = query.arxivId ? normalizeArxivId(query.arxivId) : undefined;
  if (!doi && !arxivId) throw new Error("Provide a DOI or arXiv ID");

  const { metadata } = await resolveBibliographicMetadata({ doi, arxivId });
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

  const attach = await tryAttachPdfFromUrl(
    projectRoot,
    createResult.paper.id,
    catalogPdfUrl(metadata, createResult.paper),
  );

  return {
    ...createResult,
    paper: attach.paper,
    pdfAttached: attach.attached,
    pdfAttachError: attach.attachError,
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
    await deletePaper(projectRoot, paper.id);
    const enrich = await enrichPaperFromCatalog(projectRoot, applied.duplicatePaper.id);
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
      if (result.pdfAttached) pdfsAttached++;
    } else if (!paper.pdf_path) {
      const attach = await tryAttachPdfFromUrl(projectRoot, paperId, arxivPdfUrl(paper.arxiv_id));
      if (attach.attached) pdfsAttached++;
    }
  }

  return { enriched, enrichFailed, pdfsAttached };
}

/** User-initiated PDF download from arXiv or catalog open-access link. */
export async function downloadPdfForPaper(
  projectRoot: string,
  paperId: string,
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
    throw new Error("Add a DOI or arXiv ID first");
  }

  let arxivAttachError: string | undefined;
  const triedArxivUrl = arxivPdfUrl(arxivId);
  if (triedArxivUrl) {
    const attach = await tryAttachPdfFromUrl(projectRoot, paperId, triedArxivUrl);
    if (attach.attached) return attach;
    arxivAttachError = attach.attachError;
  }

  const { metadata } = await resolveBibliographicMetadata({ doi, arxivId });
  const discoveredArxiv =
    normalizeArxivId(metadata.arxiv_id) ?? arxivIdFromDoi(metadata.doi) ?? arxivId;
  const retryArxivUrl = arxivPdfUrl(discoveredArxiv);
  if (retryArxivUrl && retryArxivUrl !== triedArxivUrl) {
    const attach = await tryAttachPdfFromUrl(projectRoot, paperId, retryArxivUrl);
    if (attach.attached) return attach;
    if (!arxivAttachError) arxivAttachError = attach.attachError;
  }

  const catalogUrl = catalogPdfUrl(metadata, paper);
  if (!catalogUrl) {
    if (arxivAttachError || triedArxivUrl || retryArxivUrl) {
      throw new Error(
        arxivAttachError ?? "arXiv PDF download failed. Try again later or import a PDF manually.",
      );
    }
    throw new Error(
      "No open-access PDF found for this entry. Publisher paywalled PDFs cannot be auto-downloaded — import a PDF file manually.",
    );
  }

  const attach = await tryAttachPdfFromUrl(projectRoot, paperId, catalogUrl);
  if (!attach.attached) {
    throw new Error(attach.attachError ?? "PDF download failed");
  }
  return attach;
}
