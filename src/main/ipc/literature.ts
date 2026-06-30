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
  exportBibTeX,
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
} from "../services/literature-service";
import { resolvePaperPdfBytes, ensurePaperPdfAbsPath } from "../services/literature-pdf-resolve";
import { toLiteraturePdfUrl } from "../services/literature-pdf-protocol";
import { getPdfCacheStatesForPapers, getLiteratureStorageStats, pruneOrphanPdfAttachments } from "../services/literature-pdf-cache";
import {
  addPapersToZoteroCollection,
  deleteCollectionInZotero,
  removePapersFromZoteroCollection,
  renameCollectionInZotero,
} from "../services/zotero-sync";
import {
  createPaperFromCatalog,
  downloadPdfForPaper,
  ingestPdfWithEnrich,
} from "../services/literature-enrich";
import { exportZoteroBibliography } from "../services/zotero-sync";
import { resolveBibliographicMetadata } from "../../shared/bibliographic-metadata";
import { bibliographicToPaperPatch } from "../../shared/bibliographic-metadata/helpers";
import type { StagedCitationPayload, StageResult } from "../../shared/citation-staging";
import { normalizeArxivId, normalizeDoi } from "../../shared/doi-utils";

async function bibliographyExportContent(
  projectRoot: string,
  paperIds?: string[],
): Promise<string> {
  const papers = paperIds?.length
    ? listPapers(projectRoot).filter((p) => paperIds.includes(p.id))
    : listPapers(projectRoot);
  const zoteroPaperIds = papers.filter((p) => p.zotero_key).map((p) => p.id);
  if (zoteroPaperIds.length > 0) {
    try {
      return await exportZoteroBibliography(projectRoot, paperIds);
    } catch {
      if (zoteroPaperIds.length === papers.length) {
        return exportBibTeX(projectRoot, paperIds);
      }
    }
  }
  return exportBibTeX(projectRoot, paperIds);
}

export function registerLiteratureHandlers(): void {
  ipcMain.handle("literature:list", async (_event, args: { projectRoot: string }) => {
    return listPapers(args.projectRoot);
  });

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
    return searchPapers(args.projectRoot, args.query, args.limit);
  });

  ipcMain.handle("literature:get", async (_event, args: { projectRoot: string; paperId: string }) => {
    return getPaper(args.projectRoot, args.paperId);
  });

  ipcMain.handle("literature:ingestPdf", async (_event, args: { projectRoot: string; pdfPath: string; title?: string; doi?: string }) => {
    return ingestPdfWithEnrich(args.projectRoot, args.pdfPath, { title: args.title, doi: args.doi });
  });

  ipcMain.handle(
    "literature:createFromIdentifier",
    async (_event, args: { projectRoot: string; doi?: string; arxivId?: string }) => {
      return createPaperFromCatalog(args.projectRoot, { doi: args.doi, arxivId: args.arxivId });
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
        doi?: string;
        arxivId?: string;
        sourceUrl?: string;
        discoveredFrom?: StagedCitationPayload["discoveredFrom"];
      },
    ): Promise<StageResult> => {
      const normDoi = args.doi?.trim() ? normalizeDoi(args.doi.trim()) : null;
      const normArxiv = args.arxivId?.trim() ? normalizeArxivId(args.arxivId.trim()) : null;
      if (!normDoi && !normArxiv) {
        return {
          staged: false,
          verified: false,
          error: "Invalid or missing DOI/arXiv ID.",
          hint: "Use an exact DOI or arXiv ID from websearch or the user. Do not invent identifiers.",
        };
      }
      if (normDoi && normArxiv) {
        return { staged: false, verified: false, error: "Provide only one of doi or arxivId." };
      }
      try {
        const { metadata } = await resolveBibliographicMetadata(
          {
            doi: normDoi ?? undefined,
            arxivId: normArxiv ?? undefined,
          },
          { fast: true },
        );
        if (!metadata.title?.trim()) {
          return {
            staged: false,
            verified: false,
            error: "Catalog returned no verifiable title.",
            hint: "Confirm the identifier with websearch or the user.",
          };
        }
        const patch = bibliographicToPaperPatch(metadata);
        const existing = findExistingByIdentifier(args.projectRoot, {
          doi: normDoi,
          arxivId: normArxiv,
        });
        const payload: StagedCitationPayload = {
          title: (patch.title as string) ?? metadata.title,
          authors: (patch.authors as string | null) ?? null,
          year: (patch.year as number | null) ?? null,
          venue: (patch.venue as string | null) ?? null,
          type: (patch.type as string | null) ?? null,
          doi: (patch.doi as string | null) ?? null,
          arxivId: (patch.arxiv_id as string | null) ?? null,
          abstract: (patch.abstract as string | null) ?? null,
          cslJson: null,
          sourceUrl: args.sourceUrl ?? null,
          catalogSource: metadata.source ?? null,
          catalogVerified: true,
          verifyError: null,
          discoveredFrom: args.discoveredFrom ?? "agent",
          libraryPaperId: existing?.paperId ?? null,
          libraryBibkey: existing?.bibkey ?? null,
        };
        return {
          staged: true,
          verified: true,
          citation: payload,
          alreadyInLibrary: Boolean(existing),
          libraryBibkey: existing?.bibkey ?? null,
          hint: existing
            ? "Already in library. Cite as [n]."
            : "Cite as [n] in your reply. User will confirm before adding to library.",
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          staged: false,
          verified: false,
          error: message,
          hint: "Identifier not found in external catalogs. Confirm with websearch or ask the user — do not guess.",
        };
      }
    },
  );

  ipcMain.handle(
    "literature:applyMetadata",
    async (_event, args: { projectRoot: string; paperId: string; metadata: Record<string, unknown> }) => {
      return applyMetadata(args.projectRoot, args.paperId, args.metadata as Parameters<typeof applyMetadata>[2]);
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
    return createPaper(args.projectRoot, args.metadata as Parameters<typeof createPaper>[1]);
  });

  ipcMain.handle(
    "literature:applyIdentifiers",
    async (
      _event,
      args: { projectRoot: string; paperId: string; doi?: string | null; arxivId?: string | null },
    ) => {
      return applyIdentifiers(args.projectRoot, args.paperId, { doi: args.doi, arxivId: args.arxivId });
    },
  );

  ipcMain.handle(
    "literature:fetchAndApplyMetadata",
    async (
      _event,
      args: { projectRoot: string; paperId: string; doi?: string; arxivId?: string },
    ) => {
      return fetchAndApplyMetadata(args.projectRoot, args.paperId, { doi: args.doi, arxivId: args.arxivId });
    },
  );

  ipcMain.handle(
    "literature:downloadPdf",
    async (_event, args: { projectRoot: string; paperId: string }) => {
      return downloadPdfForPaper(args.projectRoot, args.paperId);
    },
  );

  ipcMain.handle(
    "literature:updatePaper",
    async (_event, args: { projectRoot: string; paperId: string; patch: Record<string, unknown> }) => {
      return updatePaper(args.projectRoot, args.paperId, args.patch as Parameters<typeof updatePaper>[2]);
    },
  );

  ipcMain.handle("literature:deletePaper", async (_event, args: { projectRoot: string; paperId: string }) => {
    deletePaper(args.projectRoot, args.paperId);
    return { ok: true };
  });

  ipcMain.handle("literature:importToLocal", async (_event, args: { projectRoot: string; paperId: string }) => {
    detachZoteroMirror(args.projectRoot, args.paperId);
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

  ipcMain.handle("literature:readingList", async (_event, args: { projectRoot: string }) => {
    return listReadingList(args.projectRoot);
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
    const libraryDb = path.join(result.filePaths[0], ".prismnext", "library", "library.db");
    if (!fs.existsSync(libraryDb)) return { path: null, error: "No library.db in selected project" };
    return { path: result.filePaths[0] };
  });
}
