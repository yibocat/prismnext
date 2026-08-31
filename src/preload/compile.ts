import { ipcRenderer } from "electron";
import type { CompileAgentCompleteEvent } from "../shared/compile/artifact-key";
import type { TypstCliFormat } from "../shared/compile/typst-format";

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
	compileTypstExport: (
		projectDir: string,
		mainFile: string,
		format: TypstCliFormat,
		opts?: { dirtyFiles?: Array<{ relPath: string; content: string }> },
	) =>
		ipcRenderer.invoke("compile:typstExport", {
			projectDir,
			mainFile,
			format,
			dirtyFiles: opts?.dirtyFiles,
		}),
	compileDetectTexlive: (args?: { projectRoot?: string }) =>
		ipcRenderer.invoke("compile:detectTexlive", args),
	compileExportPdf: (projectRoot: string, mainFile: string, pdfBytes?: Uint8Array | null) =>
		ipcRenderer.invoke("compile:exportPdf", { projectRoot, mainFile, pdfBytes }),
	manuscriptPackZip: (projectRoot: string, manuscriptDir: string) =>
		ipcRenderer.invoke("manuscript:packZip", { projectRoot, manuscriptDir }),
	onCompileAgentComplete: (
		callback: (data: CompileAgentCompleteEvent) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			data: CompileAgentCompleteEvent,
		) => callback(data);
		ipcRenderer.on("compile:agentComplete", handler);
		return () => ipcRenderer.removeListener("compile:agentComplete", handler);
	},
};
