import { ipcRenderer } from "electron";

export const themeApi = {
	// Theme — glass vibrancy synchronization
	themeSetGlassMode: (mode: "light" | "dark" | "system") =>
		ipcRenderer.invoke("theme:setGlassMode", mode),
	themeListSystemFonts: () =>
		ipcRenderer.invoke("theme:listSystemFonts") as Promise<
			{ family: string; monospace: boolean }[]
		>,
};
