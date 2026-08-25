import { ipcRenderer } from "electron";

export const themeApi = {
	themeApplyGlass: (payload: { enabled: boolean; opaqueBackground?: string }) =>
		ipcRenderer.invoke("theme:applyGlass", payload),
	themeListSystemFonts: () =>
		ipcRenderer.invoke("theme:listSystemFonts") as Promise<
			{ family: string; monospace: boolean }[]
		>,
};
