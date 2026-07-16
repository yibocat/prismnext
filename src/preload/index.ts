import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { WorkspaceFolder } from "../renderer/types/workspace";
import type { PaperExtractState, PaperExtractProgress } from "../shared/paper-extract";

// Expose filesystem and dialog APIs to renderer
contextBridge.exposeInMainWorld("electronAPI", {
	// Platform info
	platform: process.platform as "darwin" | "win32" | "linux",
	getPathForFile: (file: File) => webUtils.getPathForFile(file),

	// Filesystem operations
	fsScan: (rootPath: string) => ipcRenderer.invoke("fs:scan", { rootPath }),
	fsScanMetadata: (rootPath: string) => ipcRenderer.invoke("fs:scanMetadata", { rootPath }),
	fsRead: (absPath: string) => ipcRenderer.invoke("fs:read", { absPath }),
	fsReadBatch: (absPaths: string[]) => ipcRenderer.invoke("fs:readBatch", { absPaths }),
	fsReadImage: (absPath: string) =>
		ipcRenderer.invoke("fs:readImage", { absPath }),
	fsReadBytes: (absPath: string) =>
		ipcRenderer.invoke("fs:readBytes", { absPath }) as Promise<{ bytes: ArrayBuffer }>,
	fsWrite: (absPath: string, content: string) =>
		ipcRenderer.invoke("fs:write", { absPath, content }),
	fsCreate: (rootPath: string, relativePath: string, content: string) =>
		ipcRenderer.invoke("fs:create", { rootPath, relativePath, content }),
	fsDelete: (absPath: string) => ipcRenderer.invoke("fs:delete", { absPath }),
	fsDeleteFolder: (absPath: string) =>
		ipcRenderer.invoke("fs:deleteFolder", { absPath }),
	fsRename: (oldPath: string, newPath: string) =>
		ipcRenderer.invoke("fs:rename", { oldPath, newPath }),
	fsMkdir: (absPath: string) => ipcRenderer.invoke("fs:mkdir", { absPath }),

	// Template
	templateList: () => ipcRenderer.invoke("template:list"),
	templateGet: (templateId: string) => ipcRenderer.invoke("template:get", { templateId }),
	templatePreview: (templateId: string) => ipcRenderer.invoke("template:preview", { templateId }),
	templateApply: (args: {
		rootPath: string;
		manuscriptDir: string;
		files: { path: string; content: string }[];
		templateId: string;
		templateCategory: string;
	}) => ipcRenderer.invoke("template:apply", args),
	templateGetPdfData: (templateId: string) => ipcRenderer.invoke("template:getPdfData", { templateId }),
	templateDetectChanges: (args: {
		rootPath: string;
		manuscriptDir: string;
		appliedFiles: Record<string, string>;
	}) => ipcRenderer.invoke("template:detectChanges", args),
  templateBackup: (args: {
    rootPath: string;
    manuscriptDir: string;
    files: string[];
    backupLabel: string;
    sourceTemplateId?: string;
    targetTemplateId?: string;
  }) => ipcRenderer.invoke("template:backup", args),
	templateListBackups: (args: { rootPath: string }) =>
		ipcRenderer.invoke("template:listBackups", args),
	templateRestoreBackup: (args: {
		rootPath: string;
		manuscriptDir: string;
		backupLabel: string;
	}) => ipcRenderer.invoke("template:restoreBackup", args),
	templateDeleteBackup: (args: { rootPath: string; backupLabel: string }) =>
		ipcRenderer.invoke("template:deleteBackup", args),

	// File watcher
	fsWatchStart: (rootPath: string) =>
		ipcRenderer.invoke("fs:watch-start", { rootPath }),
	fsWatchStop: () => ipcRenderer.invoke("fs:watch-stop"),

	// Dialog operations
	dialogOpenFolder: () => ipcRenderer.invoke("dialog:openFolder"),
	dialogOpenFile: () => ipcRenderer.invoke("dialog:openFile"),
	dialogOpenJsonFile: () => ipcRenderer.invoke("dialog:openJsonFile"),
	dialogSaveJsonFile: (defaultPath?: string) =>
		ipcRenderer.invoke("dialog:saveJsonFile", { defaultPath }),
	shellShowItemInFolder: (absPath: string) =>
		ipcRenderer.invoke("shell:showItemInFolder", { absPath }),
	shellOpenExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", { url }),
	fsExists: (absPath: string) => ipcRenderer.invoke("fs:exists", { absPath }),
	fsIsFile: (absPath: string) => ipcRenderer.invoke("fs:isFile", { absPath }),
	fsFindByBasename: (projectRoot: string, basename: string) =>
		ipcRenderer.invoke("fs:findByBasename", { projectRoot, basename }),
	projectCreate: (rootPath: string, workspaceDirs?: WorkspaceFolder[]) =>
		ipcRenderer.invoke("project:create", { rootPath, workspaceDirs }),
	projectEnsure: (rootPath: string) => ipcRenderer.invoke("project:ensure", { rootPath }),
	projectScaffoldAgentsMd: (rootPath: string) =>
		ipcRenderer.invoke("project:scaffoldAgentsMd", { rootPath }),
	projectCheck: (rootPath: string) => ipcRenderer.invoke("project:check", { rootPath }),

	researchBriefEnsure: (projectRoot: string) =>
		ipcRenderer.invoke("researchBrief:ensure", { projectRoot }),
	researchBriefRead: (projectRoot: string) =>
		ipcRenderer.invoke("researchBrief:read", { projectRoot }),
	researchBriefGetPath: (projectRoot: string) =>
		ipcRenderer.invoke("researchBrief:getPath", { projectRoot }),
	researchBriefUpdateSection: (args: {
		projectRoot: string;
		section: string;
		content: string;
		append?: boolean;
	}) => ipcRenderer.invoke("researchBrief:updateSection", args),

	// Experiments (Sprint 0.7 — Experiments RightArea mode)
	experimentList: (projectRoot: string, includeArchived?: boolean) =>
		ipcRenderer.invoke("experiment:list", { projectRoot, includeArchived }),
	experimentRead: (args: { projectRoot: string; id: string; runsLimit?: number }) =>
		ipcRenderer.invoke("experiment:read", args),
	experimentDetectEnv: (args: { projectRoot: string; id: string }) =>
		ipcRenderer.invoke("experiment:detectEnv", args),
	experimentGetPaths: (args: { projectRoot: string; id: string }) =>
		ipcRenderer.invoke("experiment:getPaths", args),
	experimentArchive: (args: { projectRoot: string; id: string }) =>
		ipcRenderer.invoke("experiment:archive", args),
	experimentRestore: (args: { projectRoot: string; id: string }) =>
		ipcRenderer.invoke("experiment:restore", args),
	experimentDelete: (args: { projectRoot: string; id: string; removeLab?: boolean }) =>
		ipcRenderer.invoke("experiment:delete", args),
	experimentRun: (args: {
		projectRoot: string;
		id: string;
		command: string;
		artifacts?: string[];
		notes?: string;
		kind?: string;
		chatSessionId?: string | null;
	}) => ipcRenderer.invoke("experiment:run", args),
	experimentCancelRun: (args: { projectRoot: string; id: string; runId: string }) =>
		ipcRenderer.invoke("experiment:cancelRun", args),
	onExperimentChanged: (
		callback: (data: {
			projectRoot: string;
			id?: string;
			reason: string;
			focus?: boolean;
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: {
				projectRoot: string;
				id?: string;
				reason: string;
				focus?: boolean;
			},
		) => callback(data);
		ipcRenderer.on("experiment:changed", handler);
		return () => ipcRenderer.removeListener("experiment:changed", handler);
	},
	onExperimentRunComplete: (
		callback: (data: import("../shared/experiment-log").ExperimentRunCompleteEvent) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: import("../shared/experiment-log").ExperimentRunCompleteEvent,
		) => callback(data);
		ipcRenderer.on("experiment:runComplete", handler);
		return () => ipcRenderer.removeListener("experiment:runComplete", handler);
	},
	onExperimentRunOutput: (
		callback: (data: { id: string; runId: string; chunk: string }) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: { id: string; runId: string; chunk: string },
		) => callback(data);
		ipcRenderer.on("experiment:runOutput", handler);
		return () => ipcRenderer.removeListener("experiment:runOutput", handler);
	},

	// Provenance - trace a claimed artifact / run back to its generating command.
	provenanceGetForArtifact: (projectRoot: string, artifactPath: string) =>
		ipcRenderer.invoke("provenance:getForArtifact", { projectRoot, artifactPath }),
	provenanceGetForRun: (projectRoot: string, runId: string) =>
		ipcRenderer.invoke("provenance:getForRun", { projectRoot, runId }),

		// Update checker — manifest is a local path or HTTPS url to version.json.
		updateCheck: () => ipcRenderer.invoke("update:check"),
		updateStatus: () => ipcRenderer.invoke("update:status"),
		updateIgnore: (version: string) => ipcRenderer.invoke("update:ignore", { version }),
		updateUnignore: () => ipcRenderer.invoke("update:unignore"),
		aboutGetVersions: () => ipcRenderer.invoke("about:getVersions"),

	// Window operations
	windowSetTitle: (title: string) =>
		ipcRenderer.invoke("window:setTitle", { title }),
	windowIsMaximized: () => ipcRenderer.invoke("window:isMaximized"),
	windowIsFullscreen: () => ipcRenderer.invoke("window:isFullscreen"),
	windowMinimize: () => ipcRenderer.invoke("window:minimize"),
	windowMaximize: () => ipcRenderer.invoke("window:maximize"),
	windowClose: () => ipcRenderer.invoke("window:close"),

	// Window state events (Main → Renderer)
	onWindowStateChange: (
		callback: (state: {
			isMaximized: boolean;
			isFullscreen: boolean;
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			state: { isMaximized: boolean; isFullscreen: boolean },
		) => callback(state);
		ipcRenderer.on("window:stateChange", handler);
		return () => ipcRenderer.removeListener("window:stateChange", handler);
	},

	onCloseTabRequest: (callback: () => void) => {
		const handler = () => callback();
		ipcRenderer.on("app:closeTab", handler);
		return () => ipcRenderer.removeListener("app:closeTab", handler);
	},

	// Compile operations
	compileExecute: (projectDir: string, mainFile: string, useTexlive?: boolean) =>
		ipcRenderer.invoke("compile:execute", { projectDir, mainFile, useTexlive }),
	compileSynctex: (projectDir: string, page: number, x: number, y: number) =>
		ipcRenderer.invoke("compile:synctex", { projectDir, page, x, y }),
	compileSynctexForward: (projectDir: string, file: string, line: number) =>
		ipcRenderer.invoke("compile:synctexForward", { projectDir, file, line }),
	compileDetectTexlive: () => ipcRenderer.invoke("compile:detectTexlive"),
	onCompileAgentComplete: (
		callback: (data: {
			projectDir: string;
			success: boolean;
			mainFile?: string;
			pdfBytes?: ArrayBuffer;
			error?: string;
			logTail?: string;
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: {
				projectDir: string;
				success: boolean;
				mainFile?: string;
				pdfBytes?: ArrayBuffer;
				error?: string;
				logTail?: string;
			},
		) => callback(data);
		ipcRenderer.on("compile:agentComplete", handler);
		return () => ipcRenderer.removeListener("compile:agentComplete", handler);
	},

	// Literature library
	literatureList: (projectRoot: string) => ipcRenderer.invoke("literature:list", { projectRoot }),
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
		citation: import("../shared/citation-staging").StagedCitationImportInput,
	) => ipcRenderer.invoke("literature:createFromStagedCitation", { projectRoot, citation }),
	onLiteratureStagedAddProgress: (
		callback: (data: import("../shared/citation-staging").StagedAddProgressEvent) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: import("../shared/citation-staging").StagedAddProgressEvent,
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
			discoveredFrom?: "paper-search-mcp" | "websearch" | "webfetch" | "user" | "agent";
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

	extractEnqueue: (
		projectRoot: string,
		paperId: string,
		source: "mineru" | "pdfjs" | "html",
		force?: boolean,
	) => ipcRenderer.invoke("extract:enqueue", { projectRoot, paperId, source, force }),
	extractRetry: (projectRoot: string, paperId: string, source: "mineru" | "pdfjs" | "html") =>
		ipcRenderer.invoke("extract:retry", { projectRoot, paperId, source }),
	extractEnqueueBatch: (
		projectRoot: string,
		paperIds: string[],
		source: "mineru" | "pdfjs" | "html",
		force?: boolean,
	) => ipcRenderer.invoke("extract:enqueueBatch", { projectRoot, paperIds, source, force }),
	extractEnqueueCollection: (
		projectRoot: string,
		collectionId: string,
		source: "mineru" | "pdfjs" | "html",
		force?: boolean,
	) => ipcRenderer.invoke("extract:enqueueCollection", { projectRoot, collectionId, source, force }),
	extractCancel: (projectRoot: string, paperId: string, source: "mineru" | "pdfjs" | "html") =>
		ipcRenderer.invoke("extract:cancel", { projectRoot, paperId, source }),
	extractList: (projectRoot: string, paperIds: string[]) =>
		ipcRenderer.invoke("extract:list", { projectRoot, paperIds }),
	extractGet: (projectRoot: string, paperId: string, source: "mineru" | "pdfjs" | "html") =>
		ipcRenderer.invoke("extract:get", { projectRoot, paperId, source }),
	extractGetBlocks: (
		projectRoot: string,
		paperId: string,
		source?: "mineru" | "pdfjs" | "html",
	) => ipcRenderer.invoke("extract:getBlocks", { projectRoot, paperId, source }),
	extractOpenMd: (projectRoot: string, paperId: string, source: "mineru" | "pdfjs" | "html") =>
		ipcRenderer.invoke("extract:openMd", { projectRoot, paperId, source }),
	extractTestMineru: (token?: string) => ipcRenderer.invoke("extract:testMineru", { token }),
	extractResume: (projectRoot: string) => ipcRenderer.invoke("extract:resume", { projectRoot }),
	onExtractProgress: (
		callback: (data: { projectRoot: string; progress: PaperExtractProgress }) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: { projectRoot: string; progress: PaperExtractProgress },
		) => callback(data);
		ipcRenderer.on("extract:progress", handler);
		return () => ipcRenderer.removeListener("extract:progress", handler);
	},
	onExtractProgressClear: (
		callback: (data: {
			projectRoot: string;
			paperId: string;
			source: "mineru" | "pdfjs" | "html";
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: { projectRoot: string; paperId: string; source: "mineru" | "pdfjs" | "html" },
		) => callback(data);
		ipcRenderer.on("extract:progressClear", handler);
		return () => ipcRenderer.removeListener("extract:progressClear", handler);
	},
	onExtractPdfCached: (
		callback: (data: { projectRoot: string; paperId: string }) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: { projectRoot: string; paperId: string },
		) => callback(data);
		ipcRenderer.on("extract:pdfCached", handler);
		return () => ipcRenderer.removeListener("extract:pdfCached", handler);
	},
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
	onExtractStatusChanged: (
		callback: (data: { projectRoot: string; state: PaperExtractState }) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: { projectRoot: string; state: PaperExtractState },
		) => callback(data);
		ipcRenderer.on("extract:statusChanged", handler);
		return () => ipcRenderer.removeListener("extract:statusChanged", handler);
	},
	onExtractAgentRequested: (
		callback: (data: {
			projectRoot: string;
			paperId: string;
			bibkey: string;
			title: string;
			source: "mineru" | "pdfjs" | "html";
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: {
				projectRoot: string;
				paperId: string;
				bibkey: string;
				title: string;
				source: "mineru" | "pdfjs" | "html";
			},
		) => callback(data);
		ipcRenderer.on("extract:agentRequested", handler);
		return () => ipcRenderer.removeListener("extract:agentRequested", handler);
	},

	zoteroProbe: () => ipcRenderer.invoke("zotero:probe"),
	zoteroStatus: () => ipcRenderer.invoke("zotero:status"),
	zoteroListCollections: () => ipcRenderer.invoke("zotero:listCollections"),
	zoteroGetProjectBinding: (projectRoot: string) =>
		ipcRenderer.invoke("zotero:getProjectBinding", { projectRoot }),
	zoteroSetProjectBinding: (
		projectRoot: string,
		collectionId: string | null,
		collectionName?: string | null,
	) =>
		ipcRenderer.invoke("zotero:setProjectBinding", {
			projectRoot,
			collectionId,
			collectionName,
		}),
	zoteroPullCollections: (projectRoot: string) =>
		ipcRenderer.invoke("zotero:pullCollections", { projectRoot }),
	zoteroPullCollection: (projectRoot: string) =>
		ipcRenderer.invoke("zotero:pullCollection", { projectRoot }),
	zoteroGetLastSync: (projectRoot: string) =>
		ipcRenderer.invoke("zotero:getLastSync", { projectRoot }),

	// Bibliographic catalog (global — not library UI only)
	bibliographyResolve: (opts: { doi?: string; arxivId?: string }) =>
		ipcRenderer.invoke("bibliography:resolve", opts),

	// OpenCode agent operations
	chatDispose: () => ipcRenderer.invoke("chat:dispose"),
	chatPrewarm: (projectPath: string) => ipcRenderer.invoke("chat:prewarm", { projectPath }),
	mcpEnsure: (projectPath: string) =>
		ipcRenderer.invoke("mcp:ensure", { projectPath }) as Promise<{
			ok: boolean;
			health: {
				status: "ready" | "degraded";
				mode: "npx";
				detail: string;
			};
		}>,
	mcpApply: (projectPath: string) =>
		ipcRenderer.invoke("mcp:apply", { projectPath }) as Promise<{
			ok: boolean;
			reloadedSessions: number;
			error?: string;
			health?: {
				status: "ready" | "degraded";
				mode: "npx";
				detail: string;
			};
		}>,
	mcpPaperSearchHealth: () =>
		ipcRenderer.invoke("mcp:paperSearchHealth") as Promise<{
			status: "ready" | "degraded";
			mode: "npx";
			detail: string;
		}>,
	agentListSkills: (projectPath: string) => ipcRenderer.invoke("agent:listSkills", { projectPath }),
	agentListRules: (projectPath: string) => ipcRenderer.invoke("agent:listRules", { projectPath }),
	agentInstallRule: (projectPath: string, ruleId: string, content: string) =>
		ipcRenderer.invoke("agent:installRule", { projectPath, ruleId, content }),
	agentDeleteRule: (projectPath: string, ruleId: string) =>
		ipcRenderer.invoke("agent:deleteRule", { projectPath, ruleId }),
	agentSetRuleEnabled: (projectPath: string, ruleId: string, enabled: boolean) =>
		ipcRenderer.invoke("agent:setRuleEnabled", { projectPath, ruleId, enabled }),
	agentListSkillRegistries: (projectPath: string) =>
		ipcRenderer.invoke("agent:listSkillRegistries", { projectPath }),
	agentListSkillLibrarySources: (projectPath: string) =>
		ipcRenderer.invoke("agent:listSkillLibrarySources", { projectPath }),
	agentAddSkillLibrarySource: (projectPath: string, registryUrl: string) =>
		ipcRenderer.invoke("agent:addSkillLibrarySource", { projectPath, registryUrl }),
	agentFetchSkillLibraryCatalog: (projectPath: string, sourceId: string) =>
		ipcRenderer.invoke("agent:fetchSkillLibraryCatalog", { projectPath, sourceId }),
	agentInstallLibraryCatalogItem: (
		projectPath: string,
		item: import("../shared/skill-library-types").LibraryCatalogItem,
	) => ipcRenderer.invoke("agent:installLibraryCatalogItem", { projectPath, item }),
	agentInstallAllFromLibrarySource: (projectPath: string, sourceId: string) =>
		ipcRenderer.invoke("agent:installAllFromLibrarySource", { projectPath, sourceId }),
	agentRemoveSkillLibrarySource: (projectPath: string, sourceId: string) =>
		ipcRenderer.invoke("agent:removeSkillLibrarySource", { projectPath, sourceId }),
	agentSetSkillLibrarySourceConnected: (projectPath: string, sourceId: string, connected: boolean) =>
		ipcRenderer.invoke("agent:setSkillLibrarySourceConnected", { projectPath, sourceId, connected }),
	agentListBundledSkills: () => ipcRenderer.invoke("agent:listBundledSkills"),
	agentInstallBundledSkill: (projectPath: string, skillId: string) =>
		ipcRenderer.invoke("agent:installBundledSkill", { projectPath, skillId }),
	agentSyncSkills: (projectPath: string) => ipcRenderer.invoke("agent:syncSkills", { projectPath }),
	agentFetchSkillRegistry: (registryUrl: string) =>
		ipcRenderer.invoke("agent:fetchSkillRegistry", { registryUrl }),
	agentConnectSkillRegistry: (projectPath: string, registryUrl: string) =>
		ipcRenderer.invoke("agent:connectSkillRegistry", { projectPath, registryUrl }),
	agentDisconnectSkillRegistry: (projectPath: string, registryUrl: string) =>
		ipcRenderer.invoke("agent:disconnectSkillRegistry", { projectPath, registryUrl }),
	agentSetSkillEnabled: (projectPath: string, skillId: string, enabled: boolean) =>
		ipcRenderer.invoke("agent:setSkillEnabled", { projectPath, skillId, enabled }),
	agentInstallSkill: (projectPath: string, skillId: string, content: string) =>
		ipcRenderer.invoke("agent:installSkill", { projectPath, skillId, content }),
	agentInstallSkillFromRegistry: (
		projectPath: string,
		skillName: string,
		artifactUrl: string,
		options?: {
			artifactType?: "skill-md" | "archive" | "unknown";
			files?: string[];
			indexUrl: string;
		},
	) =>
		ipcRenderer.invoke("agent:installSkillFromRegistry", {
			projectPath,
			skillName,
			artifactUrl,
			artifactType: options?.artifactType,
			files: options?.files,
			indexUrl: options?.indexUrl ?? "",
		}),
	agentAnalyzeSkillSource: (input: string) =>
		ipcRenderer.invoke("agent:analyzeSkillSource", { input }),
	agentInstallSkillPackages: (
		projectPath: string,
		selection: {
			cacheKey: string;
			packageIds: string[];
			includeShared: boolean;
			origin:
				| { adapter: "github"; repo: string; ref: string; path: string }
				| { adapter: "discovery"; indexUrl: string };
		},
	) => ipcRenderer.invoke("agent:installSkillPackages", { projectPath, selection }),
	agentReinstallSkill: (projectPath: string, skillId: string) =>
		ipcRenderer.invoke("agent:reinstallSkill", { projectPath, skillId }),
	agentCheckSkillUpdates: (projectPath: string) =>
		ipcRenderer.invoke("agent:checkSkillUpdates", { projectPath }),
	agentDeleteSkill: (projectPath: string, skillId: string) =>
		ipcRenderer.invoke("agent:deleteSkill", { projectPath, skillId }),
	expertsList: (projectPath: string) =>
		ipcRenderer.invoke("experts:list", { projectPath }),
	orchestratorsList: (projectPath: string) =>
		ipcRenderer.invoke("orchestrators:list", { projectPath }),
	expertsGetManifest: (projectPath: string) =>
		ipcRenderer.invoke("experts:getManifest", { projectPath }),
	orchestratorsGetManifest: (projectPath: string) =>
		ipcRenderer.invoke("orchestrators:getManifest", { projectPath }),
	expertsGetDetail: (projectPath: string, expertId: string) =>
		ipcRenderer.invoke("experts:getDetail", { projectPath, expertId }),
	expertsSetBuiltinEnabled: (projectPath: string, expertId: string, enabled: boolean) =>
		ipcRenderer.invoke("experts:setBuiltinEnabled", { projectPath, expertId, enabled }),
	expertsSaveCustom: (
		projectPath: string,
		payload: import("@shared/agent-experts").SaveCustomExpertPayload,
	) => ipcRenderer.invoke("experts:saveCustom", { projectPath, payload }),
	expertsSaveBuiltinOverride: (
		projectPath: string,
		payload: import("@shared/agent-experts").SaveBuiltinExpertOverridePayload,
	) => ipcRenderer.invoke("experts:saveBuiltinOverride", { projectPath, payload }),
	expertsDeleteCustom: (projectPath: string, expertId: string) =>
		ipcRenderer.invoke("experts:deleteCustom", { projectPath, expertId }),
	orchestratorsSetDefault: (projectPath: string, orchestratorId: string) =>
		ipcRenderer.invoke("orchestrators:setDefault", { projectPath, orchestratorId }),
	orchestratorsSaveBuiltinOverride: (
		projectPath: string,
		payload: import("@shared/agent-experts").SaveBuiltinOrchestratorOverridePayload,
	) => ipcRenderer.invoke("orchestrators:saveBuiltinOverride", { projectPath, payload }),
	orchestratorsResetBuiltinOverride: (projectPath: string, orchestratorId: string) =>
		ipcRenderer.invoke("orchestrators:resetBuiltinOverride", { projectPath, orchestratorId }),
	orchestratorsGetDetail: (projectPath: string, orchestratorId: string) =>
		ipcRenderer.invoke("orchestrators:getDetail", { projectPath, orchestratorId }),
	orchestratorsSaveCustom: (
		projectPath: string,
		payload: import("@shared/agent-experts").SaveCustomOrchestratorPayload,
	) => ipcRenderer.invoke("orchestrators:saveCustom", { projectPath, payload }),
	orchestratorsDeleteCustom: (projectPath: string, orchestratorId: string) =>
		ipcRenderer.invoke("orchestrators:deleteCustom", { projectPath, orchestratorId }),
	expertsGetEditorOptions: (projectPath: string) =>
		ipcRenderer.invoke("experts:getEditorOptions", { projectPath }),
	expertsResetBuiltinOverride: (projectPath: string, expertId: string) =>
		ipcRenderer.invoke("experts:resetBuiltinOverride", { projectPath, expertId }),
	expertsResetBuiltinsToDefaults: (projectPath: string) =>
		ipcRenderer.invoke("experts:resetBuiltinsToDefaults", { projectPath }),
	chatSend: (args: {
		projectPath: string;
		worktreePath?: string;
		prompt: string;
		tabId?: string;
		sessionId?: string | null;
		apiKey?: string;
		baseUrl?: string;
		model?: string;
		provider?: string;
		thoughtLevel?: string;
		mcpServerAllowlist?: string[];
		skillIds?: string[];
		userDisplayContent?: Record<string, unknown>[];
		intensivePaperIds?: string[];
		hasPaperSnippets?: boolean;
		orchestratorId?: string | null;
		selectedExpertIds?: string[];
	}) =>
		ipcRenderer.invoke("chat:send", args),
	chatCancel: (sessionId: string) =>
		ipcRenderer.invoke("chat:cancel", { sessionId }),
	chatRegisterTab: (args: { tabId: string; sessionId: string; projectPath?: string }) =>
		ipcRenderer.invoke("chat:registerTab", args),
	chatSyncIntensiveReading: (args: {
		sessionId: string;
		projectRoot: string;
		paperIds?: string[];
	}) => ipcRenderer.invoke("chat:syncIntensiveReading", args),
	chatCompact: (sessionId: string, projectPath: string) =>
		ipcRenderer.invoke("chat:compact", { sessionId, projectPath }),
	chatAnswer: (sessionId: string, answer: string) =>
		ipcRenderer.invoke("chat:answer", { sessionId, answer }),
		chatAnswerQuestion: (questionId: string, answer: string) =>
			ipcRenderer.invoke("chat:answerQuestion", { questionId, answer }),
		chatAnswerPermission: (
			permissionId: string,
			approved: boolean,
			toolCallId?: string,
			opts?: { always?: boolean },
		) =>
			ipcRenderer.invoke("chat:answerPermission", {
				permissionId,
				approved,
				toolCallId,
				always: opts?.always,
			}),
	chatStatus: () => ipcRenderer.invoke("chat:status"),
	sessionList: (projectPath?: string) => ipcRenderer.invoke("session:list", { projectPath }),
	sessionLoad: (sessionId: string, projectPath?: string, cwd?: string) =>
		ipcRenderer.invoke("session:load", { sessionId, projectPath, cwd }),
	sessionLoadWindow: (sessionId: string, projectPath: string | undefined, cwd: string | undefined, offset: number, limit: number) =>
		ipcRenderer.invoke("session:loadWindow", { sessionId, projectPath, cwd, offset, limit }),
	sessionGetDirectory: (sessionId: string) =>
		ipcRenderer.invoke("session:getDirectory", { sessionId }),
	sessionReassignDirectory: (fromDirectory: string, toDirectory: string) =>
		ipcRenderer.invoke("session:reassignDirectory", { fromDirectory, toDirectory }),
	sessionDelete: (sessionId: string, projectPath?: string) =>
		ipcRenderer.invoke("session:delete", { sessionId, projectPath }),
	sessionTruncateToTurn: (args: {
		sessionId: string;
		projectPath: string;
		worktreePath?: string;
		turnIndex: number;
	}) => ipcRenderer.invoke("session:truncateToTurn", args),
	sessionUndoTruncate: (args: {
		sessionId: string;
		projectPath: string;
		worktreePath?: string;
	}) => ipcRenderer.invoke("session:undoTruncate", args),
	sessionGetContext: (projectPath: string, sessionId: string) =>
		ipcRenderer.invoke("session:getContext", { projectPath, sessionId }),
	sessionGetUserDisplays: (projectPath: string, sessionId: string) =>
		ipcRenderer.invoke("session:getUserDisplays", { projectPath, sessionId }),
	sessionAppendUserDisplay: (
		projectPath: string,
		sessionId: string,
		content: Record<string, unknown>[],
	) => ipcRenderer.invoke("session:appendUserDisplay", { projectPath, sessionId, content }),
	chatGetProviders: () => ipcRenderer.invoke("chat:getProviders"),
	chatSetAuth: (provider: string, credentials: Record<string, string>) =>
		ipcRenderer.invoke("chat:setAuth", { provider, credentials }),
	chatTestConnection: (args: { provider: string; apiKey: string; baseUrl?: string }) =>
		ipcRenderer.invoke("chat:testConnection", args),

	// Settings operations
	settingsGet: () => ipcRenderer.invoke("settings:get"),
	settingsSet: (patch: Record<string, unknown>) =>
		ipcRenderer.invoke("settings:set", patch),
	settingsGetAgentProjectConfig: (projectPath: string) =>
		ipcRenderer.invoke("settings:getAgentProjectConfig", { projectPath }),
	settingsSetAgentProjectConfig: (projectPath: string, config: any) =>
		ipcRenderer.invoke("settings:setAgentProjectConfig", { projectPath, config }),
	settingsGetAssembledPrompt: (projectRoot?: string, userCustomPrompt?: string) =>
		ipcRenderer.invoke("settings:getAssembledPrompt", { projectRoot, userCustomPrompt }),
	settingsGetPromptStackPreview: (
		projectRoot?: string,
		userCustomPrompt?: string,
		orchestratorId?: string | null,
	) =>
		ipcRenderer.invoke("settings:getPromptStackPreview", {
			projectRoot,
			userCustomPrompt,
			orchestratorId,
		}),
	settingsComputePromptFingerprint: (projectRoot?: string) =>
		ipcRenderer.invoke("settings:computePromptFingerprint", { projectRoot }),
	settingsGetDefaultPersona: () =>
		ipcRenderer.invoke("settings:getDefaultPersona"),
	settingsGetKnowledgeModules: (projectRoot?: string) =>
		ipcRenderer.invoke("settings:getKnowledgeModules", { projectRoot }),
	settingsGetModules: (projectRoot?: string) =>
		ipcRenderer.invoke("settings:getModules", { projectRoot }),
	settingsGetBuiltinTools: () =>
		ipcRenderer.invoke("settings:getBuiltinTools"),
	settingsGetLayers: () =>
		ipcRenderer.invoke("settings:getLayers"),
	settingsSetLayer: (id: string, enabled: boolean) =>
		ipcRenderer.invoke("settings:setLayer", { id, enabled }),

	// Commands operations
	commandsList: (projectRoot?: string | null) =>
		ipcRenderer.invoke("commands:list", { projectRoot }),
	commandsExpand: (name: string, rawInput: string, projectRoot: string) =>
		ipcRenderer.invoke("commands:expand", { name, rawInput, projectRoot }),
	commandsCreate: (
		projectRoot: string,
		payload: import("../main/commands/types").CreateCommandPayload,
	) => ipcRenderer.invoke("commands:create", { projectRoot, payload }),
	commandsUpdate: (
		projectRoot: string,
		id: string,
		payload: import("../main/commands/types").UpdateCommandPayload,
	) => ipcRenderer.invoke("commands:update", { projectRoot, id, payload }),
	commandsDelete: (projectRoot: string, id: string) =>
		ipcRenderer.invoke("commands:delete", { projectRoot, id }),
	commandsToggle: (id: string, enabled: boolean) =>
		ipcRenderer.invoke("commands:toggle", { id, enabled }),
	commandsReload: (projectRoot?: string | null) =>
		ipcRenderer.invoke("commands:reload", { projectRoot }),
	commandsPreviewImport: (projectRoot: string, pack: unknown) =>
		ipcRenderer.invoke("commands:previewImport", { projectRoot, pack }),
	commandsImportPack: (
		projectRoot: string,
		pack: unknown,
		strategy: "skip" | "replace" | "rename",
	) => ipcRenderer.invoke("commands:importPack", { projectRoot, pack, strategy }),
	commandsWriteExportFile: (filePath: string, projectRoot: string) =>
		ipcRenderer.invoke("commands:writeExportFile", { filePath, projectRoot }),
	commandsReadImportFile: (filePath: string) =>
		ipcRenderer.invoke("commands:readImportFile", { filePath }),

	// Workspace operations
	workspaceGetConfig: (projectRoot: string) =>
		ipcRenderer.invoke("workspace:getConfig", { projectRoot }),
	workspaceUpdateConfig: (projectRoot: string, dirs: WorkspaceFolder[]) =>
		ipcRenderer.invoke("workspace:updateConfig", { projectRoot, dirs }),
	workspaceCreateFolders: (projectRoot: string, dirs?: WorkspaceFolder[]) =>
		ipcRenderer.invoke("workspace:createFolders", { projectRoot, dirs }),
	workspaceEnsureMainTex: (projectRoot: string) =>
		ipcRenderer.invoke("workspace:ensureMainTex", { projectRoot }) as Promise<{ created: boolean; relativePath?: string }>,

	// Browser operations
	browserInit: (projectRoot: string) => ipcRenderer.invoke("browser:init", { projectRoot }),
	browserSaveBookmarks: (projectRoot: string, bookmarks: unknown[]) =>
		ipcRenderer.invoke("browser:saveBookmarks", { projectRoot, bookmarks }),
	browserSaveRecent: (projectRoot: string, recent: unknown[]) =>
		ipcRenderer.invoke("browser:saveRecent", { projectRoot, recent }),
	browserClearCookies: () => ipcRenderer.invoke("browser:clearCookies"),
	browserClearCache: () => ipcRenderer.invoke("browser:clearCache"),

	// Terminal operations
	terminalCreate: (args: {
		sessionId: string;
		tabId: string;
		projectRoot: string;
		cwd: string;
	}) => ipcRenderer.invoke("terminal:create", args),
	terminalDestroy: (args: { sessionId: string }) =>
		ipcRenderer.invoke("terminal:destroy", args),
	terminalDestroyTab: (args: { tabId: string }) =>
		ipcRenderer.invoke("terminal:destroyTab", args),
	terminalDestroyTabs: (args: { tabIds: string[] }) =>
		ipcRenderer.invoke("terminal:destroyTabs", args),
	terminalWrite: (args: { sessionId: string; data: string }) =>
		ipcRenderer.invoke("terminal:write", args),
	terminalResize: (args: { sessionId: string; cols: number; rows: number }) =>
		ipcRenderer.invoke("terminal:resize", args),
	terminalEnvInfo: () => ipcRenderer.invoke("terminal:envInfo"),
	terminalLoadConfig: (projectRoot: string) =>
		ipcRenderer.invoke("terminal:loadConfig", { projectRoot }),
	terminalSaveConfig: (projectRoot: string, config: unknown) =>
		ipcRenderer.invoke("terminal:saveConfig", { projectRoot, config }),
	terminalRunAiBash: (args: {
		sessionId: string;
		chatTabId: string;
		toolCallId: string;
		command: string;
		cwd?: string;
	}) => ipcRenderer.invoke("terminal:runAiBash", args),
	terminalRegisterBashJob: (args: {
		sessionId: string;
		toolCallId: string;
		command: string;
	}) => ipcRenderer.invoke("terminal:registerBashJob", args),
	terminalDestroyAllAiPty: () => ipcRenderer.invoke("terminal:destroyAllAiPty"),

	// Terminal events (Main → Renderer)
	onTerminalData: (callback: (data: { sessionId: string; tabId: string; data: string }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; tabId: string; data: string }) => callback(data);
		ipcRenderer.on("terminal:data", handler);
		return () => ipcRenderer.removeListener("terminal:data", handler);
	},
	onTerminalExit: (callback: (data: { sessionId: string; tabId: string; exitCode: number }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; tabId: string; exitCode: number }) => callback(data);
		ipcRenderer.on("terminal:exit", handler);
		return () => ipcRenderer.removeListener("terminal:exit", handler);
	},
	onTerminalAiStream: (
		callback: (data: {
			sessionId: string;
			chatTabId: string;
			requestId: string;
			toolCallId?: string;
			chunk: string;
			phase: "output";
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: {
				sessionId: string;
				chatTabId: string;
				requestId: string;
				toolCallId?: string;
				chunk: string;
				phase: "output";
			},
		) => callback(data);
		ipcRenderer.on("terminal:aiStream", handler);
		return () => ipcRenderer.removeListener("terminal:aiStream", handler);
	},
	onTerminalAiExit: (
		callback: (data: {
			sessionId: string;
			chatTabId: string;
			requestId: string;
			toolCallId?: string;
			exitCode: number;
			cwd: string;
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: {
				sessionId: string;
				chatTabId: string;
				requestId: string;
				toolCallId?: string;
				exitCode: number;
				cwd: string;
			},
		) => callback(data);
		ipcRenderer.on("terminal:aiExit", handler);
		return () => ipcRenderer.removeListener("terminal:aiExit", handler);
	},

	// Git operations
	gitWarmup: (projectRoot: string) =>
		ipcRenderer.invoke("git:warmup", { projectRoot }),
	gitIsRepo: (projectRoot: string) =>
		ipcRenderer.invoke("git:isRepo", { projectRoot }),
	gitStatus: (projectRoot: string) =>
		ipcRenderer.invoke("git:status", { projectRoot }),
	gitBranches: (projectRoot: string) =>
		ipcRenderer.invoke("git:branches", { projectRoot }),
	gitCheckout: (projectRoot: string, branch: string) =>
		ipcRenderer.invoke("git:checkout", { projectRoot, branch }),
	gitCreateBranch: (projectRoot: string, branchName: string) =>
		ipcRenderer.invoke("git:createBranch", { projectRoot, branchName }),
	gitDiff: (projectRoot: string, filePath: string, indexStatus: string, worktreeStatus: string, staged: boolean, unstaged: boolean, untracked: boolean, view?: "staged" | "unstaged" | "all") =>
		ipcRenderer.invoke("git:diff", { projectRoot, filePath, indexStatus, worktreeStatus, staged, unstaged, untracked, view }),
	gitStage: (projectRoot: string, filePath: string) =>
		ipcRenderer.invoke("git:stage", { projectRoot, filePath }),
	gitUnstage: (projectRoot: string, filePath: string) =>
		ipcRenderer.invoke("git:unstage", { projectRoot, filePath }),
	gitStageAll: (projectRoot: string, filePaths: string[]) =>
		ipcRenderer.invoke("git:stageAll", { projectRoot, filePaths }),
	gitUnstageAll: (projectRoot: string, filePaths: string[]) =>
		ipcRenderer.invoke("git:unstageAll", { projectRoot, filePaths }),
	gitInit: (projectRoot: string) =>
		ipcRenderer.invoke("git:init", { projectRoot }),
	gitDiscard: (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) =>
		ipcRenderer.invoke("git:discard", { projectRoot, filePath, staged, untracked, worktreeStatus }),
	gitCommit: (projectRoot: string, message: string) =>
		ipcRenderer.invoke("git:commit", { projectRoot, message }),
	gitCommitAll: (projectRoot: string, filePaths: string[], message: string) =>
		ipcRenderer.invoke("git:commitAll", { projectRoot, filePaths, message }),
	gitDeleteBranch:(projectRoot: string, branch: string) =>
		ipcRenderer.invoke("git:deleteBranch", { projectRoot, branch }),
	gitRevert: (projectRoot: string, hash: string) =>
		ipcRenderer.invoke("git:revert", { projectRoot, hash }),
	gitReset: (projectRoot: string, hash: string, mode: "soft" | "mixed" | "hard") =>
		ipcRenderer.invoke("git:reset", { projectRoot, hash, mode }),
	gitDiffStats: (projectRoot: string) =>
		ipcRenderer.invoke("git:diffStats", { projectRoot }),
	gitLog: (projectRoot: string, maxCount?: number) =>
		ipcRenderer.invoke("git:log", { projectRoot, maxCount }),
	gitPush: (projectRoot: string) =>
		ipcRenderer.invoke("git:push", { projectRoot }),
	gitMerge: (projectRoot: string, sourceBranch: string) =>
		ipcRenderer.invoke("git:merge", { projectRoot, sourceBranch }),
	gitMergeNoCommit: (projectRoot: string, sourceBranch: string) =>
		ipcRenderer.invoke("git:mergeNoCommit", { projectRoot, sourceBranch }),
	gitAbortMerge: (projectRoot: string) =>
		ipcRenderer.invoke("git:abortMerge", { projectRoot }),
	gitStash: (projectRoot: string, message?: string) =>
		ipcRenderer.invoke("git:stash", { projectRoot, message }),
	gitStashPop: (projectRoot: string) =>
		ipcRenderer.invoke("git:stashPop", { projectRoot }),
	gitCommitDiff: (projectRoot: string, hash: string) =>
		ipcRenderer.invoke("git:commitDiff", { projectRoot, hash }),
	gitCommitFiles: (projectRoot: string, hash: string) =>
		ipcRenderer.invoke("git:commitFiles", { projectRoot, hash }),
	gitCommitFileDiff: (projectRoot: string, hash: string, filePath: string) =>
		ipcRenderer.invoke("git:commitFileDiff", { projectRoot, hash, filePath }),

	// Worktree operations
	worktreeList: (projectRoot: string) =>
		ipcRenderer.invoke("worktree:list", { projectRoot }),
	worktreeCreate: (projectRoot: string, name?: string, baseBranch?: string) =>
		ipcRenderer.invoke("worktree:create", { projectRoot, name, baseBranch }),
	worktreeBranches: (projectRoot: string) =>
		ipcRenderer.invoke("worktree:branches", { projectRoot }),
	worktreeRemove: (projectRoot: string, name: string) =>
		ipcRenderer.invoke("worktree:remove", { projectRoot, name }),
	worktreeMergeStatus: (projectRoot: string, name: string) =>
		ipcRenderer.invoke("worktree:mergeStatus", { projectRoot, name }),
	worktreeMoveSessions: (projectRoot: string, worktreeName: string) =>
		ipcRenderer.invoke("worktree:moveSessions", { projectRoot, worktreeName }),

	// Chat events (Main → Renderer)
	onChatStream: (callback: (data: { tabId: string; type: string; data: any }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; type: string; data: any }) => callback(data);
		ipcRenderer.on("chat:stream", handler);
		return () => ipcRenderer.removeListener("chat:stream", handler);
	},
	onChatComplete: (callback: (data: { tabId: string; sessionId: string; success: boolean; error?: string; tokenUsage?: any }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
		ipcRenderer.on("chat:complete", handler);
		return () => ipcRenderer.removeListener("chat:complete", handler);
	},
	onChatPermission: (callback: (data: { tabId: string; permissionId: string; message: string; options: any; toolCallId?: string; toolName?: string; raw?: any }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
		ipcRenderer.on("chat:permission", handler);
		return () => ipcRenderer.removeListener("chat:permission", handler);
	},
	onChatSessionCreated: (callback: (data: { tabId: string; sessionId: string }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
		ipcRenderer.on("chat:sessionCreated", handler);
		return () => ipcRenderer.removeListener("chat:sessionCreated", handler);
	},
	removeChatListeners: () => {
		ipcRenderer.removeAllListeners("chat:stream");
		ipcRenderer.removeAllListeners("chat:complete");
		ipcRenderer.removeAllListeners("chat:permission");
		ipcRenderer.removeAllListeners("chat:sessionCreated");
	},

	// File watcher events (Main → Renderer)
	onFileChanged: (callback: (data: { projectRoot: string; changedPaths?: string[] }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { projectRoot: string; changedPaths?: string[] }) => callback(data);
		ipcRenderer.on("fs:fileChanged", handler);
		return () => ipcRenderer.removeListener("fs:fileChanged", handler);
	},
	onSkillsIntegrationChanged: (callback: (data: { projectPath: string }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { projectPath: string }) => callback(data);
		ipcRenderer.on("skills:integrationChanged", handler);
		return () => ipcRenderer.removeListener("skills:integrationChanged", handler);
	},

	// Log system
	logFetch: (params: unknown) => ipcRenderer.invoke("log:fetch", params),

	// Theme — glass vibrancy synchronization
	themeSetGlassMode: (mode: "light" | "dark" | "system") =>
		ipcRenderer.invoke("theme:setGlassMode", mode),
});
