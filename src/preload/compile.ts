import { ipcRenderer } from "electron";

export const compileApi = {
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
};
