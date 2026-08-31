/**
 * Host-facing literature API — IPC handlers call this, not satellite modules.
 * Domain files stay importable from here; this file must not import `./facade`
 * (facade re-exports it last).
 */
import type { HostEventOrigin } from "../app/event-sink";
import { StagedCitationAddCancelledError } from "../lib/staged-citation-add-cancelled";
import type { PaperExtractSource } from "../../shared/literature/paper-extract";
import type { PaperCitationSectionKind } from "../../shared/literature/paper-citation-network";
import {
  STAGED_CITATION_CREATE_CANCELLED,
  type StagedCitationImportInput,
  type StagedCitationPayload,
  type StageResult,
} from "../../shared/literature/citation-staging";
import { enqueueAiMetadata } from "./ai-metadata/literature-ai-metadata-queue";
import { saveAnnotation } from "./annotations";
import { parseBetterBibTeXJson, importBibTeX } from "./bibliography";
import {
  getCitationHealth,
  importProjectBibKeysIntoLibrary,
  syncLibraryToManuscriptBib,
} from "./citation/citation-health";
import {
  getPaperCitationNetwork,
  getPaperCitationNetworkPage,
} from "./citation/literature-citation-network";
import { stageLiteratureCitation } from "./citation/literature-citation-staging";
import {
  beginStagedCitationAdd,
  cancelStagedCitationAdd,
  endStagedCitationAdd,
} from "./citation/staged-citation-add-abort";
import {
  addPapersToCollection,
  deleteCollection,
  getCollectionRow,
  listReadingList,
  removePapersFromCollection,
  updateCollection,
} from "./collections";
import {
  createPaperFromCatalog,
  createPaperFromStagedCitation,
  downloadPdfForPaper,
  ingestPdfWithEnrich,
} from "./enrich";
import { onPaperPdfAttached, onPaperPdfChanged } from "./extract/literature-extract-automation";
import {
  cancelPaperExtract,
  enqueueBatchPaperExtract,
  enqueueCollectionExtract,
  enqueuePaperExtract,
  resumeExtractQueues,
  retryPaperExtract,
} from "./extract/literature-extract-queue";
import { testMineruConnection } from "./extract/mineru-client";
import {
  getPaperExtractAbsPath,
  getPaperExtractState,
  listPaperExtractStates,
  readExtractBlocks,
  readExtractMarkdown,
} from "./extract/paper-extract-db";
import { readPaperPdfContent } from "./extract/paper-extract-read";
import {
  applyIdentifiers,
  applyMetadata,
  createPaper,
  fetchAndApplyMetadata,
  getPaper,
  listPapers,
  mapPaperForRenderer,
  searchPapers,
  updatePaper,
} from "./papers";
import { attachLocalPdfToPaper, replacePdfFromFile } from "./pdf";
import type { PaperRow } from "./types";
import {
  getLiteratureStorageStats,
  getPdfCacheStatesForPapers,
  pruneOrphanPdfAttachments,
} from "./pdf/literature-pdf-cache";
import { ensurePaperPdfAbsPath, resolvePaperPdfBytes } from "./pdf/literature-pdf-resolve";
import { toLiteraturePdfUrl } from "./pdf/url";
import {
  getZoteroStatus,
  listZoteroCollections,
  type ZoteroCollection,
  type ZoteroStatus,
} from "./zotero/zotero-client";
import {
  addPapersToZoteroCollection,
  deleteCollectionInZotero,
  getZoteroLastSync,
  getZoteroProjectBinding,
  pullZoteroCollectionsForProject,
  removePapersFromZoteroCollection,
  renameCollectionInZotero,
  setZoteroProjectBinding,
  syncBoundZoteroCollection,
  type ZoteroSyncResult,
} from "./zotero/zotero-sync";

export {
  bibliographyExportContent,
  citePaperInProject,
  formatBibliography,
  importFromProject,
} from "./bibliography";
export { resolveBibliographicMetadata } from "./catalog";
export {
  createCollection,
  listCollectionPaperIds,
  listCollections,
} from "./collections";
export {
  deleteAnnotation,
  getAnnotations,
} from "./annotations";
export {
  deletePaper,
  findExistingByIdentifier,
} from "./papers";
export { inspectWorkbenchLibrary, resolveLibraryDisplayAbs } from "./paths";
export { promoteZoteroPaperToProject } from "./zotero";
export { importZoteroBatchForRenderer, parseLiteratureImportBatch } from "./zotero-import-batch";
export {
  cancelStagedCitationAdd,
  getCitationHealth,
  getLiteratureStorageStats,
  getPaperCitationNetwork,
  getPaperCitationNetworkPage,
  getZoteroLastSync,
  getZoteroProjectBinding,
  getZoteroStatus,
  importProjectBibKeysIntoLibrary,
  listPaperExtractStates,
  listZoteroCollections,
  pruneOrphanPdfAttachments,
  pullZoteroCollectionsForProject,
  setZoteroProjectBinding,
  syncBoundZoteroCollection,
  syncLibraryToManuscriptBib,
};
export type { ZoteroCollection, ZoteroStatus, ZoteroSyncResult };
export type { LiteratureProjectConfig } from "../project/workspace-config";

function mapPaperRow(row: PaperRow | null) {
  return row ? mapPaperForRenderer(row) : null;
}

function mapPaperPayload<T extends { paper: PaperRow }>(result: T) {
  return { ...result, paper: mapPaperForRenderer(result.paper) };
}

export function listPapersForRenderer(projectRoot: string) {
  return listPapers(projectRoot).map(mapPaperForRenderer);
}

export function searchPapersForRenderer(projectRoot: string, query: string, limit?: number) {
  return searchPapers(projectRoot, query, limit).map(mapPaperForRenderer);
}

export function getPaperForRenderer(projectRoot: string, paperId: string) {
  return mapPaperRow(getPaper(projectRoot, paperId));
}

export function getPdfCacheStatusForProject(projectRoot: string) {
  const papers = listPapers(projectRoot);
  return getPdfCacheStatesForPapers(projectRoot, papers);
}

export function listReadingListForRenderer(projectRoot: string) {
  return listReadingList(projectRoot).map(mapPaperForRenderer);
}

export async function ingestPdfForRenderer(
  projectRoot: string,
  pdfPath: string,
  opts?: { title?: string; doi?: string },
) {
  return mapPaperPayload(await ingestPdfWithEnrich(projectRoot, pdfPath, opts));
}

export function replacePaperPdfForRenderer(projectRoot: string, paperId: string, pdfPath: string) {
  const { paper, replaced } = replacePdfFromFile(projectRoot, paperId, pdfPath);
  if (replaced) {
    onPaperPdfChanged(projectRoot, paperId, "replace");
  }
  return { paper: mapPaperForRenderer(paper), replaced };
}

export function attachLocalPdfForRenderer(
  projectRoot: string,
  paperId: string,
  pdfPath: string,
  opts?: { ignoreIdentifierConflict?: boolean },
) {
  const hadPdf = Boolean(getPaper(projectRoot, paperId)?.pdf_path);
  const result = attachLocalPdfToPaper(projectRoot, paperId, pdfPath, opts);

  if (result.attached) {
    if (hadPdf && result.replaced) {
      onPaperPdfChanged(projectRoot, paperId, "replace");
    } else if (!hadPdf) {
      onPaperPdfAttached(projectRoot, paperId, "import");
    }
  }

  const conflict = result.conflict
    ? result.conflict.kind === "sha_duplicate" || result.conflict.kind === "identifier_duplicate"
      ? {
          kind: result.conflict.kind,
          otherPaper: mapPaperForRenderer(result.conflict.otherPaper),
          doi:
            result.conflict.kind === "identifier_duplicate" ? result.conflict.doi : undefined,
          arxivId:
            result.conflict.kind === "identifier_duplicate"
              ? result.conflict.arxivId
              : undefined,
        }
      : result.conflict.kind === "target_mismatch"
        ? {
            kind: result.conflict.kind,
            entryDoi: result.conflict.entryDoi,
            entryArxivId: result.conflict.entryArxivId,
            pdfDoi: result.conflict.pdfDoi,
            pdfArxivId: result.conflict.pdfArxivId,
          }
        : {
            kind: result.conflict.kind,
            entryDoi: result.conflict.entryDoi,
            entryArxivId: result.conflict.entryArxivId,
          }
    : undefined;

  return {
    paper: mapPaperForRenderer(result.paper),
    attached: result.attached,
    replaced: result.replaced,
    conflict,
    attachError: result.attachError,
  };
}

export async function createPaperFromIdentifierForRenderer(
  projectRoot: string,
  query: {
    doi?: string;
    arxivId?: string;
    isbn?: string;
    pmid?: string;
    adsBibcode?: string;
  },
  origin: HostEventOrigin,
) {
  let activePaperId: string | undefined;
  const result = await createPaperFromCatalog(projectRoot, query, (paperId, info) => {
    activePaperId = paperId;
    origin.send("literature:pdfDownloadProgress", {
      paperId,
      ...info,
    });
  });
  if (activePaperId) {
    origin.send("literature:pdfDownloadProgress", {
      paperId: activePaperId,
      phase: "done",
    });
  }
  return mapPaperPayload(result);
}

export async function createFromStagedCitationForRenderer(
  projectRoot: string,
  citation: StagedCitationImportInput,
  origin: HostEventOrigin,
) {
  const stagedId = citation.stagedId;
  const signal = beginStagedCitationAdd(stagedId);
  const send = (payload: {
    phase: "writing" | "downloading-pdf" | "done";
    receivedBytes?: number;
    totalBytes?: number | null;
    pdfAttached?: boolean;
    pdfSkipped?: boolean;
  }) => {
    if (signal.aborted) return;
    origin.send("literature:stagedAddProgress", {
      stagedId,
      sessionId: citation.sessionId,
      batchIndex: citation.batchIndex,
      batchTotal: citation.batchTotal,
      ...payload,
    });
  };
  try {
    return mapPaperPayload(
      await createPaperFromStagedCitation(projectRoot, citation, send, { signal }),
    );
  } catch (err) {
    if (err instanceof StagedCitationAddCancelledError) {
      return STAGED_CITATION_CREATE_CANCELLED;
    }
    throw err;
  } finally {
    endStagedCitationAdd(stagedId);
  }
}

export async function stageCitationForRenderer(args: {
  projectRoot: string;
  sessionId: string;
  doi?: string;
  arxivId?: string;
  sourceUrl?: string;
  discoveredFrom?: StagedCitationPayload["discoveredFrom"];
}): Promise<StageResult> {
  const sessionId = args.sessionId?.trim();
  if (!sessionId) {
    return {
      staged: false,
      verified: false,
      error: "Missing sessionId for stage action.",
    };
  }
  return stageLiteratureCitation(args.projectRoot, sessionId, {
    doi: args.doi,
    arxivId: args.arxivId,
    sourceUrl: args.sourceUrl,
    discoveredFrom: args.discoveredFrom,
  });
}

export function applyMetadataForRenderer(
  projectRoot: string,
  paperId: string,
  metadata: Record<string, unknown>,
) {
  return mapPaperForRenderer(
    applyMetadata(projectRoot, paperId, metadata as Parameters<typeof applyMetadata>[2]),
  );
}

export function importBibTeXForRenderer(
  projectRoot: string,
  bibContent: string,
  jsonContent?: string,
  enrichAfterImport = true,
) {
  const pdfMap = jsonContent ? parseBetterBibTeXJson(jsonContent) : {};
  return importBibTeX(projectRoot, bibContent, pdfMap, { enrichAfterImport });
}

export function saveAnnotationForRenderer(
  projectRoot: string,
  annotation: Record<string, unknown>,
) {
  return saveAnnotation(projectRoot, annotation as Parameters<typeof saveAnnotation>[1]);
}

export async function readPaperPdfBytesForRenderer(projectRoot: string, paperId: string) {
  const buf = await resolvePaperPdfBytes(projectRoot, paperId);
  return buf ? { pdfBytes: Uint8Array.from(buf) } : { pdfBytes: null };
}

export async function ensurePaperPdfForRenderer(
  projectRoot: string,
  paperId: string,
  origin: HostEventOrigin,
) {
  const send = (payload: {
    phase: "resolving" | "downloading" | "caching" | "reading" | "opening" | "done";
    receivedBytes?: number;
    totalBytes?: number | null;
  }) => {
    origin.send("literature:pdfDownloadProgress", {
      paperId,
      ...payload,
    });
  };

  const absPath = await ensurePaperPdfAbsPath(projectRoot, paperId, (info) => {
    if (info.phase === "reading") {
      send({ phase: "opening" });
    } else {
      send({
        phase: info.phase,
        receivedBytes: info.receivedBytes,
        totalBytes: info.totalBytes,
      });
    }
  });

  send({ phase: "done" });
  return {
    pdfUrl: absPath ? toLiteraturePdfUrl(absPath) : null,
  };
}

export function createPaperForRenderer(projectRoot: string, metadata: Record<string, unknown>) {
  return mapPaperPayload(createPaper(projectRoot, metadata as Parameters<typeof createPaper>[1]));
}

export function applyIdentifiersForRenderer(
  projectRoot: string,
  paperId: string,
  ids: { doi?: string | null; arxivId?: string | null },
) {
  const result = applyIdentifiers(projectRoot, paperId, ids);
  return {
    ...result,
    paper: result.paper ? mapPaperForRenderer(result.paper) : undefined,
    duplicatePaper: result.duplicatePaper ? mapPaperForRenderer(result.duplicatePaper) : undefined,
  };
}

export async function fetchAndApplyMetadataForRenderer(
  projectRoot: string,
  paperId: string,
  ids: { doi?: string; arxivId?: string },
) {
  return mapPaperPayload(await fetchAndApplyMetadata(projectRoot, paperId, ids));
}

export async function downloadPdfForRenderer(
  projectRoot: string,
  paperId: string,
  origin: HostEventOrigin,
) {
  const send = (payload: {
    phase: "resolving" | "downloading" | "done";
    receivedBytes?: number;
    totalBytes?: number | null;
  }) => {
    origin.send("literature:pdfDownloadProgress", {
      paperId,
      ...payload,
    });
  };
  send({ phase: "resolving" });
  const result = await downloadPdfForPaper(projectRoot, paperId, (info) => {
    send({
      phase: "downloading",
      receivedBytes: info.receivedBytes,
      totalBytes: info.totalBytes,
    });
  });
  send({ phase: "done" });
  return mapPaperPayload(result);
}

export function updatePaperForRenderer(
  projectRoot: string,
  paperId: string,
  patch: Record<string, unknown>,
) {
  return mapPaperForRenderer(
    updatePaper(projectRoot, paperId, patch as Parameters<typeof updatePaper>[2]),
  );
}

export function regenerateAiMetadataForPaper(projectRoot: string, paperId: string) {
  enqueueAiMetadata(projectRoot, paperId, { force: true });
  return { ok: true };
}

export async function updateCollectionForRenderer(
  projectRoot: string,
  collectionId: string,
  name: string,
) {
  const row = getCollectionRow(projectRoot, collectionId);
  if (row.zotero_key) {
    return renameCollectionInZotero(projectRoot, collectionId, name);
  }
  return updateCollection(projectRoot, collectionId, { name });
}

export async function deleteCollectionForRenderer(projectRoot: string, collectionId: string) {
  const row = getCollectionRow(projectRoot, collectionId);
  if (row.zotero_key) {
    await deleteCollectionInZotero(projectRoot, collectionId);
  } else {
    deleteCollection(projectRoot, collectionId);
  }
  return { ok: true };
}

export async function addPapersToCollectionForRenderer(
  projectRoot: string,
  collectionId: string,
  paperIds: string[],
) {
  const row = getCollectionRow(projectRoot, collectionId);
  if (row.zotero_key) {
    return addPapersToZoteroCollection(projectRoot, collectionId, paperIds);
  }
  return { added: addPapersToCollection(projectRoot, collectionId, paperIds), skipped: 0 };
}

export async function removePapersFromCollectionForRenderer(
  projectRoot: string,
  collectionId: string,
  paperIds: string[],
) {
  const row = getCollectionRow(projectRoot, collectionId);
  if (row.zotero_key) {
    return removePapersFromZoteroCollection(projectRoot, collectionId, paperIds);
  }
  return {
    removed: removePapersFromCollection(projectRoot, collectionId, paperIds),
  };
}

export async function enqueuePaperExtractForRenderer(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
  force?: boolean,
) {
  await enqueuePaperExtract(projectRoot, paperId, source, { force });
  return { ok: true };
}

export function cancelPaperExtractForRenderer(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
) {
  cancelPaperExtract(projectRoot, paperId, source);
  return { ok: true };
}

export function getExtractDocument(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
) {
  const state = getPaperExtractState(projectRoot, paperId, source);
  if (!state || state.status !== "ready" || !state.mdPath) {
    return { state, markdown: null as string | null };
  }
  return {
    state,
    markdown: readExtractMarkdown(projectRoot, state),
  };
}

export function getExtractBlocksDocument(
  projectRoot: string,
  paperId: string,
  source?: PaperExtractSource,
) {
  const resolved = source ?? "mineru";
  const state = getPaperExtractState(projectRoot, paperId, resolved);
  if (!state || state.status !== "ready") {
    return { state, blocks: null };
  }
  return { state, blocks: readExtractBlocks(projectRoot, paperId, resolved) };
}

export function openExtractMarkdown(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
) {
  const state = getPaperExtractState(projectRoot, paperId, source);
  if (!state?.mdPath) return { relativePath: null as string | null };
  const abs = getPaperExtractAbsPath(projectRoot, state.mdPath);
  const relativePath = abs.startsWith(projectRoot)
    ? abs.slice(projectRoot.length + 1)
    : state.mdPath;
  return { relativePath };
}

export async function testMineruFromSettings(token?: string) {
  const { getSettings } = await import("../app/settings");
  const resolved = token ?? (getSettings().mineruApiToken as string | undefined) ?? "";
  return testMineruConnection(resolved);
}

export function resumeExtractQueuesForRenderer(projectRoot: string) {
  resumeExtractQueues(projectRoot);
  return { ok: true };
}

export function retryPaperExtractForRenderer(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
) {
  retryPaperExtract(projectRoot, paperId, source);
  return { ok: true };
}

export function enqueueBatchPaperExtractForRenderer(
  projectRoot: string,
  paperIds: string[],
  source: PaperExtractSource,
  force?: boolean,
) {
  return enqueueBatchPaperExtract(projectRoot, paperIds, source, { force });
}

export function enqueueCollectionExtractForRenderer(
  projectRoot: string,
  collectionId: string,
  source: PaperExtractSource,
  force?: boolean,
) {
  return enqueueCollectionExtract(projectRoot, collectionId, source, { force });
}

export async function readUserPaperPdfContent(args: {
  projectRoot: string;
  bibkey: string;
  pages?: string;
  query?: string;
  source?: "auto" | PaperExtractSource;
  force?: boolean;
}) {
  const { getSettings } = await import("../app/settings");
  const token = getSettings().mineruApiToken;
  const tokenPresent = typeof token === "string" && token.trim().length > 0;
  return readPaperPdfContent(
    { ...args, initiatedBy: "user", waitTimeoutMs: 5 * 60_000 },
    tokenPresent,
  );
}
