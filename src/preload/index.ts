import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { WorkspaceFolder } from "../renderer/types/workspace";
import type { PaperExtractState, PaperExtractProgress } from "../shared/paper-extract";
import type { IconSpec } from "../shared/icon-spec";
import type {
	ExecutionApplyProjectSwitchArgs,
	ExecutionApplyProjectSwitchResult,
	ExecutionCancelResult,
	ExecutionFindByToolCallIdResult,
	ExecutionGetResult,
	ExecutionListRunningResult,
	ExecutionReplayArgs,
	ExecutionReplayResult,
	ExecutionRerunResult,
	TerminalExecutionEvent,
} from "../shared/execution";
import type { AgentEvent } from "../shared/agent-runtime";

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
	fsStat: (absPath: string) =>
		ipcRenderer.invoke("fs:stat", { absPath }),
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
	fsWatchStart: () => ipcRenderer.invoke("fs:watch-start"),
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
	shellDesktopNotify: (args: {
		kind: "turn_complete" | "action_required";
		title: string;
		body: string;
		tabId?: string;
	}) => ipcRenderer.invoke("shell:desktopNotify", args),
	shellSetTrayStatus: (
		status: "idle" | "busy" | "attention",
		tooltip?: string | null,
		runningCount?: number,
	) => ipcRenderer.invoke("shell:setTrayStatus", { status, tooltip, runningCount }),
	shellSetTrayMenu: (snapshot: {
		showLabel: string;
		newChatLabel: string;
		quitLabel: string;
		recent: Array<{
			id: string;
			title: string;
			sessionId?: string;
			tabId?: string;
		}>;
		projectName?: string | null;
		modes?: Array<{
			id: "texworkspace" | "literature" | "experiments";
			label: string;
		}>;
	}) => ipcRenderer.invoke("shell:setTrayMenu", snapshot),
	onShellFocusChatTab: (callback: (args: { tabId: string }) => void) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			args: { tabId: string },
		) => callback(args);
		ipcRenderer.on("shell:focusChatTab", handler);
		return () => ipcRenderer.removeListener("shell:focusChatTab", handler);
	},
	onShellTrayNewChat: (callback: () => void) => {
		const handler = () => callback();
		ipcRenderer.on("shell:trayNewChat", handler);
		return () => ipcRenderer.removeListener("shell:trayNewChat", handler);
	},
	onShellTrayOpenRecent: (
		callback: (args: { id: string; sessionId?: string; tabId?: string }) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			args: { id: string; sessionId?: string; tabId?: string },
		) => callback(args);
		ipcRenderer.on("shell:trayOpenRecent", handler);
		return () => ipcRenderer.removeListener("shell:trayOpenRecent", handler);
	},
	onShellTrayOpenMode: (
		callback: (args: {
			modeId: "texworkspace" | "literature" | "experiments";
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			args: { modeId: "texworkspace" | "literature" | "experiments" },
		) => callback(args);
		ipcRenderer.on("shell:trayOpenMode", handler);
		return () => ipcRenderer.removeListener("shell:trayOpenMode", handler);
	},
	fsExists: (absPath: string) => ipcRenderer.invoke("fs:exists", { absPath }),
	fsIsFile: (absPath: string) => ipcRenderer.invoke("fs:isFile", { absPath }),
	fsFindByBasename: (projectRoot: string, basename: string) =>
		ipcRenderer.invoke("fs:findByBasename", { projectRoot, basename }),
	projectCreate: (
		rootPath: string,
		workspaceDirs?: WorkspaceFolder[],
		options?: {
			initGit?: boolean;
			projectIcon?: IconSpec | string | null;
			projectIconImagePngBase64?: string;
		},
	) =>
		ipcRenderer.invoke("project:create", {
			rootPath,
			workspaceDirs,
			initGit: options?.initGit,
			projectIcon: options?.projectIcon,
			projectIconImagePngBase64: options?.projectIconImagePngBase64,
		}),
	projectSetIcon: (rootPath: string, icon: IconSpec | null) =>
		ipcRenderer.invoke("project:setIcon", { rootPath, icon }),
	projectSetIconImage: (rootPath: string, pngBase64: string) =>
		ipcRenderer.invoke("project:setIconImage", { rootPath, pngBase64 }),
	projectOpen: (rootPath: string) => ipcRenderer.invoke("project:open", { rootPath }),
	projectActivate: (rootPath: string) => ipcRenderer.invoke("project:activate", { rootPath }),
	projectClose: () => ipcRenderer.invoke("project:close"),
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

	researchPlanWrite: (args: {
		projectRoot: string;
		doc: import("../shared/research-plan").ResearchPlanDoc;
	}) => ipcRenderer.invoke("researchPlan:write", args),
	researchPlanReadDraft: (args: { projectRoot: string; sessionId?: string }) =>
		ipcRenderer.invoke("researchPlan:readDraft", args),
	researchPlanClaimDraft: (args: { projectRoot: string; sessionId: string }) =>
		ipcRenderer.invoke("researchPlan:claimDraft", args),
	researchPlanHasPendingDraft: (args: { projectRoot: string; sessionId: string }) =>
		ipcRenderer.invoke("researchPlan:hasPendingDraft", args),
	researchPlanPromoteDraft: (args: {
		projectRoot: string;
		sessionId?: string;
		/** @deprecated Ignored — promote always renames draft to approved. */
		status?: "approved" | "snapshot";
	}) => ipcRenderer.invoke("researchPlan:promoteDraft", args),
	researchPlanDiscardDraft: (args: { projectRoot: string; sessionId?: string }) =>
		ipcRenderer.invoke("researchPlan:discardDraft", args),

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
	experimentCreate: (args: {
		projectRoot: string;
		title: string;
		tags?: string[];
		description?: string;
		briefLinks?: {
			sections?: string[];
			hypothesisExcerpt?: string;
			researchQuestionExcerpt?: string;
		};
	}) => ipcRenderer.invoke("experiment:create", args),
	experimentUpdate: (args: {
		projectRoot: string;
		id: string;
		title?: string;
		tags?: string[];
		description?: string;
		briefLinks?: {
			sections?: string[];
			hypothesisExcerpt?: string;
			researchQuestionExcerpt?: string;
		} | null;
	}) => ipcRenderer.invoke("experiment:update", args),
	experimentUpdateRun: (args: {
		projectRoot: string;
		id: string;
		runId: string;
		notes: string;
	}) => ipcRenderer.invoke("experiment:updateRun", args),
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
	experimentSnapshot: (args: {
		projectRoot: string;
		id: string;
		scanDirs?: string[];
		metricsFiles?: string[];
		maxFiles?: number;
		maxDepth?: number;
	}) => ipcRenderer.invoke("experiment:snapshot", args),
	interactionGet: (projectRoot: string, id: string) =>
		ipcRenderer.invoke("interaction:get", { projectRoot, id }),
	interactionList: (projectRoot: string) =>
		ipcRenderer.invoke("interaction:list", { projectRoot }),
	interactionWrite: (args: {
		projectRoot: string;
		spec: import("../shared/interaction-spec").InteractionSpec;
	}) => ipcRenderer.invoke("interaction:write", args),
	onInteractionChanged: (
		callback: (data: {
			projectRoot: string;
			id: string;
			title?: string;
			reason: string;
			focus?: boolean;
		}) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: {
				projectRoot: string;
				id: string;
				title?: string;
				reason: string;
				focus?: boolean;
			},
		) => callback(data);
		ipcRenderer.on("interaction:changed", handler);
		return () => ipcRenderer.removeListener("interaction:changed", handler);
	},
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
	onExperimentRunStarted: (
		callback: (data: import("../shared/experiment-log").ExperimentRunStartedEvent) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: import("../shared/experiment-log").ExperimentRunStartedEvent,
		) => callback(data);
		ipcRenderer.on("experiment:runStarted", handler);
		return () => ipcRenderer.removeListener("experiment:runStarted", handler);
	},
	onExperimentRunOutput: (
		callback: (data: import("../shared/experiment-log").ExperimentRunOutputEvent) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: import("../shared/experiment-log").ExperimentRunOutputEvent,
		) => callback(data);
		ipcRenderer.on("experiment:runOutput", handler);
		return () => ipcRenderer.removeListener("experiment:runOutput", handler);
	},

	// Provenance - trace a claimed artifact / run back to its generating command.
	provenanceGetForArtifact: (projectRoot: string, artifactPath: string) =>
		ipcRenderer.invoke("provenance:getForArtifact", { projectRoot, artifactPath }),
	provenanceGetForRun: (projectRoot: string, runId: string) =>
		ipcRenderer.invoke("provenance:getForRun", { projectRoot, runId }),

		// App updater — electron-updater (packaged) / version.json (dev QA).
		updateCheck: () => ipcRenderer.invoke("update:check"),
		updateStatus: () => ipcRenderer.invoke("update:status"),
		updateDownload: () => ipcRenderer.invoke("update:download"),
		updateInstall: () => ipcRenderer.invoke("update:install"),
		updateIgnore: (version: string) => ipcRenderer.invoke("update:ignore", { version }),
		updateUnignore: () => ipcRenderer.invoke("update:unignore"),
		onUpdateProgress: (callback: (data: { percent: number }) => void) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				data: { percent: number },
			) => callback(data);
			ipcRenderer.on("update:progress", handler);
			return () => ipcRenderer.removeListener("update:progress", handler);
		},
		onUpdateChanged: (callback: (status: unknown) => void) => {
			const handler = (_event: Electron.IpcRendererEvent, status: unknown) =>
				callback(status);
			ipcRenderer.on("update:changed", handler);
			return () => ipcRenderer.removeListener("update:changed", handler);
		},
		aboutGetVersions: () => ipcRenderer.invoke("about:getVersions"),

	// Pro license (open-core activation; Free builds have no private Pro module)
	proGetLicense: () => ipcRenderer.invoke("pro:getLicense"),
	proActivate: (rawKey: string) => ipcRenderer.invoke("pro:activate", rawKey),
	proClearLicense: () => ipcRenderer.invoke("pro:clearLicense"),

	// Window operations
	windowSetTitle: (title: string) =>
		ipcRenderer.invoke("window:setTitle", { title }),
	windowIsMaximized: () => ipcRenderer.invoke("window:isMaximized"),
	windowIsFullscreen: () => ipcRenderer.invoke("window:isFullscreen"),
	windowMinimize: () => ipcRenderer.invoke("window:minimize"),
	windowMaximize: () => ipcRenderer.invoke("window:maximize"),
	windowClose: () => ipcRenderer.invoke("window:close"),
	windowNew: () => ipcRenderer.invoke("window:new"),

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
	compileExecute: (
		projectDir: string,
		mainFile: string,
		useTexlive?: boolean,
		opts?: {
			dirtyRelPaths?: string[];
			dirtyFiles?: Array<{ relPath: string; content: string }>;
			pdfOnDisk?: boolean;
			skipSynctex?: boolean;
			fast?: boolean;
		},
	) =>
		ipcRenderer.invoke("compile:execute", {
			projectDir,
			mainFile,
			useTexlive,
			dirtyRelPaths: opts?.dirtyRelPaths,
			dirtyFiles: opts?.dirtyFiles,
			pdfOnDisk: opts?.pdfOnDisk,
			skipSynctex: opts?.skipSynctex,
			fast: opts?.fast,
		}),
	compileDetectTexlive: () => ipcRenderer.invoke("compile:detectTexlive"),
	compileExportPdf: (projectRoot: string, mainFile: string, pdfBytes?: Uint8Array | null) =>
		ipcRenderer.invoke("compile:exportPdf", { projectRoot, mainFile, pdfBytes }),
	manuscriptPackZip: (projectRoot: string, manuscriptDir: string) =>
		ipcRenderer.invoke("manuscript:packZip", { projectRoot, manuscriptDir }),
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
	literatureCancelStagedCitationAdd: (stagedId: string) =>
		ipcRenderer.invoke("literature:cancelStagedCitationAdd", { stagedId }),
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
	chatDispose: (opts?: { keepProjectPath?: string }) =>
		ipcRenderer.invoke("chat:dispose", opts),
	chatPrewarm: (projectPath: string) => ipcRenderer.invoke("chat:prewarm", { projectPath }),
	chatEnsureAgent: (projectPath?: string) =>
		ipcRenderer.invoke("chat:ensureAgent", { projectPath }),
	onAgentStatusChanged: (callback: (status: unknown) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, status: unknown) =>
			callback(status);
		ipcRenderer.on("chat:agentStatus", handler);
		return () => ipcRenderer.removeListener("chat:agentStatus", handler);
	},
	mcpEnsure: (projectPath: string) =>
		ipcRenderer.invoke("mcp:ensure", { projectPath }) as Promise<{
			ok: boolean;
			ensure?: {
				added?: boolean;
				migrated?: boolean;
				reenabled?: boolean;
				removed?: boolean;
			};
			reloadedSessions?: number;
		}>,
	mcpApply: (projectPath: string) =>
		ipcRenderer.invoke("mcp:apply", { projectPath }) as Promise<{
			ok: boolean;
			reloadedSessions: number;
			error?: string;
		}>,
	mcpReadTeamJson: (projectPath: string, teamId?: string) =>
		ipcRenderer.invoke("mcp:readTeamJson", { projectPath, teamId }) as Promise<{
			teamId: string;
			content: string;
		}>,
	mcpWriteTeamJson: (projectPath: string, content: string, teamId?: string) =>
		ipcRenderer.invoke("mcp:writeTeamJson", { projectPath, teamId, content }) as Promise<{
			ok: boolean;
			teamId?: string;
			reloadedSessions: number;
			error?: string;
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
	agentUninstallAllFromLibrarySource: (projectPath: string, sourceId: string) =>
		ipcRenderer.invoke("agent:uninstallAllFromLibrarySource", { projectPath, sourceId }),
	agentRemoveSkillLibrarySource: (projectPath: string, sourceId: string) =>
		ipcRenderer.invoke("agent:removeSkillLibrarySource", { projectPath, sourceId }),
	agentSetSkillLibrarySourceConnected: (projectPath: string, sourceId: string, connected: boolean) =>
		ipcRenderer.invoke("agent:setSkillLibrarySourceConnected", { projectPath, sourceId, connected }),
	agentListBundledSkills: () => ipcRenderer.invoke("agent:listBundledSkills"),
	agentInstallBundledSkill: (projectPath: string, skillId: string) =>
		ipcRenderer.invoke("agent:installBundledSkill", { projectPath, skillId }),
	agentReadBundledSkillMd: (skillId: string) =>
		ipcRenderer.invoke("agent:readBundledSkillMd", { skillId }),
	agentSyncSkills: (projectPath: string) => ipcRenderer.invoke("agent:syncSkills", { projectPath }),
	agentFetchSkillRegistry: (registryUrl: string) =>
		ipcRenderer.invoke("agent:fetchSkillRegistry", { registryUrl }),
	agentConnectSkillRegistry: (projectPath: string, registryUrl: string) =>
		ipcRenderer.invoke("agent:connectSkillRegistry", { projectPath, registryUrl }),
	agentDisconnectSkillRegistry: (projectPath: string, registryUrl: string) =>
		ipcRenderer.invoke("agent:disconnectSkillRegistry", { projectPath, registryUrl }),
	agentSetSkillEnabled: (projectPath: string, skillId: string, enabled: boolean) =>
		ipcRenderer.invoke("agent:setSkillEnabled", { projectPath, skillId, enabled }),
	agentInstallSkill: (
		projectPath: string,
		skillId: string,
		content: string,
		targetTeamId?: string,
	) =>
		ipcRenderer.invoke("agent:installSkill", { projectPath, skillId, content, targetTeamId }),
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
	subagentsList: (projectPath: string) =>
		ipcRenderer.invoke("subagents:list", { projectPath }),
	orchestratorsList: (projectPath: string) =>
		ipcRenderer.invoke("orchestrators:list", { projectPath }),
	subagentsGetDetail: (projectPath: string, expertId: string) =>
		ipcRenderer.invoke("subagents:getDetail", { projectPath, expertId }),
	subagentsSaveCustom: (
		projectPath: string,
		payload: import("@shared/agent-subagents").SaveCustomSubagentPayload,
		targetTeamId?: string,
	) => ipcRenderer.invoke("subagents:saveCustom", { projectPath, payload, targetTeamId }),
	subagentsListRosterReferrers: (projectPath: string, expertId: string) =>
		ipcRenderer.invoke("subagents:listRosterReferrers", { projectPath, expertId }),
	subagentsDeleteCustom: (projectPath: string, expertId: string) =>
		ipcRenderer.invoke("subagents:deleteCustom", { projectPath, expertId }),
	orchestratorsGetDetail: (projectPath: string, orchestratorId: string) =>
		ipcRenderer.invoke("orchestrators:getDetail", { projectPath, orchestratorId }),
	orchestratorsSaveCustom: (
		projectPath: string,
		payload: import("@shared/agent-subagents").SaveCustomOrchestratorPayload,
		targetTeamId?: string,
	) => ipcRenderer.invoke("orchestrators:saveCustom", { projectPath, payload, targetTeamId }),
	orchestratorsDeleteCustom: (projectPath: string, orchestratorId: string) =>
		ipcRenderer.invoke("orchestrators:deleteCustom", { projectPath, orchestratorId }),
	agentStatus: (args?: { projectRoot?: string }) =>
		ipcRenderer.invoke("agent:status", args),
	agentSend: (args: import("../shared/agent-api").AgentSendInput) =>
		ipcRenderer.invoke("agent:send", args),
	agentCancel: (args: { conversationId: string }) =>
		ipcRenderer.invoke("agent:cancel", args),
	agentDispose: (args?: { conversationId?: string }) =>
		ipcRenderer.invoke("agent:dispose", args),
	agentResolvePermission: (args: { requestId: string; decision: "allow" | "deny" }) =>
		ipcRenderer.invoke("agent:resolvePermission", args),
	agentListSessions: (projectRoot: string) =>
		ipcRenderer.invoke("agent:listSessions", { projectRoot }),
	agentLoadSession: (args: import("../shared/agent-api").AgentLoadSessionInput) =>
		ipcRenderer.invoke("agent:loadSession", args),
	agentRenameSession: (args: import("../shared/agent-api").AgentRenameSessionInput) =>
		ipcRenderer.invoke("agent:renameSession", args),
	onAgentEvent: (callback: (event: import("../shared/agent-runtime").AgentEvent) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: import("../shared/agent-runtime").AgentEvent) => callback(data);
		ipcRenderer.on("agent:event", handler);
		return () => ipcRenderer.removeListener("agent:event", handler);
	},
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
		sessionTeamId?: string | null;
		sessionAgent?: "build" | "plan";
		selectedExpertIds?: string[];
		promptImages?: Array<{ mimeType: string; data: string; name: string; uri?: string }>;
		promptFiles?: Array<{ uri: string; name: string; mimeType: string; size?: number }>;
	}) =>
		ipcRenderer.invoke("chat:send", args),
	chatDescribeImages: (args: {
		providerId: string;
		modelId: string;
		images: Array<{ name: string; mimeType: string; data: string; uri?: string }>;
	}) =>
		ipcRenderer.invoke("chat:describeImages", args),
	chatCancel: (
		sessionId: string,
		opts?: { childrenOnly?: boolean; excludeSessionIds?: string[] },
	) =>
		ipcRenderer.invoke("chat:cancel", {
			sessionId,
			childrenOnly: opts?.childrenOnly,
			excludeSessionIds: opts?.excludeSessionIds,
		}),
	chatStopSubAgent: (args: {
		parentSessionId: string;
		taskToolUseId: string;
		subSessionId?: string;
		message: string;
		excludeSessionIds?: string[];
	}) => ipcRenderer.invoke("chat:stopSubAgent", args),
	chatGetSubAgentActivity: (args: {
		parentSessionId: string;
		taskToolUseId: string;
		subSessionId?: string;
	}) => ipcRenderer.invoke("chat:getSubAgentActivity", args),
	chatRegisterTab: (args: { tabId: string; sessionId: string; projectPath?: string }) =>
		ipcRenderer.invoke("chat:registerTab", args),
	chatSyncIntensiveReading: (args: {
		sessionId: string;
		projectRoot: string;
		paperIds?: string[];
	}) => ipcRenderer.invoke("chat:syncIntensiveReading", args),
	chatSetSessionAgent: (args: { sessionId: string; agent: "build" | "plan" }) =>
		ipcRenderer.invoke("chat:setSessionAgent", args),
	chatSetPlanSuggestDismissed: (args: { sessionId: string; dismissed: boolean }) =>
		ipcRenderer.invoke("chat:setPlanSuggestDismissed", args),
	chatResolvePlanSuggest: (args: {
		sessionId: string;
		decision: "accepted" | "dismissed" | "timed_out";
	}) => ipcRenderer.invoke("chat:resolvePlanSuggest", args),
	chatCompact: (sessionId: string, projectPath: string) =>
		ipcRenderer.invoke("chat:compact", { sessionId, projectPath }),
	chatAnswer: (sessionId: string, answer: string) =>
		ipcRenderer.invoke("chat:answer", { sessionId, answer }),
		chatAnswerQuestion: (questionId: string, answer: string) =>
			ipcRenderer.invoke("chat:answerQuestion", { questionId, answer }),
		chatReadPendingQuestion: (sessionId: string) =>
			ipcRenderer.invoke("chat:readPendingQuestion", { sessionId }),
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
	chatStatus: (projectPath?: string) =>
		ipcRenderer.invoke("chat:status", { projectPath }),
	sessionList: (projectPath?: string) => ipcRenderer.invoke("session:list", { projectPath }),
	sessionLoad: (sessionId: string, projectPath?: string, cwd?: string) =>
		ipcRenderer.invoke("session:load", { sessionId, projectPath, cwd }),
	sessionLoadWindow: (sessionId: string, projectPath: string | undefined, cwd: string | undefined, offset: number, limit: number) =>
		ipcRenderer.invoke("session:loadWindow", { sessionId, projectPath, cwd, offset, limit }),
	sessionGetDirectory: (sessionId: string) =>
		ipcRenderer.invoke("session:getDirectory", { sessionId }),
	sessionRename: (args: { tabId: string; title: string; sessionId: string }) =>
		ipcRenderer.invoke("session:rename", args),
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
	sessionGetPlanEvents: (projectPath: string, sessionId: string) =>
		ipcRenderer.invoke("session:getPlanEvents", { projectPath, sessionId }),
	sessionGetTurnMetas: (projectPath: string, sessionId: string) =>
		ipcRenderer.invoke("session:getTurnMetas", { projectPath, sessionId }) as Promise<
			Record<number, { completedAt?: number; modelLabel?: string; summary?: string }>
		>,
	sessionUpsertTurnMeta: (
		projectPath: string,
		sessionId: string,
		turnIndex: number,
		meta: { completedAt?: number; modelLabel?: string; summary?: string },
	) => ipcRenderer.invoke("session:upsertTurnMeta", { projectPath, sessionId, turnIndex, meta }),
	sessionUpsertPlanArtifact: (
		projectPath: string,
		sessionId: string,
		event: {
			kind: "plan-artifact";
			path: string;
			title?: string;
			discarded?: boolean;
			afterIndex: number;
		},
	) => ipcRenderer.invoke("session:upsertPlanArtifact", { projectPath, sessionId, event }),
	sessionAppendPlanDecision: (
		projectPath: string,
		sessionId: string,
		event: {
			kind: "plan-decision";
			decision: "approved" | "rejected";
			path?: string;
			title?: string;
			afterIndex: number;
		},
	) => ipcRenderer.invoke("session:appendPlanDecision", { projectPath, sessionId, event }),
	sessionMarkPlanArtifactDiscarded: (projectPath: string, sessionId: string) =>
		ipcRenderer.invoke("session:markPlanArtifactDiscarded", { projectPath, sessionId }),
	chatGetProviders: () => ipcRenderer.invoke("chat:getProviders"),
	chatGetEffortCatalog: () => ipcRenderer.invoke("chat:getEffortCatalog"),
	chatGetOpenCodeModelsCatalog: () =>
		ipcRenderer.invoke("chat:getOpenCodeModelsCatalog"),
	chatFetchProviderModels: (args: {
		providerId: string;
		apiKey?: string;
		baseUrl?: string;
	}) => ipcRenderer.invoke("chat:fetchProviderModels", args),
	chatFetchOpenRouterModels: (args?: { apiKey?: string; baseUrl?: string }) =>
		ipcRenderer.invoke("chat:fetchProviderModels", {
			providerId: "openrouter",
			...(args ?? {}),
		}),
	chatGetModelEffort: (args: {
		provider: string;
		modelId: string;
		fallback?: string[];
	}) => ipcRenderer.invoke("chat:getModelEffort", args),
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
	settingsCountPromptTokens: (text: string) =>
		ipcRenderer.invoke("settings:countPromptTokens", { text }),
	settingsComputePromptFingerprint: (projectRoot?: string) =>
		ipcRenderer.invoke("settings:computePromptFingerprint", { projectRoot }),
	settingsGetDefaultPersona: () =>
		ipcRenderer.invoke("settings:getDefaultPersona"),
	settingsGetKnowledgeModules: (projectRoot?: string) =>
		ipcRenderer.invoke("settings:getKnowledgeModules", { projectRoot }),
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
	commandsToggle: (projectRoot: string, id: string, enabled: boolean) =>
		ipcRenderer.invoke("commands:toggle", { projectRoot, id, enabled }),
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

	// Agent Packs（生命周期 + 视图，§9.5）
	teamsList: (projectRoot: string) =>
		ipcRenderer.invoke("teams:list", { projectRoot }),
	teamsInstall: (teamId: string) =>
		ipcRenderer.invoke("teams:install", { teamId }),
	teamsSetEnabled: (
		projectRoot: string,
		teamId: string,
		enabled: boolean | null,
		scope?: "app" | "project",
	) => ipcRenderer.invoke("teams:setEnabled", { projectRoot, teamId, enabled, scope }),
	teamsUninstall: (teamId: string) =>
		ipcRenderer.invoke("teams:uninstall", { teamId }),
	teamsSetAssetEnabled: (
		projectRoot: string,
		fqid: string,
		enabled: boolean | null,
		scope?: "app" | "project",
	) => ipcRenderer.invoke("teams:setAssetEnabled", { projectRoot, fqid, enabled, scope }),
	teamsSaveAssetOverride: (
		projectRoot: string,
		fqid: string,
		patch: import("@shared/teams/types").AssetOverride,
		scope?: "app" | "project",
	) => ipcRenderer.invoke("teams:saveAssetOverride", { projectRoot, fqid, patch, scope }),
	teamsGetActiveTeam: (projectRoot: string, sessionTeamId?: string | null) =>
		ipcRenderer.invoke("teams:getActiveTeam", { projectRoot, sessionTeamId }),
	teamsSetActiveTeam: (projectRoot: string, teamId: string, scope?: "project" | "app") =>
		ipcRenderer.invoke("teams:setActiveTeam", { projectRoot, teamId, scope }),
	teamsGetRoster: (projectRoot: string, teamId: string) =>
		ipcRenderer.invoke("teams:getRoster", { projectRoot, teamId }),
	teamsGetSkillsRoster: (projectRoot: string, teamId: string) =>
		ipcRenderer.invoke("teams:getSkillsRoster", { projectRoot, teamId }),
	teamsGetCommandsRoster: (projectRoot: string, teamId: string) =>
		ipcRenderer.invoke("teams:getCommandsRoster", { projectRoot, teamId }),
	teamsCreate: (
		projectRoot: string,
		input: {
			name: string;
			description?: string;
			longDescription?: string;
			tags?: string[];
			scope: "app" | "project";
			leadName?: string;
			leadInstructions?: string;
			icon?: IconSpec | null;
			iconImagePngBase64?: string;
		},
	) => ipcRenderer.invoke("teams:create", { projectRoot, ...input }),
	teamsUpdateIcon: (
		teamId: string,
		icon: IconSpec | null,
		projectRoot?: string | null,
	) => ipcRenderer.invoke("teams:updateIcon", { teamId, icon, projectRoot }),
	teamsSetIconImage: (
		teamId: string,
		pngBase64: string,
		projectRoot?: string | null,
	) => ipcRenderer.invoke("teams:setIconImage", { teamId, pngBase64, projectRoot }),
	teamsDelete: (teamId: string, projectRoot?: string) =>
		ipcRenderer.invoke("teams:delete", { teamId, projectRoot }),
	teamsGetCoreState: (projectRoot: string) =>
		ipcRenderer.invoke("teams:getCoreState", { projectRoot }),
	teamsResetCoreDefaults: (projectRoot: string, kind: "subagent" | "orchestrator") =>
		ipcRenderer.invoke("teams:resetCoreDefaults", { projectRoot, kind }),
	teamsResolveOrigin: (projectRoot: string, fqidOrId: string) =>
		ipcRenderer.invoke("teams:resolveOrigin", { projectRoot, fqidOrId }),
	teamsListAssets: (projectRoot: string, kind: string) =>
		ipcRenderer.invoke("teams:listAssets", { projectRoot, kind }),
	teamsSetDefaultOrchestrator: (projectRoot: string, fqid: string) =>
		ipcRenderer.invoke("teams:setDefaultOrchestrator", { projectRoot, fqid }),
	teamsGetTeamContents: (teamId: string, projectRoot?: string | null) =>
		ipcRenderer.invoke("teams:getTeamContents", { teamId, projectRoot }),
	teamsListProjectMcps: (projectRoot: string) =>
		ipcRenderer.invoke("teams:listProjectMcps", { projectRoot }),
	teamsListMcp: (projectRoot: string) =>
		ipcRenderer.invoke("teams:listMcp", { projectRoot }) as Promise<
			Array<{ name: string; enabled: boolean; origin: string; autoStart: boolean }>
		>,

	// User teams (app-level, like installed teams)
	teamsListUserTeams: () =>
		ipcRenderer.invoke("teams:listUserTeams") as Promise<
			Array<{ teamId: string; name: string; description: string; version: string }>
		>,
	teamsCreateUserTeam: (name: string, description?: string) =>
		ipcRenderer.invoke("teams:createUserTeam", { name, description }) as Promise<{
			teamId: string;
			name: string;
			description: string;
			version: string;
		}>,
	teamsDeleteUserTeam: (teamId: string) =>
		ipcRenderer.invoke("teams:deleteUserTeam", { teamId }),

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
	terminalRegisterBashJob: (args: {
		sessionId: string;
		toolCallId: string;
		command: string;
	}) => ipcRenderer.invoke("terminal:registerBashJob", args),
	terminalDestroyAllAiPty: () => ipcRenderer.invoke("terminal:destroyAllAiPty"),

	executionGet: (executionId: string): Promise<ExecutionGetResult> =>
		ipcRenderer.invoke("execution:get", { executionId }),
	executionFindByToolCallId: (toolCallId: string): Promise<ExecutionFindByToolCallIdResult> =>
		ipcRenderer.invoke("execution:findByToolCallId", { toolCallId }),
	executionReplay: (args: ExecutionReplayArgs): Promise<ExecutionReplayResult> =>
		ipcRenderer.invoke("execution:replay", args),
	executionCancel: (executionId: string): Promise<ExecutionCancelResult> =>
		ipcRenderer.invoke("execution:cancel", { executionId }),
	executionRerun: (executionId: string): Promise<ExecutionRerunResult> =>
		ipcRenderer.invoke("execution:rerun", { executionId }),
	executionListRunning: (): Promise<ExecutionListRunningResult> =>
		ipcRenderer.invoke("execution:listRunning"),
	executionApplyProjectSwitch: (
		args: ExecutionApplyProjectSwitchArgs,
	): Promise<ExecutionApplyProjectSwitchResult> =>
		ipcRenderer.invoke("execution:applyProjectSwitch", args),
	onExecutionEvent: (listener: (event: TerminalExecutionEvent) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, payload: TerminalExecutionEvent) =>
			listener(payload);
		ipcRenderer.on("execution:event", handler);
		return () => ipcRenderer.removeListener("execution:event", handler);
	},

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
	gitCheckIgnore: (projectRoot: string, relativePaths: string[]) =>
		ipcRenderer.invoke("git:checkIgnore", { projectRoot, relativePaths }),

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
	onChatAgentEvent: (callback: (data: AgentEvent) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: AgentEvent) => callback(data);
		ipcRenderer.on("chat:agent-event", handler);
		return () => ipcRenderer.removeListener("chat:agent-event", handler);
	},
	onChatComplete: (callback: (data: {
		tabId: string;
		sessionId: string;
		success: boolean;
		error?: string;
		errorCode?: string;
		emptyTurn?: boolean;
		tokenUsage?: any;
		contextUsed?: number | null;
		contextWindowSize?: number | null;
		contextSource?: "usage_update" | "prompt_usage" | "estimate" | null;
		promptStale?: boolean;
		planDraftMissing?: boolean;
	}) => void) => {
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
		ipcRenderer.removeAllListeners("chat:agent-event");
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
	onExpertsIntegrationChanged: (callback: (data: { projectPath: string }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { projectPath: string }) => callback(data);
		ipcRenderer.on("subagents:integrationChanged", handler);
		return () => ipcRenderer.removeListener("subagents:integrationChanged", handler);
	},

	// Log system
	logFetch: (params: unknown) => ipcRenderer.invoke("log:fetch", params),

	// Theme — glass vibrancy synchronization
	themeSetGlassMode: (mode: "light" | "dark" | "system") =>
		ipcRenderer.invoke("theme:setGlassMode", mode),
	themeListSystemFonts: () =>
		ipcRenderer.invoke("theme:listSystemFonts") as Promise<
			{ family: string; monospace: boolean }[]
		>,
});
