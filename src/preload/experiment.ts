import { ipcRenderer } from "electron";

export const experimentApi = {
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
		callback: (data: import("../shared/experiments/log").ExperimentRunCompleteEvent) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: import("../shared/experiments/log").ExperimentRunCompleteEvent,
		) => callback(data);
		ipcRenderer.on("experiment:runComplete", handler);
		return () => ipcRenderer.removeListener("experiment:runComplete", handler);
	},
	onExperimentRunStarted: (
		callback: (data: import("../shared/experiments/log").ExperimentRunStartedEvent) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: import("../shared/experiments/log").ExperimentRunStartedEvent,
		) => callback(data);
		ipcRenderer.on("experiment:runStarted", handler);
		return () => ipcRenderer.removeListener("experiment:runStarted", handler);
	},
	onExperimentRunOutput: (
		callback: (data: import("../shared/experiments/log").ExperimentRunOutputEvent) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: import("../shared/experiments/log").ExperimentRunOutputEvent,
		) => callback(data);
		ipcRenderer.on("experiment:runOutput", handler);
		return () => ipcRenderer.removeListener("experiment:runOutput", handler);
	},
};
