import { ipcRenderer } from "electron";

export const literatureApi = {
	// Literature library
	literatureList: (projectRoot: string) => ipcRenderer.invoke("literature:list", { projectRoot }),
	literatureResolveAbs: (projectRoot: string, rel: string) =>
		ipcRenderer.invoke("literature:resolveAbs", { projectRoot, rel }),
	literatureGetPdfCacheStatus: (projectRoot: string) =>
		ipcRenderer.invoke("literature:getPdfCacheStatus", { projectRoot }),
	literatureGetStorageStats: (projectRoot: string) =>
		ipcRenderer.invoke("literature:getStorageStats", { projectRoot }),
	literaturePruneOrphanAttachments: (projectRoot: string) =>
		ipcRenderer.invoke("literature:pruneOrphanAttachments", { projectRoot }),
	literatureSearch: (projectRoot: string, query: string, limit?: number) =>
		ipcRenderer.invoke("literature:search", { projectRoot, query, limit }),
	literatureGet: (projectRoot: string, paperId: string) =>
		ipcRenderer.invoke("literature:get", { projectRoot, paperId }),
	literatureIngestPdf: (projectRoot: string, pdfPath: string, opts?: { title?: string; doi?: string }) =>
		ipcRenderer.invoke("literature:ingestPdf", { projectRoot, pdfPath, ...opts }),
	literatureReplacePdf: (projectRoot: string, paperId: string, pdfPath: string) =>
		ipcRenderer.invoke("literature:replacePdf", { projectRoot, paperId, pdfPath }),
	literatureAttachLocalPdf: (
		projectRoot: string,
		paperId: string,
		pdfPath: string,
		opts?: { ignoreIdentifierConflict?: boolean },
	) =>
		ipcRenderer.invoke("literature:attachLocalPdf", {
			projectRoot,
			paperId,
			pdfPath,
			ignoreIdentifierConflict: opts?.ignoreIdentifierConflict,
		}),
	literatureCreateFromIdentifier: (
		projectRoot: string,
		ids: {
			doi?: string;
			arxivId?: string;
			isbn?: string;
			pmid?: string;
			adsBibcode?: string;
		},
	) => ipcRenderer.invoke("literature:createFromIdentifier", { projectRoot, ...ids }),
	literatureCreateFromStagedCitation: (
		projectRoot: string,
		citation: import("../shared/literature/citation-staging").StagedCitationImportInput,
	) => ipcRenderer.invoke("literature:createFromStagedCitation", { projectRoot, citation }),
	literatureCancelStagedCitationAdd: (stagedId: string) =>
		ipcRenderer.invoke("literature:cancelStagedCitationAdd", { stagedId }),
	onLiteratureStagedAddProgress: (
		callback: (data: import("../shared/literature/citation-staging").StagedAddProgressEvent) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: import("../shared/literature/citation-staging").StagedAddProgressEvent,
		) => callback(data);
		ipcRenderer.on("literature:stagedAddProgress", handler);
		return () => ipcRenderer.removeListener("literature:stagedAddProgress", handler);
	},
	literatureFindExisting: (
		projectRoot: string,
		ids: { doi?: string | null; arxivId?: string | null },
	) =>
		ipcRenderer.invoke("literature:findExisting", {
			projectRoot,
			doi: ids.doi ?? null,
			arxivId: ids.arxivId ?? null,
		}),
	literatureStage: (
		projectRoot: string,
		args: {
			sessionId: string;
			doi?: string;
			arxivId?: string;
			sourceUrl?: string;
			discoveredFrom?: "literature-discover" | "paper-search-mcp" | "websearch" | "webfetch" | "user" | "agent";
		},
	) => ipcRenderer.invoke("literature:stage", { projectRoot, ...args }),
	literatureApplyMetadata: (projectRoot: string, paperId: string, metadata: Record<string, unknown>) =>
		ipcRenderer.invoke("literature:applyMetadata", { projectRoot, paperId, metadata }),
	literatureApplyIdentifiers: (
		projectRoot: string,
		paperId: string,
		ids: { doi?: string | null; arxivId?: string | null },
	) => ipcRenderer.invoke("literature:applyIdentifiers", { projectRoot, paperId, ...ids }),
	literatureFetchAndApplyMetadata: (
		projectRoot: string,
		paperId: string,
		opts?: { doi?: string; arxivId?: string },
	) => ipcRenderer.invoke("literature:fetchAndApplyMetadata", { projectRoot, paperId, ...opts }),
	literatureDownloadPdf: (projectRoot: string, paperId: string) =>
		ipcRenderer.invoke("literature:downloadPdf", { projectRoot, paperId }),
	literatureImportBibTeX: (projectRoot: string, bibContent: string, jsonContent?: string) =>
		ipcRenderer.invoke("literature:importBibTeX", { projectRoot, bibContent, jsonContent }),
	literatureGetAnnotations: (projectRoot: string, paperId: string) =>
		ipcRenderer.invoke("literature:getAnnotations", { projectRoot, paperId }),
	literatureSaveAnnotation: (projectRoot: string, annotation: Record<string, unknown>) =>
		ipcRenderer.invoke("literature:saveAnnotation", { projectRoot, annotation }),
	literatureDeleteAnnotation: (projectRoot: string, annotationId: string) =>
		ipcRenderer.invoke("literature:deleteAnnotation", { projectRoot, annotationId }),
	literatureReadPdfBytes: (projectRoot: string, paperId: string) =>
		ipcRenderer.invoke("literature:readPdfBytes", { projectRoot, paperId }),
	literatureEnsurePaperPdf: (projectRoot: string, paperId: string) =>
		ipcRenderer.invoke("literature:ensurePaperPdf", { projectRoot, paperId }),
	onLiteraturePdfDownloadProgress: (
		callback: (data: {
			paperId: string;
			phase: "resolving" | "downloading" | "caching" | "reading" | "opening" | "done";
			receivedBytes?: number;
			totalBytes?: number | null;
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: {
				paperId: string;
				phase: "resolving" | "downloading" | "caching" | "reading" | "opening" | "done";
				receivedBytes?: number;
				totalBytes?: number | null;
			},
		) => callback(data);
		ipcRenderer.on("literature:pdfDownloadProgress", handler);
		return () => ipcRenderer.removeListener("literature:pdfDownloadProgress", handler);
	},
	literatureCreatePaper: (projectRoot: string, metadata: Record<string, unknown>) =>
		ipcRenderer.invoke("literature:createPaper", { projectRoot, metadata }),
	literatureUpdatePaper: (projectRoot: string, paperId: string, patch: Record<string, unknown>) =>
		ipcRenderer.invoke("literature:updatePaper", { projectRoot, paperId, patch }),
	literatureRegenerateAiMetadata: (projectRoot: string, paperId: string) =>
		ipcRenderer.invoke("literature:regenerateAiMetadata", { projectRoot, paperId }),
	literatureGetCitationNetwork: (
		projectRoot: string,
		paperId: string,
		opts?: { refresh?: boolean },
	) =>
		ipcRenderer.invoke("literature:getCitationNetwork", {
			projectRoot,
			paperId,
			refresh: opts?.refresh,
		}),
	literatureGetCitationNetworkPage: (
		projectRoot: string,
		paperId: string,
		section: "references" | "citedBy",
		cursor: string,
		opts?: { refresh?: boolean },
	) =>
		ipcRenderer.invoke("literature:getCitationNetworkPage", {
			projectRoot,
			paperId,
			section,
			cursor,
			refresh: opts?.refresh,
		}),
	onLiteratureAiMetadataChanged: (
		callback: (payload: { projectRoot: string; paperId: string }) => void,
	) => {
		const handler = (_event: unknown, payload: { projectRoot: string; paperId: string }) =>
			callback(payload);
		ipcRenderer.on("literature:aiMetadataChanged", handler);
		return () => ipcRenderer.removeListener("literature:aiMetadataChanged", handler);
	},
	literatureDeletePaper: (projectRoot: string, paperId: string) =>
		ipcRenderer.invoke("literature:deletePaper", { projectRoot, paperId }),
	literatureImportToLocal: (projectRoot: string, paperId: string) =>
		ipcRenderer.invoke("literature:importToLocal", { projectRoot, paperId }),
	literatureExportBib: (projectRoot: string, paperIds?: string[]) =>
		ipcRenderer.invoke("literature:exportBib", { projectRoot, paperIds }),
	literatureFormatBibliography: (projectRoot: string, paperIds: string[], style?: string) =>
		ipcRenderer.invoke("literature:formatBibliography", { projectRoot, paperIds, style }),
	literatureExportBibToFile: (
		projectRoot: string,
		paperIds?: string[],
		defaultPath?: string,
	) => ipcRenderer.invoke("literature:exportBibToFile", { projectRoot, paperIds, defaultPath }),
	literatureCite: (projectRoot: string, bibkey: string) =>
		ipcRenderer.invoke("literature:cite", { projectRoot, bibkey }),
	literatureCitationHealth: (projectRoot: string) =>
		ipcRenderer.invoke("literature:citationHealth", { projectRoot }),
	literatureMergeIntoProjectBib: (
		projectRoot: string,
		options?: { bibkeys?: string[]; all?: boolean; onlyCitedInTex?: boolean },
	) => ipcRenderer.invoke("literature:mergeIntoProjectBib", { projectRoot, ...options }),
	literatureImportFromProjectBib: (projectRoot: string, bibkeys?: string[]) =>
		ipcRenderer.invoke("literature:importFromProjectBib", { projectRoot, bibkeys }),
	literatureReadingList: (projectRoot: string) =>
		ipcRenderer.invoke("literature:readingList", { projectRoot }),
	literatureListCollections: (projectRoot: string) =>
		ipcRenderer.invoke("literature:listCollections", { projectRoot }),
	literatureCreateCollection: (
		projectRoot: string,
		name: string,
		parentId?: string | null,
	) => ipcRenderer.invoke("literature:createCollection", { projectRoot, name, parentId }),
	literatureUpdateCollection: (projectRoot: string, collectionId: string, name: string) =>
		ipcRenderer.invoke("literature:updateCollection", { projectRoot, collectionId, name }),
	literatureDeleteCollection: (projectRoot: string, collectionId: string) =>
		ipcRenderer.invoke("literature:deleteCollection", { projectRoot, collectionId }),
	literatureListCollectionPaperIds: (projectRoot: string, collectionId: string) =>
		ipcRenderer.invoke("literature:listCollectionPaperIds", { projectRoot, collectionId }),
	literatureAddPapersToCollection: (
		projectRoot: string,
		collectionId: string,
		paperIds: string[],
	) =>
		ipcRenderer.invoke("literature:addPapersToCollection", {
			projectRoot,
			collectionId,
			paperIds,
		}),
	literatureRemovePapersFromCollection: (
		projectRoot: string,
		collectionId: string,
		paperIds: string[],
	) =>
		ipcRenderer.invoke("literature:removePapersFromCollection", {
			projectRoot,
			collectionId,
			paperIds,
		}),
	literatureImportFromProject: (
		targetRoot: string,
		sourceRoot: string,
		paperIds: string[],
		opts?: { includeAnnotations?: boolean; includePdf?: boolean },
	) => ipcRenderer.invoke("literature:importFromProject", { targetRoot, sourceRoot, paperIds, ...opts }),
	literaturePickPdf: () => ipcRenderer.invoke("literature:pickPdf"),
	literaturePickBibTeX: () => ipcRenderer.invoke("literature:pickBibTeX"),
	literaturePickProjectRoot: () => ipcRenderer.invoke("literature:pickProjectRoot"),
	onLiteraturePaperMaterialized: (
		callback: (data: { projectRoot: string; paperId: string }) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: { projectRoot: string; paperId: string },
		) => callback(data);
		ipcRenderer.on("literature:paperMaterialized", handler);
		return () => ipcRenderer.removeListener("literature:paperMaterialized", handler);
	},
};
