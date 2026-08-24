import { ipcRenderer } from "electron";

export const bibliographyApi = {
	// Bibliographic catalog (global — not library UI only)
	bibliographyResolve: (opts: { doi?: string; arxivId?: string }) =>
		ipcRenderer.invoke("bibliography:resolve", opts),
};
