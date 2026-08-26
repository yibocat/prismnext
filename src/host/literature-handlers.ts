import type { HostEventOrigin } from "../main/app/event-sink";
import { setHostEvents } from "../main/app/event-sink";
import type { HostHandlerContext } from "./context";
import * as literature from "../main/literature/host";

function originFrom(ctx: HostHandlerContext): HostEventOrigin {
  return {
    send(channel, payload) {
      ctx.emit(channel, payload);
    },
  };
}

function projectRoot(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  return typeof params.projectRoot === "string" && params.projectRoot.trim()
    ? params.projectRoot
    : ctx.remoteRoot ?? "";
}

export function installLiteratureEvents(ctx: HostHandlerContext): void {
  setHostEvents({
    broadcast(channel, payload) {
      ctx.emit(channel, payload);
    },
    sendToOriginThenBroadcast(channel, payload) {
      ctx.emit(channel, payload);
    },
  });
}

export const literatureHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "literature:list"(params, ctx) {
    return literature.listPapersForRenderer(projectRoot(params, ctx));
  },
  async "literature:resolveAbs"(params, ctx) {
    return literature.resolveLibraryDisplayAbs(projectRoot(params, ctx), String(params.rel ?? ""));
  },
  async "literature:getPdfCacheStatus"(params, ctx) {
    return literature.getPdfCacheStatusForProject(projectRoot(params, ctx));
  },
  async "literature:getStorageStats"(params, ctx) {
    return literature.getLiteratureStorageStats(projectRoot(params, ctx));
  },
  async "literature:pruneOrphanAttachments"(params, ctx) {
    return literature.pruneOrphanPdfAttachments(projectRoot(params, ctx));
  },
  async "literature:search"(params, ctx) {
    return literature.searchPapersForRenderer(
      projectRoot(params, ctx),
      String(params.query ?? ""),
      typeof params.limit === "number" ? params.limit : undefined,
    );
  },
  async "literature:get"(params, ctx) {
    return literature.getPaperForRenderer(projectRoot(params, ctx), String(params.paperId ?? ""));
  },
  async "literature:ingestPdf"(params, ctx) {
    return literature.ingestPdfForRenderer(projectRoot(params, ctx), String(params.pdfPath ?? ""), {
      title: typeof params.title === "string" ? params.title : undefined,
      doi: typeof params.doi === "string" ? params.doi : undefined,
    });
  },
  async "literature:replacePdf"(params, ctx) {
    return literature.replacePaperPdfForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      String(params.pdfPath ?? ""),
    );
  },
  async "literature:attachLocalPdf"(params, ctx) {
    return literature.attachLocalPdfForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      String(params.pdfPath ?? ""),
      { ignoreIdentifierConflict: params.ignoreIdentifierConflict === true },
    );
  },
  async "literature:createFromIdentifier"(params, ctx) {
    return literature.createPaperFromIdentifierForRenderer(
      projectRoot(params, ctx),
      {
        doi: typeof params.doi === "string" ? params.doi : undefined,
        arxivId: typeof params.arxivId === "string" ? params.arxivId : undefined,
        isbn: typeof params.isbn === "string" ? params.isbn : undefined,
        pmid: typeof params.pmid === "string" ? params.pmid : undefined,
        adsBibcode: typeof params.adsBibcode === "string" ? params.adsBibcode : undefined,
      },
      originFrom(ctx),
    );
  },
  async "literature:createFromStagedCitation"(params, ctx) {
    return literature.createFromStagedCitationForRenderer(
      projectRoot(params, ctx),
      params.citation as never,
      originFrom(ctx),
    );
  },
  async "literature:findExisting"(params, ctx) {
    return literature.findExistingByIdentifier(projectRoot(params, ctx), {
      doi: typeof params.doi === "string" ? params.doi : null,
      arxivId: typeof params.arxivId === "string" ? params.arxivId : null,
    });
  },
  async "literature:stage"(params, ctx) {
    return literature.stageCitationForRenderer({
      projectRoot: projectRoot(params, ctx),
      sessionId: String(params.sessionId ?? ""),
      doi: typeof params.doi === "string" ? params.doi : undefined,
      arxivId: typeof params.arxivId === "string" ? params.arxivId : undefined,
      sourceUrl: typeof params.sourceUrl === "string" ? params.sourceUrl : undefined,
      discoveredFrom: params.discoveredFrom as never,
    });
  },
  async "literature:applyMetadata"(params, ctx) {
    return literature.applyMetadataForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      (params.metadata && typeof params.metadata === "object"
        ? params.metadata
        : {}) as Record<string, unknown>,
    );
  },
  async "literature:importBibTeX"(params, ctx) {
    return literature.importBibTeXForRenderer(
      projectRoot(params, ctx),
      String(params.bibContent ?? ""),
      typeof params.jsonContent === "string" ? params.jsonContent : undefined,
      params.enrichAfterImport !== false,
    );
  },
  async "literature:getAnnotations"(params, ctx) {
    return literature.getAnnotations(projectRoot(params, ctx), String(params.paperId ?? ""));
  },
  async "literature:saveAnnotation"(params, ctx) {
    return literature.saveAnnotationForRenderer(
      projectRoot(params, ctx),
      (params.annotation && typeof params.annotation === "object"
        ? params.annotation
        : {}) as Record<string, unknown>,
    );
  },
  async "literature:deleteAnnotation"(params, ctx) {
    literature.deleteAnnotation(projectRoot(params, ctx), String(params.annotationId ?? ""));
    return { ok: true };
  },
  async "literature:readPdfBytes"(params, ctx) {
    return literature.readPaperPdfBytesForRenderer(projectRoot(params, ctx), String(params.paperId ?? ""));
  },
  async "literature:ensurePaperPdf"(params, ctx) {
    return literature.ensurePaperPdfForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      originFrom(ctx),
    );
  },
  async "literature:createPaper"(params, ctx) {
    return literature.createPaperForRenderer(
      projectRoot(params, ctx),
      (params.metadata && typeof params.metadata === "object"
        ? params.metadata
        : {}) as Record<string, unknown>,
    );
  },
  async "literature:applyIdentifiers"(params, ctx) {
    return literature.applyIdentifiersForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      {
        doi: typeof params.doi === "string" ? params.doi : null,
        arxivId: typeof params.arxivId === "string" ? params.arxivId : null,
      },
    );
  },
  async "literature:fetchAndApplyMetadata"(params, ctx) {
    return literature.fetchAndApplyMetadataForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      {
        doi: typeof params.doi === "string" ? params.doi : undefined,
        arxivId: typeof params.arxivId === "string" ? params.arxivId : undefined,
      },
    );
  },
  async "literature:downloadPdf"(params, ctx) {
    return literature.downloadPdfForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      originFrom(ctx),
    );
  },
  async "literature:updatePaper"(params, ctx) {
    return literature.updatePaperForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      (params.patch && typeof params.patch === "object" ? params.patch : {}) as Record<string, unknown>,
    );
  },
  async "literature:regenerateAiMetadata"(params, ctx) {
    return literature.regenerateAiMetadataForPaper(projectRoot(params, ctx), String(params.paperId ?? ""));
  },
  async "literature:deletePaper"(params, ctx) {
    literature.deletePaper(projectRoot(params, ctx), String(params.paperId ?? ""));
    return { ok: true };
  },
  async "literature:importToLocal"(params, ctx) {
    literature.promoteZoteroPaperToProject(projectRoot(params, ctx), String(params.paperId ?? ""));
    return { ok: true };
  },
  async "literature:exportBib"(params, ctx) {
    return {
      content: await literature.bibliographyExportContent(
        projectRoot(params, ctx),
        Array.isArray(params.paperIds)
          ? params.paperIds.filter((item): item is string => typeof item === "string")
          : undefined,
      ),
    };
  },
  async "literature:formatBibliography"(params, ctx) {
    const paperIds = Array.isArray(params.paperIds)
      ? params.paperIds.filter((item): item is string => typeof item === "string")
      : [];
    return {
      content: literature.formatBibliography(
        projectRoot(params, ctx),
        paperIds,
        typeof params.style === "string" ? params.style as never : "ieee",
      ),
    };
  },
  async "literature:cite"(params, ctx) {
    return literature.citePaperInProject(projectRoot(params, ctx), String(params.bibkey ?? ""));
  },
  async "literature:citationHealth"(params, ctx) {
    return literature.getCitationHealth(projectRoot(params, ctx));
  },
  async "literature:mergeIntoProjectBib"(params, ctx) {
    return literature.syncLibraryToManuscriptBib(projectRoot(params, ctx), {
      bibkeys: Array.isArray(params.bibkeys)
        ? params.bibkeys.filter((item): item is string => typeof item === "string")
        : undefined,
      all: params.all === true,
      onlyCitedInTex: params.onlyCitedInTex === true,
    });
  },
  async "literature:importFromProjectBib"(params, ctx) {
    return literature.importProjectBibKeysIntoLibrary(
      projectRoot(params, ctx),
      Array.isArray(params.bibkeys)
        ? params.bibkeys.filter((item): item is string => typeof item === "string")
        : undefined,
    );
  },
  async "literature:readingList"(params, ctx) {
    return literature.listReadingListForRenderer(projectRoot(params, ctx));
  },
  async "literature:listCollections"(params, ctx) {
    return literature.listCollections(projectRoot(params, ctx));
  },
  async "literature:createCollection"(params, ctx) {
    return literature.createCollection(
      projectRoot(params, ctx),
      String(params.name ?? ""),
      typeof params.parentId === "string" ? params.parentId : null,
    );
  },
  async "literature:updateCollection"(params, ctx) {
    return literature.updateCollectionForRenderer(
      projectRoot(params, ctx),
      String(params.collectionId ?? ""),
      String(params.name ?? ""),
    );
  },
  async "literature:deleteCollection"(params, ctx) {
    return literature.deleteCollectionForRenderer(
      projectRoot(params, ctx),
      String(params.collectionId ?? ""),
    );
  },
  async "literature:listCollectionPaperIds"(params, ctx) {
    return literature.listCollectionPaperIds(
      projectRoot(params, ctx),
      String(params.collectionId ?? ""),
    );
  },
  async "literature:addPapersToCollection"(params, ctx) {
    return literature.addPapersToCollectionForRenderer(
      projectRoot(params, ctx),
      String(params.collectionId ?? ""),
      Array.isArray(params.paperIds)
        ? params.paperIds.filter((item): item is string => typeof item === "string")
        : [],
    );
  },
  async "literature:removePapersFromCollection"(params, ctx) {
    return literature.removePapersFromCollectionForRenderer(
      projectRoot(params, ctx),
      String(params.collectionId ?? ""),
      Array.isArray(params.paperIds)
        ? params.paperIds.filter((item): item is string => typeof item === "string")
        : [],
    );
  },
  async "literature:importFromProject"(params, ctx) {
    const target = typeof params.targetRoot === "string" ? params.targetRoot : projectRoot(params, ctx);
    const source = typeof params.sourceRoot === "string" ? params.sourceRoot : "";
    return literature.importFromProject(
      target,
      source,
      Array.isArray(params.paperIds)
        ? params.paperIds.filter((item): item is string => typeof item === "string")
        : [],
      {
        includeAnnotations: params.includeAnnotations === true,
        includePdf: params.includePdf === true,
      },
    );
  },
  async "literature:getCitationNetwork"(params, ctx) {
    return literature.getPaperCitationNetwork(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      { refresh: params.refresh === true },
    );
  },
  async "literature:getCitationNetworkPage"(params, ctx) {
    return literature.getPaperCitationNetworkPage(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      params.section as never,
      String(params.cursor ?? ""),
      { refresh: params.refresh === true },
    );
  },
  async "literature:importBatch"(params, ctx) {
    const root = projectRoot(params, ctx);
    return literature.importZoteroBatchForRenderer(
      root,
      literature.parseLiteratureImportBatch(root, params),
    );
  },
  async "literature:getZoteroBinding"(params, ctx) {
    return literature.getZoteroProjectBinding(projectRoot(params, ctx));
  },
  async "literature:setZoteroBinding"(params, ctx) {
    return literature.setZoteroProjectBinding(
      projectRoot(params, ctx),
      typeof params.collectionId === "string" ? params.collectionId : null,
      typeof params.collectionName === "string" ? params.collectionName : null,
    );
  },
  async "literature:getZoteroLastSync"(params, ctx) {
    return { lastSyncAt: literature.getZoteroLastSync(projectRoot(params, ctx)) };
  },
  async "extract:enqueue"(params, ctx) {
    return literature.enqueuePaperExtractForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      extractSource(params),
      params.force === true,
    );
  },
  async "extract:cancel"(params, ctx) {
    return literature.cancelPaperExtractForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      extractSource(params),
    );
  },
  async "extract:list"(params, ctx) {
    const paperIds = Array.isArray(params.paperIds)
      ? params.paperIds.filter((item): item is string => typeof item === "string")
      : [];
    return literature.listPaperExtractStates(projectRoot(params, ctx), paperIds);
  },
  async "extract:get"(params, ctx) {
    return literature.getExtractDocument(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      extractSource(params),
    );
  },
  async "extract:getBlocks"(params, ctx) {
    const source = params.source === "mineru" || params.source === "pdfjs" || params.source === "html"
      ? params.source
      : undefined;
    return literature.getExtractBlocksDocument(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      source,
    );
  },
  async "extract:openMd"(params, ctx) {
    return literature.openExtractMarkdown(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      extractSource(params),
    );
  },
  async "extract:resume"(params, ctx) {
    return literature.resumeExtractQueuesForRenderer(projectRoot(params, ctx));
  },
  async "extract:retry"(params, ctx) {
    return literature.retryPaperExtractForRenderer(
      projectRoot(params, ctx),
      String(params.paperId ?? ""),
      extractSource(params),
    );
  },
  async "extract:enqueueBatch"(params, ctx) {
    const paperIds = Array.isArray(params.paperIds)
      ? params.paperIds.filter((item): item is string => typeof item === "string")
      : [];
    return literature.enqueueBatchPaperExtractForRenderer(
      projectRoot(params, ctx),
      paperIds,
      extractSource(params),
      params.force === true,
    );
  },
  async "extract:enqueueCollection"(params, ctx) {
    return literature.enqueueCollectionExtractForRenderer(
      projectRoot(params, ctx),
      String(params.collectionId ?? ""),
      extractSource(params),
      params.force === true,
    );
  },
  async "extract:readPdf"(params, ctx) {
    const source = params.source;
    return literature.readUserPaperPdfContent({
      projectRoot: projectRoot(params, ctx),
      bibkey: String(params.bibkey ?? ""),
      pages: typeof params.pages === "string" ? params.pages : undefined,
      query: typeof params.query === "string" ? params.query : undefined,
      source: source === "auto" || source === "mineru" || source === "pdfjs" || source === "html"
        ? source
        : undefined,
      force: params.force === true,
    });
  },
};

function extractSource(params: Record<string, unknown>): "mineru" | "pdfjs" | "html" {
  const source = params.source;
  if (source === "mineru" || source === "pdfjs" || source === "html") return source;
  return "pdfjs";
}
