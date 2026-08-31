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
  getZoteroLastSync,
  getZoteroProjectBinding,
  importBibTeXForRenderer,
  importZoteroBatchForRenderer,
  parseLiteratureImportBatch,
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
  setZoteroProjectBinding,
  stageCitationForRenderer,
  syncLibraryToManuscriptBib,
  updateCollectionForRenderer,
  updatePaperForRenderer,
} from "../literature/host";
import type { PaperCitationSectionKind } from "../../shared/literature/paper-citation-network";
import type { StagedCitationImportInput, StagedCitationPayload, StageResult } from "../../shared/literature/citation-staging";
import { getRemoteSessionBroker } from "./remote";
import { routeHostLiteratureMethod } from "../remote/literature-route";
import {
  LITERATURE_LOCAL_PDF_METHODS,
  stageLaptopPdfForRemote,
} from "../remote/agent-attachments";
import { parseRemoteAbs } from "../../shared/remote";

function asLiteratureArgs(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  const rec = asLiteratureArgs(args);
  const projectRoot = typeof rec?.projectRoot === "string" ? rec.projectRoot : "";
  const pdfPath = typeof rec?.pdfPath === "string" ? rec.pdfPath : "";
  const profileId = parseRemoteAbs(projectRoot)?.profileId;
  const broker = getRemoteSessionBroker();
  if (
    profileId
    && broker.isBound(profileId)
    && (LITERATURE_LOCAL_PDF_METHODS as readonly string[]).includes(method)
    && pdfPath
  ) {
    const staged = await stageLaptopPdfForRemote(projectRoot, pdfPath, async (absPath, bytes) => {
      await broker.invoke(profileId, "fs:writeBlob", {
        path: absPath,
        bytes: bytes.toString("base64"),
        offset: 0,
      });
    });
    if (!staged.ok) throw new Error(staged.error);
    args = { ...rec, pdfPath: staged.pdfPath };
  }
  return routeHostLiteratureMethod(method, args, broker);
}

function handleLiterature(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, args: any) => unknown,
): void {
  ipcMain.handle(channel, async (event, args) => {
    const remote = await routeIfRemote(channel, args ?? {});
    if (remote !== undefined) return remote;
    return fn(event, args);
  });
}

export function registerLiteratureHandlers(): void {
  handleLiterature("literature:list", async (_event, args: { projectRoot: string }) => {
    try {
      return listPapersForRenderer(args.projectRoot);
    } catch (err) {
      if (err instanceof Error && err.message === "literature_not_on_remote_yet") return [];
      throw err;
    }
  });

  handleLiterature(
    "literature:resolveAbs",
    async (_event, args: { projectRoot: string; rel: string }) => {
      return resolveLibraryDisplayAbs(args.projectRoot, args.rel);
    },
  );

  handleLiterature("literature:getPdfCacheStatus", async (_event, args: { projectRoot: string }) => {
    return getPdfCacheStatusForProject(args.projectRoot);
  });

  handleLiterature("literature:getStorageStats", async (_event, args: { projectRoot: string }) => {
    return getLiteratureStorageStats(args.projectRoot);
  });

  handleLiterature("literature:pruneOrphanAttachments", async (_event, args: { projectRoot: string }) => {
    return pruneOrphanPdfAttachments(args.projectRoot);
  });

  handleLiterature("literature:search", async (_event, args: { projectRoot: string; query: string; limit?: number }) => {
    return searchPapersForRenderer(args.projectRoot, args.query, args.limit);
  });

  handleLiterature("literature:get", async (_event, args: { projectRoot: string; paperId: string }) => {
    return getPaperForRenderer(args.projectRoot, args.paperId);
  });

  handleLiterature("literature:ingestPdf", async (_event, args: { projectRoot: string; pdfPath: string; title?: string; doi?: string }) => {
    return ingestPdfForRenderer(args.projectRoot, args.pdfPath, { title: args.title, doi: args.doi });
  });

  handleLiterature(
    "literature:replacePdf",
    async (_event, args: { projectRoot: string; paperId: string; pdfPath: string }) => {
      return replacePaperPdfForRenderer(args.projectRoot, args.paperId, args.pdfPath);
    },
  );

  handleLiterature(
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

  handleLiterature(
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

  handleLiterature(
    "literature:createFromStagedCitation",
    async (
      event,
      args: { projectRoot: string; citation: StagedCitationImportInput },
    ) => {
      return createFromStagedCitationForRenderer(args.projectRoot, args.citation, event.sender);
    },
  );

  handleLiterature(
    "literature:cancelStagedCitationAdd",
    (_event, args: { stagedId: string }) => {
      cancelStagedCitationAdd(args.stagedId);
    },
  );

  handleLiterature(
    "literature:findExisting",
    async (_event, args: { projectRoot: string; doi?: string | null; arxivId?: string | null }) => {
      return findExistingByIdentifier(args.projectRoot, { doi: args.doi, arxivId: args.arxivId });
    },
  );

  handleLiterature(
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

  handleLiterature(
    "literature:applyMetadata",
    async (_event, args: { projectRoot: string; paperId: string; metadata: Record<string, unknown> }) => {
      return applyMetadataForRenderer(args.projectRoot, args.paperId, args.metadata);
    },
  );

  handleLiterature(
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

  handleLiterature("literature:getAnnotations", async (_event, args: { projectRoot: string; paperId: string }) => {
    return getAnnotations(args.projectRoot, args.paperId);
  });

  handleLiterature(
    "literature:saveAnnotation",
    async (_event, args: { projectRoot: string; annotation: Record<string, unknown> }) => {
      return saveAnnotationForRenderer(args.projectRoot, args.annotation);
    },
  );

  handleLiterature("literature:deleteAnnotation", async (_event, args: { projectRoot: string; annotationId: string }) => {
    deleteAnnotation(args.projectRoot, args.annotationId);
    return { ok: true };
  });

  handleLiterature("literature:readPdfBytes", async (_event, args: { projectRoot: string; paperId: string }) => {
    return readPaperPdfBytesForRenderer(args.projectRoot, args.paperId);
  });

  handleLiterature("literature:ensurePaperPdf", async (event, args: { projectRoot: string; paperId: string }) => {
    return ensurePaperPdfForRenderer(args.projectRoot, args.paperId, event.sender);
  });

  handleLiterature("literature:createPaper", async (_event, args: { projectRoot: string; metadata: Record<string, unknown> }) => {
    return createPaperForRenderer(args.projectRoot, args.metadata);
  });

  handleLiterature(
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

  handleLiterature(
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

  handleLiterature(
    "literature:downloadPdf",
    async (event, args: { projectRoot: string; paperId: string }) => {
      return downloadPdfForRenderer(args.projectRoot, args.paperId, event.sender);
    },
  );

  handleLiterature(
    "literature:updatePaper",
    async (_event, args: { projectRoot: string; paperId: string; patch: Record<string, unknown> }) => {
      return updatePaperForRenderer(args.projectRoot, args.paperId, args.patch);
    },
  );

  handleLiterature(
    "literature:regenerateAiMetadata",
    async (_event, args: { projectRoot: string; paperId: string }) => {
      return regenerateAiMetadataForPaper(args.projectRoot, args.paperId);
    },
  );

  handleLiterature("literature:deletePaper", async (_event, args: { projectRoot: string; paperId: string }) => {
    deletePaper(args.projectRoot, args.paperId);
    return { ok: true };
  });

  handleLiterature("literature:importToLocal", async (_event, args: { projectRoot: string; paperId: string }) => {
    promoteZoteroPaperToProject(args.projectRoot, args.paperId);
    return { ok: true };
  });

  handleLiterature("literature:exportBib", async (_event, args: { projectRoot: string; paperIds?: string[] }) => {
    return { content: await bibliographyExportContent(args.projectRoot, args.paperIds) };
  });

  handleLiterature(
    "literature:formatBibliography",
    async (_event, args: { projectRoot: string; paperIds: string[]; style?: string }) => {
      const content = formatBibliography(args.projectRoot, args.paperIds, (args.style as any) ?? "ieee");
      return { content };
    },
  );

  handleLiterature(
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

  handleLiterature("literature:cite", async (_event, args: { projectRoot: string; bibkey: string }) => {
    return citePaperInProject(args.projectRoot, args.bibkey);
  });

  handleLiterature("literature:citationHealth", async (_event, args: { projectRoot: string }) => {
    return getCitationHealth(args.projectRoot);
  });

  handleLiterature(
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

  handleLiterature(
    "literature:importFromProjectBib",
    async (_event, args: { projectRoot: string; bibkeys?: string[] }) => {
      return importProjectBibKeysIntoLibrary(args.projectRoot, args.bibkeys);
    },
  );

  handleLiterature("literature:readingList", async (_event, args: { projectRoot: string }) => {
    return listReadingListForRenderer(args.projectRoot);
  });

  handleLiterature("literature:listCollections", async (_event, args: { projectRoot: string }) => {
    return listCollections(args.projectRoot);
  });

  handleLiterature(
    "literature:createCollection",
    async (_event, args: { projectRoot: string; name: string; parentId?: string | null }) => {
      return createCollection(args.projectRoot, args.name, args.parentId);
    },
  );

  handleLiterature(
    "literature:updateCollection",
    async (_event, args: { projectRoot: string; collectionId: string; name: string }) => {
      return updateCollectionForRenderer(args.projectRoot, args.collectionId, args.name);
    },
  );

  handleLiterature(
    "literature:deleteCollection",
    async (_event, args: { projectRoot: string; collectionId: string }) => {
      return deleteCollectionForRenderer(args.projectRoot, args.collectionId);
    },
  );

  handleLiterature(
    "literature:listCollectionPaperIds",
    async (_event, args: { projectRoot: string; collectionId: string }) => {
      return listCollectionPaperIds(args.projectRoot, args.collectionId);
    },
  );

  handleLiterature(
    "literature:addPapersToCollection",
    async (
      _event,
      args: { projectRoot: string; collectionId: string; paperIds: string[] },
    ) => {
      return addPapersToCollectionForRenderer(args.projectRoot, args.collectionId, args.paperIds);
    },
  );

  handleLiterature(
    "literature:removePapersFromCollection",
    async (
      _event,
      args: { projectRoot: string; collectionId: string; paperIds: string[] },
    ) => {
      return removePapersFromCollectionForRenderer(args.projectRoot, args.collectionId, args.paperIds);
    },
  );

  handleLiterature(
    "literature:importFromProject",
    async (_event, args: { targetRoot: string; sourceRoot: string; paperIds: string[]; includeAnnotations?: boolean; includePdf?: boolean }) => {
      return importFromProject(args.targetRoot, args.sourceRoot, args.paperIds, {
        includeAnnotations: args.includeAnnotations,
        includePdf: args.includePdf,
      });
    },
  );

  handleLiterature("literature:pickPdf", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePaths[0]) return { path: null };
    return { path: result.filePaths[0] };
  });

  handleLiterature("literature:pickBibTeX", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "BibTeX", extensions: ["bib"] }, { name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return { paths: [] as string[] };
    return { paths: result.filePaths };
  });

  handleLiterature("literature:pickProjectRoot", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { path: null };
    const inspected = inspectWorkbenchLibrary(result.filePaths[0]);
    if (!inspected.ok) return { path: null, error: inspected.error };
    return { path: result.filePaths[0] };
  });

  handleLiterature(
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

  handleLiterature(
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

  handleLiterature("literature:importBatch", async (_event, args: Record<string, unknown>) => {
    const projectRoot = typeof args.projectRoot === "string" ? args.projectRoot : "";
    return importZoteroBatchForRenderer(projectRoot, parseLiteratureImportBatch(projectRoot, args));
  });

  handleLiterature("literature:getZoteroBinding", async (_event, args: { projectRoot: string }) => {
    return getZoteroProjectBinding(args.projectRoot);
  });

  handleLiterature(
    "literature:setZoteroBinding",
    async (
      _event,
      args: { projectRoot: string; collectionId: string | null; collectionName?: string | null },
    ) => {
      return setZoteroProjectBinding(args.projectRoot, args.collectionId, args.collectionName);
    },
  );

  handleLiterature("literature:getZoteroLastSync", async (_event, args: { projectRoot: string }) => {
    return { lastSyncAt: getZoteroLastSync(args.projectRoot) };
  });
}
