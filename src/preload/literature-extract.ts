import { ipcRenderer } from "electron";
import type { PaperExtractState, PaperExtractProgress } from "../shared/literature/paper-extract";

export const literatureExtractApi = {
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
};
