import { ipcMain, dialog, BrowserWindow } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  addPapersToCollection,
  applyIdentifiers,
  applyMetadata,
  citePaperInProject,
  createCollection,
  createPaper,
  deleteAnnotation,
  deleteCollection,
  deletePaper,
  detachZoteroMirror,
  promoteZoteroPaperToProject,
  formatBibliography,
  fetchAndApplyMetadata,
  getAnnotations,
  getCollectionRow,
  getPaper,
  importBibTeX,
  importFromProject,
  listCollectionPaperIds,
  listCollections,
  listPapers,
  listReadingList,
  parseBetterBibTeXJson,
  removePapersFromCollection,
  saveAnnotation,
  searchPapers,
  updateCollection,
  updatePaper,
  findExistingByIdentifier,
  replacePdfFromFile,
  attachLocalPdfToPaper,
  mapPaperForRenderer,
  resolveLibraryDisplayAbs,
  bibliographyExportContent,
  type PaperRow,
} from "../literature/facade";
import { readWorkbenchJson } from "../workbench/identity";
import { resolveWorkbenchHome } from "../workbench/home";
import { libraryRel } from "../../shared/workbench/paths";
import {
  getCitationHealth,
  importProjectBibKeysIntoLibrary,
  syncLibraryToManuscriptBib,
} from "../literature/citation/citation-health";
import { onPaperPdfAttached, onPaperPdfChanged } from "../literature/extract/literature-extract-automation";
import { resolvePaperPdfBytes, ensurePaperPdfAbsPath } from "../literature/pdf/literature-pdf-resolve";
import { toLiteraturePdfUrl } from "../literature/pdf/url";
import { getPdfCacheStatesForPapers, getLiteratureStorageStats, pruneOrphanPdfAttachments } from "../literature/pdf/literature-pdf-cache";
import {
  addPapersToZoteroCollection,
  deleteCollectionInZotero,
  removePapersFromZoteroCollection,
  renameCollectionInZotero,
} from "../literature/zotero/zotero-sync";
import {
  createPaperFromCatalog,
  createPaperFromStagedCitation,
  downloadPdfForPaper,
  ingestPdfWithEnrich,
} from "../literature/enrich";
import {
  beginStagedCitationAdd,
  cancelStagedCitationAdd,
  endStagedCitationAdd,
} from "../literature/citation/staged-citation-add-abort";
import { StagedCitationAddCancelledError } from "../lib/staged-citation-add-cancelled";
import { STAGED_CITATION_CREATE_CANCELLED } from "../../shared/literature/citation-staging";
import type { StagedCitationImportInput, StagedCitationPayload, StageResult } from "../../shared/literature/citation-staging";
import { stageLiteratureCitation } from "../literature/citation/literature-citation-staging";
import {
  getPaperCitationNetwork,
  getPaperCitationNetworkPage,
} from "../literature/citation/literature-citation-network";
import type { PaperCitationSectionKind } from "../../shared/literature/paper-citation-network";

function mapPaperRow(row: PaperRow | null) {
  return row ? mapPaperForRenderer(row) : null;
}

function mapPaperPayload<T extends { paper: PaperRow }>(result: T) {
  return { ...result, paper: mapPaperForRenderer(result.paper) };
}

export function registerLiteratureHandlers(): void {
  ipcMain.handle("literature:list", async (_event, args: { projectRoot: string }) => {
    return listPapers(args.projectRoot).map(mapPaperForRenderer);
  });

  ipcMain.handle(
    "literature:resolveAbs",
    async (_event, args: { projectRoot: string; rel: string }) => {
      return resolveLibraryDisplayAbs(args.projectRoot, args.rel);
    },
  );

  ipcMain.handle("literature:getPdfCacheStatus", async (_event, args: { projectRoot: string }) => {
    const papers = listPapers(args.projectRoot);
    return getPdfCacheStatesForPapers(args.projectRoot, papers);
  });

  ipcMain.handle("literature:getStorageStats", async (_event, args: { projectRoot: string }) => {
    return getLiteratureStorageStats(args.projectRoot);
  });

  ipcMain.handle("literature:pruneOrphanAttachments", async (_event, args: { projectRoot: string }) => {
    return pruneOrphanPdfAttachments(args.projectRoot);
  });

  ipcMain.handle("literature:search", async (_event, args: { projectRoot: string; query: string; limit?: number }) => {
    return searchPapers(args.projectRoot, args.query, args.limit).map(mapPaperForRenderer);
  });

  ipcMain.handle("literature:get", async (_event, args: { projectRoot: string; paperId: string }) => {
    return mapPaperRow(getPaper(args.projectRoot, args.paperId));
  });

  ipcMain.handle("literature:ingestPdf", async (_event, args: { projectRoot: string; pdfPath: string; title?: string; doi?: string }) => {
    return mapPaperPayload(await ingestPdfWithEnrich(args.projectRoot, args.pdfPath, { title: args.title, doi: args.doi }));
  });

  ipcMain.handle(
    "literature:replacePdf",
    async (_event, args: { projectRoot: string; paperId: string; pdfPath: string }) => {
      const { paper, replaced } = replacePdfFromFile(args.projectRoot, args.paperId, args.pdfPath);
      if (replaced) {
        onPaperPdfChanged(args.projectRoot, args.paperId, "replace");
      }
      return { paper: mapPaperForRenderer(paper), replaced };
    },
  );

  ipcMain.handle(
    "literature:attachLocalPdf",
    async (
      _event,
      args: {
        projectRoot: string;
        paperId: string;
        pdfPath: string;
        ignoreIdentifierConflict?: boolean;
      },
    ) => {
      const hadPdf = Boolean(getPaper(args.projectRoot, args.paperId)?.pdf_path);
      const result = attachLocalPdfToPaper(args.projectRoot, args.paperId, args.pdfPath, {
        ignoreIdentifierConflict: args.ignoreIdentifierConflict,
      });

      if (result.attached) {
        if (hadPdf && result.replaced) {
          onPaperPdfChanged(args.projectRoot, args.paperId, "replace");
        } else if (!hadPdf) {
          onPaperPdfAttached(args.projectRoot, args.paperId, "import");
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
    },
  );

  ipcMain.handle(
    "literature:createFromIdentifier",
    async (
      event,
      args: {
        projectRoot: string;
        doi?: string;
        arxivId?: string;
        isbn?: string;
        pmid?: string;
        adsBibcode?: string;
      },
    ) => {
      let activePaperId: string | undefined;
      const result = await createPaperFromCatalog(
        args.projectRoot,
        {
          doi: args.doi,
          arxivId: args.arxivId,
          isbn: args.isbn,
          pmid: args.pmid,
          adsBibcode: args.adsBibcode,
        },
        (paperId, info) => {
          activePaperId = paperId;
          event.sender.send("literature:pdfDownloadProgress", {
            paperId,
            ...info,
          });
        },
      );
      if (activePaperId) {
        event.sender.send("literature:pdfDownloadProgress", {
          paperId: activePaperId,
          phase: "done",
        });
      }
      return mapPaperPayload(result);
    },
  );

  ipcMain.handle(
    "literature:createFromStagedCitation",
    async (
      event,
      args: { projectRoot: string; citation: StagedCitationImportInput },
    ) => {
      const stagedId = args.citation.stagedId;
      const signal = beginStagedCitationAdd(stagedId);
      const send = (payload: {
        phase: "writing" | "downloading-pdf" | "done";
        receivedBytes?: number;
        totalBytes?: number | null;
        pdfAttached?: boolean;
        pdfSkipped?: boolean;
      }) => {
        if (signal.aborted) return;
        event.sender.send("literature:stagedAddProgress", {
          stagedId,
          sessionId: args.citation.sessionId,
          batchIndex: args.citation.batchIndex,
          batchTotal: args.citation.batchTotal,
          ...payload,
        });
      };
      try {
        return mapPaperPayload(
          await createPaperFromStagedCitation(args.projectRoot, args.citation, send, {
            signal,
          }),
        );
      } catch (err) {
        if (err instanceof StagedCitationAddCancelledError) {
          return STAGED_CITATION_CREATE_CANCELLED;
        }
        throw err;
      } finally {
        endStagedCitationAdd(stagedId);
      }
    },
  );

  ipcMain.handle(
    "literature:cancelStagedCitationAdd",
    (_event, args: { stagedId: string }) => {
      cancelStagedCitationAdd(args.stagedId);
    },
  );

  ipcMain.handle(
    "literature:findExisting",
    async (_event, args: { projectRoot: string; doi?: string | null; arxivId?: string | null }) => {
      return findExistingByIdentifier(args.projectRoot, { doi: args.doi, arxivId: args.arxivId });
    },
  );

  // Stage a citation: resolve metadata via catalogs WITHOUT writing to library.db.
  // Returns a StagedCitationPayload + assigned refId (scoped to the session via caller).
  ipcMain.handle(
    "literature:stage",
    async (
      _event,
      args: {
        projectRoot: string;
        sessionId: string;
        doi?: string;
        arxivId?: string;
        sourceUrl?: string;
        discoveredFrom?: StagedCitationPayload["discoveredFrom"];
      },
    ): Promise<StageResult> => {
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
    },
  );

  ipcMain.handle(
    "literature:applyMetadata",
    async (_event, args: { projectRoot: string; paperId: string; metadata: Record<string, unknown> }) => {
      return mapPaperForRenderer(
        applyMetadata(args.projectRoot, args.paperId, args.metadata as Parameters<typeof applyMetadata>[2]),
      );
    },
  );

  ipcMain.handle(
    "literature:importBibTeX",
    async (_event, args: { projectRoot: string; bibContent: string; jsonContent?: string; enrichAfterImport?: boolean }) => {
      const pdfMap = args.jsonContent ? parseBetterBibTeXJson(args.jsonContent) : {};
      return importBibTeX(args.projectRoot, args.bibContent, pdfMap, {
        enrichAfterImport: args.enrichAfterImport ?? true,
      });
    },
  );

  ipcMain.handle("literature:getAnnotations", async (_event, args: { projectRoot: string; paperId: string }) => {
    return getAnnotations(args.projectRoot, args.paperId);
  });

  ipcMain.handle(
    "literature:saveAnnotation",
    async (_event, args: { projectRoot: string; annotation: Record<string, unknown> }) => {
      return saveAnnotation(args.projectRoot, args.annotation as Parameters<typeof saveAnnotation>[1]);
    },
  );

  ipcMain.handle("literature:deleteAnnotation", async (_event, args: { projectRoot: string; annotationId: string }) => {
    deleteAnnotation(args.projectRoot, args.annotationId);
    return { ok: true };
  });

  ipcMain.handle("literature:readPdfBytes", async (_event, args: { projectRoot: string; paperId: string }) => {
    const buf = await resolvePaperPdfBytes(args.projectRoot, args.paperId);
    return buf ? { pdfBytes: Uint8Array.from(buf) } : { pdfBytes: null };
  });

  ipcMain.handle("literature:ensurePaperPdf", async (event, args: { projectRoot: string; paperId: string }) => {
    const send = (payload: {
      phase: "resolving" | "downloading" | "caching" | "reading" | "opening" | "done";
      receivedBytes?: number;
      totalBytes?: number | null;
    }) => {
      event.sender.send("literature:pdfDownloadProgress", {
        paperId: args.paperId,
        ...payload,
      });
    };

    const absPath = await ensurePaperPdfAbsPath(args.projectRoot, args.paperId, (info) => {
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
  });

  ipcMain.handle("literature:createPaper", async (_event, args: { projectRoot: string; metadata: Record<string, unknown> }) => {
    const result = createPaper(args.projectRoot, args.metadata as Parameters<typeof createPaper>[1]);
    return mapPaperPayload(result);
  });

  ipcMain.handle(
    "literature:applyIdentifiers",
    async (
      _event,
      args: { projectRoot: string; paperId: string; doi?: string | null; arxivId?: string | null },
    ) => {
      const result = applyIdentifiers(args.projectRoot, args.paperId, { doi: args.doi, arxivId: args.arxivId });
      return {
        ...result,
        paper: result.paper ? mapPaperForRenderer(result.paper) : undefined,
        duplicatePaper: result.duplicatePaper ? mapPaperForRenderer(result.duplicatePaper) : undefined,
      };
    },
  );

  ipcMain.handle(
    "literature:fetchAndApplyMetadata",
    async (
      _event,
      args: { projectRoot: string; paperId: string; doi?: string; arxivId?: string },
    ) => {
      const result = await fetchAndApplyMetadata(args.projectRoot, args.paperId, {
        doi: args.doi,
        arxivId: args.arxivId,
      });
      return mapPaperPayload(result);
    },
  );

  ipcMain.handle(
    "literature:downloadPdf",
    async (event, args: { projectRoot: string; paperId: string }) => {
      const send = (payload: {
        phase: "resolving" | "downloading" | "done";
        receivedBytes?: number;
        totalBytes?: number | null;
      }) => {
        event.sender.send("literature:pdfDownloadProgress", {
          paperId: args.paperId,
          ...payload,
        });
      };
      send({ phase: "resolving" });
      const result = await downloadPdfForPaper(args.projectRoot, args.paperId, (info) => {
        send({
          phase: "downloading",
          receivedBytes: info.receivedBytes,
          totalBytes: info.totalBytes,
        });
      });
      send({ phase: "done" });
      return mapPaperPayload(result);
    },
  );

  ipcMain.handle(
    "literature:updatePaper",
    async (_event, args: { projectRoot: string; paperId: string; patch: Record<string, unknown> }) => {
      return mapPaperForRenderer(
        updatePaper(args.projectRoot, args.paperId, args.patch as Parameters<typeof updatePaper>[2]),
      );
    },
  );

  ipcMain.handle(
    "literature:regenerateAiMetadata",
    async (_event, args: { projectRoot: string; paperId: string }) => {
      const { enqueueAiMetadata } = await import("../literature/ai-metadata/literature-ai-metadata-queue");
      enqueueAiMetadata(args.projectRoot, args.paperId, { force: true });
      return { ok: true };
    },
  );

  ipcMain.handle("literature:deletePaper", async (_event, args: { projectRoot: string; paperId: string }) => {
    deletePaper(args.projectRoot, args.paperId);
    return { ok: true };
  });

  ipcMain.handle("literature:importToLocal", async (_event, args: { projectRoot: string; paperId: string }) => {
    promoteZoteroPaperToProject(args.projectRoot, args.paperId);
    return { ok: true };
  });

  ipcMain.handle("literature:exportBib", async (_event, args: { projectRoot: string; paperIds?: string[] }) => {
    return { content: await bibliographyExportContent(args.projectRoot, args.paperIds) };
  });

  ipcMain.handle(
    "literature:formatBibliography",
    async (_event, args: { projectRoot: string; paperIds: string[]; style?: string }) => {
      const content = formatBibliography(args.projectRoot, args.paperIds, (args.style as any) ?? "ieee");
      return { content };
    },
  );

  ipcMain.handle(
    "literature:exportBibToFile",
    async (_event, args: { projectRoot: string; paperIds?: string[]; defaultPath?: string }) => {
      const content = await bibliographyExportContent(args.projectRoot, args.paperIds);
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return { canceled: true, path: null as string | null };

      const result = await dialog.showSaveDialog(win, {
        title: "Export BibTeX",
        defaultPath: args.defaultPath ?? "references.bib",
        filters: [{ name: "BibTeX", extensions: ["bib"] }],
      });
      if (result.canceled || !result.filePath) {
        return { canceled: true, path: null };
      }
      fs.writeFileSync(result.filePath, content, "utf-8");
      return { canceled: false, path: result.filePath };
    },
  );

  ipcMain.handle("literature:cite", async (_event, args: { projectRoot: string; bibkey: string }) => {
    return citePaperInProject(args.projectRoot, args.bibkey);
  });

  ipcMain.handle("literature:citationHealth", async (_event, args: { projectRoot: string }) => {
    return getCitationHealth(args.projectRoot);
  });

  ipcMain.handle(
    "literature:mergeIntoProjectBib",
    async (
      _event,
      args: {
        projectRoot: string;
        bibkeys?: string[];
        all?: boolean;
        onlyCitedInTex?: boolean;
      },
    ) => {
      return syncLibraryToManuscriptBib(args.projectRoot, {
        bibkeys: args.bibkeys,
        all: args.all,
        onlyCitedInTex: args.onlyCitedInTex,
      });
    },
  );

  ipcMain.handle(
    "literature:importFromProjectBib",
    async (_event, args: { projectRoot: string; bibkeys?: string[] }) => {
      return importProjectBibKeysIntoLibrary(args.projectRoot, args.bibkeys);
    },
  );

  ipcMain.handle("literature:readingList", async (_event, args: { projectRoot: string }) => {
    return listReadingList(args.projectRoot).map(mapPaperForRenderer);
  });

  ipcMain.handle("literature:listCollections", async (_event, args: { projectRoot: string }) => {
    return listCollections(args.projectRoot);
  });

  ipcMain.handle(
    "literature:createCollection",
    async (_event, args: { projectRoot: string; name: string; parentId?: string | null }) => {
      return createCollection(args.projectRoot, args.name, args.parentId);
    },
  );

  ipcMain.handle(
    "literature:updateCollection",
    async (_event, args: { projectRoot: string; collectionId: string; name: string }) => {
      const row = getCollectionRow(args.projectRoot, args.collectionId);
      if (row.zotero_key) {
        return renameCollectionInZotero(args.projectRoot, args.collectionId, args.name);
      }
      return updateCollection(args.projectRoot, args.collectionId, { name: args.name });
    },
  );

  ipcMain.handle(
    "literature:deleteCollection",
    async (_event, args: { projectRoot: string; collectionId: string }) => {
      const row = getCollectionRow(args.projectRoot, args.collectionId);
      if (row.zotero_key) {
        await deleteCollectionInZotero(args.projectRoot, args.collectionId);
      } else {
        deleteCollection(args.projectRoot, args.collectionId);
      }
      return { ok: true };
    },
  );

  ipcMain.handle(
    "literature:listCollectionPaperIds",
    async (_event, args: { projectRoot: string; collectionId: string }) => {
      return listCollectionPaperIds(args.projectRoot, args.collectionId);
    },
  );

  ipcMain.handle(
    "literature:addPapersToCollection",
    async (
      _event,
      args: { projectRoot: string; collectionId: string; paperIds: string[] },
    ) => {
      const row = getCollectionRow(args.projectRoot, args.collectionId);
      if (row.zotero_key) {
        return addPapersToZoteroCollection(args.projectRoot, args.collectionId, args.paperIds);
      }
      return { added: addPapersToCollection(args.projectRoot, args.collectionId, args.paperIds), skipped: 0 };
    },
  );

  ipcMain.handle(
    "literature:removePapersFromCollection",
    async (
      _event,
      args: { projectRoot: string; collectionId: string; paperIds: string[] },
    ) => {
      const row = getCollectionRow(args.projectRoot, args.collectionId);
      if (row.zotero_key) {
        return removePapersFromZoteroCollection(args.projectRoot, args.collectionId, args.paperIds);
      }
      return {
        removed: removePapersFromCollection(args.projectRoot, args.collectionId, args.paperIds),
      };
    },
  );

  ipcMain.handle(
    "literature:importFromProject",
    async (_event, args: { targetRoot: string; sourceRoot: string; paperIds: string[]; includeAnnotations?: boolean; includePdf?: boolean }) => {
      return importFromProject(args.targetRoot, args.sourceRoot, args.paperIds, {
        includeAnnotations: args.includeAnnotations,
        includePdf: args.includePdf,
      });
    },
  );

  ipcMain.handle("literature:pickPdf", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePaths[0]) return { path: null };
    return { path: result.filePaths[0] };
  });

  ipcMain.handle("literature:pickBibTeX", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "BibTeX", extensions: ["bib"] }, { name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return { paths: [] as string[] };
    return { paths: result.filePaths };
  });

  ipcMain.handle("literature:pickProjectRoot", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { path: null };
    const json = readWorkbenchJson(result.filePaths[0]);
    if (!json) return { path: null, error: "No workbench project in selected folder" };
    const libraryDb = path.join(resolveWorkbenchHome(), libraryRel(json.id), "library.db");
    if (!fs.existsSync(libraryDb)) return { path: null, error: "No library in the workbench project slot" };
    return { path: result.filePaths[0] };
  });

  ipcMain.handle(
    "literature:getCitationNetwork",
    async (
      _event,
      args: { projectRoot: string; paperId: string; refresh?: boolean },
    ) => {
      return getPaperCitationNetwork(args.projectRoot, args.paperId, {
        refresh: args.refresh,
      });
    },
  );

  ipcMain.handle(
    "literature:getCitationNetworkPage",
    async (
      _event,
      args: {
        projectRoot: string;
        paperId: string;
        section: PaperCitationSectionKind;
        cursor: string;
        refresh?: boolean;
      },
    ) => {
      return getPaperCitationNetworkPage(
        args.projectRoot,
        args.paperId,
        args.section,
        args.cursor,
        { refresh: args.refresh },
      );
    },
  );
}
