/**
 * Literature / Zotero / citation desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by literature-store. extract / reader stores are not on this port yet.
 */

type DesktopApi = typeof window.electronAPI;

function forward<K extends keyof DesktopApi>(name: K): DesktopApi[K] {
  return ((...args: Parameters<DesktopApi[K]>) => {
    const fn = window.electronAPI?.[name];
    return typeof fn === "function" ? (fn as DesktopApi[K])(...args) : undefined;
  }) as DesktopApi[K];
}

export const literatureDesktop = {
  zoteroProbe: forward("zoteroProbe"),
  zoteroGetProjectBinding: forward("zoteroGetProjectBinding"),
  zoteroGetLastSync: forward("zoteroGetLastSync"),
  zoteroSetProjectBinding: forward("zoteroSetProjectBinding"),
  zoteroPullCollection: forward("zoteroPullCollection"),
  zoteroPullCollections: forward("zoteroPullCollections"),
  literatureListCollections: forward("literatureListCollections"),
  literatureReadingList: forward("literatureReadingList"),
  literatureListCollectionPaperIds: forward("literatureListCollectionPaperIds"),
  literatureCreateCollection: forward("literatureCreateCollection"),
  literatureUpdateCollection: forward("literatureUpdateCollection"),
  literatureDeleteCollection: forward("literatureDeleteCollection"),
  literatureAddPapersToCollection: forward("literatureAddPapersToCollection"),
  literatureRemovePapersFromCollection: forward("literatureRemovePapersFromCollection"),
  literatureSearch: forward("literatureSearch"),
  literatureList: forward("literatureList"),
  literatureGetPdfCacheStatus: forward("literatureGetPdfCacheStatus"),
  literatureCreatePaper: forward("literatureCreatePaper"),
  literatureUpdatePaper: forward("literatureUpdatePaper"),
  literatureDeletePaper: forward("literatureDeletePaper"),
  literatureImportToLocal: forward("literatureImportToLocal"),
  literatureCreateFromIdentifier: forward("literatureCreateFromIdentifier"),
  literatureExportBibToFile: forward("literatureExportBibToFile"),
  literatureCite: forward("literatureCite"),
  literatureCitationHealth: forward("literatureCitationHealth"),
  literatureMergeIntoProjectBib: forward("literatureMergeIntoProjectBib"),
  literatureImportFromProjectBib: forward("literatureImportFromProjectBib"),
  literatureIngestPdf: forward("literatureIngestPdf"),
  literatureReadPdfBytes: forward("literatureReadPdfBytes"),
  literatureApplyIdentifiers: forward("literatureApplyIdentifiers"),
  literatureFetchAndApplyMetadata: forward("literatureFetchAndApplyMetadata"),
  literatureDownloadPdf: forward("literatureDownloadPdf"),
  literatureAttachLocalPdf: forward("literatureAttachLocalPdf"),
  literatureImportBibTeX: forward("literatureImportBibTeX"),
  literatureGetAnnotations: forward("literatureGetAnnotations"),
  literatureSaveAnnotation: forward("literatureSaveAnnotation"),
  literatureDeleteAnnotation: forward("literatureDeleteAnnotation"),
  onLiteraturePdfDownloadProgress: forward("onLiteraturePdfDownloadProgress"),
  onLiteraturePaperMaterialized: forward("onLiteraturePaperMaterialized"),
};
