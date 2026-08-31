import { ipcRenderer } from "electron";
import type {
  TypstDidChangeArgs,
  TypstDidCloseArgs,
  TypstDidOpenArgs,
  TypstDiagnosticsEvent,
  TypstEnsureSessionArgs,
  TypstIpcError,
  TypstPreviewReadyEvent,
  TypstPreviewStartArgs,
  TypstPreviewStopArgs,
  TypstScrollToEvent,
} from "../shared/typst/session";

export const typstApi = {
	typstEnsureSession: (args: TypstEnsureSessionArgs) =>
		ipcRenderer.invoke("typst:ensureSession", args) as Promise<{ ok: true } | TypstIpcError>,
	typstDidOpen: (args: TypstDidOpenArgs) =>
		ipcRenderer.invoke("typst:didOpen", args) as Promise<{ ok: true } | TypstIpcError>,
	typstDidChange: (args: TypstDidChangeArgs) =>
		ipcRenderer.invoke("typst:didChange", args) as Promise<{ ok: true } | TypstIpcError>,
	typstDidClose: (args: TypstDidCloseArgs) =>
		ipcRenderer.invoke("typst:didClose", args) as Promise<{ ok: true } | TypstIpcError>,
	typstPreviewStart: (args: TypstPreviewStartArgs) =>
		ipcRenderer.invoke("typst:previewStart", args) as Promise<
			TypstPreviewReadyEvent | TypstIpcError
		>,
	typstPreviewStop: (args: TypstPreviewStopArgs) =>
		ipcRenderer.invoke("typst:previewStop", args) as Promise<{ ok: true } | TypstIpcError>,
	onTypstPreviewReady: (callback: (data: TypstPreviewReadyEvent) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: TypstPreviewReadyEvent) =>
			callback(data);
		ipcRenderer.on("typst:previewReady", handler);
		return () => ipcRenderer.removeListener("typst:previewReady", handler);
	},
	onTypstDiagnostics: (callback: (data: TypstDiagnosticsEvent) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: TypstDiagnosticsEvent) =>
			callback(data);
		ipcRenderer.on("typst:diagnostics", handler);
		return () => ipcRenderer.removeListener("typst:diagnostics", handler);
	},
	onTypstScrollTo: (callback: (data: TypstScrollToEvent) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: TypstScrollToEvent) => callback(data);
		ipcRenderer.on("typst:scrollTo", handler);
		return () => ipcRenderer.removeListener("typst:scrollTo", handler);
	},
};
