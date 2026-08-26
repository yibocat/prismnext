import { ipcMain, dialog, BrowserWindow } from "electron";
import * as fs from "node:fs";
import {
  addPapersToCollectionForRenderer,
  applyIdentifiersForRenderer,
  applyMetadataForRenderer,
  attachLocalPdfForRenderer,
  bibliographyExportContent,
  cancelStagedCitationAdd,
  citePaperInProject,
  createCollection,
  createFromStagedCitationForRenderer,
  createPaperForRenderer,
  createPaperFromIdentifierForRenderer,
  deleteAnnotation,
  deleteCollectionForRenderer,
  deletePaper,
  downloadPdfForRenderer,
  ensurePaperPdfForRenderer,
  fetchAndApplyMetadataForRenderer,
  findExistingByIdentifier,
  formatBibliography,
  getAnnotations,
  getCitationHealth,
  getPaperCitationNetwork,
  getPaperCitationNetworkPage,
  getPaperForRenderer,
  getPdfCacheStatusForProject,
  getLiteratureStorageStats,
  importBibTeXForRenderer,
  importFromProject,
  importProjectBibKeysIntoLibrary,
  ingestPdfForRenderer,
  inspectWorkbenchLibrary,
  listCollectionPaperIds,
  listCollections,
  listPapersForRenderer,
  listReadingListForRenderer,
  pruneOrphanPdfAttachments,
  promoteZoteroPaperToProject,
  readPaperPdfBytesForRenderer,
  regenerateAiMetadataForPaper,
  removePapersFromCollectionForRenderer,
  replacePaperPdfForRenderer,
  resolveLibraryDisplayAbs,
  saveAnnotationForRenderer,
  searchPapersForRenderer,
  stageCitationForRenderer,
  syncLibraryToManuscriptBib,
  updateCollectionForRenderer,
  updatePaperForRenderer,
} from "../literature/host";
import type { PaperCitationSectionKind } from "../../shared/literature/paper-citation-network";
import type { StagedCitationImportInput, StagedCitationPayload, StageResult } from "../../shared/literature/citation-staging";

export function registerLiteratureHandlers(): void {
  ipcMain.handle("literature:list", async (_event, args: { projectRoot: string }) => {
    try {
      return listPapersForRenderer(args.projectRoot);
    } catch (err) {
      if (err instanceof Error && err.message === "literature_not_on_remote_yet") return [];
      throw err;
    }
  });

  ipcMain.handle(
    "literature:resolveAbs",
    async (_event, args: { projectRoot: string; rel: string }) => {
      return resolveLibraryDisplayAbs(args.projectRoot, args.rel);
    },
  );

  ipcMain.handle("literature:getPdfCacheStatus", async (_event, args: { projectRoot: string }) => {
    return getPdfCacheStatusForProject(args.projectRoot);
  });

  ipcMain.handle("literature:getStorageStats", async (_event, args: { projectRoot: string }) => {
    return getLiteratureStorageStats(args.projectRoot);
  });

  ipcMain.handle("literature:pruneOrphanAttachments", async (_event, args: { projectRoot: string }) => {
    return pruneOrphanPdfAttachments(args.projectRoot);
  });

  ipcMain.handle("literature:search", async (_event, args: { projectRoot: string; query: string; limit?: number }) => {
    return searchPapersForRenderer(args.projectRoot, args.query, args.limit);
  });

  ipcMain.handle("literature:get", async (_event, args: { projectRoot: string; paperId: string }) => {
    return getPaperForRenderer(args.projectRoot, args.paperId);
  });

  ipcMain.handle("literature:ingestPdf", async (_event, args: { projectRoot: string; pdfPath: string; title?: string; doi?: string }) => {
    return ingestPdfForRenderer(args.projectRoot, args.pdfPath, { title: args.title, doi: args.doi });
  });

  ipcMain.handle(
    "literature:replacePdf",
    async (_event, args: { projectRoot: string; paperId: string; pdfPath: string }) => {
      return replacePaperPdfForRenderer(args.projectRoot, args.paperId, args.pdfPath);
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
      return attachLocalPdfForRenderer(args.projectRoot, args.paperId, args.pdfPath, {
        ignoreIdentifierConflict: args.ignoreIdentifierConflict,
      });
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
      return createPaperFromIdentifierForRenderer(args.projectRoot, args, event.sender);
    },
  );

  ipcMain.handle(
    "literature:createFromStagedCitation",
    async (
      event,
      args: { projectRoot: string; citation: StagedCitationImportInput },
    ) => {
      return createFromStagedCitationForRenderer(args.projectRoot, args.citation, event.sender);
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
      return stageCitationForRenderer(args);
    },
  );

  ipcMain.handle(
    "literature:applyMetadata",
    async (_event, args: { projectRoot: string; paperId: string; metadata: Record<string, unknown> }) => {
      return applyMetadataForRenderer(args.projectRoot, args.paperId, args.metadata);
    },
  );

  ipcMain.handle(
    "literature:importBibTeX",
    async (_event, args: { projectRoot: string; bibContent: string; jsonContent?: string; enrichAfterImport?: boolean }) => {
      return importBibTeXForRenderer(
        args.projectRoot,
        args.bibContent,
        args.jsonContent,
        args.enrichAfterImport ?? true,
      );
    },
  );

  ipcMain.handle("literature:getAnnotations", async (_event, args: { projectRoot: string; paperId: string }) => {
    return getAnnotations(args.projectRoot, args.paperId);
  });

  ipcMain.handle(
    "literature:saveAnnotation",
    async (_event, args: { projectRoot: string; annotation: Record<string, unknown> }) => {
      return saveAnnotationForRenderer(args.projectRoot, args.annotation);
    },
  );

  ipcMain.handle("literature:deleteAnnotation", async (_event, args: { projectRoot: string; annotationId: string }) => {
    deleteAnnotation(args.projectRoot, args.annotationId);
    return { ok: true };
  });

  ipcMain.handle("literature:readPdfBytes", async (_event, args: { projectRoot: string; paperId: string }) => {
    return readPaperPdfBytesForRenderer(args.projectRoot, args.paperId);
  });

  ipcMain.handle("literature:ensurePaperPdf", async (event, args: { projectRoot: string; paperId: string }) => {
    return ensurePaperPdfForRenderer(args.projectRoot, args.paperId, event.sender);
  });

  ipcMain.handle("literature:createPaper", async (_event, args: { projectRoot: string; metadata: Record<string, unknown> }) => {
    return createPaperForRenderer(args.projectRoot, args.metadata);
  });

  ipcMain.handle(
    "literature:applyIdentifiers",
    async (
      _event,
      args: { projectRoot: string; paperId: string; doi?: string | null; arxivId?: string | null },
    ) => {
      return applyIdentifiersForRenderer(args.projectRoot, args.paperId, {
        doi: args.doi,
        arxivId: args.arxivId,
      });
    },
  );

  ipcMain.handle(
    "literature:fetchAndApplyMetadata",
    async (
      _event,
      args: { projectRoot: string; paperId: string; doi?: string; arxivId?: string },
    ) => {
      return fetchAndApplyMetadataForRenderer(args.projectRoot, args.paperId, {
        doi: args.doi,
        arxivId: args.arxivId,
      });
    },
  );

  ipcMain.handle(
    "literature:downloadPdf",
    async (event, args: { projectRoot: string; paperId: string }) => {
      return downloadPdfForRenderer(args.projectRoot, args.paperId, event.sender);
    },
  );

  ipcMain.handle(
    "literature:updatePaper",
    async (_event, args: { projectRoot: string; paperId: string; patch: Record<string, unknown> }) => {
      return updatePaperForRenderer(args.projectRoot, args.paperId, args.patch);
    },
  );

  ipcMain.handle(
    "literature:regenerateAiMetadata",
    async (_event, args: { projectRoot: string; paperId: string }) => {
      return regenerateAiMetadataForPaper(args.projectRoot, args.paperId);
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
    return listReadingListForRenderer(args.projectRoot);
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
      return updateCollectionForRenderer(args.projectRoot, args.collectionId, args.name);
    },
  );

  ipcMain.handle(
    "literature:deleteCollection",
    async (_event, args: { projectRoot: string; collectionId: string }) => {
      return deleteCollectionForRenderer(args.projectRoot, args.collectionId);
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
      return addPapersToCollectionForRenderer(args.projectRoot, args.collectionId, args.paperIds);
    },
  );

  ipcMain.handle(
    "literature:removePapersFromCollection",
    async (
      _event,
      args: { projectRoot: string; collectionId: string; paperIds: string[] },
    ) => {
      return removePapersFromCollectionForRenderer(args.projectRoot, args.collectionId, args.paperIds);
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
    const inspected = inspectWorkbenchLibrary(result.filePaths[0]);
    if (!inspected.ok) return { path: null, error: inspected.error };
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
